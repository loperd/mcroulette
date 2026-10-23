# Product scope and priorities

Individual chest instances, rather than chest types, are the units of ownership and opening. The inventory is the main workspace; the case catalog and opened/destroyed archive are separate views.

## Current foundation

The application has a Go API for authentication, chest ownership, authoritative opening outcomes and owned items. The frontend presents per-instance contents and appearance, a physical chest-opening sequence, a roulette strip and the resulting item. World/model definitions are shared by the opening scene and previews.

The existing item screen also displays balances. The existing backend stores mutable wallet balances and coordinates workshop actions in a shared transaction. These are migration starting points, not the accepted target architecture.

## Accepted next work

Inventory must show recognizable objects with compact item presentation and server-priced repair, merge, salvage and sale actions. Currency and collection materials belong in a separate Wallet section with balances and transaction history, not among owned items.

Wallet becomes an autonomous bounded context with a double-entry ledger. Inventory and future Shop integrate only through ports and adapters, using durable sagas, outbox/inbox, idempotency and compensation. The [context contract](architecture/contexts.md) defines the boundaries and failure rules; the ledger and saga migration are not complete.

Identity/Profile needs a settings page for adding passkeys, linking or rebinding Telegram, language and interface preferences. Provider linking must preserve the current player account and be extensible to future Google authentication. Existing login support does not mean these settings are implemented.

The performance target includes iPhone X/11 and midrange Android devices. Chromium CPU/viewport emulation is useful regression evidence but cannot establish Safari, Telegram WebView or physical GPU performance.

## Further product work

Server-side Minecraft account linking and delivery acknowledgment need an explicit integration contract. A reward screen alone does not establish delivery to Minecraft. Future Shop pricing, payment sources and purchase policies require their own domain decisions.

Other planned capabilities include collection progress, discovery/duplicate indicators, account preferences, operational observability and configuration simulation. Do not present speculative mechanics or fabricated activity as existing product behavior.

## Acceptance

Changes must preserve authoritative rewards, prevent repeated consumption or credit, recover interrupted sessions and release rendering resources. UI interactions need real-browser review; performance needs device measurements; a release needs successful CI deployment and a production smoke check. See the [validation](guides/development.md), [performance](guides/performance.md) and [release](guides/releases.md) guides.
