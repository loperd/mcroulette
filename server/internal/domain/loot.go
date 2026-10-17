package domain

type CaseType struct {
	ID          string
	Rarity      string
	Title       string
	Collection  string
	Description string
	Accent      string
	Deep        string
	Highlight   string
	Glow        string
}

type LootItem struct {
	ID      string
	CaseID  string
	Title   string
	Rarity  string
	Weight  float64
	Palette string
	Glyph   string
}

var Cases = []CaseType{
	{ID: "traveler", Rarity: "common", Title: "Сундук Путника", Collection: "Дороги Верхнего мира", Description: "Дорожные трофеи, инструменты и находки после долгих странствий.", Accent: "#9aa9a0", Deep: "#35483f", Highlight: "#d2ded5", Glow: "#9aa9a055"},
	{ID: "deep-mine", Rarity: "uncommon", Title: "Кладовая Шахтёра", Collection: "Глубинные шахты", Description: "Снаряжение и редкие минералы из забытых подземных залов.", Accent: "#5fc78e", Deep: "#195d42", Highlight: "#a8edbd", Glow: "#5fc78e66"},
	{ID: "ender", Rarity: "rare", Title: "Сокровища Эндера", Collection: "Коллекция Края", Description: "Тайны другого измерения и артефакты из Края.", Accent: "#59a9ef", Deep: "#174d79", Highlight: "#a2d5ff", Glow: "#59a9ef66"},
	{ID: "dragon", Rarity: "epic", Title: "Казна Драконоборца", Collection: "Предел Дракона", Description: "Реликвии древней битвы, пропитанные энергией Края.", Accent: "#b887ed", Deep: "#59357d", Highlight: "#e0c0ff", Glow: "#b887ed66"},
}

// Loot tables are demo content; weights are used by the server-side selector.
var Loot = []LootItem{
	{ID: "traveler-compass", CaseID: "traveler", Title: "Компас забытой тропы", Rarity: "default", Weight: 38, Palette: "#9aa9a0", Glyph: "compass"},
	{ID: "traveler-cloak", CaseID: "traveler", Title: "Плащ странника", Rarity: "default", Weight: 30, Palette: "#a37a4d", Glyph: "cloak"},
	{ID: "traveler-pickaxe", CaseID: "traveler", Title: "Каменная кирка с рунами", Rarity: "primary", Weight: 20, Palette: "#82938b", Glyph: "pickaxe"},
	{ID: "traveler-map", CaseID: "traveler", Title: "Карта дальних земель", Rarity: "legendary", Weight: 12, Palette: "#d6b96e", Glyph: "map"},
	{ID: "mine-crystal", CaseID: "deep-mine", Title: "Кристалл глубин", Rarity: "default", Weight: 38, Palette: "#55b58b", Glyph: "crystal"},
	{ID: "mine-lantern", CaseID: "deep-mine", Title: "Фонарь шахтёра", Rarity: "default", Weight: 30, Palette: "#d3a950", Glyph: "lantern"},
	{ID: "mine-drill", CaseID: "deep-mine", Title: "Бур древнего мастера", Rarity: "primary", Weight: 22, Palette: "#82aa9c", Glyph: "pickaxe"},
	{ID: "mine-heart", CaseID: "deep-mine", Title: "Сердце жилы", Rarity: "legendary", Weight: 10, Palette: "#9cf2ce", Glyph: "crystal"},
	{ID: "ender-shard", CaseID: "ender", Title: "Осколок портала", Rarity: "default", Weight: 35, Palette: "#5895d2", Glyph: "crystal"},
	{ID: "ender-eye", CaseID: "ender", Title: "Глаз странника Края", Rarity: "default", Weight: 28, Palette: "#8d65bd", Glyph: "eye"},
	{ID: "ender-crown", CaseID: "ender", Title: "Корона пустоты", Rarity: "primary", Weight: 24, Palette: "#ad8de4", Glyph: "crown"},
	{ID: "ender-heart", CaseID: "ender", Title: "Сердце Края", Rarity: "legendary", Weight: 13, Palette: "#7de5ce", Glyph: "heart"},
	{ID: "dragon-scale", CaseID: "dragon", Title: "Чешуя древнего дракона", Rarity: "default", Weight: 35, Palette: "#b887ed", Glyph: "scale"},
	{ID: "dragon-blade", CaseID: "dragon", Title: "Клинок последнего дозора", Rarity: "primary", Weight: 30, Palette: "#e48b78", Glyph: "sword"},
	{ID: "dragon-crown", CaseID: "dragon", Title: "Корона драконоборца", Rarity: "primary", Weight: 22, Palette: "#e4b761", Glyph: "crown"},
	{ID: "dragon-egg", CaseID: "dragon", Title: "Осколок драконьего яйца", Rarity: "legendary", Weight: 13, Palette: "#df75e0", Glyph: "egg"},
}

func CaseByID(id string) (CaseType, bool) {
	for _, chest := range Cases {
		if chest.ID == id {
			return chest, true
		}
	}
	return CaseType{}, false
}
