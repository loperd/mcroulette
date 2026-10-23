// Package dice keeps legacy callers compatible with Inventory's deterministic random policy.
package dice

import owned "github.com/voxel-vault/api/internal/inventory/domain/dice"

type Dice = owned.Dice

const (
	StreamIssue     = owned.StreamIssue
	StreamLanding   = owned.StreamLanding
	StreamOpening   = owned.StreamOpening
	StreamMerge     = owned.StreamMerge
	StreamItemMerge = owned.StreamItemMerge
)

var New = owned.New
