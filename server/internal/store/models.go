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

// ChestInstance is one chest a player owns, as the chest aggregate stores it. Appearance is the
// look clients once reported; nothing writes it any more.
type ChestInstance struct {
	ID     string `gorm:"primaryKey;size:36"`
	UserID string `gorm:"index:idx_chest_owner_status,priority:1;size:32;not null"`
	CaseID string `gorm:"size:64;not null"`
	Status string `gorm:"index:idx_chest_owner_status,priority:2;size:16;not null"`
	// Seed of the chest's look and fate, chosen at issue: the client derives the same appearance.
	Seed       int64   `gorm:"not null"`
	Appearance []byte  `gorm:"type:jsonb"`
	SessionID  *string `gorm:"size:128"`
	// RewardID is the dropped item; DropState the state it fell in.
	RewardID  *string `gorm:"size:96"`
	DropState string  `gorm:"size:16;not null;default:''"`
	OpenedAt  *time.Time
	// The chest's metadata (docs/rewrite/chest-metadata.md), frozen with the rulebook revision.
	Revision      string  `gorm:"size:64;not null;default:''"`
	Contents      []byte  `gorm:"type:jsonb"`
	Traits        []byte  `gorm:"type:jsonb"`
	Rarity        string  `gorm:"size:24;not null;default:''"`
	Condition     float64 `gorm:"not null;default:1"`
	OriginSource  string  `gorm:"size:32;not null;default:''"`
	OriginParents []byte  `gorm:"type:jsonb"`
	DestroyedAt   string  `gorm:"size:16;not null;default:''"`
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

// InventoryItem is one item a player owns and the state it is in.
type InventoryItem struct {
	ID        string `gorm:"primaryKey;size:36"`
	UserID    string `gorm:"index;size:32;not null"`
	ItemID    string `gorm:"size:96;not null"`
	State     string `gorm:"size:16;not null"`
	Origin    string `gorm:"size:36;not null"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

// WalletBalance is a player's balance of one resource: the currency or a collection's material.
type WalletBalance struct {
	UserID    string `gorm:"primaryKey;size:32"`
	Resource  string `gorm:"primaryKey;size:64"`
	Value     int64  `gorm:"not null;check:value >= 0"`
	UpdatedAt time.Time
}
