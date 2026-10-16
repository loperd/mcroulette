from mathutils import Vector
scene = bpy.data.scenes['Ender Reference']
scene.frame_set(0)
changed = 0
for window in bpy.context.window_manager.windows:
    window.scene = scene
    for area in window.screen.areas:
        if area.type != 'VIEW_3D':
            continue
        space = area.spaces.active
        space.shading.type = 'MATERIAL'
        space.shading.use_scene_world = False
        space.shading.use_scene_lights = False
        space.clip_start = 0.01
        space.clip_end = 100
        region = space.region_3d
        region.view_perspective = 'PERSP'
        region.view_location = (0, 0, 0.47)
        region.view_distance = 2.6
        region.view_rotation = Vector((1.4, -2, 1.1)).to_track_quat('Z', 'Y')
        area.tag_redraw()
        changed += 1
for obj in scene.objects:
    if obj.type == 'MESH':
        for material in obj.data.materials:
            if material and material.node_tree:
                for node in material.node_tree.nodes:
                    if node.type == 'TEX_IMAGE':
                        node.interpolation = 'Closest'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'assets/chests/ender-reference.blend'))
RESULT = {'updated_viewports': changed, 'shading': 'MATERIAL', 'texture': '64x64 packed, nearest sampling', 'distance': 2.6}
