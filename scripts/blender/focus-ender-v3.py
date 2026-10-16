from mathutils import Vector
scene=bpy.data.scenes['Voxel Vault Ender V2']
scene.name='Voxel Vault - Ender'
bpy.context.window.scene=scene
scene.frame_set(0)
bpy.ops.object.select_all(action='DESELECT')
for window in bpy.context.window_manager.windows:
    window.scene=scene
    for area in window.screen.areas:
        if area.type=='VIEW_3D':
            space=area.spaces.active;space.shading.type='MATERIAL';space.shading.use_scene_world=False;space.shading.use_scene_lights=False
            space.region_3d.view_location=(0,0,.75);space.region_3d.view_distance=3.8
            space.region_3d.view_rotation=Vector((-3,-4,2)).to_track_quat('Z','Y')
            area.tag_redraw()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/chests/ender-v3/ender-vault.blend'))
RESULT={'scene':scene.name,'frame':scene.frame_current,'file':bpy.data.filepath}
