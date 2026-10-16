scene = bpy.data.scenes['Ender Reference']
bpy.context.window.scene = scene
scene.frame_set(0)
body = scene.objects.get('6e2da91e-9722-6cba-1061-d46d14d9b13d') or scene.objects.get('Chest_bottom')
roof = scene.objects.get('a8485cb4-c06f-afd9-9293-9865a0d32ee5') or scene.objects.get('Chest_top')
assert body and roof and not scene.objects.get('block')
body.name = 'Chest_bottom'
roof.name = 'Chest_top'
bpy.ops.object.select_all(action='DESELECT')
for obj in scene.objects:
    obj.select_set(True)
scene.frame_start = 0
scene.frame_end = 25
destination = ROOT / 'assets/chests/reference/ender/ender-chest.glb'
bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB', use_selection=True, export_animations=True, export_frame_range=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'assets/chests/ender-reference.blend'))
RESULT = {'file': str(destination), 'bytes': destination.stat().st_size, 'actions': [a.name for a in bpy.data.actions]}
