package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/voxel-vault/api/internal/app"
	"github.com/voxel-vault/api/internal/domain/chest"
	"github.com/voxel-vault/api/internal/domain/inventory"
	"github.com/voxel-vault/api/internal/domain/wallet"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ErrNotFound is the app's: no such chest of that owner, or no such player.
var ErrNotFound = app.ErrNotFound

// Tx is one transaction over the economy aggregates. Loading an aggregate locks it until the
// transaction ends, so two requests cannot change one chest, inventory or wallet at once.
type Tx struct{ db *gorm.DB }

// Transact runs fn in a transaction; an error from fn rolls everything back.
func Transact(ctx context.Context, db *gorm.DB, fn func(Tx) error) error {
	return db.WithContext(ctx).Transaction(func(tx *gorm.DB) error { return fn(Tx{db: tx}) })
}

func (t Tx) locked() *gorm.DB { return t.db.Clauses(clause.Locking{Strength: "UPDATE"}) }

// Chest loads and locks one chest of an owner.
func (t Tx) Chest(owner, id string) (*chest.Chest, error) {
	var row ChestInstance
	found := t.locked().Where("id = ? AND user_id = ?", id, owner).Limit(1).Find(&row)
	if found.Error != nil {
		return nil, found.Error
	}
	if found.RowsAffected == 0 {
		return nil, ErrNotFound
	}
	return row.chest()
}

// Chests lists an owner's chests, oldest first, without locking them.
func (t Tx) Chests(owner string) ([]*chest.Chest, error) {
	var rows []ChestInstance
	if err := t.db.Where("user_id = ?", owner).Order("created_at, id").Find(&rows).Error; err != nil {
		return nil, err
	}
	chests := make([]*chest.Chest, 0, len(rows))
	for _, row := range rows {
		c, err := row.chest()
		if err != nil {
			return nil, err
		}
		chests = append(chests, c)
	}
	return chests, nil
}

// SaveChest inserts a new chest or updates a stored one.
func (t Tx) SaveChest(c *chest.Chest) error {
	row, err := chestRow(c.State())
	if err != nil {
		return err
	}
	var stored ChestInstance
	found := t.db.Select("opened_at", "created_at").Where("id = ?", row.ID).Limit(1).Find(&stored)
	if found.Error != nil {
		return found.Error
	}
	if found.RowsAffected == 0 {
		return t.db.Create(&row).Error
	}
	row.OpenedAt, row.CreatedAt = stored.OpenedAt, stored.CreatedAt
	if row.Status == string(chest.Opened) && row.OpenedAt == nil {
		now := time.Now()
		row.OpenedAt = &now
	}
	return t.db.Model(&ChestInstance{}).Where("id = ?", row.ID).Select("*").Omit("id", "created_at").Updates(&row).Error
}

func chestRow(s chest.State) (ChestInstance, error) {
	contents, err := json.Marshal(s.Contents)
	if err != nil {
		return ChestInstance{}, err
	}
	traits, err := json.Marshal(s.Traits)
	if err != nil {
		return ChestInstance{}, err
	}
	parents, err := json.Marshal(s.Origin.Parents)
	if err != nil {
		return ChestInstance{}, err
	}
	row := ChestInstance{
		ID: s.ID, UserID: s.Owner, CaseID: s.Type, Status: string(s.Status), Seed: int64(s.Seed),
		Revision: s.Revision, Contents: contents, Traits: traits, Rarity: s.Rarity, Condition: s.Condition,
		OriginSource: s.Origin.Source, OriginParents: parents, DestroyedAt: string(s.DestroyedAt),
	}
	if s.Session != "" {
		row.SessionID = &s.Session
	}
	if s.Drop != nil {
		row.RewardID, row.DropState = &s.Drop.Item, s.Drop.State
	}
	return row, nil
}

func (row ChestInstance) chest() (*chest.Chest, error) {
	s := chest.State{
		ID: row.ID, Owner: row.UserID, Type: row.CaseID, Revision: row.Revision, Seed: uint64(row.Seed),
		Rarity: row.Rarity, Condition: row.Condition, Status: chest.Status(row.Status),
		Origin: chest.Origin{Source: row.OriginSource}, DestroyedAt: chest.Moment(row.DestroyedAt),
	}
	if err := errors.Join(unmarshal(row.Contents, &s.Contents), unmarshal(row.Traits, &s.Traits), unmarshal(row.OriginParents, &s.Origin.Parents)); err != nil {
		return nil, fmt.Errorf("chest %s: %w", row.ID, err)
	}
	if row.SessionID != nil {
		s.Session = *row.SessionID
	}
	if row.RewardID != nil {
		s.Drop = &chest.Drop{Item: *row.RewardID, State: row.DropState}
	}
	return chest.Restore(s), nil
}

// unmarshal reads a jsonb column; an empty one (a chest issued before metadata) stays empty.
func unmarshal(data []byte, to any) error {
	if len(data) == 0 {
		return nil
	}
	return json.Unmarshal(data, to)
}

// lockOwner serialises changes to one player's inventory and wallet on the user row: their rows
// may not exist yet, so they cannot be locked themselves.
func (t Tx) lockOwner(owner string) error {
	var user User
	found := t.locked().Select("id").Where("id = ?", owner).Limit(1).Find(&user)
	if found.Error == nil && found.RowsAffected == 0 {
		return ErrNotFound
	}
	return found.Error
}

// FirstStarter locks the player and marks their starter grant; true the first time only.
func (t Tx) FirstStarter(owner string) (bool, error) {
	var user User
	found := t.locked().Select("id", "starter_granted_at").Where("id = ?", owner).Limit(1).Find(&user)
	if found.Error != nil {
		return false, found.Error
	}
	if found.RowsAffected == 0 {
		return false, ErrNotFound
	}
	if user.StarterGrantedAt != nil {
		return false, nil
	}
	return true, t.db.Model(&User{}).Where("id = ?", owner).Update("starter_granted_at", time.Now()).Error
}

// OpenedAt is when each of an owner's opened chests was opened.
func (t Tx) OpenedAt(owner string) (map[string]time.Time, error) {
	var rows []ChestInstance
	if err := t.db.Select("id", "opened_at").Where("user_id = ? AND opened_at IS NOT NULL", owner).Find(&rows).Error; err != nil {
		return nil, err
	}
	at := make(map[string]time.Time, len(rows))
	for _, row := range rows {
		at[row.ID] = *row.OpenedAt
	}
	return at, nil
}

// Inventory loads and locks a player's inventory.
func (t Tx) Inventory(owner string) (*inventory.Inventory, error) {
	if err := t.lockOwner(owner); err != nil {
		return nil, err
	}
	var rows []InventoryItem
	if err := t.db.Where("user_id = ?", owner).Order("created_at, id").Find(&rows).Error; err != nil {
		return nil, err
	}
	items := make([]inventory.Item, len(rows))
	for i, row := range rows {
		items[i] = inventory.Item{ID: row.ID, Item: row.ItemID, State: row.State, Origin: row.Origin}
	}
	return inventory.Restore(owner, items), nil
}

// SaveInventory stores the items as they are now: new ones are added, changed ones updated and
// the ones gone (salvaged, sold, merged away) deleted.
func (t Tx) SaveInventory(inv *inventory.Inventory) error {
	items := inv.Items()
	ids := make([]string, len(items))
	for i, item := range items {
		ids[i] = item.ID
		row := InventoryItem{ID: item.ID, UserID: inv.Owner(), ItemID: item.Item, State: item.State, Origin: item.Origin}
		err := t.db.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "id"}},
			DoUpdates: clause.AssignmentColumns([]string{"state", "updated_at"}),
		}).Create(&row).Error
		if err != nil {
			return err
		}
	}
	gone := t.db.Where("user_id = ?", inv.Owner())
	if len(ids) > 0 {
		gone = gone.Where("id NOT IN ?", ids)
	}
	return gone.Delete(&InventoryItem{}).Error
}

// Wallet loads and locks a player's wallet.
func (t Tx) Wallet(owner string) (*wallet.Wallet, error) {
	if err := t.lockOwner(owner); err != nil {
		return nil, err
	}
	var rows []WalletBalance
	if err := t.db.Where("user_id = ?", owner).Find(&rows).Error; err != nil {
		return nil, err
	}
	balances := make(map[string]int64, len(rows))
	for _, row := range rows {
		balances[row.Resource] = row.Value
	}
	return wallet.Restore(owner, balances), nil
}

func (t Tx) SaveWallet(w *wallet.Wallet) error {
	for resource, value := range w.Balances() {
		row := WalletBalance{UserID: w.Owner(), Resource: resource, Value: value}
		err := t.db.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "user_id"}, {Name: "resource"}},
			DoUpdates: clause.AssignmentColumns([]string{"value", "updated_at"}),
		}).Create(&row).Error
		if err != nil {
			return err
		}
	}
	return nil
}

// Economy is the app's store over PostgreSQL.
type Economy struct{ DB *gorm.DB }

func (e Economy) Transact(ctx context.Context, fn func(app.Tx) error) error {
	return Transact(ctx, e.DB, func(tx Tx) error { return fn(tx) })
}
