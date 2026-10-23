# Offline Minecraft import

The importer under `tools/mc-import/` converts Sponge `.schem` files into validated world packs. It runs in Node outside the browser runtime. The engine knows cells, boxes and textures; the importer owns Minecraft syntax, supported shapes and resource mapping.

## Command

```sh
node tools/mc-import/cli.ts input.schem \
  --mapping tools/mc-import/vanilla-mapping.json \
  --resource-pack /path/to/resource-pack \
  --out /path/to/output-pack \
  --id example-world \
  --author "Author" --license CC0-1.0
```

Optional flags: `--region x0,y0,z0:x1,y1,z1` (inclusive crop), `--scene scene.json` (markers/cameras/environment/sides), `--source` and `--strict`. The resource folder may use `assets/minecraft/textures/block/*.png` or a flat tile directory.

The output directory contains `pack.json`, `structure.u16` and textures. Reports are written beside it as `<out>.import-report.json` and `.md`, then the pack is read back through `readWorldPack`. Existing nonempty output without a pack manifest is not replaced. `--strict` exits unsuccessfully for unsupported states even though it writes the pack for inspection.

## Modules

| File | Responsibility |
|---|---|
| `schem.ts` | Bounded gzip/NBT reader for Sponge v1–v3, palette/cells/block entities/entities, crop |
| `states.ts` | Normalize state names and sort properties without silently discarding them |
| `geometry.ts` | Cubes, parts, plants, torches and supported directional geometry |
| `mapping.ts` | Author mappings for block roles, materials, tints and placeholder |
| `textures.ts` | 8-bit PNG decode, first animation frame, fixed biome tint, opaque approximation, quarter-turns |
| `import.ts` | Build pack files and compatibility findings |
| `report.ts`, `cli.ts` | English report rendering and command-line workflow |

The bundled vanilla mapping is an example, not a license to redistribute game textures. The importer has no built-in Mojang tile assets. `scripts/packs/make-mc-tiles.mjs` generates original CC0 stand-ins for local validation.

The repository uses its own schematic reader. Earlier Prismarine research incorrectly decoded some leaf states; those research JSON/reports are not the source of truth. Read states from the schematic palette instead of relying on that conversion.

## Shape and material limits

Supported shapes include cubes, stairs, slabs, walls, fences, trapdoors, lanterns, axis-oriented pillars and face-oriented cubes. Rotation is baked into box geometry and rotated tile copies; runtime block rotation is unnecessary. Vanilla UV locking derives from box coordinates.

Unsupported geometry includes many doors/gates/panes/beds, buttons/pressure plates/signs/banners, carpets/rails/ladders/vines, chests/chains/bars/candles/pots, wall torches, liquids and snow layers. Consult the actual report for each input rather than assuming this list is exhaustive.

Approximations include lantern handles, fire planes, opaque treatment of translucent tiles, first animation frames, fixed biome tint, waterlogged/ignored state and block-entity data. Missing scene metadata is generated and reported. Source entities do not become a live Minecraft connection or implemented NPC channel.

## Compatibility findings

Every state reports cell count, result (`exact`, `approximated`, `unsupported`) and a list of findings. Findings distinguish shape, material, state and block-entity loss using stable codes and details. A shape approximation and a material approximation may both be recorded for one state.

`exact` means supported geometry/state with the author's selected material mapping. `approximated` must explain each loss. Unsupported cells remain empty or use an explicitly configured placeholder, and this is reported. There is no silent fallback to claim complete fidelity.

Review the report, run `readWorldPack` validation, and capture the result through [world review](README.md). Conversion success alone does not prove visual fidelity or redistribution rights.
