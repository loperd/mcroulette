package store

import "time"

// EconomyOwner serializes the original economy and retains its starter marker.
// It carries only an opaque subject, never identity or authentication data.
type EconomyOwner struct {
	ID               string `gorm:"primaryKey;size:160"`
	StarterGrantedAt *time.Time
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
	// The chest's metadata (docs/reference/economy.md), frozen with the rulebook revision.
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
