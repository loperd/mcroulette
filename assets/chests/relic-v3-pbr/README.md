# Relic Chest V3 — PBR review candidate

Visual acceptance is pending. Rune and the active application case are unchanged.

Open `relic.bbmodel` in Blockbench, select **PBR** view. Body and LidAssembly are editable polygon meshes; Vault.Open opens the lid through 105°. Embedded normal and derived MER maps make native viewport review useful. Blockbench MER emission is an approximation; it has no independent RGB emissive/AO equivalent to the GLB. The canonical PBR maps and material factors live in the adjacent PNG files and `materials.json`.

Controlled export after editing geometry, base color or UV:

```sh
python3.13 scripts/chests/build-relic.py --from-bbmodel assets/chests/relic-v3-pbr/relic.bbmodel --output-dir assets/chests/relic-v3-pbr
```

Controlled export uses the adjacent ORM, normal and emissive PNGs, not embedded BB normal/MER preview edits. To change PBR, edit the canonical external maps/materials.json and refresh viewport textures. Do not use Blockbench's native GLB exporter for production PBR. Keep newly added polygon meshes directly inside Body/LidAssembly; convert cubes to meshes; retain the root hinge.

Rebuilding the procedural candidate discards manual asset edits:

```sh
python3.13 scripts/chests/build-relic-pbr.py
python3.13 scripts/chests/review-relic-pbr.py
```

Textures use physical face charts at 128 texels/block, 4px dilated gutters; measured atlas sizes reflect chart packing, not upscaled 64px paintings. Core GLB maps: Base Color and Emissive in sRGB; Normal linear with +Y tangent convention; ORM linear with R=AO, G=Roughness, B=Metallic. Material factors for metallic/roughness are 1 because channel values carry the physical properties. Crystals are opaque faceted minerals with low mapped emission; no unsupported transmission.

Actual renderer review: `npm run dev -- --host 127.0.0.1`, open `/relic-review.html`. It calls production `loadChestAssets` with a review-only profile, preserves maps and provides neutral/showcase/application lighting. For automated screenshots on a machine with WebGL-capable Chromium: `node scripts/chests/capture-relic-runtime.mjs`.

Offline evidence is in `artifacts/relic-pbr-pass/renders/`. CPU path tracing is explicitly distinct from a real WebGL screenshot. Full report: `artifacts/relic-pbr-pass/REPORT.md`.
