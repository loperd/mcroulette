# Relic v2 — prototype for visual review

`relic.glb` — final PBR export for this review. `relic.bbmodel` — editable Blockbench **Free Model** with polygon meshes and PBR texture groups. `materials.json` defines exact export factors; Blockbench's material preview uses an approximate scalar emission control. `contract.json` defines scale, axis, assembly/clip names and the review status.

One GLB unit is one block. Closed vertices remain in x/z ±0.5, y 0..1; the animated lid naturally travels outside the closed envelope. Front = −Z. `Body` is fixed; `LidAssembly` rotates around `[0, 10.55, 7.65] / 16`. The large front crystal is in the body; only the short upper clasp moves with the lid. `Vault.Open` runs 0..105° in one second and can be reversed. The existing game model is not replaced.

## Editing and exporting

Open `relic.bbmodel` in Blockbench. Use material view to inspect metal/roughness groups. Edit the named meshes, face UVs, or embedded bitmaps. Keep the two assembly roots, their origins/rest transforms and names. Convert new cubes to meshes and put them directly in Body or LidAssembly; unsupported structures fail explicitly. These are limits of the controlled exporter, not Minecraft requirements.

For exact PBR export after edits:

```sh
python3.13 scripts/chests/build-relic.py --from-bbmodel assets/chests/relic-v2/relic.bbmodel
python3.13 scripts/chests/validate-relic.py
python3.13 scripts/chests/review-relic.py
node --test tests/adapters/relic-v2.test.mjs
```

The controlled export preserves authored mesh positions, element rotation/translation, per-face UVs, texture bitmaps and `materials.json` PBR values. It does **not** overwrite the edited bbmodel. Edit metallic/roughness/emission in `materials.json`; texture colors come from the actual bitmaps.

Do not rely on native GLB export from the installed Blockbench version for the material contract: its exporter switches to textured view, where PBR groups are not selected. This was established from installed Blockbench 5.2.2 source; GUI roundtrip remains unverified. The controlled path has a byte-identical unedited roundtrip plus tests with actual mesh, UV and roughness edits.

Rebuild the procedural original only when intended:

```sh
python3.13 scripts/chests/build-relic.py
```

That command overwrites this prototype's model, bitmaps and source, so save manual variations separately. It does not rebuild the legacy models or Rune.

## Visual evidence and validation

See `artifacts/ender-redesign/REPORT.md`, `artifacts/ender-redesign/relic/review-sheet.png` and the individual 800² PNGs. The renderer reads the actual GLB buffers, PNGs and PBR materials and performs CPU path tracing with GGX, white area lights, shadows and reflections. It does not connect to a browser/application. It is not proof of WebGL/GPU performance or a running editor screenshot.

Python generation/review requires Python 3.13 with numpy and Pillow. CPU review additionally requires clang++ and a C++17 standard library. No dependencies were added to the app. `--quick` produces low-sample drafts; final renders use the settings recorded in `render.json`.

The shared review rig is the starting contract for future Rune evidence: beauty/clay direction `[1.5,1.15,-1.9]`, ortho width 1.62, target `[0,.48,0]`, identical lights/exposure. Orthographic checks use width 1.18; open poses are explicitly fit and recorded separately. Rune redesign starts after Relic visual approval.
