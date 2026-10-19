package store

import (
	"fmt"

	"github.com/voxel-vault/api/internal/domain"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func Open(dsn string) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{TranslateError: true}) // ErrDuplicatedKey for unique handles
	if err != nil {
		return nil, fmt.Errorf("open PostgreSQL: %w", err)
	}
	if err := db.AutoMigrate(&User{}, &Credential{}, &Identity{}, &Ceremony{}, &OAuthFlow{}, &Session{}, &ChestType{}, &LootItem{}, &ChestInstance{}, &InventoryItem{}, &WalletBalance{}); err != nil {
		return nil, fmt.Errorf("migrate application schema: %w", err)
	}
	if err := seed(db); err != nil {
		return nil, err
	}
	return db, nil
}

func seed(db *gorm.DB) error {
	for _, chest := range domain.Cases {
		row := ChestType{ID: chest.ID, Rarity: chest.Rarity, Title: chest.Title, Collection: chest.Collection,
			Description: chest.Description, Accent: chest.Accent, Deep: chest.Deep, Highlight: chest.Highlight, Glow: chest.Glow}
		if err := db.FirstOrCreate(&row, ChestType{ID: chest.ID}).Error; err != nil {
			return fmt.Errorf("seed chest %s: %w", chest.ID, err)
		}
	}
	for _, item := range domain.Loot {
		row := item
		if err := db.FirstOrCreate(&row, LootItem{ID: item.ID}).Error; err != nil {
			return fmt.Errorf("seed loot item %s: %w", item.ID, err)
		}
	}
	return nil
}
