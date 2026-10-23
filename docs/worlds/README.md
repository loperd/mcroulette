# World system

`packages/blockworld` is the reusable Three.js block-world engine. It does not import Voxel Vault application code or know about chests, case types or Wallet. Application adapters select a world and provide a chest as a guest.

## Rendering foundation

`BlockWorld` is a fixed-volume grid with block IDs and sky/glow light arrays, not a chunk streaming store. Builders place blocks deterministically, compute light and mesh the result. The mesher culls covered faces and emits merged opaque, plant/torch and liquid passes, with directional shading, smooth light, vertex AO and optional baked sun occlusion. Changing the cell grid after meshing does not update existing geometry automatically.

Built-in block textures are procedural and nearest-filtered. Wind, waves, flicker and atmospheric effects use the world's clock and shaders. The baseline world look uses baked vertex lighting, Basic materials, no tone mapping and its existing color pipeline. See the [package README](../../packages/blockworld/README.md) for lighting/meshing details.

`BlockView` owns renderer, camera, frame loop, resize observer, world physics and view-local resources. The frontend `PixelWorldBackground` adapter manages its lifetime and fallback. Hidden/obscured worlds pause; quality adaptation reduces render cost before allowing sustained slow frames.

## Stage, Living and Guest

| Object | Ownership and update |
|---|---|
| `Stage` | A built scene: root, camera, environment, anchor, ground and world-owned resources |
| `Living` | World-owned behavior created by the builder, updated by the world clock |
| `Guest` | Application-owned object with its own root, units, appearance and behavior; admitted/dismissed through the view |

A guest is placed at the stage anchor, scaled to block units and oriented using the anchor front or camera. The world supplies camera, shared-depth rendering, lighting and physics. The guest owns its internal state, animation and assets, requests frames when needed, and removes its physics body on leave. Dismissing it does not dispose assets owned by the application.

There is one physics clock: a world and its guest must not step the simulation twice in a frame. Camera approach is a shared resource; current behavior is designed around the principal chest guest, not arbitrary independently controlled cameras.

Built-in stages are cached by builder ID and seed. A mutable root cannot belong to two live views; attempting to reuse a cached stage concurrently must fail before reparenting it. Uncached pack stages build an independent root per view and dispose their owned resources. [World packs](packs.md) details that lifecycle.

## Deferred entity extension

A view-local `Resident`/`inhabit()` channel was explored for externally supplied mobs/NPCs that need the world's clock and look. It is deferred, not a published implemented API. Stage/Living/Guest remain the accepted foundation; an entity framework or new renderer is not required for packs.

If external entities are introduced, their source adapter owns identity and target pose. A rendered entity must have one pose writer; do not make server updates and dynamic physics competing authorities. A live Minecraft protocol connection, coordinate mapping, collision policy and multi-guest camera ownership need separate decisions. Offline schematic import does not supply live entity synchronization.

## Mine world

The mine implementation is under `src/adapters/outbound/worlds/miner/`, selected through the application world registry for `deep-mine`. Its procedural scene includes fortress/gate, tunnel and cliffs, chest platform, galleries/rail, carts/crates, banners, lava, waterfalls, ore, fog and sparks. Repeated geometry uses instancing; static ore crystals are batched.

Use `/world-review.html?world=deep-mine` or the actual case flow to inspect it. The old `/miner-scene.html` experiment was removed. Reference matching and phone performance need browser/device evidence, not historical mesh counts.

## Rendering experiments

The dev-only `/scene-lab.html` compares baseline and `shadow-poc` on the same world/camera. The PoC uses Lambert variants, normals, a bounded 1536-pixel directional shadow map, hemisphere fill, ACES and sRGB output. Production remains on its selected baseline unless explicitly configured otherwise.

A historical desktop sample at 1492 × 929 reported baseline 120 FPS / 0.16 ms CPU submission and PoC 98 FPS / 4.71 ms, with 38 draw calls and 180.3k triangles in both modes. These short samples are not GPU measurements or physical-phone evidence. The original screenshot capture was not usable, so visual superiority was not established.

The engineering direction is to extend the existing renderer when a measured requirement justifies it. Bloom, screen-space AO, volumetric effects, per-block PBR and chunk streaming are separate work; their availability in Three.js does not mean they are integrated. Preserve the existing baked world look and verify color/alpha behavior before changing rendering passes.

## Review and regressions

```sh
node scripts/world-review.mjs artifacts/world-review/baseline deep-mine="world=deep-mine"
node scripts/world-regression.mjs
node scripts/world-regression.mjs --base <revision>
```

World review uses the actual BlockView and records screenshots, metrics and errors. World regression compares deterministic geometry/material fingerprints with HEAD or a specified revision. For a dirty shared tree, use `capture <file>` before a change and `compare <file>` afterward. Matching geometry hashes do not establish pixel equality; capture both views when changing lighting/materials.

[World packs](packs.md) covers declarative scenes; [Minecraft import](minecraft-import.md) covers offline source conversion.
