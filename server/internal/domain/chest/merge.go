package chest

import (
	"fmt"
	"math"

	"github.com/voxel-vault/api/internal/domain/dice"
	"github.com/voxel-vault/api/internal/domain/rulebook"
)

type MergeRequest struct {
	ID        string
	Seed      uint64
	Situation rulebook.Situation
}

// Merge turns two available chests of one owner and one type into a new one; both are spent.
// Traits of "reset" groups (damage) are gone; the others survive by the merge.<group>.* chances
// and, held by both, may rise a tier. The contents are the union cut to content.size purely at
// random, so the player may lose items of either chest. Rarity and condition are appraised anew.
func Merge(rb *rulebook.Rulebook, a, b *Chest, req MergeRequest) (*Chest, error) {
	if a.s.ID == b.s.ID || a.s.Owner != b.s.Owner || a.s.Type != b.s.Type {
		return nil, ErrMismatch
	}
	if a.s.Status != Available || b.s.Status != Available {
		return nil, ErrUnavailable
	}
	if _, ok := rb.Type(a.s.Type); !ok {
		return nil, fmt.Errorf("%w %q", ErrUnknownType, a.s.Type)
	}
	c := &Chest{s: State{
		ID: req.ID, Owner: a.s.Owner, Type: a.s.Type, Revision: rb.Revision(), Seed: req.Seed,
		Origin: Origin{Source: SourceMerge, Parents: []string{a.s.ID, b.s.ID}}, Status: Available,
	}}
	d := dice.New(req.Seed, dice.StreamMerge)
	s := c.situation(rb, req.Situation)
	c.s.Traits = mergeTraits(rb, a.s.Traits, b.s.Traits, s, d)
	c.s.Contents = mergeContents(a.s.Contents, b.s.Contents, int(rb.Value("content.size", s)), d)
	c.appraise(rb, s)
	a.s.Status, b.s.Status = Merged, Merged
	return c, nil
}

func mergeTraits(rb *rulebook.Rulebook, a, b []Trait, s rulebook.Situation, d *dice.Dice) []Trait {
	other := map[string]Trait{}
	for _, trait := range b {
		other[trait.ID] = trait
	}
	order := append([]Trait{}, a...)
	for _, trait := range b {
		if !hasTrait(a, trait.ID) {
			order = append(order, trait)
		}
	}
	var kept []Trait
	for _, trait := range order {
		def, ok := rb.Trait(trait.ID)
		if !ok {
			continue
		}
		group, _ := rb.Group(def.Group)
		if group.Merge != rulebook.MergeKeep {
			continue
		}
		prefix := "merge." + group.ID
		twin, both := other[trait.ID]
		both = both && hasTrait(a, trait.ID)
		if !both {
			if d.Chance(rb.Value(prefix+".keepOne", s)) {
				kept = append(kept, trait)
			}
			continue
		}
		if !d.Chance(rb.Value(prefix+".keepBoth", s)) {
			continue
		}
		if twin.Intensity > trait.Intensity {
			trait = twin
		}
		if d.Chance(rb.Value(prefix+".upgrade", s)) {
			trait.Intensity = nextTier(rb, trait)
		}
		kept = append(kept, trait)
	}
	return withoutConflicts(rb, kept)
}

// nextTier lifts an intensity to the threshold of the tier above; the top tier stays as it is.
func nextTier(rb *rulebook.Rulebook, trait Trait) float64 {
	thresholds := rb.TierThresholds(trait.ID)
	if tier := rb.Tier(trait.ID, trait.Intensity); tier < len(thresholds) {
		return math.Max(trait.Intensity, thresholds[tier])
	}
	return trait.Intensity
}

// withoutConflicts keeps, of traits sharing an exclusive key, only the most intense.
func withoutConflicts(rb *rulebook.Rulebook, traits []Trait) []Trait {
	var out []Trait
	for _, trait := range traits {
		def, _ := rb.Trait(trait.ID)
		rival := -1
		for i, kept := range out {
			if excludes(rb, kept.ID, def) {
				rival = i
			}
		}
		switch {
		case rival < 0:
			out = append(out, trait)
		case trait.Intensity > out[rival].Intensity:
			out[rival] = trait
		}
	}
	return out
}

func hasTrait(traits []Trait, id string) bool {
	for _, trait := range traits {
		if trait.ID == id {
			return true
		}
	}
	return false
}

func mergeContents(a, b []Slot, size int, d *dice.Dice) []Slot {
	union := append([]Slot{}, a...)
	for _, slot := range b {
		if !holds(union, slot.Item) {
			union = append(union, slot)
		}
	}
	for i := len(union) - 1; i > 0; i-- {
		j := d.Index(i + 1)
		union[i], union[j] = union[j], union[i]
	}
	return union[:min(max(size, 1), len(union))]
}
