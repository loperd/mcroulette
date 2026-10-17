package httpapi

import (
	"fmt"
	"html"
	"strings"

	"github.com/voxel-vault/api/internal/store"
)

func itemSVG(item store.LootItem) string {
	colors := map[string][2]string{"common": {"#88989a", "#344345"}, "uncommon": {"#62c88b", "#173c2d"}, "rare": {"#4ea8ff", "#152a51"}, "epic": {"#ba73ff", "#371747"}, "legendary": {"#ffbd55", "#553516"}}
	palette, ok := colors[strings.ToLower(item.Rarity)]
	if !ok {
		palette = colors["common"]
	}
	label := html.EscapeString(item.Title)
	return fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="%s"/><stop offset="1" stop-color="%s"/></linearGradient></defs><rect width="320" height="220" rx="16" fill="#101d20"/><path d="M44 68 160 28l116 40v96l-116 34L44 164z" fill="url(#g)" stroke="#b9e9df" stroke-opacity=".5" stroke-width="4"/><path d="m44 68 116 40 116-40M160 108v90" fill="none" stroke="#d6fff3" stroke-opacity=".5" stroke-width="4"/><rect x="144" y="85" width="32" height="42" rx="4" fill="#121c1e"/><text x="160" y="215" text-anchor="middle" fill="#e9f1ee" font-family="sans-serif" font-size="14">%s</text></svg>`, palette[0], palette[1], label)
}
