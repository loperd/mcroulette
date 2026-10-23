# Relic geometry review candidate

This candidate precedes the material pass. `assets/chests/relic-v2/` remains intact. The seven existing PNGs and glTF PBR factors are retained; this candidate does not add roughness, normal, AO or wear maps.

`relic.glb` is the geometry-review export; `relic.bbmodel` is the editable Free Model. `contract.json` records block envelope, pivot and clip; `materials.json` retains v2 values.

Closed envelope: X/Z ±0.5, Y 0..1. One GLB unit equals one block and 16 authoring units. Front is −Z. Body stays fixed; LidAssembly rotates 105° around `[0,10.55,7.65]/16`. Bounds and the sweep of 38 moving parts are recorded in `artifacts/relic-geometry-pass/relic/geometry-validation.json`.

## Generation and editing

```sh
python3.13 scripts/chests/build-relic.py --geometry-pass
python3.13 scripts/chests/build-relic.py --from-bbmodel assets/chests/relic-v3-geometry/relic.bbmodel --output-dir assets/chests/relic-v3-geometry
python3.13 scripts/chests/validate-relic.py --asset assets/chests/relic-v3-geometry/relic.glb --out artifacts/relic-geometry-pass/relic
python3.13 scripts/chests/check-relic-construction.py
python3.13 scripts/chests/test-authoring.py --asset assets/chests/relic-v3-geometry/relic.glb --out artifacts/relic-geometry-pass/relic
RELIC_ASSET_DIR=assets/chests/relic-v3-geometry node --test tests/adapters/relic-v2.test.mjs
python3.13 scripts/chests/review-relic.py --asset assets/chests/relic-v3-geometry/relic.glb --out artifacts/relic-geometry-pass/relic --geometry-only
python3.13 scripts/chests/compare-relic-geometry.py
```

Preserve Body/LidAssembly, origins and rest transforms. Put details directly inside those assemblies and convert new cubes to meshes. The controlled exporter transfers mesh transforms, UVs and embedded bitmaps; native editor PBR export is not verified. `--geometry-pass` overwrites manual changes to this candidate, so save variants separately.

## Construction

Panels sit inside wall openings. The lower band, rim and external braces are continuous frame meshes. Lid corner caps rest on the slab. The front crystal has an open capsule, backing and four retaining claws; its upper socket has a matching octagonal opening. Fixed hinge cheeks hold the pin while the moving sleeve leaves radial clearance.

This is an assembly of separate parts, not one welded mesh. Contacts, press fits, shoulders and crystal grips intentionally touch or overlap slightly. Moving geometry is checked separately against Body. Connectivity validates one connected assembly for Body and one for LidAssembly; it is not a structural strength calculation.

## Review scope

Inspect `before-after.png`, `review-sheet.png` and close-ups under `artifacts/relic-geometry-pass/relic/`. The full report is `artifacts/relic-geometry-pass/REPORT.md`. Geometry approval precedes material wear/roughness/normal work. Current evidence is CPU clay rendering, not premium material quality or GPU validation.
