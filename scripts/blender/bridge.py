"""Run once in Blender's Python Console using runpy.run_path(..., run_name='__main__')."""
import json
import os
from pathlib import Path
import sys
import time
import traceback
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / ".blender"
KEY = "mcroulette_blender_bridge"


def project_path(value):
    path = (ROOT / value).resolve()
    if not path.is_relative_to(ROOT):
        raise ValueError("Use a file inside the mcroulette project.")
    return path


def write_json(path, value):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def dispatch(bpy, request):
    action = request["action"]
    if action == "status":
        return {
            "version": bpy.app.version_string,
            "file": bpy.data.filepath,
            "scene": bpy.context.scene.name,
            "objects": [{"name": obj.name, "type": obj.type,
                         "location": list(obj.location),
                         "vertices": len(obj.data.vertices) if obj.type == "MESH" else None}
                        for obj in bpy.context.scene.objects],
            "actions": [item.name for item in bpy.data.actions],
            "materials": [item.name for item in bpy.data.materials],
        }
    if action == "exec":
        source = project_path(request["path"])
        if source.suffix != ".py":
            raise ValueError("exec expects a project .py script.")
        scope = {"bpy": bpy, "ROOT": ROOT, "__file__": str(source), "__name__": "__main__"}
        exec(compile(source.read_text(encoding="utf-8"), str(source), "exec"), scope)
        return scope.get("RESULT", {"executed": str(source)})
    if action == "import":
        source = project_path(request["path"])
        if source.suffix.lower() not in (".glb", ".gltf"):
            raise ValueError("import expects a .glb or .gltf file.")
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(source))
        return {"imported": [obj.name for obj in bpy.data.objects if obj not in before]}
    if action in ("save", "export", "render"):
        destination = project_path(request["path"])
        suffix = {"save": ".blend", "export": ".glb", "render": ".png"}[action]
        if destination.suffix.lower() != suffix:
            raise ValueError(f"{action} expects {suffix}.")
        destination.parent.mkdir(parents=True, exist_ok=True)
        if action == "save":
            bpy.ops.wm.save_as_mainfile(filepath=str(destination))
        elif action == "export":
            bpy.ops.export_scene.gltf(filepath=str(destination), export_format="GLB", export_animations=True)
        else:
            scene = bpy.context.scene
            if scene.camera is None:
                raise ValueError("Set a scene camera before rendering.")
            scene.render.filepath = str(destination)
            scene.render.image_settings.file_format = "PNG"
            bpy.ops.render.render(write_still=True)
        return {"file": str(destination)}
    raise ValueError(f"Unknown action: {action}")


def start():
    import bpy

    previous = sys.modules.get(KEY)
    if previous:
        previous.stop()
    for directory in (STATE / "requests", STATE / "results"):
        directory.mkdir(parents=True, exist_ok=True)
    owner_file = STATE / "owner.json"
    if owner_file.exists():
        owner = json.loads(owner_file.read_text(encoding="utf-8"))
        try:
            os.kill(owner["pid"], 0)
        except ProcessLookupError:
            owner_file.unlink()
        else:
            raise RuntimeError(f"Project bridge is already owned by Blender process {owner['pid']}.")
    with owner_file.open("x", encoding="utf-8") as owner:
        json.dump({"pid": os.getpid()}, owner)
    active = True

    def stop():
        nonlocal active
        active = False
        if bpy.app.timers.is_registered(tick):
            bpy.app.timers.unregister(tick)
        heartbeat = STATE / "connection.json"
        if heartbeat.exists():
            connection = json.loads(heartbeat.read_text(encoding="utf-8"))
            if connection.get("pid") == os.getpid():
                heartbeat.unlink(missing_ok=True)
        if owner_file.exists():
            owner = json.loads(owner_file.read_text(encoding="utf-8"))
            if owner.get("pid") == os.getpid():
                owner_file.unlink(missing_ok=True)

    def tick():
        if not active:
            return None
        try:
            write_json(STATE / "connection.json", {
                "pid": os.getpid(), "version": bpy.app.version_string,
                "project": str(ROOT), "file": bpy.data.filepath, "updatedAt": time.time(),
            })
            for pending in sorted((STATE / "requests").glob("*.json"))[:1]:
                claimed = pending.with_suffix(".working")
                try:
                    pending.rename(claimed)
                except FileNotFoundError:
                    continue
                try:
                    request = json.loads(claimed.read_text(encoding="utf-8"))
                    if request["expiresAt"] < time.time():
                        raise TimeoutError("Request expired before execution; it was not run.")
                    result = {"ok": True, "result": dispatch(bpy, request)}
                except Exception as error:
                    result = {"ok": False, "error": str(error), "traceback": traceback.format_exc()}
                write_json(STATE / "results" / pending.name, result)
                claimed.unlink(missing_ok=True)
        except Exception:
            traceback.print_exc()
        return 0.25

    sys.modules[KEY] = SimpleNamespace(stop=stop)
    bpy.app.timers.register(tick, first_interval=0.1, persistent=True)
    print(f"MC Roulette bridge connected: {ROOT}")


if __name__ == "__main__":
    start()
