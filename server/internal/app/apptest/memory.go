// Package apptest is an in-memory store for tests of the use cases and their adapters.
package apptest

import (
	"context"

	"github.com/voxel-vault/api/internal/app"
	"github.com/voxel-vault/api/internal/domain/chest"
	"github.com/voxel-vault/api/internal/domain/inventory"
	"github.com/voxel-vault/api/internal/domain/wallet"
)

// Memory is an app.Store in memory; a failing transaction leaves it untouched.
type Memory struct {
	Chests   map[string]chest.State
	Items    map[string][]inventory.Item
	Balances map[string]map[string]int64
	Starters map[string]bool
}

type memTx struct{ m *Memory }

func NewMemory() *Memory {
	return &Memory{Chests: map[string]chest.State{}, Items: map[string][]inventory.Item{}, Balances: map[string]map[string]int64{}, Starters: map[string]bool{}}
}

func (m *Memory) Transact(_ context.Context, fn func(app.Tx) error) error {
	work := NewMemory()
	for k, v := range m.Starters {
		work.Starters[k] = v
	}
	for k, v := range m.Chests {
		work.Chests[k] = v
	}
	for k, v := range m.Items {
		work.Items[k] = v
	}
	for k, v := range m.Balances {
		work.Balances[k] = v
	}
	if err := fn(memTx{work}); err != nil {
		return err
	}
	*m = *work
	return nil
}

func (t memTx) Chest(owner, id string) (*chest.Chest, error) {
	s, ok := t.m.Chests[id]
	if !ok || s.Owner != owner {
		return nil, app.ErrNotFound
	}
	return chest.Restore(s), nil
}

func (t memTx) Chests(owner string) ([]*chest.Chest, error) {
	var out []*chest.Chest
	for _, s := range t.m.Chests {
		if s.Owner == owner {
			out = append(out, chest.Restore(s))
		}
	}
	return out, nil
}

func (t memTx) SaveChest(c *chest.Chest) error { t.m.Chests[c.State().ID] = c.State(); return nil }
func (t memTx) Inventory(owner string) (*inventory.Inventory, error) {
	return inventory.Restore(owner, t.m.Items[owner]), nil
}
func (t memTx) SaveInventory(inv *inventory.Inventory) error {
	t.m.Items[inv.Owner()] = inv.Items()
	return nil
}
func (t memTx) Wallet(owner string) (*wallet.Wallet, error) {
	return wallet.Restore(owner, t.m.Balances[owner]), nil
}
func (t memTx) SaveWallet(w *wallet.Wallet) error { t.m.Balances[w.Owner()] = w.Balances(); return nil }
func (t memTx) FirstStarter(owner string) (bool, error) {
	first := !t.m.Starters[owner]
	t.m.Starters[owner] = true
	return first, nil
}
