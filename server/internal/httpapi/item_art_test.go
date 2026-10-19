package httpapi

import (
	"testing"

	"github.com/voxel-vault/api/internal/rulebookjson"
)

func TestEveryRulebookItemHasPrivilegeArt(t *testing.T) {
	rb, err := rulebookjson.Load("../../config/economy.json")
	if err != nil {
		t.Fatal(err)
	}
	for _, chestType := range rb.Types() {
		for _, item := range chestType.Pool {
			if _, ok := privilegeArt[item.Glyph]; !ok {
				t.Errorf("%s (glyph %q) has no privilege art; it would show the generated SVG", item.ID, item.Glyph)
			}
		}
	}
}
