package store_test

import (
	"context"
	"errors"
	"fmt"
	"os"
	"reflect"
	"testing"
	"time"

	"github.com/voxel-vault/api/internal/domain/chest"
	"github.com/voxel-vault/api/internal/domain/inventory"
	"github.com/voxel-vault/api/internal/domain/rulebook"
	"github.com/voxel-vault/api/internal/domain/rulebook/rulebooktest"
	"github.com/voxel-vault/api/internal/domain/wallet"
	"github.com/voxel-vault/api/internal/store"
	"gorm.io/gorm"
)

// openTestDB needs a disposable database: TEST_DATABASE_URL=postgres://… go test ./internal/store/
func openTestDB(t *testing.T) (*gorm.DB, string) {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	db, err := store.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	owner := fmt.Sprintf("t%d", time.Now().UnixNano())[:20]
	if err := db.Create(&store.EconomyOwner{ID: owner}).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		for _, model := range []any{&store.ChestInstance{}, &store.InventoryItem{}, &store.WalletBalance{}, &store.EconomyOwner{}} {
			column := "user_id"
			if _, isUser := model.(*store.EconomyOwner); isUser {
				column = "id"
			}
			db.Where(column+" = ?", owner).Delete(model)
		}
	})
	return db, owner
}

func TestChestRoundTrip(t *testing.T) {
	db, owner := openTestDB(t)
	rb := rulebooktest.Build(t, rulebooktest.Set(map[string]float64{"trait.group.aging.chance": 1, "chest.destroy.impact.perWear": 0, "chest.destroy.opening.perWear": 0}))
	ctx := context.Background()
	issued, err := chest.Issue(rb, chest.IssueRequest{ID: newID(), Owner: owner, Type: "ender", Source: "admin", Seed: 42})
	if err != nil {
		t.Fatal(err)
	}
	must(t, store.Transact(ctx, db, func(tx store.Tx) error { return tx.SaveChest(issued) }))
	must(t, store.Transact(ctx, db, func(tx store.Tx) error {
		c, err := tx.Chest(owner, issued.State().ID)
		if err != nil {
			return err
		}
		if !reflect.DeepEqual(c.State(), issued.State()) {
			return fmt.Errorf("stored %+v\nloaded %+v", issued.State(), c.State())
		}
		if _, err := c.Claim(rb, nil, "s"); err != nil {
			return err
		}
		if _, err := c.Open(rb, nil, "s"); err != nil {
			return err
		}
		return tx.SaveChest(c)
	}))
	var row store.ChestInstance
	must(t, db.First(&row, "id = ?", issued.State().ID).Error)
	if row.Status != string(chest.Opened) || row.RewardID == nil || row.OpenedAt == nil || row.DropState == "" {
		t.Fatalf("opened chest stored as %+v", row)
	}
	err = store.Transact(ctx, db, func(tx store.Tx) error { _, err := tx.Chest("someone-else", row.ID); return err })
	if !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("another owner's chest: %v", err)
	}
}

func TestInventoryAndWalletRoundTrip(t *testing.T) {
	db, owner := openTestDB(t)
	rb := rulebooktest.Build(t)
	ctx := context.Background()
	a, b := newID(), newID()
	must(t, store.Transact(ctx, db, func(tx store.Tx) error {
		inv, err := tx.Inventory(owner)
		if err != nil {
			return err
		}
		for _, id := range []string{a, b} {
			if err := inv.Receive(rb, inventory.Item{ID: id, Item: "item-i", State: "heavy", Origin: "c"}); err != nil {
				return err
			}
		}
		w, err := tx.Wallet(owner)
		if err != nil {
			return err
		}
		if err := w.Credit(wallet.Amount{Resource: "end-shards", Value: 20}); err != nil {
			return err
		}
		if _, err := inv.Repair(rb, w, a, rulebook.Situation{}); err != nil {
			return err
		}
		if _, err := inv.Salvage(rb, w, b, nil); err != nil {
			return err
		}
		return errors.Join(tx.SaveInventory(inv), tx.SaveWallet(w))
	}))
	must(t, store.Transact(ctx, db, func(tx store.Tx) error {
		inv, err := tx.Inventory(owner)
		if err != nil {
			return err
		}
		w, err := tx.Wallet(owner)
		if err != nil {
			return err
		}
		want := []inventory.Item{{ID: a, Item: "item-i", State: "slight", Origin: "c"}}
		if !reflect.DeepEqual(inv.Items(), want) {
			return fmt.Errorf("items %+v", inv.Items())
		}
		if got := w.Balance("end-shards"); got != 20-16+8 {
			return fmt.Errorf("balance %d", got)
		}
		return nil
	}))
}

func newID() string { return fmt.Sprintf("%036d", time.Now().UnixNano()) }

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

func TestFirstStarterOnce(t *testing.T) {
	db, owner := openTestDB(t)
	ctx := context.Background()
	for i, want := range []bool{true, false} {
		must(t, store.Transact(ctx, db, func(tx store.Tx) error {
			first, err := tx.FirstStarter(owner)
			if err == nil && first != want {
				t.Errorf("call %d: first = %v", i, first)
			}
			return err
		}))
	}
	err := store.Transact(ctx, db, func(tx store.Tx) error { _, err := tx.FirstStarter("nobody"); return err })
	if !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("unknown player: %v", err)
	}
}
