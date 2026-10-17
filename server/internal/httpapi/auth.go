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
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/voxel-vault/api/internal/store"
	"golang.org/x/oauth2"
	"gorm.io/gorm"
)

type ceremonyResponse struct {
	CeremonyID string `json:"ceremonyId"`
	Options    any    `json:"options"`
}

func (s *Server) registerOptions(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Handle      string `json:"handle"`
		DisplayName string `json:"displayName"`
	}
	if !decode(w, r, &body) {
		writeError(w, 400, "invalid request")
		return
	}
	body.Handle = strings.TrimSpace(strings.ToLower(body.Handle))
	body.DisplayName = strings.TrimSpace(body.DisplayName)
	if !validHandle(body.Handle) || body.DisplayName == "" || len(body.DisplayName) > 160 {
		writeError(w, 400, "handle or displayName is invalid")
		return
	}
	user := store.User{ID: randomID(), Handle: body.Handle, DisplayName: body.DisplayName}
	if err := s.db.WithContext(r.Context()).Create(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			writeError(w, 409, "handle already exists")
		} else {
			writeError(w, 500, "could not create account")
		}
		return
	}
	creation, session, err := s.webauthn.BeginRegistration(&user)
	if err != nil {
		_ = s.db.Delete(&user).Error
		writeError(w, 500, "could not start passkey registration")
		return
	}
	if err := s.saveCeremony(r.Context(), user.ID, "register", session); err != nil {
		_ = s.db.Delete(&user).Error
		writeError(w, 500, "could not persist registration challenge")
		return
	}
	writeJSON(w, 200, ceremonyResponse{CeremonyID: session.Challenge, Options: creation})
}

func (s *Server) registerVerify(w http.ResponseWriter, r *http.Request) {
	ceremony, user, session, ok := s.loadCeremony(w, r, "register")
	if !ok {
		return
	}
	credential, err := s.webauthn.FinishRegistration(&user, session, r)
	if err != nil {
		writeError(w, 400, "passkey registration verification failed")
		return
	}
	encodedID := base64.RawURLEncoding.EncodeToString(credential.ID)
	data, err := json.Marshal(credential)
	if err != nil {
		writeError(w, 500, "could not store passkey")
		return
	}
	err = s.db.WithContext(r.Context()).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&store.Credential{UserID: user.ID, CredentialID: encodedID, Data: data}).Error; err != nil {
			return err
		}
		return tx.Delete(&ceremony).Error
	})
	if err != nil {
		writeError(w, 500, "could not store passkey")
		return
	}
	if _, err := s.acl.AddGroupingPolicy(user.ID, s.config.DefaultRole); err != nil {
		writeError(w, 500, "could not assign default permissions")
		return
	}
	if err := s.issueSession(w, r, user); err != nil {
		writeError(w, 500, "could not start session")
		return
	}
	writeJSON(w, 201, map[string]any{"id": user.ID, "handle": user.Handle, "displayName": user.DisplayName, "roles": mustRoles(s.acl, user.ID)})
}

func (s *Server) loginOptions(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Handle string `json:"handle"`
	}
	if !decode(w, r, &body) {
		writeError(w, 400, "invalid request")
		return
	}
	var user store.User
	if err := s.db.WithContext(r.Context()).Preload("Credentials").First(&user, "handle = ?", strings.ToLower(strings.TrimSpace(body.Handle))).Error; err != nil || len(user.Credentials) == 0 {
		writeError(w, 401, "invalid credentials")
		return
	}
	assertion, session, err := s.webauthn.BeginLogin(&user)
	if err != nil {
		writeError(w, 500, "could not start passkey login")
		return
	}
	if err := s.saveCeremony(r.Context(), user.ID, "login", session); err != nil {
		writeError(w, 500, "could not persist login challenge")
		return
	}
	writeJSON(w, 200, ceremonyResponse{CeremonyID: session.Challenge, Options: assertion})
}

func (s *Server) loginVerify(w http.ResponseWriter, r *http.Request) {
	ceremony, user, session, ok := s.loadCeremony(w, r, "login")
	if !ok {
		return
	}
	credential, err := s.webauthn.FinishLogin(&user, session, r)
	if err != nil {
		writeError(w, 401, "passkey verification failed")
		return
	}
	data, err := json.Marshal(credential)
	if err != nil {
		writeError(w, 500, "could not update passkey")
		return
	}
	encodedID := base64.RawURLEncoding.EncodeToString(credential.ID)
	err = s.db.WithContext(r.Context()).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&store.Credential{}).Where("user_id = ? AND credential_id = ?", user.ID, encodedID).Update("data", data).Error; err != nil {
			return err
		}
		return tx.Delete(&ceremony).Error
	})
	if err != nil {
		writeError(w, 500, "could not update passkey")
		return
	}
	if err := s.issueSession(w, r, user); err != nil {
		writeError(w, 500, "could not start session")
		return
	}
	writeJSON(w, 200, map[string]any{"id": user.ID, "handle": user.Handle, "displayName": user.DisplayName, "roles": mustRoles(s.acl, user.ID)})
}

func (s *Server) saveCeremony(ctx context.Context, userID, kind string, session *webauthn.SessionData) error {
	data, err := json.Marshal(session)
	if err != nil {
		return err
	}
	return s.db.WithContext(ctx).Create(&store.Ceremony{ID: session.Challenge, UserID: userID, Kind: kind, Session: data, ExpiresAt: session.Expires}).Error
}

func (s *Server) loadCeremony(w http.ResponseWriter, r *http.Request, kind string) (store.Ceremony, store.User, webauthn.SessionData, bool) {
	id := r.Header.Get("X-Ceremony-ID")
	if id == "" {
		writeError(w, 400, "missing ceremony id")
		return store.Ceremony{}, store.User{}, webauthn.SessionData{}, false
	}
	var ceremony store.Ceremony
	if err := s.db.WithContext(r.Context()).First(&ceremony, "id = ? AND kind = ? AND expires_at > ?", id, kind, time.Now()).Error; err != nil {
		writeError(w, 400, "ceremony expired or missing")
		return ceremony, store.User{}, webauthn.SessionData{}, false
	}
	var session webauthn.SessionData
	if err := json.Unmarshal(ceremony.Session, &session); err != nil {
		writeError(w, 400, "invalid ceremony state")
		return ceremony, store.User{}, session, false
	}
	var user store.User
	if err := s.db.WithContext(r.Context()).Preload("Credentials").First(&user, "id = ?", ceremony.UserID).Error; err != nil {
		writeError(w, 400, "account missing")
		return ceremony, user, session, false
	}
	return ceremony, user, session, true
}

func (s *Server) telegramStart(w http.ResponseWriter, r *http.Request) {
	if s.telegramProvider == nil {
		writeError(w, 503, "Telegram login is not configured")
		return
	}
	state, err := randomToken(32)
	if err != nil {
		writeError(w, 500, "could not start Telegram login")
		return
	}
	nonce, err := randomToken(24)
	if err != nil {
		writeError(w, 500, "could not start Telegram login")
		return
	}
	verifier := oauth2.GenerateVerifier()
	flow := store.OAuthFlow{State: state, Nonce: nonce, Verifier: verifier, ExpiresAt: time.Now().Add(10 * time.Minute)}
	if err := s.db.WithContext(r.Context()).Create(&flow).Error; err != nil {
		writeError(w, 500, "could not persist Telegram login")
		return
	}
	url := s.telegramOAuth.AuthCodeURL(state, oauth2.S256ChallengeOption(verifier), oauth2.SetAuthURLParam("nonce", nonce))
	http.Redirect(w, r, url, http.StatusFound)
}

func (s *Server) telegramCallback(w http.ResponseWriter, r *http.Request) {
	if s.telegramProvider == nil {
		writeError(w, 503, "Telegram login is not configured")
		return
	}
	state := r.URL.Query().Get("state")
	var flow store.OAuthFlow
	if err := s.db.WithContext(r.Context()).First(&flow, "state = ? AND expires_at > ?", state, time.Now()).Error; err != nil {
		writeError(w, 400, "Telegram login state expired")
		return
	}
	s.db.WithContext(r.Context()).Delete(&flow)
	token, err := s.telegramOAuth.Exchange(r.Context(), r.URL.Query().Get("code"), oauth2.VerifierOption(flow.Verifier))
	if err != nil {
		writeError(w, 401, "Telegram authorization failed")
		return
	}
	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok {
		writeError(w, 401, "Telegram did not return an identity token")
		return
	}
	idToken, err := s.telegramVerifier.Verify(r.Context(), rawIDToken)
	if err != nil {
		// The reason stays in the server log (never the token itself): alg/kid tell which key failed.
		alg, kid := tokenHeader(rawIDToken)
		log.Printf("telegram: id token rejected: %v (alg=%s kid=%s)", err, alg, kid)
		writeError(w, 401, "Telegram identity token is invalid")
		return
	}
	var claims struct {
		Subject  string `json:"sub"`
		Nonce    string `json:"nonce"`
		Name     string `json:"name"`
		Username string `json:"preferred_username"`
	}
	if err := idToken.Claims(&claims); err != nil || claims.Subject == "" || claims.Nonce != flow.Nonce {
		writeError(w, 401, "Telegram identity did not match the login flow")
		return
	}
	user, err := s.findOrCreateTelegramUser(r.Context(), claims)
	if err != nil {
		writeError(w, 500, "could not create account")
		return
	}
	if err := s.issueSession(w, r, user); err != nil {
		writeError(w, 500, "could not start session")
		return
	}
	http.Redirect(w, r, s.config.FrontendURL, http.StatusSeeOther)
}

func (s *Server) findOrCreateTelegramUser(ctx context.Context, claims struct {
	Subject  string `json:"sub"`
	Nonce    string `json:"nonce"`
	Name     string `json:"name"`
	Username string `json:"preferred_username"`
}) (store.User, error) {
	var identity store.Identity
	err := s.db.WithContext(ctx).First(&identity, "provider = ? AND subject = ?", "telegram", claims.Subject).Error
	if err == nil {
		var user store.User
		err = s.db.WithContext(ctx).Preload("Credentials").First(&user, "id = ?", identity.UserID).Error
		return user, err
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return store.User{}, err
	}
	handle := "tg_" + claims.Subject
	if len(handle) > 80 {
		handle = handle[:80]
	}
	name := strings.TrimSpace(claims.Name)
	if name == "" {
		name = strings.TrimSpace(claims.Username)
	}
	if name == "" {
		name = "Игрок"
	}
	user := store.User{ID: randomID(), Handle: handle, DisplayName: name}
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&user).Error; err != nil {
			return err
		}
		return tx.Create(&store.Identity{UserID: user.ID, Provider: "telegram", Subject: claims.Subject}).Error
	})
	if err != nil {
		return store.User{}, err
	}
	if _, err := s.acl.AddGroupingPolicy(user.ID, s.config.DefaultRole); err != nil {
		return store.User{}, err
	}
	return user, nil
}

func (s *Server) sameOrigin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			allowed := false
			for _, value := range s.config.RPOrigins {
				if value == origin {
					allowed = true
					break
				}
			}
			if !allowed {
				writeError(w, 403, "origin not allowed")
				return
			}
		}
		next(w, r)
	}
}

func validHandle(value string) bool {
	return len(value) >= 3 && len(value) <= 80 && handlePattern.MatchString(value)
}

var handlePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]*$`)

func randomID() string { token, _ := randomToken(16); return strings.ReplaceAll(token, "-", "") }
func randomToken(length int) (string, error) {
	value := make([]byte, length)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(value), nil
}

// tokenHeader reads alg and kid from a JWT's header without trusting it (for logging only).
func tokenHeader(token string) (string, string) {
	header, _, _ := strings.Cut(token, ".")
	raw, err := base64.RawURLEncoding.DecodeString(header)
	if err != nil {
		return "?", "?"
	}
	var fields struct {
		Alg string `json:"alg"`
		Kid string `json:"kid"`
	}
	if json.Unmarshal(raw, &fields) != nil {
		return "?", "?"
	}
	return fields.Alg, fields.Kid
}

func tokenDigest(value string) string {
	digest := sha256.Sum256([]byte(value))
	return hex.EncodeToString(digest[:])
}

var _ = fmt.Sprintf
