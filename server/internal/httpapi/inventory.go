package httpapi

import (
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/voxel-vault/api/internal/domain"
	"github.com/voxel-vault/api/internal/store"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Chests exist only on the server. A player gets them from the server (the starter grant on the
// first inventory read, an admin grant) and can only open what they own: claim a chest for one
// opening session, have its prize rolled for that session, then complete it with that prize or
// record that it was destroyed.

const (
	statusAvailable = "available"
	statusOpening   = "opening"
	statusOpened    = "opened"
	statusDestroyed = "destroyed"
	maxGrant        = 100
	maxAppearance   = 16 << 10
)

var errChestUnavailable = errors.New("chest unavailable")

type chestDTO struct {
	ID         string          `json:"id"`
	CaseID     string          `json:"caseId"`
	Status     string          `json:"status"`
	Seed       int64           `json:"seed"`
	Appearance json.RawMessage `json:"appearance,omitempty"`
	SessionID  *string         `json:"sessionId,omitempty"`
	Reward     *itemDTO        `json:"reward,omitempty"`
	OpenedAt   *time.Time      `json:"openedAt,omitempty"`
}

func (s *Server) inventoryRoutes() {
	s.mux.HandleFunc("GET /api/v1/inventory", s.requirePermission("/api/v1/inventory", "GET", s.listInventory))
	s.mux.HandleFunc("POST /api/v1/inventory/{instanceID}/claim", s.sameOrigin(s.requirePermission("/api/v1/inventory/:instanceID/claim", "POST", s.claimChest)))
	s.mux.HandleFunc("POST /api/v1/inventory/{instanceID}/complete", s.sameOrigin(s.requirePermission("/api/v1/inventory/:instanceID/complete", "POST", s.completeChest)))
	s.mux.HandleFunc("POST /api/v1/inventory/{instanceID}/destroy", s.sameOrigin(s.requirePermission("/api/v1/inventory/:instanceID/destroy", "POST", s.destroyChest)))
	s.mux.HandleFunc("PUT /api/v1/inventory/{instanceID}/appearance", s.sameOrigin(s.requirePermission("/api/v1/inventory/:instanceID/appearance", "PUT", s.chestAppearance)))
	s.mux.HandleFunc("POST /api/v1/admin/users/{userID}/chests", s.sameOrigin(s.requirePermission("/api/v1/admin/users/:userID/chests", "POST", s.grantChests)))
}

func (s *Server) listInventory(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	if err := s.grantStarter(s.db.WithContext(r.Context()), user.ID); err != nil {
		writeError(w, 500, "could not issue starter chests")
		return
	}
	var rows []store.ChestInstance
	if err := s.db.WithContext(r.Context()).Where("user_id = ?", user.ID).Order("created_at, id").Find(&rows).Error; err != nil {
		writeError(w, 500, "could not read inventory")
		return
	}
	dtos, err := s.chestDTOs(r, rows)
	if err != nil {
		writeError(w, 500, "could not read rewards")
		return
	}
	writeJSON(w, http.StatusOK, dtos)
}

// grantStarter gives a player the starter chests exactly once, even under concurrent requests:
// the user row is locked and marked in the same transaction as the chests are created.
func (s *Server) grantStarter(db *gorm.DB, userID string) error {
	grants, err := parseGrants(s.config.StarterChests)
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		var user store.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, "id = ?", userID).Error; err != nil {
			return err
		}
		if user.StarterGrantedAt != nil {
			return nil
		}
		for _, grant := range grants {
			if err := issueChests(tx, userID, grant.caseID, grant.count); err != nil {
				return err
			}
		}
		now := time.Now()
		return tx.Model(&store.User{}).Where("id = ?", userID).Update("starter_granted_at", now).Error
	})
}

type grant struct {
	caseID string
	count  int
}

// parseGrants reads "case:count,case:count"; unknown chest types and bad counts are errors.
func parseGrants(value string) ([]grant, error) {
	var grants []grant
	for _, part := range strings.Split(value, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		caseID, countText, ok := strings.Cut(part, ":")
		count, err := strconv.Atoi(strings.TrimSpace(countText))
		if _, known := domain.CaseByID(strings.TrimSpace(caseID)); !ok || err != nil || !known || count < 1 || count > maxGrant {
			return nil, fmt.Errorf("invalid chest grant %q", part)
		}
		grants = append(grants, grant{caseID: strings.TrimSpace(caseID), count: count})
	}
	return grants, nil
}

func issueChests(tx *gorm.DB, userID, caseID string, count int) error {
	rows := make([]store.ChestInstance, 0, count)
	for i := 0; i < count; i++ {
		id, err := newUUID()
		if err != nil {
			return err
		}
		seed, err := newSeed()
		if err != nil {
			return err
		}
		rows = append(rows, store.ChestInstance{ID: id, UserID: userID, CaseID: caseID, Status: statusAvailable, Seed: seed})
	}
	return tx.Create(&rows).Error
}

func (s *Server) grantChests(w http.ResponseWriter, r *http.Request) {
	var body struct {
		CaseID string `json:"caseId"`
		Count  int    `json:"count"`
	}
	if !decode(w, r, &body) || body.Count < 1 || body.Count > maxGrant {
		writeError(w, 400, "invalid grant")
		return
	}
	if _, ok := domain.CaseByID(body.CaseID); !ok {
		writeError(w, 404, "chest type not found")
		return
	}
	userID := r.PathValue("userID")
	err := s.db.WithContext(r.Context()).Transaction(func(tx *gorm.DB) error {
		if err := tx.First(&store.User{}, "id = ?", userID).Error; err != nil {
			return err
		}
		return issueChests(tx, userID, body.CaseID, body.Count)
	})
	if errors.Is(err, gorm.ErrRecordNotFound) {
		writeError(w, 404, "user not found")
		return
	} else if err != nil {
		writeError(w, 500, "could not issue chests")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"userId": userID, "caseId": body.CaseID, "issued": body.Count})
}

func (s *Server) claimChest(w http.ResponseWriter, r *http.Request) {
	sessionID, ok := sessionBody(w, r)
	if !ok {
		return
	}
	s.transition(w, r, func(tx *gorm.DB, chest *store.ChestInstance) error {
		return claim(tx, chest, sessionID)
	})
}

// claim reserves an available chest for one opening session; claiming it again for the same
// session changes nothing.
func claim(tx *gorm.DB, chest *store.ChestInstance, sessionID string) error {
	if chest.Status == statusOpening && chest.SessionID != nil && *chest.SessionID == sessionID {
		return nil
	}
	if chest.Status != statusAvailable {
		return errChestUnavailable
	}
	chest.Status, chest.SessionID = statusOpening, &sessionID
	return tx.Save(chest).Error
}

func (s *Server) completeChest(w http.ResponseWriter, r *http.Request) {
	sessionID, ok := sessionBody(w, r)
	if !ok {
		return
	}
	s.transition(w, r, func(tx *gorm.DB, chest *store.ChestInstance) error {
		if chest.Status == statusOpened && sameSession(chest, sessionID) {
			return nil
		}
		if chest.Status != statusOpening || !sameSession(chest, sessionID) {
			return errChestUnavailable
		}
		// The reward is what the server rolled for this session, never what the client says.
		var roll store.CaseRoll
		if err := tx.Where("session_id = ? AND user_id = ?", sessionID, chest.UserID).First(&roll).Error; err != nil {
			return errChestUnavailable
		}
		now := time.Now()
		chest.Status, chest.RewardID, chest.OpenedAt = statusOpened, &roll.LootItemID, &now
		return tx.Save(chest).Error
	})
}

func (s *Server) destroyChest(w http.ResponseWriter, r *http.Request) {
	sessionID, ok := sessionBody(w, r)
	if !ok {
		return
	}
	s.transition(w, r, func(tx *gorm.DB, chest *store.ChestInstance) error {
		if chest.Status == statusDestroyed && sameSession(chest, sessionID) {
			return nil
		}
		if chest.Status != statusOpening || !sameSession(chest, sessionID) {
			return errChestUnavailable
		}
		chest.Status = statusDestroyed
		return tx.Save(chest).Error
	})
}

// chestAppearance keeps what a landing did to the chest's look (cracks, chips). Cosmetic: it
// changes neither ownership nor reward, and only a chest in or after its opening can change.
func (s *Server) chestAppearance(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Appearance json.RawMessage `json:"appearance"`
	}
	if !decode(w, r, &body) || len(body.Appearance) == 0 || len(body.Appearance) > maxAppearance || !json.Valid(body.Appearance) || body.Appearance[0] != '{' {
		writeError(w, 400, "invalid appearance")
		return
	}
	s.transition(w, r, func(tx *gorm.DB, chest *store.ChestInstance) error {
		if chest.Status == statusAvailable {
			return errChestUnavailable
		}
		chest.Appearance = body.Appearance
		return tx.Save(chest).Error
	})
}

// transition loads the player's own chest under a row lock, applies a change and answers with
// the chest as it now is; a chest of somebody else is the same as one that does not exist.
func (s *Server) transition(w http.ResponseWriter, r *http.Request, change func(*gorm.DB, *store.ChestInstance) error) {
	user := userFrom(r.Context())
	var chest store.ChestInstance
	err := s.db.WithContext(r.Context()).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&chest, "id = ? AND user_id = ?", r.PathValue("instanceID"), user.ID).Error; err != nil {
			return err
		}
		return change(tx, &chest)
	})
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		writeError(w, 404, "chest not found")
	case errors.Is(err, errChestUnavailable):
		writeError(w, 409, "chest is not available for this session")
	case err != nil:
		writeError(w, 500, "could not update chest")
	default:
		dtos, err := s.chestDTOs(r, []store.ChestInstance{chest})
		if err != nil {
			writeError(w, 500, "could not read reward")
			return
		}
		writeJSON(w, http.StatusOK, dtos[0])
	}
}

func (s *Server) chestDTOs(r *http.Request, rows []store.ChestInstance) ([]chestDTO, error) {
	ids := []string{}
	for _, row := range rows {
		if row.RewardID != nil {
			ids = append(ids, *row.RewardID)
		}
	}
	items := map[string]store.LootItem{}
	if len(ids) > 0 {
		var loot []store.LootItem
		if err := s.db.WithContext(r.Context()).Where("id IN ?", ids).Find(&loot).Error; err != nil {
			return nil, err
		}
		for _, item := range loot {
			items[item.ID] = item
		}
	}
	dtos := make([]chestDTO, 0, len(rows))
	for _, row := range rows {
		dto := chestDTO{ID: row.ID, CaseID: row.CaseID, Status: row.Status, Seed: row.Seed, SessionID: row.SessionID, OpenedAt: row.OpenedAt}
		if len(row.Appearance) > 0 {
			dto.Appearance = row.Appearance
		}
		if row.RewardID != nil {
			if item, ok := items[*row.RewardID]; ok {
				reward := toItemDTO(item)
				dto.Reward = &reward
			}
		}
		dtos = append(dtos, dto)
	}
	return dtos, nil
}

func sessionBody(w http.ResponseWriter, r *http.Request) (string, bool) {
	var body struct {
		SessionID string `json:"sessionId"`
	}
	if !decode(w, r, &body) || strings.TrimSpace(body.SessionID) == "" || len(body.SessionID) > 128 {
		writeError(w, 400, "invalid sessionId")
		return "", false
	}
	return body.SessionID, true
}

func sameSession(chest *store.ChestInstance, sessionID string) bool {
	return chest.SessionID != nil && *chest.SessionID == sessionID
}

func newUUID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	h := hex.EncodeToString(b)
	return h[0:8] + "-" + h[8:12] + "-" + h[12:16] + "-" + h[16:20] + "-" + h[20:], nil
}

// newSeed picks a 32-bit seed: the client's appearance generator works on unsigned 32-bit seeds.
func newSeed() (int64, error) {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		return 0, err
	}
	return int64(binary.BigEndian.Uint32(b)), nil
}
