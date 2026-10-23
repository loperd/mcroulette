# Relic / Rune authoring sources

Two independent candidates based on supplied 64 × 64 atlases and visual references. These are an initial editable pass; reference detail exceeds the texture resolution of these models. They do not replace the current game model.

## Files and contract

Each `relic/` and `rune/` directory contains a `*-ender-chest.bbmodel` source, a preview/import GLB, editable `atlas.png` and original `source-atlas.png`. Textures are embedded in both model formats.

`Body` contains the hollow shell, posts, rim, feet and lower decoration. `LidAssembly` contains the lid, corners, hinges and moving latch. Its pivot is `[0, 10.25, 7]`, with front facing −Z. `Vault.Open` lasts one second and opens to 105°. Do not move animated pieces into Body.

Faces have individual UVs. The original atlas islands remain intact; the formerly empty region `x=16..47, y=48..55` adds metal, dark metal, glow and interior palettes. GLB emission uses `Vault.Glow` with nearest filtering. Export scale is 1/16: closed width is about 0.992 and height about 0.925.

## Review

Generated evidence lives in `artifacts/ender-blockbench/`: comparison plus per-variant three-quarter/front/right/back/top/open/wireframe images. These are CPU renders of final GLB geometry/UVs, not screenshots from Blockbench. Glow is represented by brightness without bloom.

Review corner thickness, lid height and latch size first. Fourteen pixels across a main face remain coarser than the references. A closer match needs a dedicated 128–256 px unwrap, wider relief decoration and a faceted crystal. Rune includes editable `Body.RuneSeal*` geometry.

Relic has 900 triangles; Rune has 936. Each has four meshes, two materials, one embedded PNG and one opening clip. Validation checked face orientation, UV bounds, Three.js GLTFLoader loading, assembly names and lid motion. Node loading used an ImageBitmap metadata stub; Pillow decoded the texture for CPU review. Opening in the actual editor and WebGL material appearance still require verification.

## Regeneration

```sh
python3.13 scripts/build-ender-blockbench.py
node scripts/verify-ender-blockbench.mjs
```

The generator overwrites sources and review images. Save a separate source before hand editing. After editing in Blockbench, export GLB with textures/animations and scale 16; the generator does not import those manual changes. Files were generated directly in the compatible format rather than exported from a running editor.
