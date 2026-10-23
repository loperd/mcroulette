# Opening runtime and recovery

## Authority and presentation

The server determines chest ownership, landing damage, destruction and item outcome. The client validates the response and presents it. Roulette weights determine the visible strip, not authority to issue a reward. A browser snapshot or URL never establishes ownership.

The backend opening protocol is `claim` followed by `open`, with the same session ID on retry. The frontend obtains the authoritative result before presenting it, retains it through the animation and does not reroll to recover a visual failure. Destruction at impact ends after landing; destruction during opening plays the overload sequence. Neither produces a roulette spin or reward.

## Ports and state

Application controllers work through catalog/prize, inventory, session journal, chest presentation, roulette presentation, transition, audio and scheduling ports. Three.js, Rapier handles, DOM nodes and browser storage stay behind adapters. Catalog consumers may share an in-flight load; canceling one consumer must not cancel another active consumer.

The visible progression is loading → ready → clearing → dropping → opening → flashing → spinning → settling → revealing → prize visible → resetting. Failures expose a specific retry/reset action. Disposed controllers are terminal. A new action changes state synchronously before awaiting work, preventing repeated clicks from launching duplicate operations.

Each operation has cancellation and a generation/session token. A late response or animation callback cannot mutate a replacement session. Optional audio failure does not block opening. Reduced motion changes presentation without changing the result.

## Strip and motion

Strip construction uses validated nonnegative display weights. The original rounded-copy scheme has a nominal cap of 40 slots; rounding may produce fewer. The selected prize is inserted if absent. Internal indices are zero-based; the target must always be valid, including a zero-weight catalog. An empty catalog is rejected.

The stop offset is sampled within the central 80% of the target card. The spin plan computes absolute position from elapsed time, so dropped frames do not lose distance. Resize preserves logical position and target. CanvasRoulette caches card images and draws only visible slots; React does not receive per-frame offsets.

Presentation time counts all elapsed visible time. Physics uses a bounded fixed-step accumulator separately. Hidden tabs pause visual scheduling; resume must not replay missed audio clicks or advance physics through an unbounded gap.

## Routes

Hash routes preserve static-hosting compatibility and deployment prefixes.

| Route | Current screen |
|---|---|
| `#/inventory` | Available/opening chest instances |
| `#/archive` | Opened and destroyed instances |
| `#/items` | Owned items; currently also displays balances pending Wallet separation |
| `#/cases` | Case type catalog |
| `#/cases/<caseId>` | Type-level case view |
| `#/cases/<caseId>/instances/<instanceId>` | Owned chest view |
| `.../items/<itemId>` | Item inspection |
| `.../opening/<sessionId>` | Opening session |
| `.../reward/<sessionId>` | Session reward |

The item/opening/reward suffixes work on case and owned-instance routes. `?from=archive` preserves the return destination. Explicit links take priority over stored navigation; otherwise the router restores the last route or falls back to inventory. Unknown or malformed routes do not silently substitute a different item/case. Wallet and settings routes are planned, not implemented by this documentation.

## Persistence and recovery

Browser storage contains versioned, validated screen snapshots and a scoped session journal. It stores the session ID before requesting the result, then the selected item and strip/spin plan before roulette presentation. Storage failure or invalid/future snapshots must not crash the application.

Recovery repeats an interrupted physical phase from its start rather than restoring an exact GPU/physics frame. Roulette reuses the stored plan and prize. An already shown reward can be restored directly. Route disposal frees render/audio resources without discarding a recoverable session; completion clears the relevant checkpoint. Server state remains authoritative when reconciling ownership and outcome.

## Inventory presentation

A chest card may group similar instances but must retain individual IDs, seeds, state and metadata. Filtering occurs before grouping; the representative preview and navigation refer to a real member of the group. Group keys must reflect meaningful rarity, condition, appearance and lifecycle differences rather than technical revision alone.

Display condition as remaining integrity, with per-part detail and the worst part determining the overall indicator. Condition is not reward probability. Model/instance revisions and appearance participate in preview cache invalidation; a generic static poster is not a substitute for current instance appearance.

## Resource lifecycle and physics

Rapier is the chosen rigid-body engine, isolated behind a physics port. Closed-chest colliders are computed from normalized model bounds; opening uses authored animation rather than a physical lid hinge. Fixed physics steps are 1/60 second with a bounded catch-up budget. Reset clears velocities/bodies; dispose frees WASM worlds, GPU resources, event handlers, observers and frame callbacks according to ownership.

The world and chest share physics time when integrated as a Guest; it must not step twice per frame. Shared asset resources are freed only by their owner. Validate repeated cycles, cancellation, tab pause/resume, resize, exact target stopping and real WASM reset separately from visual calibration.
