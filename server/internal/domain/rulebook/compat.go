// Package rulebook preserves the legacy API's imports while the rules are now owned by
// Inventory. This compatibility layer is not a cross-context integration contract.
package rulebook

import owned "github.com/voxel-vault/api/internal/inventory/domain/rulebook"

type Definition = owned.Definition
type Event = owned.Event
type Collection = owned.Collection
type ChestType = owned.ChestType
type Item = owned.Item
type Group = owned.Group
type TraitDef = owned.TraitDef
type Param = owned.Param
type Rulebook = owned.Rulebook
type Rule = owned.Rule
type Condition = owned.Condition
type Situation = owned.Situation

const (
	MergeReset = owned.MergeReset
	MergeKeep  = owned.MergeKeep
	Intact     = owned.Intact
)

var New = owned.New
