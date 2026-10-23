package httpapi

import (
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/voxel-vault/api/internal/app"
	"github.com/voxel-vault/api/internal/domain/chest"
	"github.com/voxel-vault/api/internal/domain/inventory"
	"github.com/voxel-vault/api/internal/domain/rulebook"
	"github.com/voxel-vault/api/internal/domain/wallet"
	"github.com/voxel-vault/api/internal/store"
)

// Chests and items exist only on the server, and the server alone decides what happens to them.
// A player gets chests from the server (the starter grant on the first inventory read, an admin
// grant) and opens what they own: claim a chest for one opening session (the server lands it and
// says what the fall did), then open it (the server says whether it broke or what dropped, and
// puts the drop into the player's items). The client only draws those outcomes.

type contentDTO struct {
	Item   itemDTO `json:"item"`
	Weight float64 `json:"weight"`
}

type traitDTO struct {
	ID        string  `json:"id"`
	Intensity float64 `json:"intensity"`
	Seed      uint32  `json:"seed"`
}

type originDTO struct {
	Source  string   `json:"source"`
	Parents []string `json:"parents,omitempty"`
}

type dropDTO struct {
	Item  itemDTO `json:"item"`
	State string  `json:"state"`
}

type chestDTO struct {
	ID          string       `json:"id"`
	CaseID      string       `json:"caseId"`
	Status      string       `json:"status"`
	Seed        uint64       `json:"seed"`
	Revision    string       `json:"revision"`
	Contents    []contentDTO `json:"contents"`
	Traits      []traitDTO   `json:"traits"`
	Rarity      string       `json:"rarity"`
	Condition   float64      `json:"condition"`
	Origin      originDTO    `json:"origin"`
	SessionID   string       `json:"sessionId,omitempty"`
	Drop        *dropDTO     `json:"drop,omitempty"`
	DestroyedAt string       `json:"destroyedAt,omitempty"`
	OpenedAt    *time.Time   `json:"openedAt,omitempty"`
}

type landingDTO struct {
	Damage    *traitDTO `json:"damage,omitempty"`
	Destroyed bool      `json:"destroyed"`
}

type ownedItemDTO struct {
	ID     string     `json:"id"`
	Item   itemDTO    `json:"item"`
	State  string     `json:"state"`
	Origin string     `json:"origin"`
	Offers *offersDTO `json:"offers,omitempty"`
}

// offersDTO is what each workshop action would cost or bring now; mergeWith is the twin to merge
// the item with (absent: nothing to merge) and mergeRepair the chance, in percent, that this
// merge mends the item that stays.
type offersDTO struct {
	Repair      *amountDTO `json:"repair"`
	Salvage     amountDTO  `json:"salvage"`
	Sell        amountDTO  `json:"sell"`
	MergeWith   string     `json:"mergeWith,omitempty"`
	MergeRepair float64    `json:"mergeRepair"`
}

type amountDTO struct {
	Resource string `json:"resource"`
	Value    int64  `json:"value"`
}

func (s *Server) inventoryRoutes() {
	if s.contexts != nil {
		s.contextRoutes()
		return
	}
	player := func(method, path string, handler http.HandlerFunc) {
		pattern := strings.NewReplacer("{instanceID}", ":instanceID", "{itemID}", ":itemID").Replace(path)
		h := s.requirePermission(pattern, method, s.guardEconomy(handler))
		if method != http.MethodGet {
			h = s.sameOrigin(h)
		}
		s.mux.HandleFunc(method+" "+path, h)
	}
	player("GET", "/api/v1/inventory", s.listInventory)
	player("POST", "/api/v1/inventory/{instanceID}/claim", s.claimChest)
	player("POST", "/api/v1/inventory/{instanceID}/open", s.openChest)
	player("GET", "/api/v1/inventory/merge", s.mergeOdds)
	player("POST", "/api/v1/inventory/merge", s.mergeChests)
	player("GET", "/api/v1/inventory/items", s.listItems)
	player("POST", "/api/v1/inventory/items/merge", s.mergeItems)
	for name, action := range map[string]app.Workshop{"repair": app.Repair, "salvage": app.Salvage, "sell": app.Sell} {
		player("POST", "/api/v1/inventory/items/{itemID}/"+name, s.workItem(action))
	}
	s.mux.HandleFunc("POST /api/v1/admin/users/{userID}/chests", s.sameOrigin(s.requirePermission("/api/v1/admin/users/:userID/chests", "POST", s.guardEconomy(s.grantChests))))
}

func (s *Server) listInventory(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	if err := s.economy.GrantStarter(r.Context(), user.ID, s.starter); err != nil {
		writeError(w, 500, "could not issue starter chests")
		return
	}
	states, err := s.economy.Chests(r.Context(), user.ID)
	if err != nil {
		writeError(w, 500, "could not read inventory")
		return
	}
	var openedAt map[string]time.Time
	err = store.Transact(r.Context(), s.db, func(tx store.Tx) (err error) {
		openedAt, err = tx.OpenedAt(user.ID)
		return err
	})
	if err != nil {
		writeError(w, 500, "could not read inventory")
		return
	}
	rb := s.rulebook()
	dtos := make([]chestDTO, len(states))
	for i, state := range states {
		dtos[i] = toChestDTO(rb, state)
		if at, ok := openedAt[state.ID]; ok {
			dtos[i].OpenedAt = &at
		}
	}
	writeJSON(w, http.StatusOK, dtos)
}

// claimChest starts an opening session; the server lands the chest and answers what the fall
// did. A retry for the same session answers the chest as it is, with no landing.
func (s *Server) claimChest(w http.ResponseWriter, r *http.Request) {
	sessionID, ok := sessionBody(w, r)
	if !ok {
		return
	}
	state, landing, err := s.economy.Claim(r.Context(), userFrom(r.Context()).ID, r.PathValue("instanceID"), sessionID)
	if err != nil {
		writeEconomyError(w, err)
		return
	}
	body := map[string]any{"chest": toChestDTO(s.rulebook(), state), "landing": nil}
	if landing != nil {
		dto := landingDTO{Destroyed: landing.Destroyed}
		if landing.Damage != nil {
			trait := toTraitDTO(*landing.Damage)
			dto.Damage = &trait
		}
		body["landing"] = dto
	}
	writeJSON(w, http.StatusOK, body)
}

// openChest finishes the session: the chest breaks or drops an item into the player's items. A
// retry for the same session answers the same outcome.
func (s *Server) openChest(w http.ResponseWriter, r *http.Request) {
	sessionID, ok := sessionBody(w, r)
	if !ok {
		return
	}
	opened, err := s.economy.Open(r.Context(), userFrom(r.Context()).ID, r.PathValue("instanceID"), sessionID)
	if err != nil {
		writeEconomyError(w, err)
		return
	}
	rb := s.rulebook()
	dto := toChestDTO(rb, opened.Chest)
	if opened.Chest.Status == chest.Opened {
		now := time.Now()
		dto.OpenedAt = &now
	}
	body := map[string]any{"chest": dto, "item": nil}
	if opened.Item != nil {
		body["item"] = toOwnedItemDTO(rb, *opened.Item)
	}
	writeJSON(w, http.StatusOK, body)
}

func (s *Server) mergeChests(w http.ResponseWriter, r *http.Request) {
	a, b, ok := pairBody(w, r)
	if !ok {
		return
	}
	merged, err := s.economy.MergeChests(r.Context(), userFrom(r.Context()).ID, a, b)
	if err != nil {
		writeEconomyError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, toChestDTO(s.rulebook(), merged))
}

// mergeOddsDTO is, in percent, what merging two chests would likely make: each trait's chance to
// stay and to rise a tier, and of the items the two hold together, how many the new one keeps.
type mergeOddsDTO struct {
	Traits   []traitOddsDTO  `json:"traits"`
	Contents contentsOddsDTO `json:"contents"`
}

type traitOddsDTO struct {
	ID      string  `json:"id"`
	Keep    float64 `json:"keep"`
	Upgrade float64 `json:"upgrade"`
}

type contentsOddsDTO struct {
	Total int     `json:"total"`
	Kept  int     `json:"kept"`
	Keep  float64 `json:"keep"`
}

func (s *Server) mergeOdds(w http.ResponseWriter, r *http.Request) {
	a, b := r.URL.Query().Get("a"), r.URL.Query().Get("b")
	if a == "" || b == "" || len(a) > 128 || len(b) > 128 {
		writeError(w, 400, "invalid pair")
		return
	}
	odds, err := s.economy.MergeOdds(r.Context(), userFrom(r.Context()).ID, a, b)
	if err != nil {
		writeEconomyError(w, err)
		return
	}
	dto := mergeOddsDTO{Traits: make([]traitOddsDTO, len(odds.Traits)),
		Contents: contentsOddsDTO{Total: odds.Contents, Kept: odds.Size, Keep: percent(odds.ItemKeep, 1)}}
	for i, trait := range odds.Traits {
		dto.Traits[i] = traitOddsDTO{ID: trait.ID, Keep: percent(trait.Keep, 1), Upgrade: percent(trait.Upgrade, 1)}
	}
	writeJSON(w, http.StatusOK, dto)
}

func (s *Server) listItems(w http.ResponseWriter, r *http.Request) {
	items, balances, err := s.economy.Inventory(r.Context(), userFrom(r.Context()).ID)
	if err != nil {
		writeError(w, 500, "could not read items")
		return
	}
	rb := s.rulebook()
	dtos := make([]ownedItemDTO, 0, len(items))
	for _, item := range items {
		dto := toOwnedItemDTO(rb, item.Item)
		if o := item.Offers; o != nil {
			dto.Offers = &offersDTO{Salvage: toAmountDTO(o.Salvage), Sell: toAmountDTO(o.Sell), MergeWith: o.MergeWith, MergeRepair: percent(o.MergeRepair, 1)}
			if o.Repair != nil {
				repair := toAmountDTO(*o.Repair)
				dto.Offers.Repair = &repair
			}
		}
		dtos = append(dtos, dto)
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": dtos, "balances": balances})
}

// workItem repairs, salvages or sells an item; it answers what was paid or gained.
func (s *Server) workItem(action app.Workshop) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		amount, err := s.economy.Work(r.Context(), userFrom(r.Context()).ID, r.PathValue("itemID"), action)
		if err != nil {
			writeEconomyError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, toAmountDTO(amount))
	}
}

func (s *Server) mergeItems(w http.ResponseWriter, r *http.Request) {
	a, b, ok := pairBody(w, r)
	if !ok {
		return
	}
	kept, err := s.economy.MergeItems(r.Context(), userFrom(r.Context()).ID, a, b)
	if err != nil {
		writeEconomyError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toOwnedItemDTO(s.rulebook(), kept))
}

func (s *Server) grantChests(w http.ResponseWriter, r *http.Request) {
	var body struct {
		CaseID string `json:"caseId"`
		Count  int    `json:"count"`
	}
	if !decode(w, r, &body) || body.Count < 1 || body.Count > app.MaxIssue {
		writeError(w, 400, "invalid grant")
		return
	}
	if _, ok := s.rulebook().Type(body.CaseID); !ok {
		writeError(w, 404, "chest type not found")
		return
	}
	userID := r.PathValue("userID")
	found, err := s.identity.Profiles.Exists(r.Context(), userID)
	if err != nil {
		writeError(w, 500, "could not issue chests")
		return
	} else if !found {
		writeError(w, 404, "user not found")
		return
	}
	if _, err := s.economy.Issue(r.Context(), userID, body.CaseID, "admin", body.Count); err != nil {
		writeEconomyError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"userId": userID, "caseId": body.CaseID, "issued": body.Count})
}

// writeEconomyError says what the domain refused; another player's chest or item is the same as
// one that does not exist.
func writeEconomyError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, app.ErrNotFound):
		writeError(w, 404, "not found")
	case errors.Is(err, inventory.ErrUnknownItem):
		writeError(w, 404, "item not found")
	case errors.Is(err, chest.ErrUnknownType):
		writeError(w, 404, "chest type not found")
	case errors.Is(err, app.ErrInvalid), errors.Is(err, chest.ErrNoSession):
		writeError(w, 400, "invalid request")
	case errors.Is(err, chest.ErrUnavailable), errors.Is(err, chest.ErrNotOpening), errors.Is(err, chest.ErrWrongSession):
		writeError(w, 409, "chest is not available for this session")
	case errors.Is(err, chest.ErrMismatch):
		writeError(w, 409, "only two available chests of one type merge")
	case errors.Is(err, inventory.ErrNotTwins):
		writeError(w, 409, "only two damaged items of one kind merge")
	case errors.Is(err, inventory.ErrIntact):
		writeError(w, 409, "item is not damaged")
	case errors.Is(err, wallet.ErrInsufficient):
		writeError(w, 409, "not enough resources")
	default:
		writeError(w, 500, "could not update the economy")
	}
}

func toChestDTO(rb *rulebook.Rulebook, s chest.State) chestDTO {
	dto := chestDTO{
		ID: s.ID, CaseID: s.Type, Status: string(s.Status), Seed: s.Seed, Revision: s.Revision,
		Contents: make([]contentDTO, 0, len(s.Contents)), Traits: make([]traitDTO, 0, len(s.Traits)),
		Rarity: s.Rarity, Condition: s.Condition, Origin: originDTO{Source: s.Origin.Source, Parents: s.Origin.Parents},
		SessionID: s.Session, DestroyedAt: string(s.DestroyedAt),
	}
	var total float64
	for _, slot := range s.Contents {
		total += slot.Weight
	}
	for _, slot := range s.Contents {
		dto.Contents = append(dto.Contents, contentDTO{Item: rulebookItemDTO(rb, slot.Item, percent(slot.Weight, total)), Weight: slot.Weight})
	}
	for _, trait := range s.Traits {
		dto.Traits = append(dto.Traits, toTraitDTO(trait))
	}
	if s.Drop != nil {
		dto.Drop = &dropDTO{Item: rulebookItemDTO(rb, s.Drop.Item, 0), State: s.Drop.State}
	}
	return dto
}

// percent is a weight's share of the total in percent: an item's chance to drop.
func percent(weight, total float64) float64 {
	if total <= 0 {
		return 0
	}
	return math.Round(weight/total*10000) / 100
}

func toTraitDTO(t chest.Trait) traitDTO {
	return traitDTO{ID: t.ID, Intensity: t.Intensity, Seed: t.Seed}
}

func toAmountDTO(a wallet.Amount) amountDTO { return amountDTO{Resource: a.Resource, Value: a.Value} }

func toOwnedItemDTO(rb *rulebook.Rulebook, item inventory.Item) ownedItemDTO {
	return ownedItemDTO{ID: item.ID, Item: rulebookItemDTO(rb, item.Item, 0), State: item.State, Origin: item.Origin}
}

// rulebookItemDTO describes an item by the rulebook; one the rulebook no longer has keeps its id.
func rulebookItemDTO(rb *rulebook.Rulebook, id string, chance float64) itemDTO {
	item, _, ok := rb.Item(id)
	if !ok {
		return itemDTO{ID: id, Title: id, Image: "/api/v1/items/" + id + "/image.svg", Chance: chance}
	}
	return itemDTO{ID: item.ID, Title: item.Title, Image: itemImageURL(item.ID, item.Glyph), Type: item.Rarity, Chance: chance}
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

func pairBody(w http.ResponseWriter, r *http.Request) (string, string, bool) {
	var body struct {
		A string `json:"a"`
		B string `json:"b"`
	}
	if !decode(w, r, &body) || body.A == "" || body.B == "" || len(body.A) > 128 || len(body.B) > 128 {
		writeError(w, 400, "invalid pair")
		return "", "", false
	}
	return body.A, body.B, true
}

// parseGrants reads "type:count,type:count"; types the rulebook does not have and bad counts
// are errors.
func parseGrants(rb *rulebook.Rulebook, value string) ([]app.Grant, error) {
	var grants []app.Grant
	for _, part := range strings.Split(value, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		chestType, countText, ok := strings.Cut(part, ":")
		chestType = strings.TrimSpace(chestType)
		count, err := strconv.Atoi(strings.TrimSpace(countText))
		if _, known := rb.Type(chestType); !ok || err != nil || !known || count < 1 || count > app.MaxIssue {
			return nil, fmt.Errorf("invalid chest grant %q", part)
		}
		grants = append(grants, app.Grant{Type: chestType, Count: count})
	}
	return grants, nil
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

// newSeed picks a 32-bit seed: the client draws a chest's look from it on unsigned 32-bit seeds.
func newSeed() (uint64, error) {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		return 0, err
	}
	return uint64(binary.BigEndian.Uint32(b)), nil
}
