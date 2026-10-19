package httpapi

import (
	"regexp"
	"testing"
)

func TestParseGrantsReadsTheStarterChests(t *testing.T) {
	grants, err := parseGrants(" traveler:10, deep-mine:5 ,ender:5,dragon:3,")
	if err != nil {
		t.Fatal(err)
	}
	want := []grant{{"traveler", 10}, {"deep-mine", 5}, {"ender", 5}, {"dragon", 3}}
	if len(grants) != len(want) {
		t.Fatalf("got %v", grants)
	}
	for i := range want {
		if grants[i] != want[i] {
			t.Fatalf("grant %d: got %v, want %v", i, grants[i], want[i])
		}
	}
}

func TestParseGrantsRejectsUnknownChestsAndBadCounts(t *testing.T) {
	for _, value := range []string{"nether:3", "traveler", "traveler:0", "traveler:-1", "traveler:101", "traveler:x"} {
		if _, err := parseGrants(value); err == nil {
			t.Errorf("%q: expected an error", value)
		}
	}
	if grants, err := parseGrants(""); err != nil || len(grants) != 0 {
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
		if err != nil || seed < 0 || seed > 0xffffffff {
			t.Fatalf("bad seed %d (%v)", seed, err)
		}
	}
}
