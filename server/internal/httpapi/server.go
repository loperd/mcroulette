package httpapi

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/casbin/casbin/v3"
	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/voxel-vault/api/internal/config"
	"github.com/voxel-vault/api/internal/domain"
	"github.com/voxel-vault/api/internal/store"
	"golang.org/x/oauth2"
	"gorm.io/gorm"
)

const sessionCookie = "vv_session"
const sessionLifetime = 30 * 24 * time.Hour

type contextKey string

const userContextKey contextKey = "user"

type Server struct {
	db               *gorm.DB
	config           config.Config
	webauthn         *webauthn.WebAuthn
	acl              *casbin.Enforcer
	telegramProvider *oidc.Provider
	telegramVerifier *oidc.IDTokenVerifier
	telegramOAuth    oauth2.Config
	mux              *http.ServeMux
}

func New(db *gorm.DB, cfg config.Config, acl *casbin.Enforcer) (*Server, error) {
	wa, err := webauthn.New(&webauthn.Config{RPID: cfg.RPID, RPDisplayName: cfg.RPDisplayName, RPOrigins: cfg.RPOrigins,
		AttestationPreference: protocol.PreferNoAttestation, AuthenticatorSelection: webauthn.SelectAuthenticator("", nil, "required")})
	if err != nil {
		return nil, fmt.Errorf("configure WebAuthn: %w", err)
	}
	s := &Server{db: db, config: cfg, webauthn: wa, acl: acl, mux: http.NewServeMux()}
	if cfg.TelegramClientID != "" && cfg.TelegramSecret != "" && cfg.TelegramRedirect != "" {
		provider, err := oidc.NewProvider(context.Background(), "https://oauth.telegram.org")
		if err != nil {
			return nil, fmt.Errorf("discover Telegram OIDC: %w", err)
		}
		s.telegramProvider = provider
		var discovery struct {
			JWKS string `json:"jwks_uri"`
		}
		if err := provider.Claims(&discovery); err != nil || discovery.JWKS == "" {
			return nil, fmt.Errorf("read Telegram OIDC keys URL: %v", err)
		}
		// Telegram's key set includes a secp256k1 key the standard key set cannot parse.
		s.telegramVerifier = oidc.NewVerifier("https://oauth.telegram.org", newLenientKeySet(discovery.JWKS),
			&oidc.Config{ClientID: cfg.TelegramClientID, SupportedSigningAlgs: []string{"RS256", "ES256", "EdDSA"}})
		s.telegramOAuth = oauth2.Config{ClientID: cfg.TelegramClientID, ClientSecret: cfg.TelegramSecret,
			Endpoint: provider.Endpoint(), RedirectURL: cfg.TelegramRedirect, Scopes: []string{oidc.ScopeOpenID, "profile"}}
	}
	s.routes()
	return s, nil
}

func (s *Server) Handler() http.Handler {
	return securityHeaders(s.mux)
}

func (s *Server) routes() {
	s.mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	s.mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		sqlDB, err := s.db.DB()
		if err == nil {
			err = sqlDB.PingContext(r.Context())
		}
		if err != nil {
			writeError(w, http.StatusServiceUnavailable, "database unavailable")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
	})
	s.mux.HandleFunc("GET /api/v1/cases", s.listCases)
	s.mux.HandleFunc("GET /api/v1/cases/{caseID}/catalog", s.caseCatalog)
	s.mux.HandleFunc("GET /api/v1/items/{itemID}/image.svg", s.itemImage)
	s.mux.HandleFunc("POST /api/v1/cases/{caseID}/roll", s.sameOrigin(s.requirePermission("/api/v1/cases/:caseID/roll", "POST", s.rollLoot)))
	s.mux.HandleFunc("POST /api/v1/auth/passkeys/register/options", s.sameOrigin(s.registerOptions))
	s.mux.HandleFunc("POST /api/v1/auth/passkeys/register/verify", s.sameOrigin(s.registerVerify))
	s.mux.HandleFunc("POST /api/v1/auth/passkeys/login/options", s.sameOrigin(s.loginOptions))
	s.mux.HandleFunc("POST /api/v1/auth/passkeys/login/verify", s.sameOrigin(s.loginVerify))
	s.mux.HandleFunc("GET /api/v1/auth/providers", func(w http.ResponseWriter, _ *http.Request) {
		// The login screen shows only the ways in that this deployment has configured.
		writeJSON(w, http.StatusOK, map[string]bool{"passkey": true, "telegram": s.telegramProvider != nil})
	})
	s.mux.HandleFunc("GET /api/v1/auth/telegram/start", s.telegramStart)
	s.mux.HandleFunc("GET /api/v1/auth/telegram/callback", s.telegramCallback)
	s.mux.HandleFunc("GET /api/v1/me", s.requirePermission("/api/v1/me", "GET", s.me))
	s.mux.HandleFunc("POST /api/v1/auth/logout", s.sameOrigin(s.requireUser(s.logout)))
	s.mux.HandleFunc("POST /api/v1/access/users/{userID}/roles", s.sameOrigin(s.requireUser(s.assignRole)))
}

type itemDTO struct {
	ID     string  `json:"id"`
	Title  string  `json:"title"`
	Image  string  `json:"image"`
	Type   string  `json:"type"`
	Chance float64 `json:"chance"`
}

func (s *Server) listCases(w http.ResponseWriter, r *http.Request) {
	var cases []store.ChestType
	if err := s.db.WithContext(r.Context()).Order("id").Find(&cases).Error; err != nil {
		writeError(w, 500, "could not list chest types")
		return
	}
	writeJSON(w, http.StatusOK, cases)
}

func (s *Server) caseCatalog(w http.ResponseWriter, r *http.Request) {
	caseID := r.PathValue("caseID")
	if _, ok := domain.CaseByID(caseID); !ok {
		writeError(w, 404, "chest type not found")
		return
	}
	var rows []store.LootItem
	if err := s.db.WithContext(r.Context()).Where("case_id = ?", caseID).Order("id").Find(&rows).Error; err != nil {
		writeError(w, 500, "could not load loot table")
		return
	}
	dtos := make([]itemDTO, 0, len(rows))
	for _, item := range rows {
		dtos = append(dtos, toItemDTO(item))
	}
	writeJSON(w, http.StatusOK, dtos)
}

func (s *Server) rollLoot(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	caseID := r.PathValue("caseID")
	if _, ok := domain.CaseByID(caseID); !ok {
		writeError(w, 404, "chest type not found")
		return
	}
	var request struct {
		SessionID string `json:"sessionId"`
	}
	if !decode(w, r, &request) || strings.TrimSpace(request.SessionID) == "" || len(request.SessionID) > 128 {
		writeError(w, 400, "invalid sessionId")
		return
	}
	var existing store.CaseRoll
	if err := s.db.WithContext(r.Context()).Where("session_id = ? AND user_id = ?", request.SessionID, user.ID).First(&existing).Error; err == nil {
		s.writeRolledItem(w, r, existing.LootItemID)
		return
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		writeError(w, 500, "could not read roll")
		return
	}
	var rows []store.LootItem
	if err := s.db.WithContext(r.Context()).Where("case_id = ?", caseID).Find(&rows).Error; err != nil {
		writeError(w, 500, "could not load loot table")
		return
	}
	item, err := weightedItem(rows)
	if err != nil {
		writeError(w, 500, "loot table is empty")
		return
	}
	roll := store.CaseRoll{SessionID: request.SessionID, UserID: user.ID, CaseID: caseID, LootItemID: item.ID}
	if err := s.db.WithContext(r.Context()).Create(&roll).Error; err != nil {
		// Concurrent retries converge on the unique (session,user) result.
		if existingErr := s.db.WithContext(r.Context()).Where("session_id = ? AND user_id = ?", request.SessionID, user.ID).First(&existing).Error; existingErr == nil {
			s.writeRolledItem(w, r, existing.LootItemID)
			return
		}
		writeError(w, 500, "could not persist roll")
		return
	}
	writeJSON(w, http.StatusOK, toItemDTO(item))
}

func (s *Server) writeRolledItem(w http.ResponseWriter, r *http.Request, id string) {
	var item store.LootItem
	if err := s.db.WithContext(r.Context()).First(&item, "id = ?", id).Error; err != nil {
		writeError(w, 500, "stored roll item missing")
		return
	}
	writeJSON(w, http.StatusOK, toItemDTO(item))
}

func toItemDTO(item store.LootItem) itemDTO {
	return itemDTO{ID: item.ID, Title: item.Title, Image: "/api/v1/items/" + item.ID + "/image.svg", Type: item.Rarity, Chance: item.Weight}
}

func weightedItem(items []store.LootItem) (store.LootItem, error) {
	var total int64
	for _, item := range items {
		if item.Weight > 0 {
			total += int64(item.Weight * 1000)
		}
	}
	if total <= 0 {
		return store.LootItem{}, errors.New("no positive weights")
	}
	n, err := rand.Int(rand.Reader, big.NewInt(total))
	if err != nil {
		return store.LootItem{}, err
	}
	target := n.Int64()
	for _, item := range items {
		weight := int64(item.Weight * 1000)
		if weight <= 0 {
			continue
		}
		if target < weight {
			return item, nil
		}
		target -= weight
	}
	return store.LootItem{}, errors.New("weighted selection failed")
}

func (s *Server) itemImage(w http.ResponseWriter, r *http.Request) {
	var item store.LootItem
	if err := s.db.WithContext(r.Context()).First(&item, "id = ?", r.PathValue("itemID")).Error; err != nil {
		writeError(w, 404, "item image not found")
		return
	}
	w.Header().Set("Content-Type", "image/svg+xml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=86400, immutable")
	w.WriteHeader(http.StatusOK)
	_, _ = io.WriteString(w, itemSVG(item))
}

func (s *Server) requireUser(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, err := s.sessionUser(r)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "authentication required")
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), userContextKey, user)))
	}
}

func (s *Server) requirePermission(object, action string, next http.HandlerFunc) http.HandlerFunc {
	return s.requireUser(func(w http.ResponseWriter, r *http.Request) {
		user := userFrom(r.Context())
		allowed, err := s.acl.Enforce(user.ID, object, action)
		if err != nil {
			writeError(w, 500, "authorization check failed")
			return
		}
		if !allowed {
			writeError(w, 403, "permission denied")
			return
		}
		next(w, r)
	})
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	roles, err := s.acl.GetRolesForUser(user.ID)
	if err != nil {
		writeError(w, 500, "could not resolve access roles")
		return
	}
	writeJSON(w, 200, map[string]any{"id": user.ID, "handle": user.Handle, "displayName": user.DisplayName, "roles": roles})
}

func (s *Server) assignRole(w http.ResponseWriter, r *http.Request) {
	caller := userFrom(r.Context())
	allowed, err := s.acl.Enforce(caller.ID, "rbac", "assign")
	if err != nil {
		writeError(w, 500, "authorization check failed")
		return
	}
	if !allowed {
		writeError(w, 403, "permission denied")
		return
	}
	var body struct {
		Role string `json:"role"`
	}
	if !decode(w, r, &body) || !validRole(body.Role) {
		writeError(w, 400, "invalid role")
		return
	}
	userID := r.PathValue("userID")
	var target store.User
	if err := s.db.WithContext(r.Context()).First(&target, "id = ?", userID).Error; err != nil {
		writeError(w, 404, "user not found")
		return
	}
	_, err = s.acl.AddGroupingPolicy(target.ID, body.Role)
	if err != nil {
		writeError(w, 500, "could not assign role")
		return
	}
	writeJSON(w, 200, map[string]any{"userId": target.ID, "roles": mustRoles(s.acl, target.ID)})
}

func validRole(value string) bool {
	return regexp.MustCompile(`^[a-zA-Z0-9:_-]{1,80}$`).MatchString(value)
}
func mustRoles(acl *casbin.Enforcer, userID string) []string {
	roles, _ := acl.GetRolesForUser(userID)
	return roles
}
func userFrom(ctx context.Context) store.User { return ctx.Value(userContextKey).(store.User) }

func (s *Server) sessionUser(r *http.Request) (store.User, error) {
	cookie, err := r.Cookie(sessionCookie)
	if err != nil || cookie.Value == "" {
		return store.User{}, errors.New("missing session")
	}
	hash := sha256.Sum256([]byte(cookie.Value))
	var session store.Session
	if err := s.db.WithContext(r.Context()).First(&session, "token_hash = ? AND expires_at > ?", hex.EncodeToString(hash[:]), time.Now()).Error; err != nil {
		return store.User{}, err
	}
	var user store.User
	if err := s.db.WithContext(r.Context()).Preload("Credentials").First(&user, "id = ?", session.UserID).Error; err != nil {
		return store.User{}, err
	}
	return user, nil
}

func (s *Server) issueSession(w http.ResponseWriter, r *http.Request, user store.User) error {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	hash := sha256.Sum256([]byte(token))
	row := store.Session{TokenHash: hex.EncodeToString(hash[:]), UserID: user.ID, ExpiresAt: time.Now().Add(sessionLifetime)}
	if err := s.db.WithContext(r.Context()).Create(&row).Error; err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: token, Path: "/", HttpOnly: true, Secure: s.config.CookieSecure,
		SameSite: http.SameSiteLaxMode, Expires: row.ExpiresAt, MaxAge: int(sessionLifetime.Seconds())})
	return nil
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(sessionCookie); err == nil {
		hash := sha256.Sum256([]byte(cookie.Value))
		s.db.WithContext(r.Context()).Delete(&store.Session{}, "token_hash = ?", hex.EncodeToString(hash[:]))
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: "", Path: "/", HttpOnly: true, Secure: s.config.CookieSecure,
		SameSite: http.SameSiteLaxMode, MaxAge: -1, Expires: time.Unix(0, 0)})
	w.WriteHeader(http.StatusNoContent)
}

func decode(w http.ResponseWriter, r *http.Request, value any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(value); err != nil {
		return false
	}
	return decoder.Decode(&struct{}{}) == io.EOF
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "same-origin")
		w.Header().Set("X-Frame-Options", "DENY")
		next.ServeHTTP(w, r)
	})
}

var _ = domain.Cases
