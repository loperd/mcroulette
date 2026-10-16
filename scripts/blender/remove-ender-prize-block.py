"""Remove the reference's animated prize hierarchy, preserving the hinged lid."""
scene = bpy.data.scenes['Ender Reference']
root = scene.objects.get('block')
removed = []
if root:
    if not root.parent or root.parent.name != 'chest':
        raise RuntimeError('Unexpected block hierarchy; refusing to remove.')
    targets = list(root.children_recursive) + [root]
    for obj in targets:
        removed.append(obj.name)
        mesh = obj.data if obj.type == 'MESH' else None
        animation = obj.animation_data
        action = animation.action if animation else None
        bpy.data.objects.remove(obj, do_unlink=True)
        if mesh and mesh.users == 0:
            bpy.data.meshes.remove(mesh)
        if action and action.users == 0:
            bpy.data.actions.remove(action)
scene.frame_set(0)
assert scene.objects.get('Lid') is not None
assert scene.objects.get('block') is None
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'assets/chests/ender-reference.blend'))
RESULT = {'removed': removed, 'remaining_meshes': [o.name for o in scene.objects if o.type == 'MESH'], 'lid_animation': bool(scene.objects['Lid'].animation_data), 'saved': 'assets/chests/ender-reference.blend'}
