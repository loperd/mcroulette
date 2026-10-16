RESULT = {'scene': bpy.context.scene.name, 'windows': [], 'images': [{'name': i.name, 'size': list(i.size), 'has_data': i.has_data, 'packed': bool(i.packed_file)} for i in bpy.data.images], 'materials': []}
for mat in bpy.data.materials:
    RESULT['materials'].append({'name': mat.name, 'nodes': [{'name': n.name, 'type': n.type, 'image': n.image.name if n.type == 'TEX_IMAGE' and n.image else None} for n in mat.node_tree.nodes] if mat.node_tree else []})
for window in bpy.context.window_manager.windows:
    entry = {'scene': window.scene.name, 'areas': []}
    for area in window.screen.areas:
        item = {'type': area.type}
        if area.type == 'VIEW_3D':
            space = area.spaces.active
            item.update(shading=space.shading.type, local_view=bool(space.local_view), distance=space.region_3d.view_distance, location=list(space.region_3d.view_location), rotation=list(space.region_3d.view_rotation))
        entry['areas'].append(item)
    RESULT['windows'].append(entry)
RESULT['objects'] = [{'name': o.name, 'hidden': o.hide_get(), 'hide_viewport': o.hide_viewport, 'scale': list(o.scale)} for o in bpy.context.scene.objects]
