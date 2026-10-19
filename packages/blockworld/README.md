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

## On top of the rules

Extras layered over the vanilla look, never replacing it:

- **Sun** (`meshWorld(..., { sun })`): shadows like a shader pack, but baked. The sun never moves, so
  each vertex casts one ray towards it through the grid while the world is meshed. Faces that face
  the sun warm up; anything behind a block or leaf lies in shadow. It only applies where sky light
  reaches, so there is no sun in caves, and it costs nothing per frame.
- **Wind and waves**: the mesher marks how free each vertex is to move (`sway`). Plant tops are fully
  free, leaves a little, and so are liquid surfaces. The view's materials move them on the GPU from
  one shared clock and the stage's wind, so grass bends with the gusts and water rolls and glints.
- **Atmosphere** (`Stage.sun`, `Stage.flicker`): a halo around the sun in the sky, and fog that glows
  towards the sun. Leaves and grass light up when the sun is behind them. Water reflects the horizon
  at grazing angles and glitters where its ripples catch the sun. Torchlight flickers: the mesher
  marks each vertex's share of block light (`glow`), so only that share moves, and each torch keeps
  its own beat. A lightning flash outshines the sun for a moment.

## The world is the base

The world owns the canvas, the camera, the ground and the physics. Anything else that lives in it
— a chest, say — comes in as a **guest** (`view.admit(guest)`):

- the world stands the guest on the stage's `anchor` block, scaled so `unit` of its units make a
  block, and turned to show the viewer its `front`;
- its body goes into the world's physics (`WorldPhysics`, Rapier, in blocks with a block = 1 m). The
  ground is the world's own solid blocks around the anchor (`Stage.ground`), or a flat floor;
- the world draws the guest after itself, with its own camera and sharing the depth, so a blade of
  grass in front of the guest hides it. The guest keeps its own look: lit materials, film curve,
  shadows and clipping. A `veil` (darkness for an interface on top) goes between the two;
- the guest moves on its own (animations, its body) and asks for a frame with `world.draw()`. The
  world's camera moves in on it with `world.approach(closer, lift)`;
- the world acts on it: `context.blast(at, strength, radius)` throws bodies in its physics;
- there is one physics clock. Whoever comes first in a frame (the world's loop or a guest) brings
  the simulation up to now, so it is never stepped twice.

A stage with `transparent: true` and only a `ground` is a see-through layer for a guest over
something that is not a block world.

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
