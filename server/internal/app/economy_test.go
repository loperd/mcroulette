package app_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/voxel-vault/api/internal/app"
	"github.com/voxel-vault/api/internal/app/apptest"
	"github.com/voxel-vault/api/internal/domain/chest"
	"github.com/voxel-vault/api/internal/domain/inventory"
	"github.com/voxel-vault/api/internal/domain/rulebook"
	"github.com/voxel-vault/api/internal/domain/rulebook/rulebooktest"
	"github.com/voxel-vault/api/internal/domain/wallet"
)

func economy(t *testing.T, change ...func(*rulebook.Definition)) (*app.Economy, *apptest.Memory) {
	rb := rulebooktest.Build(t, change...)
	m := apptest.NewMemory()
	n := 0
	return &app.Economy{
		Store: m, Rulebook: func() *rulebook.Rulebook { return rb },
		Clock: func() time.Time { return time.Date(2026, 10, 19, 12, 0, 0, 0, time.UTC) },
		IDs:   func() (string, error) { n++; return fmt.Sprintf("id-%d", n), nil },
		Seeds: func() (uint64, error) { n++; return uint64(n), nil },
	}, m
}

var safe = rulebooktest.Set(map[string]float64{"chest.destroy.impact.perWear": 0, "chest.destroy.opening.perWear": 0})

func TestOpenPutsTheDropIntoTheInventoryOnce(t *testing.T) {
	e, _ := economy(t, safe)
	ctx := context.Background()
	issued, err := e.Issue(ctx, "p", "ender", "admin", 1)
	if err != nil {
		t.Fatal(err)
	}
	id := issued[0].ID
	if _, _, err := e.Claim(ctx, "p", id, "s"); err != nil {
		t.Fatal(err)
	}
	if _, landing, err := e.Claim(ctx, "p", id, "s"); err != nil || landing != nil {
		t.Fatalf("repeated claim: %v %v", landing, err)
	}
	first, err := e.Open(ctx, "p", id, "s")
	if err != nil || first.Item == nil || first.Chest.Status != chest.Opened {
		t.Fatalf("open: %+v %v", first, err)
	}
	again, err := e.Open(ctx, "p", id, "s")
	if err != nil || again.Item == nil || again.Item.ID != first.Item.ID {
		t.Fatalf("repeated open: %+v %v", again, err)
	}
	items, _, _ := e.Inventory(ctx, "p")
	if len(items) != 1 || items[0].Item.Item != first.Chest.Drop.Item {
		t.Fatalf("inventory %+v", items)
	}
	if _, _, err := e.Claim(ctx, "q", id, "s2"); !errors.Is(err, app.ErrNotFound) {
		t.Fatalf("another player's chest: %v", err)
	}
}

func TestWorkChangesInventoryAndWalletTogether(t *testing.T) {
	e, m := economy(t)
	ctx := context.Background()
	m.Items["p"] = []inventory.Item{{ID: "x", Item: "item-i", State: "heavy"}}
	if _, err := e.Work(ctx, "p", "x", app.Repair); !errors.Is(err, wallet.ErrInsufficient) {
		t.Fatalf("repair with no material: %v", err)
	}
	if got := m.Items["p"][0].State; got != "heavy" {
		t.Fatalf("failed repair changed the item to %s", got)
	}
	gain, err := e.Work(ctx, "p", "x", app.Sell)
	if err != nil || gain.Value != 20 || m.Balances["p"][wallet.Currency] != 20 || len(m.Items["p"]) != 0 {
		t.Fatalf("sell %+v %v, state %+v", gain, err, m)
	}
}

func TestMergeChests(t *testing.T) {
	e, m := economy(t)
	ctx := context.Background()
	issued, _ := e.Issue(ctx, "p", "ender", "admin", 2)
	merged, err := e.MergeChests(ctx, "p", issued[0].ID, issued[1].ID)
	if err != nil {
		t.Fatal(err)
	}
	if m.Chests[issued[0].ID].Status != chest.Merged || m.Chests[merged.ID].Status != chest.Available {
		t.Fatalf("after merge: %+v", m.Chests)
	}
}

func TestStarterChestsAreGrantedOnce(t *testing.T) {
	e, m := economy(t)
	ctx := context.Background()
	grants := []app.Grant{{Type: "ender", Count: 2}}
	for range 2 {
		if err := e.GrantStarter(ctx, "p", grants); err != nil {
			t.Fatal(err)
		}
	}
	if len(m.Chests) != 2 {
		t.Fatalf("granted %d chests", len(m.Chests))
	}
	for _, s := range m.Chests {
		if s.Origin.Source != "starter" {
			t.Fatalf("source %q", s.Origin.Source)
		}
	}
	if err := e.GrantStarter(ctx, "q", []app.Grant{{Type: "nether", Count: 1}}); err == nil || m.Starters["q"] {
		t.Fatal("a failed grant must not mark the player")
	}
}

func TestLegacyChestsAreReissuedAndTheirPrizeKept(t *testing.T) {
	e, m := economy(t)
	ctx := context.Background()
	m.Chests["old"] = chest.State{ID: "old", Owner: "p", Type: "ender", Seed: 5, Status: chest.Opened, Session: "s", Drop: &chest.Drop{Item: "item-b"}}
	m.Chests["new"] = chest.State{ID: "new", Owner: "p", Type: "ender", Seed: 6, Status: chest.Available}
	for range 2 {
		states, err := e.Chests(ctx, "p")
		if err != nil || len(states) != 2 {
			t.Fatalf("chests %v %v", states, err)
		}
		for _, s := range states {
			if s.Legacy() || len(s.Contents) == 0 {
				t.Fatalf("not reissued: %+v", s)
			}
		}
	}
	items := m.Items["p"]
	if len(items) != 1 || items[0].Item != "item-b" || items[0].Origin != "old" || items[0].State != rulebook.Intact {
		t.Fatalf("inventory %+v", items)
	}
}
