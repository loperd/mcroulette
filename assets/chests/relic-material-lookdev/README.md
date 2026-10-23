# Relic material studies — review only

Nine isolated patches: 3 materials × restrained/balanced/weathered. These GLBs are **not production chests** and carry no useful chest opening animation. The full chest geometry, GLB and textures are frozen pending visual material approval.

`manifest.json` names the exact original parts, recorded translation and camera for every patch. Position/normal/topology/UV equality across each set of three is tested. All patches come from the existing V3 authoring file; no new coupon geometry replaces it. They are raised 0.8 block for a reflection panel to illuminate vertical faces; the shape and physical scale are preserved.

Canonical Base Color / ORM / Normal / Emissive PNGs and `materials.json` accompany every GLB. ORM is linear R=AO, G=roughness, B=metallic; normal is linear +Y tangent space; color and emissive are sRGB. Focus material has scalar metallic/roughness factors 1. Other crystal holder surfaces are neutral gray. BB files are geometry/UV references, not native PBR preview parity.

```sh
python3.13 scripts/chests/relic-lookdev.py build
python3.13 scripts/chests/relic-lookdev.py build --family metal
python3.13 scripts/chests/relic-lookdev.py render --resume
python3.13 scripts/chests/relic-lookdev.py channels
python3.13 scripts/chests/relic-lookdev.py ablations
```

Full renders: 560×560, 256 spp, identical cameras/lights within each family. Two fixed white light rigs interrogate reflection and grazing response. Resume verifies asset/image/shader hashes and settings, so unchanged studies need not be rendered again. No whole-chest material adoption occurs in these commands.

Real Three.js viewer: `npm run dev -- --host 127.0.0.1`, open `/material-lookdev.html`. It imports actual GLBs through GLTFLoader and uses MeshStandardMaterial; the checkboxes disable real material channels. It also offers baseline application lighting.

GPU capture and framebuffer comparisons, on an environment capable of launching Chromium:

```sh
node scripts/chests/capture-material-lookdev.mjs
```

Chrome exits SIGABRT in the present sandbox; actual WebGL validation remains open. CPU channel ablations test the offline shader only. Report and matrices: `artifacts/relic-material-lookdev/REPORT.md`.
