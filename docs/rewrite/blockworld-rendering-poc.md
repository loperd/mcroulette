# Voxel Vault — rendering architecture and shadow PoC

## Architecture Findings

### Runtime stack

There is no PrismarineJS runtime dependency in `package.json` or `package-lock.json`; the installed runtime dependencies are React, Three.js and Rapier. The word “Prismarine” appears in the blockworld mesher comments and README only as a reference for the ambient-occlusion algorithm. The project owns its block data, mesher and renderer in `packages/blockworld`.

The runtime path is:

```text
src/adapters/outbound/worlds/overworld-blocks.ts
  BlockRegistry + seeded world builder
        ↓
packages/blockworld/src/world.ts
  BlockWorld: typed arrays for block ids and sky/glow light
        ↓
packages/blockworld/src/light.ts → mesher.ts
  light propagation → opaque/plants/liquid typed-array geometry
        ↓
packages/blockworld/src/view.ts: worldMeshes()
  BufferGeometry + atlas-backed Three.js materials
        ↓
packages/blockworld/src/view.ts: BlockView
  Scene + Camera + WebGLRenderer + render loop + resize + fog
        ↓
src/adapters/inbound/react/PixelWorldBackground.tsx
  app lifecycle and chest Guest integration
```

`BlockWorld` is a single fixed-size volume, not a chunk store: `world.ts:2–28` allocates `Uint16Array` block ids plus `Uint8Array` sky/glow levels and provides `get`, `set`, `fill` and `top`. A world builder creates that volume with `BlockWorld`, places blocks by code and deterministic seed, runs `computeLight`, then calls `meshWorld` (`overworld-blocks.ts:87–134`).

`meshWorld` culls covered cube faces and emits three plain typed-array passes: opaque blocks, plants/torches, and liquids (`mesher.ts:16–34, 114–229`). It bakes directional face shading, smooth light, vertex AO and optional static sun occlusion into vertex colors. `worldMeshes` converts those arrays to Three.js `BufferGeometry` and gives each pass one atlas-backed `MeshBasicMaterial` (`view.ts:203–218`). The atlas is a procedural canvas texture with nearest filtering (`atlas.ts:1–6, 109–143`).

`BlockView` creates one `WebGLRenderer`, `Scene`, `PerspectiveCamera`, sky dome and `Fog`, and owns the frame loop and `ResizeObserver` (`view.ts:316–374, 468–515, 565–615`). It renders the world and then optional chest guests into the same depth space. `PixelWorldBackground.tsx:28–60` creates/disposes the view and admits/dismisses the chest guest. The world camera is independent of the block data and lives in the `Stage.camera` contract (`view.ts:34–60`).

The baseline renderer is unlit: it sets `NoToneMapping`, `LinearSRGBColorSpace` and disables `renderer.shadowMap` for the world (`view.ts:321–327, 579–585`). Existing visual lighting is mostly baked into vertex colors. Its custom `onBeforeCompile` shader adds plant sway, water waves, torch flicker, sun haze and fog (`view.ts:153–200`).

The world geometry is merged into three meshes, not one mesh per block or chunk. There is no chunk dirty/rebuild API: changing `BlockWorld.set` after meshing does not alter an existing `BufferGeometry`; callers would have to rerun lighting/meshing and replace the affected pass. Stages are cached by builder id and seed (`view.ts:272–280`); `BlockView.dispose()` releases renderer-local resources while retaining the stage root for reuse (`view.ts:468–490`). The cache currently has no eviction policy. Rapier separately builds physics ground around a guest (`physics.ts:146+`).

Three.js is pinned to `~0.186.1` (`package.json:27–32`, lockfile entry `node_modules/three`). Its installed source contains `MeshLambertMaterial`, the shadow shader chunks and `WebGLShadowMap`; its `examples/jsm/postprocessing` includes `EffectComposer` and `UnrealBloomPass`. No Composer is wired into this app today.

## Capability Matrix

| Capability | Existing support | Cost / actual boundary |
|---|---|---|
| Directional shadows | Static voxel sun occlusion is baked in `meshWorld`; Three shadow maps were disabled for the world. | **Small renderer extension.** `MeshBasicMaterial` ignores lights and does not receive dynamic shadows. The PoC converts world passes to `MeshLambertMaterial`, computes normals, enables cast/receive and adds one bounded `DirectionalLight`. No mesher rewrite was needed. |
| Ambient occlusion | Per-vertex grid AO is already baked from neighboring blocks (`mesher.ts:199–210`). | **Supported as-is** for block contact shading. Screen-space AO would need a postprocessing pass and extra render cost; not tested. |
| Atmospheric fog | `Scene.fog = Fog`; custom shaders add sun-colored haze (`view.ts:176–200, 334–337`). | **Supported as-is** for distance fog. A volumetric solution would need a shader/pass extension. |
| Tone mapping | Baseline explicitly uses `NoToneMapping`. | **Small extension.** The PoC switches world rendering to ACES Filmic and sRGB output. Visual color calibration still needs review. |
| Bloom | No postprocessing pipeline is installed in `BlockView`. | **Renderer extension.** Three’s bundled addons provide `EffectComposer` / `UnrealBloomPass`; one or more extra full-screen passes add bandwidth and render time. Not included in this PoC. |
| Dynamic lights | Sky/block light levels are propagated on CPU and baked per vertex; shader only modulates the baked glow share. | **Small extension for the world meshes.** Lambert material and Three lights work with the current vertex attributes. Many point lights may become expensive; not measured. |
| Custom block materials | One material per render pass; block identity is used to select atlas UVs but is not retained as a mesh group. | **Small extension** for changing an entire pass. Per-block material/shader behavior needs block ids/material groups or another per-vertex attribute in meshing. |
| Water | Separate liquid geometry pass; GPU wave, horizon fresnel and sun glints already exist (`view.ts:145–169, 203–210`). | **Supported as-is** for stylized water. Reflection/refraction or a depth-aware shoreline needs renderer/shader work. |
| Particles | Stage `root` accepts arbitrary Three.js objects; `Stage.living` updates them on the owned render loop. | **Supported as-is.** Existing world life uses `Points`, `BufferGeometry` and other Three objects. |
| Camera | `Stage.camera` controls pose, target, FOV, drift and screen focus; resize is internal to `BlockView`. | **Supported as-is.** It is independent of block generation and can be animated through existing APIs. |

These are implementation limits, not PrismarineJS API limits: the app does not call PrismarineJS. Three.js already provides the relevant lighting and postprocessing primitives; the current constraints are the app’s fixed unlit materials and one-pass `BlockView` pipeline.

## PoC Results

The dev-only scene lab at `http://localhost:5173/scene-lab.html` uses the production `OVERWORLD_BLOCKS` stage and chest model, fixed seed `11`, and a fixed camera (`drift: 0`). Its “Рендер: исходный / PoC-тени” button calls `BlockView.setGraphicsMode()` in place; switching does not regenerate the world or reload the page. Production starts in baseline mode and production UI was not changed.

The experiment adds a bounded 1536×1536 shadow camera, a warm directional sun, a hemisphere fill, Lambert variants for the existing three block meshes, ACES tone mapping and sRGB output. It restores the original materials and renderer mode when switched back or disposed. The scene data, atlas, geometry and chest remain the same. Current page snapshot reports zero console errors in either sampled mode; the console did contain stale Vite/HMR errors from earlier revisions of this dev page, not the current loaded page.

The browser tool’s screenshot command did not produce a retrievable artifact: it returned a screenshot path but wrote a zero-byte PNG in the workspace. Therefore no baseline/PoC screenshot paths are claimed here, and visual superiority or shadow-map appearance is **not verified**. The lab’s “Сохранить кадр” button captures the real WebGL canvas when used in a regular browser.

## Performance Comparison

Measured in the open local browser tab at a 1492×929 CSS-pixel viewport, with the same seed, camera, world and chest guest. Values are one-second rolling samples after warmup, not a cross-hardware benchmark. `frameMs` is main-thread time around Three.js render submission; it is not GPU execution time. FPS is the renderer’s one-second draw counter.

| Mode | FPS sample | CPU render submission | Draw calls | Triangles | Geometries | Textures | Shadow map |
|---|---:|---:|---:|---:|---:|---:|---|
| Baseline | 120.0 | 0.16 ms | 38 | 180.3k | 13 | 3 | off |
| Shadow PoC | 98.0 | 4.71 ms | 38 | 180.3k | 13 | 5 | on |

The sample points to the shadow pass as the dominant new cost: draw-call and geometry counts did not change, while two renderer textures appeared, the one-second FPS sample fell by about 18%, and CPU submission rose by about 4.55 ms. These counters do not reveal VRAM bytes, GPU time, or frame pacing across hardware. The shadow map currently updates with the moving scene each frame; static-map caching is a next experiment if foliage shadow motion is not required.

## Architecture Decision

| Option | Fit | Scope / risk |
|---|---|---|
| **A — REUSE** | Keep current renderer and baked-light capabilities. | Lowest change and safest performance, but cannot provide the dynamic directional shadows demonstrated by this PoC while world passes stay `MeshBasicMaterial`. Suitable if baked voxel shadows are enough. |
| **B — EXTEND** | Add lighting/shadow and optional postprocessing to `BlockView`; retain `BlockWorld`, mesher, atlas and stage builders. | **Recommended.** The PoC changes only the renderer/material boundary; Three already supports Lambert shadows. Moderate tuning and GPU cost, low dependency risk, no Prismarine internals. Keep effects configurable and measured. |
| **C — ADAPTER** | Keep block geometry/data, render through a separately controlled Three layer. | More freedom, but duplicates scene/camera/resize/lifecycle responsibilities that `BlockView` already owns. Consider only if multiple render pipelines or postprocessing isolation become necessary. |
| **D — REPLACE** | Keep block arrays but replace meshing and rendering. | Highest cost and risk. No evidence currently requires it: existing meshing already provides culling, three passes, AO, light, water motion and block tests. Reconsider if required materials/lighting cannot be expressed without corrupting the merged geometry model, or if chunk streaming/editing becomes a core need. |

Revisit B if measurements show the shadow map cannot meet target frame time on ordinary desktop hardware, if high-quality soft/volumetric shadows or temporal effects become mandatory, or if the material changes require per-block ids/groups that would significantly complicate the existing mesher. C is the first fallback; D needs evidence that current mesh output is inadequate.

## Scene Construction Findings

- **Programmatic blocks and terrain:** supported by `BlockWorld.set/fill` and `BlockRegistry`; `overworld-blocks.ts` builds seeded terrain and props directly.
- **Deterministic detail:** supported in the world builder through seeded PRNG and deterministic noise (`overworld-blocks.ts:50–70, 87–130`).
- **Hand-authored structures:** supported through explicit block loops and `set`; there is no separate scene-composition tool yet.
- **Minecraft schematic/structure import:** not implemented and no parser dependency is installed. This would require an importer (for example, a bounded NBT/Sponge schematic parser) that writes into the existing `BlockWorld` contract.
- **World reuse with different chests:** supported through cached `StageBuilder` and generic `Guest` admission; the chest is not part of the block mesher (`view.ts:72–97, 272–280, 399–427`).
- **Non-block decoration:** supported by Three.js objects in `Stage.root`, plus `Stage.living` for animation; no Prismarine adapter is involved.
- **Chunk streaming/rebuild:** absent. Current stage is a fixed full-world volume meshed as three large buffers. A future composer can target this API first; chunk boundaries and partial rebuilds would be a separate, evidence-driven extension.

## Next Implementation Scope

**Required before judging the rendering direction:** capture baseline and PoC from the same browser viewport using the lab’s real canvas; repeat the comparison after the initial shader/shadow-map warmup; inspect the actual images; record a short stable FPS/frame-time sample; then decide whether to cache the static shadow map or lower its resolution.

**After that:** calibrate light intensity and ACES exposure, test cutout-leaf shadow quality and bias acne, add a bounded optional postprocess prototype only if the direct-light result is promising, and test the same view at one narrower viewport. Do not begin a new world composer or replace meshing yet.

## Files Required for Review

### Required

| Path | Role | Why | Priority |
|---|---|---|---|
| `packages/blockworld/src/view.ts` | `production code` | Owns the A/B graphics mode, shadow light/camera, renderer settings, disposal and renderer metrics. | P0 |
| `packages/blockworld/src/index.ts` | `contract` | Exports the mode and metrics types used by the dev lab. | P1 |
| `src/dev/blockworld-scene-lab.ts` | `production code` (dev-only) | Uses the real production world/chest, fixed camera, live mode switch and counters. | P0 |
| `scene-lab.html` | `production code` (dev-only entry) | Hosts the no-reload switch, save-frame action and metrics display. | P1 |

### Reference

| Path | Role | Why |
|---|---|---|
| `packages/blockworld/src/world.ts` | `contract` | Fixed-volume block and light storage; confirms there are no chunks. |
| `packages/blockworld/src/mesher.ts` | `production code` | Face culling, light/AO baking and three mesh passes. |
| `packages/blockworld/src/atlas.ts` | `production code` | Procedural atlas and nearest-filter setup. |
| `packages/blockworld/src/physics.ts` | `production code` | Ground collision derived from block cells. |
| `src/adapters/outbound/worlds/overworld-blocks.ts` | `generator` | Seeded production world creation and block placement. |
| `src/adapters/inbound/react/PixelWorldBackground.tsx` | `production code` | App lifecycle, fallback and chest guest integration. |
| `packages/blockworld/README.md` | `docs` | Documents current lighting, AO, water, wind and stage contracts. |
| `node_modules/three/src/renderers/webgl/WebGLShadowMap.js` | `reference` | Installed Three.js shadow-map caster behavior. |
| `node_modules/three/src/renderers/shaders/ShaderLib/meshlambert.glsl.js` | `reference` | Installed Lambert shader includes shadow-map chunks. |
