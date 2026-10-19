package store

import (
	"encoding/json"
	"time"

	"github.com/go-webauthn/webauthn/webauthn"
)

type User struct {
	ID          string `gorm:"primaryKey;size:32"`
	Handle      string `gorm:"uniqueIndex;size:80;not null"`
	DisplayName string `gorm:"size:160;not null"`
	// When the player got the starter chests (once per account; nil until the first inventory read).
	StarterGrantedAt *time.Time
	CreatedAt        time.Time
	UpdatedAt        time.Time
	Credentials      []Credential `gorm:"foreignKey:UserID"`
}

func (u *User) WebAuthnID() []byte          { return []byte(u.ID) }
func (u *User) WebAuthnName() string        { return u.Handle }
func (u *User) WebAuthnDisplayName() string { return u.DisplayName }
func (u *User) WebAuthnCredentials() []webauthn.Credential {
	credentials := make([]webauthn.Credential, 0, len(u.Credentials))
	for _, row := range u.Credentials {
		var credential webauthn.Credential
		if json.Unmarshal(row.Data, &credential) == nil {
			credentials = append(credentials, credential)
		}
	}
	return credentials
}

type Credential struct {
	ID           uint   `gorm:"primaryKey"`
	UserID       string `gorm:"index;size:32;not null"`
	CredentialID string `gorm:"uniqueIndex;size:512;not null"`
	Data         []byte `gorm:"type:jsonb;not null"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type Identity struct {
	ID        uint   `gorm:"primaryKey"`
	UserID    string `gorm:"index;size:32;not null"`
	Provider  string `gorm:"uniqueIndex:idx_provider_subject;size:32;not null"`
	Subject   string `gorm:"uniqueIndex:idx_provider_subject;size:160;not null"`
	CreatedAt time.Time
}

type Ceremony struct {
	ID        string    `gorm:"primaryKey;size:64"`
	UserID    string    `gorm:"index;size:32;not null"`
	Kind      string    `gorm:"size:24;not null"`
	Session   []byte    `gorm:"type:jsonb;not null"`
	ExpiresAt time.Time `gorm:"index;not null"`
}

type OAuthFlow struct {
	State     string    `gorm:"primaryKey;size:64"`
	Nonce     string    `gorm:"size:64;not null"`
	Verifier  string    `gorm:"size:256;not null"`
	ExpiresAt time.Time `gorm:"index;not null"`
}

type Session struct {
	TokenHash string    `gorm:"primaryKey;size:64"`
	UserID    string    `gorm:"index;size:32;not null"`
	ExpiresAt time.Time `gorm:"index;not null"`
	CreatedAt time.Time
}

type ChestType struct {
	ID          string `gorm:"primaryKey;size:64"`
	Rarity      string `gorm:"size:24;not null;index"`
	Title       string `gorm:"size:160;not null"`
	Collection  string `gorm:"size:160;not null"`
	Description string `gorm:"size:500;not null"`
	Accent      string `gorm:"size:7;not null"`
	Deep        string `gorm:"size:7;not null"`
	Highlight   string `gorm:"size:7;not null"`
	Glow        string `gorm:"size:9;not null"`
}

type LootItem struct {
	ID      string  `gorm:"primaryKey;size:96"`
	CaseID  string  `gorm:"index;size:64;not null"`
	Title   string  `gorm:"size:180;not null"`
	Rarity  string  `gorm:"size:24;not null"`
	Weight  float64 `gorm:"not null"`
	Palette string  `gorm:"size:7;not null"`
	Glyph   string  `gorm:"size:32;not null"`
}

type CaseRoll struct {
	ID         uint   `gorm:"primaryKey"`
	SessionID  string `gorm:"uniqueIndex:idx_case_roll_session_user;size:128;not null"`
	UserID     string `gorm:"uniqueIndex:idx_case_roll_session_user;size:32;not null"`
	CaseID     string `gorm:"size:64;not null"`
	LootItemID string `gorm:"size:96;not null"`
	CreatedAt  time.Time
}

// ChestInstance is one chest a player owns. Only the server issues them (a starter grant, an
// admin grant); the player can only open them: available → opening (one session) → opened with
// the session's rolled reward, or destroyed with none.
type ChestInstance struct {
	ID     string `gorm:"primaryKey;size:36"`
	UserID string `gorm:"index:idx_chest_owner_status,priority:1;size:32;not null"`
	CaseID string `gorm:"size:64;not null"`
	Status string `gorm:"index:idx_chest_owner_status,priority:2;size:16;not null"`
	// Seed of the chest's look and fate, chosen at issue: the client derives the same appearance.
	Seed int64 `gorm:"not null"`
	// The look once it changed (damage from a landing); empty while it is the issued one.
	Appearance []byte  `gorm:"type:jsonb"`
	SessionID  *string `gorm:"size:128"`
	RewardID   *string `gorm:"size:96"`
	OpenedAt   *time.Time
	CreatedAt  time.Time
	UpdatedAt  time.Time
}
