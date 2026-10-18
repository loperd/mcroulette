# @voxel-vault/blockworld

Minecraft-style block worlds on three.js, rendered by the rules of the game. The app's case worlds
are built with it; the library knows nothing about chests or cases.

## Rules

- **One block, one cell.** Cubes fill it; `cross` (flowers, grass), `torch` and `liquid` models are
  drawn inside it. Ids are given in registration order, 0 is air.
- **Textures.** 16×16 per face, painted procedurally (no game assets) into one atlas, nearest filter.
- **Light.** Levels 0–15 per cell. Sky light falls straight down at 15 until an opaque block (leaves
  take 1), then spreads sideways losing 1 per block; block light floods from emitters (torch 14,
  lava and glowstone 15). Brightness uses the game's curve `f / (4 − 3f)` with the default gamma.
- **Mesh.** Only faces not covered by an opaque neighbour; directional shade top 1.0, north/south
  0.8, east/west 0.6, bottom 0.5; smooth lighting averages the open cells around each vertex;
  ambient occlusion from two side cells and the corner cell, with the quad diagonal flipped to
  follow it. Colours reach the screen as computed: no colour management, no tone mapping.
- **Passes.** Opaque (with alpha test for leaves), plants (both sides), liquids (blended).

## Performance

The world is meshed once and cached per stage; the mesher returns plain typed arrays (testable in
Node, movable to a worker). `BlockView` renders at ≤ 1× device pixels × .75, ~30 fps, and gives up
quality before frames: resolution, then frame rate, then a still picture; it pauses while hidden
or with reduced motion.

## Use

```ts
const blocks = new BlockRegistry([{ name: 'grass', textures: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' } }]);
const world = new BlockWorld(64, 32, 64, [-32, 0, -48]);
world.set(x, y, z, blocks.id('grass'));
computeLight(world, blocks);
const { texture, uv } = blockAtlas();
root.add(...worldMeshes(meshWorld(world, blocks, { uv, sky: [1, .8, .65] }), texture));
new BlockView(element, { id: 'meadow', build: () => ({ root, living, sky, fog, camera }) });
```

## References

- [minecraft-renderer](https://cdn.jsdelivr.net/npm/minecraft-renderer@0.1.96/README.md) — three.js world renderer: instanced cubes and merged models, sky/block light, smooth lighting, vanilla face shade.
- [prismarine-viewer](https://github.com/PrismarineJS/prismarine-viewer) mesher (`viewer/lib/models.js`) — per-vertex AO from two sides and a corner, quad diagonal flip, separate liquid pass.

Tests: `tests/blockworld/`.
