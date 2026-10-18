package httpapi

import (
	"testing"

	"github.com/voxel-vault/api/internal/domain"
	"github.com/voxel-vault/api/internal/store"
)

func TestEveryLootItemHasPrivilegeArt(t *testing.T) {
	for _, item := range domain.Loot {
		dto := toItemDTO(store.LootItem(item))
		if _, ok := privilegeArt[item.Glyph]; !ok {
			t.Errorf("%s (glyph %q) has no privilege art; it would show the generated SVG", item.ID, item.Glyph)
		}
		if dto.Image == "" {
			t.Errorf("%s has no image", item.ID)
		}
	}
}
