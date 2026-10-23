# Asset authoring

Model sources and variant-specific contracts live under `assets/chests/`. Read the relevant README before editing a candidate; experimental geometry/material variants are not interchangeable production assets. Keep Body/LidAssembly names, pivots, rest transforms, UVs and required animation clips compatible with the model manifest.

Generated review sheets and validation results belong under `artifacts/` and use English report text. Export/CPU validation establishes its stated checks, not editor compatibility or WebGL appearance unless those were actually exercised.

## Blender bridge

The local file-based bridge runs Blender work on the main thread through `bpy.app.timers`. The Node client exchanges jobs/results in the ignored `.blender/` directory. Connecting does not clear or import into the current scene.

In an open Blender Python Console (Shift+F4), replace the absolute project path as needed:

```python
import runpy
mcroulette_bridge = runpy.run_path('/absolute/path/to/mcroulette/scripts/blender/bridge.py', run_name='__main__')
```

Return to the 3D view with Shift+F5, then use:

```sh
npm run blender -- status
npm run blender -- import public/models/treasure-game.glb
npm run blender -- exec scripts/blender/my-model-script.py
npm run blender -- save assets/chests/workbench.blend
npm run blender -- export public/models/new-chest.glb
npm run blender -- render artifacts/model-review/preview.png
```

`exec` runs a project Python file with `bpy` and `ROOT` in scope; set `RESULT` to return JSON data. Import adds objects; export includes scene animations; render uses the existing camera/settings. Save working variants separately before overwriting a source or production model.

The default wait is 15 seconds. Set `BLENDER_TIMEOUT_MS=120000` for longer work. An expired job that has not started is discarded; a timed-out running job may still complete, so inspect its result before repeating it.

Disconnect in Blender:

```python
import sys
sys.modules['mcroulette_blender_bridge'].stop()
```

Restarting the bridge replaces its previous timer. Reconnect after Blender restarts. One project controls one Blender process, enforced by `owner.json`. Protocol tests do not prove that the installed Blender can import/export the model. If background Blender fails during platform GPU initialization, use an already open window and confirm connection through `status`.

## Runtime checks

Validate the GLB through the actual Three.js loader, inspect opening and closing animation, verify required node/clip names, and run the relevant model tests. CPU renders and metadata checks cannot establish shader appearance, texture filtering or physical-device frame time. See [chest presentation](../reference/chest-presentation.md) and [performance](performance.md).
