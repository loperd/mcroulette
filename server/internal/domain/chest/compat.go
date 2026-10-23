// Package chest provides temporary aliases for the legacy API. The implementation is
// owned by Inventory. New integrations consume Inventory's published ports instead.
package chest

import owned "github.com/voxel-vault/api/internal/inventory/domain/chest"

type Status = owned.Status
type Moment = owned.Moment
type Trait = owned.Trait
type Slot = owned.Slot
type Origin = owned.Origin
type Drop = owned.Drop
type State = owned.State
type Chest = owned.Chest
type IssueRequest = owned.IssueRequest
type MergeRequest = owned.MergeRequest
type MergeOdds = owned.MergeOdds
type TraitOdds = owned.TraitOdds
type Landing = owned.Landing
type Outcome = owned.Outcome

const (
	Available    = owned.Available
	Opening      = owned.Opening
	Opened       = owned.Opened
	Destroyed    = owned.Destroyed
	Merged       = owned.Merged
	AtImpact     = owned.AtImpact
	AtOpening    = owned.AtOpening
	SourceMerge  = owned.SourceMerge
	SourceLegacy = owned.SourceLegacy
)

var (
	ErrUnavailable  = owned.ErrUnavailable
	ErrNotOpening   = owned.ErrNotOpening
	ErrWrongSession = owned.ErrWrongSession
	ErrNoSession    = owned.ErrNoSession
	ErrEmpty        = owned.ErrEmpty
	ErrUnknownType  = owned.ErrUnknownType
	ErrMismatch     = owned.ErrMismatch
	Restore         = owned.Restore
	Issue           = owned.Issue
	Reissue         = owned.Reissue
	Merge           = owned.Merge
	Odds            = owned.Odds
	Rarity          = owned.Rarity
	Wear            = owned.Wear
	Condition       = owned.Condition
)
