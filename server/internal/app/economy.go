// Package app is the use cases of the chest economy: each one opens a transaction, loads the
// aggregates it needs, lets the domain decide and saves the result. It knows neither HTTP nor
// SQL — those are the adapters behind Store and in front of Economy.
package app

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/voxel-vault/api/internal/domain/chest"
	"github.com/voxel-vault/api/internal/domain/inventory"
	"github.com/voxel-vault/api/internal/domain/rulebook"
	"github.com/voxel-vault/api/internal/domain/wallet"
)

// Tx is one transaction over the aggregates; loading one locks it until the transaction ends.
type Tx interface {
	Chest(owner, id string) (*chest.Chest, error)
	Chests(owner string) ([]*chest.Chest, error)
	SaveChest(*chest.Chest) error
	Inventory(owner string) (*inventory.Inventory, error)
	SaveInventory(*inventory.Inventory) error
	Wallet(owner string) (*wallet.Wallet, error)
	SaveWallet(*wallet.Wallet) error
	// FirstStarter locks the player and marks their starter grant; true the first time only.
	FirstStarter(owner string) (bool, error)
}

type Store interface {
	Transact(ctx context.Context, fn func(Tx) error) error
}

// Economy is the use cases. Rulebook gives the rulebook in force now; IDs and Seeds are fresh
// random values; Clock is the time the situation is built from.
type Economy struct {
	Store    Store
	Rulebook func() *rulebook.Rulebook
	Clock    func() time.Time
	IDs      func() (string, error)
	Seeds    func() (uint64, error)
}

const MaxIssue = 100

var (
	ErrInvalid = errors.New("invalid request")
	// ErrNotFound: no such chest, or not the player's — the two are the same to a player.
	ErrNotFound = errors.New("not found")
)

// situation is the time and events now; the aggregates add their own fields.
func (e *Economy) situation(rb *rulebook.Rulebook) rulebook.Situation {
	now := e.Clock()
	return rulebook.Situation{
		"events": rb.ActiveEvents(now), "time.weekday": int(now.UTC().Weekday()), "time.hour": now.UTC().Hour(),
	}
}

// Issue gives a player count new chests of a type from a source (starter, admin, …).
func (e *Economy) Issue(ctx context.Context, owner, chestType, source string, count int) ([]chest.State, error) {
	if count < 1 || count > MaxIssue {
		return nil, fmt.Errorf("%w: count %d", ErrInvalid, count)
	}
	rb := e.Rulebook()
	var issued []chest.State
	err := e.Store.Transact(ctx, func(tx Tx) error {
		issued = nil
		return e.IssueIn(tx, rb, owner, chestType, source, count, func(c *chest.Chest) { issued = append(issued, c.State()) })
	})
	return issued, err
}

// IssueIn issues inside a caller's transaction (the starter grant marks the player in the same one).
func (e *Economy) IssueIn(tx Tx, rb *rulebook.Rulebook, owner, chestType, source string, count int, each func(*chest.Chest)) error {
	s := e.situation(rb)
	for range count {
		id, err := e.IDs()
		if err != nil {
			return err
		}
		seed, err := e.Seeds()
		if err != nil {
			return err
		}
		c, err := chest.Issue(rb, chest.IssueRequest{ID: id, Owner: owner, Type: chestType, Source: source, Seed: seed, Situation: s})
		if err != nil {
			return err
		}
		if err := tx.SaveChest(c); err != nil {
			return err
		}
		if each != nil {
			each(c)
		}
	}
	return nil
}

// Chests lists a player's chests. A chest stored before chests carried their metadata is
// reissued from its own seed first, and the item an old opening gave goes into the inventory.
func (e *Economy) Chests(ctx context.Context, owner string) ([]chest.State, error) {
	rb := e.Rulebook()
	var states []chest.State
	err := e.Store.Transact(ctx, func(tx Tx) error {
		chests, err := tx.Chests(owner)
		if err != nil {
			return err
		}
		states = make([]chest.State, len(chests))
		var inv *inventory.Inventory
		for i, c := range chests {
			states[i] = c.State()
			if !states[i].Legacy() {
				continue
			}
			if inv == nil {
				if inv, err = tx.Inventory(owner); err != nil {
					return err
				}
			}
			if states[i], err = e.reissue(tx, rb, inv, states[i].ID, owner); err != nil {
				return err
			}
		}
		if inv != nil {
			return tx.SaveInventory(inv)
		}
		return nil
	})
	return states, err
}

func (e *Economy) reissue(tx Tx, rb *rulebook.Rulebook, inv *inventory.Inventory, id, owner string) (chest.State, error) {
	locked, err := tx.Chest(owner, id)
	if err != nil {
		return chest.State{}, err
	}
	if !locked.State().Legacy() {
		return locked.State(), nil
	}
	c, err := chest.Reissue(rb, locked.State(), e.situation(rb))
	if err != nil {
		return chest.State{}, fmt.Errorf("reissue chest %s: %w", id, err)
	}
	s := c.State()
	if s.Drop != nil && itemFrom(inv, s.ID) == nil {
		itemID, err := e.IDs()
		if err != nil {
			return chest.State{}, err
		}
		if err := inv.Receive(rb, inventory.Item{ID: itemID, Item: s.Drop.Item, State: s.Drop.State, Origin: s.ID}); err != nil {
			return chest.State{}, fmt.Errorf("reissue chest %s: %w", id, err)
		}
	}
	return s, tx.SaveChest(c)
}

// Grant is a number of chests of one type.
type Grant struct {
	Type  string
	Count int
}

// GrantStarter gives a player the starter chests exactly once, even under concurrent requests.
func (e *Economy) GrantStarter(ctx context.Context, owner string, grants []Grant) error {
	rb := e.Rulebook()
	return e.Store.Transact(ctx, func(tx Tx) error {
		first, err := tx.FirstStarter(owner)
		if err != nil || !first {
			return err
		}
		for _, g := range grants {
			if err := e.IssueIn(tx, rb, owner, g.Type, "starter", g.Count, nil); err != nil {
				return err
			}
		}
		return nil
	})
}

// Claim starts an opening session and lands the chest. Claiming again for the same session
// returns the chest as it is, so a retried request changes nothing.
func (e *Economy) Claim(ctx context.Context, owner, id, session string) (chest.State, *chest.Landing, error) {
	rb := e.Rulebook()
	var state chest.State
	var landing *chest.Landing
	err := e.Store.Transact(ctx, func(tx Tx) error {
		c, err := tx.Chest(owner, id)
		if err != nil {
			return err
		}
		if s := c.State(); s.Session == session && s.Status != chest.Available {
			state, landing = s, nil
			return nil
		}
		l, err := c.Claim(rb, e.situation(rb), session)
		if err != nil {
			return err
		}
		state, landing = c.State(), &l
		return tx.SaveChest(c)
	})
	return state, landing, err
}

// Opened is an opening's result: the chest, and the item it put into the inventory unless the
// chest was destroyed.
type Opened struct {
	Chest chest.State
	Item  *inventory.Item
}

// Open finishes the session: the drop goes into the inventory in the same transaction. Opening
// again for the same session returns what the first opening did.
func (e *Economy) Open(ctx context.Context, owner, id, session string) (Opened, error) {
	rb := e.Rulebook()
	var out Opened
	err := e.Store.Transact(ctx, func(tx Tx) error {
		c, err := tx.Chest(owner, id)
		if err != nil {
			return err
		}
		inv, err := tx.Inventory(owner)
		if err != nil {
			return err
		}
		if s := c.State(); s.Session == session && (s.Status == chest.Opened || s.Status == chest.Destroyed) {
			out = Opened{Chest: s, Item: itemFrom(inv, s.ID)}
			return nil
		}
		outcome, err := c.Open(rb, e.situation(rb), session)
		if err != nil {
			return err
		}
		out = Opened{Chest: c.State()}
		if outcome.Drop != nil {
			itemID, err := e.IDs()
			if err != nil {
				return err
			}
			item := inventory.Item{ID: itemID, Item: outcome.Drop.Item, State: outcome.Drop.State, Origin: c.State().ID}
			if err := inv.Receive(rb, item); err != nil {
				return err
			}
			out.Item = &item
			if err := tx.SaveInventory(inv); err != nil {
				return err
			}
		}
		return tx.SaveChest(c)
	})
	return out, err
}

func itemFrom(inv *inventory.Inventory, chestID string) *inventory.Item {
	for _, item := range inv.Items() {
		if item.Origin == chestID {
			return &item
		}
	}
	return nil
}

// MergeChests spends two chests of one type into a new one.
func (e *Economy) MergeChests(ctx context.Context, owner, idA, idB string) (chest.State, error) {
	rb := e.Rulebook()
	var merged chest.State
	err := e.Store.Transact(ctx, func(tx Tx) error {
		a, err := tx.Chest(owner, idA)
		if err != nil {
			return err
		}
		b, err := tx.Chest(owner, idB)
		if err != nil {
			return err
		}
		id, err := e.IDs()
		if err != nil {
			return err
		}
		seed, err := e.Seeds()
		if err != nil {
			return err
		}
		c, err := chest.Merge(rb, a, b, chest.MergeRequest{ID: id, Seed: seed, Situation: e.situation(rb)})
		if err != nil {
			return err
		}
		merged = c.State()
		for _, changed := range []*chest.Chest{a, b, c} {
			if err := tx.SaveChest(changed); err != nil {
				return err
			}
		}
		return nil
	})
	return merged, err
}

// MergeOdds tells what merging two of the owner's chests would likely make; nothing changes.
func (e *Economy) MergeOdds(ctx context.Context, owner, idA, idB string) (chest.MergeOdds, error) {
	rb := e.Rulebook()
	var odds chest.MergeOdds
	err := e.Store.Transact(ctx, func(tx Tx) error {
		a, err := tx.Chest(owner, idA)
		if err != nil {
			return err
		}
		b, err := tx.Chest(owner, idB)
		if err != nil {
			return err
		}
		odds, err = chest.Odds(rb, a, b, e.situation(rb))
		return err
	})
	return odds, err
}

// Workshop is what a player does with an item for a price: repair, salvage, sell.
type Workshop func(inv *inventory.Inventory, rb *rulebook.Rulebook, w *wallet.Wallet, id string, s rulebook.Situation) (wallet.Amount, error)

var (
	Repair  Workshop = (*inventory.Inventory).Repair
	Salvage Workshop = (*inventory.Inventory).Salvage
	Sell    Workshop = (*inventory.Inventory).Sell
)

// Work runs a workshop action on an item; inventory and wallet change together or not at all.
func (e *Economy) Work(ctx context.Context, owner, itemID string, action Workshop) (wallet.Amount, error) {
	rb := e.Rulebook()
	var amount wallet.Amount
	err := e.Store.Transact(ctx, func(tx Tx) error {
		inv, err := tx.Inventory(owner)
		if err != nil {
			return err
		}
		w, err := tx.Wallet(owner)
		if err != nil {
			return err
		}
		if amount, err = action(inv, rb, w, itemID, e.situation(rb)); err != nil {
			return err
		}
		return errors.Join(tx.SaveInventory(inv), tx.SaveWallet(w))
	})
	return amount, err
}

// MergeItems joins two damaged twins; the better one stays.
func (e *Economy) MergeItems(ctx context.Context, owner, idA, idB string) (inventory.Item, error) {
	rb := e.Rulebook()
	var kept inventory.Item
	err := e.Store.Transact(ctx, func(tx Tx) error {
		inv, err := tx.Inventory(owner)
		if err != nil {
			return err
		}
		seed, err := e.Seeds()
		if err != nil {
			return err
		}
		if kept, err = inv.Merge(rb, idA, idB, seed, e.situation(rb)); err != nil {
			return err
		}
		return tx.SaveInventory(inv)
	})
	return kept, err
}

// PricedItem is an owned item with what each workshop action would cost or bring now; Offers is
// nil for an item the rulebook no longer knows.
type PricedItem struct {
	inventory.Item
	Offers *inventory.Offers
}

// Inventory is the player's items, priced, and balances.
func (e *Economy) Inventory(ctx context.Context, owner string) ([]PricedItem, map[string]int64, error) {
	rb := e.Rulebook()
	var items []PricedItem
	var balances map[string]int64
	err := e.Store.Transact(ctx, func(tx Tx) error {
		inv, err := tx.Inventory(owner)
		if err != nil {
			return err
		}
		w, err := tx.Wallet(owner)
		if err != nil {
			return err
		}
		s := e.situation(rb)
		for _, item := range inv.Items() {
			priced := PricedItem{Item: item}
			// An item the rulebook no longer knows cannot be priced; it is listed without offers.
			if offers, err := inv.Quote(rb, item.ID, s); err == nil {
				priced.Offers = &offers
			}
			items = append(items, priced)
		}
		balances = w.Balances()
		return nil
	})
	return items, balances, err
}
