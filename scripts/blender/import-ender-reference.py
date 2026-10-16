"""Import the supplied Ender reference into its own scene without clearing user work."""
import json
from mathutils import Vector

name = 'Ender Reference'
if name in bpy.data.scenes:
    raise RuntimeError('Reference scene already exists; inspect it instead of importing twice.')
scene = bpy.data.scenes.new(name)
bpy.context.window.scene = scene
bpy.ops.import_scene.gltf(filepath=str(ROOT / 'assets/chests/reference/ender/chest_geo.gltf'))
objects = []
for obj in scene.objects:
    entry = {'name': obj.name, 'type': obj.type, 'parent': obj.parent.name if obj.parent else None}
    if obj.type == 'MESH':
        obj.data.calc_loop_triangles()
        entry.update(vertices=len(obj.data.vertices), triangles=len(obj.data.loop_triangles))
        points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        entry['bounds'] = {'min': [min(p[i] for p in points) for i in range(3)], 'max': [max(p[i] for p in points) for i in range(3)]}
    objects.append(entry)
for image in bpy.data.images:
    if image.has_data and image.source == 'FILE':
        image.pack()
for obj in scene.objects:
    if obj.type == 'MESH':
        obj.select_set(True)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_distance = 3
            area.spaces.active.region_3d.view_location = (0, 0, 0)
            area.spaces.active.shading.type = 'MATERIAL'
report = {'scene': scene.name, 'objects': objects, 'actions': [{'name': a.name, 'frames': list(a.frame_range)} for a in bpy.data.actions]}
destination = ROOT / 'assets/chests/ender-reference.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(destination))
(ROOT / 'assets/chests/reference/ender/inspection.json').write_text(json.dumps(report, indent=2))
RESULT = report
