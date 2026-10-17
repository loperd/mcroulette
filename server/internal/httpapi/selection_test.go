package httpapi

import (
	"testing"

	"github.com/voxel-vault/api/internal/store"
)

func TestWeightedItemFollowsWeights(t *testing.T) {
	items := []store.LootItem{{ID: "never", Weight: 0}, {ID: "common", Weight: 90}, {ID: "rare", Weight: 10}}
	counts := map[string]int{}
	for range 20000 {
		item, err := weightedItem(items)
		if err != nil {
			t.Fatal(err)
		}
		counts[item.ID]++
	}
	if counts["never"] != 0 {
		t.Fatalf("a zero-weight item was selected %d times", counts["never"])
	}
	if share := float64(counts["rare"]) / 20000; share < .08 || share > .12 {
		t.Fatalf("rare share %.3f, want about .10", share)
	}
}

func TestWeightedItemRejectsEmptyTables(t *testing.T) {
	if _, err := weightedItem(nil); err == nil {
		t.Fatal("an empty loot table must fail")
	}
	if _, err := weightedItem([]store.LootItem{{ID: "zero", Weight: 0}}); err == nil {
		t.Fatal("a table without positive weights must fail")
	}
}

func TestHandles(t *testing.T) {
	for _, ok := range []string{"steve", "alex_01", "a.b-c"} {
		if !validHandle(ok) {
			t.Errorf("%q should be valid", ok)
		}
	}
	for _, bad := range []string{"", "ab", "-lead", "Upper", "with space", "кириллица"} {
		if validHandle(bad) {
			t.Errorf("%q should be invalid", bad)
		}
	}
}
