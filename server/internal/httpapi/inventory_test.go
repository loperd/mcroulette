package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/voxel-vault/api/internal/app"
	"github.com/voxel-vault/api/internal/app/apptest"
	"github.com/voxel-vault/api/internal/domain/inventory"
	"github.com/voxel-vault/api/internal/domain/rulebook"
	"github.com/voxel-vault/api/internal/domain/rulebook/rulebooktest"
	"github.com/voxel-vault/api/internal/rulebookjson"
)

func TestParseGrantsReadsTheStarterChests(t *testing.T) {
	rb, err := rulebookjson.Load("../../config/economy.json")
	if err != nil {
		t.Fatal(err)
	}
	grants, err := parseGrants(rb, " traveler:10, deep-mine:5 ,ender:5,dragon:3,")
	if err != nil {
		t.Fatal(err)
	}
	want := []app.Grant{{Type: "traveler", Count: 10}, {Type: "deep-mine", Count: 5}, {Type: "ender", Count: 5}, {Type: "dragon", Count: 3}}
	if !reflect.DeepEqual(grants, want) {
		t.Fatalf("got %v, want %v", grants, want)
	}
	for _, value := range []string{"nether:3", "traveler", "traveler:0", "traveler:-1", "traveler:101", "traveler:x"} {
		if _, err := parseGrants(rb, value); err == nil {
			t.Errorf("%q: expected an error", value)
		}
	}
	if grants, err := parseGrants(rb, ""); err != nil || len(grants) != 0 {
		t.Errorf("empty: got %v, %v", grants, err)
	}
}

func TestIssuedIdentitiesAreRandomUUIDsAndUnsigned32BitSeeds(t *testing.T) {
	pattern := regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	seen := map[string]bool{}
	for i := 0; i < 200; i++ {
		id, err := newUUID()
		if err != nil || !pattern.MatchString(id) || seen[id] {
			t.Fatalf("bad or repeated id %q (%v)", id, err)
		}
		seen[id] = true
		seed, err := newSeed()
		if err != nil || seed > 0xffffffff {
			t.Fatalf("bad seed %d (%v)", seed, err)
		}
	}
}

func TestRoutesDoNotConflict(t *testing.T) {
	(&Server{mux: http.NewServeMux()}).routes()
}

func economyServer(t *testing.T) (*Server, *apptest.Memory) {
	rb := rulebooktest.Build(t, rulebooktest.Set(map[string]float64{"chest.destroy.impact.perWear": 0, "chest.destroy.opening.perWear": 0}))
	m := apptest.NewMemory()
	n := 0
	current := func() *rulebook.Rulebook { return rb }
	return &Server{rulebook: current, economy: &app.Economy{Store: m, Rulebook: current, Clock: time.Now,
		IDs:   func() (string, error) { n++; return fmt.Sprintf("id-%d", n), nil },
		Seeds: func() (uint64, error) { n++; return uint64(n), nil }}}, m
}

// call runs a handler as a signed-in player and decodes its answer.
func call(t *testing.T, handler http.HandlerFunc, player, id, body string, into any) int {
	t.Helper()
	r := httptest.NewRequest("POST", "/", strings.NewReader(body))
	r.SetPathValue("instanceID", id)
	r = r.WithContext(context.WithValue(r.Context(), userContextKey, User{ID: player}))
	w := httptest.NewRecorder()
	handler(w, r)
	if into != nil && w.Code < 300 {
		if err := json.Unmarshal(w.Body.Bytes(), into); err != nil {
			t.Fatal(err)
		}
	}
	return w.Code
}

func TestClaimLandsAndOpenDropsIntoTheItems(t *testing.T) {
	s, m := economyServer(t)
	issued, err := s.economy.Issue(context.Background(), "p", "ender", "admin", 1)
	if err != nil {
		t.Fatal(err)
	}
	id := issued[0].ID
	var claimed struct {
		Chest   chestDTO    `json:"chest"`
		Landing *landingDTO `json:"landing"`
	}
	if code := call(t, s.claimChest, "p", id, `{"sessionId":"s"}`, &claimed); code != 200 || claimed.Landing == nil || claimed.Chest.Status != "opening" || len(claimed.Chest.Contents) == 0 {
		t.Fatalf("claim %d %+v", code, claimed)
	}
	if code := call(t, s.claimChest, "q", id, `{"sessionId":"s"}`, nil); code != 404 {
		t.Fatalf("another player's chest: %d", code)
	}
	if code := call(t, s.openChest, "p", id, `{"sessionId":"other"}`, nil); code != 409 {
		t.Fatalf("open by another session: %d", code)
	}
	var opened struct {
		Chest chestDTO      `json:"chest"`
		Item  *ownedItemDTO `json:"item"`
	}
	if code := call(t, s.openChest, "p", id, `{"sessionId":"s"}`, &opened); code != 200 || opened.Item == nil || opened.Chest.Drop == nil {
		t.Fatalf("open %d %+v", code, opened)
	}
	if opened.Item.Item.ID != opened.Chest.Drop.Item.ID || opened.Item.Origin != id || opened.Chest.OpenedAt == nil {
		t.Fatalf("drop %+v, item %+v", opened.Chest.Drop, opened.Item)
	}
	if items := m.Items["p"]; len(items) != 1 || items[0].ID != opened.Item.ID {
		t.Fatalf("items %+v", items)
	}
}

func TestItemsAreListedWithTheirPricesAndWorkedForThem(t *testing.T) {
	s, m := economyServer(t)
	m.Items["p"] = []inventory.Item{{ID: "a", Item: "item-i", State: "heavy"}, {ID: "b", Item: "item-i", State: "intact"}, {ID: "gone", Item: "not-in-rulebook", State: "intact"},
		{ID: "c", Item: "item-i", State: "slight"}, {ID: "d", Item: "item-i", State: "broken"}}
	m.Balances["p"] = map[string]int64{"end-shards": 100}
	var listed struct {
		Items    []ownedItemDTO   `json:"items"`
		Balances map[string]int64 `json:"balances"`
	}
	if code := call(t, s.listItems, "p", "", "", &listed); code != 200 || len(listed.Items) != 5 || listed.Balances["end-shards"] != 100 {
		t.Fatalf("list %d %+v", code, listed)
	}
	damaged, intact, gone := listed.Items[0].Offers, listed.Items[1].Offers, listed.Items[2].Offers
	if damaged == nil || damaged.Repair == nil || intact == nil || intact.Repair != nil || gone != nil {
		t.Fatalf("offers %+v %+v %+v", damaged, intact, gone)
	}
	// The server pairs each damaged item with its worst twin; an intact one has no pair.
	if damaged.MergeWith != "d" || listed.Items[3].Offers.MergeWith != "d" || listed.Items[4].Offers.MergeWith != "a" || intact.MergeWith != "" {
		t.Fatalf("merge pairs %+v %+v %+v %+v", damaged, listed.Items[3].Offers, listed.Items[4].Offers, intact)
	}
	if damaged.MergeRepair <= 0 || damaged.MergeRepair > 100 {
		t.Fatalf("merge chance in percent: %v", damaged.MergeRepair)
	}
	r := httptest.NewRequest("POST", "/", nil)
	r.SetPathValue("itemID", "a")
	r = r.WithContext(context.WithValue(r.Context(), userContextKey, User{ID: "p"}))
	w := httptest.NewRecorder()
	s.workItem(app.Repair)(w, r)
	var paid amountDTO
	if err := json.Unmarshal(w.Body.Bytes(), &paid); err != nil || w.Code != 200 || paid != *damaged.Repair {
		t.Fatalf("repair %d %s, quoted %+v", w.Code, w.Body, damaged.Repair)
	}
	if m.Balances["p"]["end-shards"] != 100-paid.Value {
		t.Fatalf("balance %d", m.Balances["p"]["end-shards"])
	}
}

func TestMergeOddsComeBeforeTheMerge(t *testing.T) {
	s, _ := economyServer(t)
	issued, err := s.economy.Issue(context.Background(), "p", "ender", "admin", 2)
	if err != nil {
		t.Fatal(err)
	}
	a, b := issued[0].ID, issued[1].ID
	odds := func(player string) (int, mergeOddsDTO) {
		r := httptest.NewRequest("GET", "/?a="+a+"&b="+b, nil)
		r = r.WithContext(context.WithValue(r.Context(), userContextKey, User{ID: player}))
		w := httptest.NewRecorder()
		s.mergeOdds(w, r)
		var dto mergeOddsDTO
		if w.Code == 200 {
			if err := json.Unmarshal(w.Body.Bytes(), &dto); err != nil {
				t.Fatal(err)
			}
		}
		return w.Code, dto
	}
	code, dto := odds("p")
	if code != 200 || dto.Traits == nil || dto.Contents.Kept != 8 || dto.Contents.Total < 8 || dto.Contents.Keep != percent(8, float64(dto.Contents.Total)) {
		t.Fatalf("odds %d %+v", code, dto)
	}
	if code, _ := odds("q"); code != 404 {
		t.Fatalf("odds of another player's chests: %d", code)
	}
	var merged chestDTO
	if code := call(t, s.mergeChests, "p", "", fmt.Sprintf(`{"a":%q,"b":%q}`, a, b), &merged); code != 201 || merged.Origin.Source != "merge" {
		t.Fatalf("merge %d %+v", code, merged)
	}
	if code, _ := odds("p"); code != 409 {
		t.Fatalf("odds of spent chests: %d", code)
	}
}
