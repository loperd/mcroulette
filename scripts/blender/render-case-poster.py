from mathutils import Vector
source = bpy.data.scenes['Ender Reference']
source.frame_set(0)
scene = bpy.data.scenes.new('Voxel Vault Poster')
clones = {}
previous = bpy.context.window.scene
try:
    for obj in source.objects:
        if obj.type not in {'MESH', 'EMPTY'}: continue
        clone = obj.copy()
        clone.animation_data_clear()
        scene.collection.objects.link(clone)
        clones[obj] = clone
    for original, clone in clones.items():
        clone.parent = clones.get(original.parent)
    camera_data = bpy.data.cameras.new('Vault Poster Camera')
    camera = bpy.data.objects.new('Vault Poster Camera', camera_data)
    scene.collection.objects.link(camera)
    camera.location = (-2.5, -3.8, 2.1)
    camera.rotation_euler = (Vector((0, 0, 0.46)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera_data.type = 'ORTHO'; camera_data.ortho_scale = 1.65
    scene.camera = camera
    for name, location, energy, color, size in [
        ('Key', (-3,-4,5), 450, (0.8,1,0.93), 4),
        ('Rim', (2,2,3), 650, (0.25,1,0.8), 3),
        ('Fill', (3,-2,2), 130, (0.7,0.85,1), 3)]:
        data = bpy.data.lights.new('Vault Poster '+name, 'AREA'); data.energy = energy; data.color = color; data.shape = 'DISK'; data.size = size
        light = bpy.data.objects.new(data.name, data); scene.collection.objects.link(light); light.location = location
        light.rotation_euler = (Vector((0,0,0.4))-light.location).to_track_quat('-Z','Y').to_euler()
    scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = 16
    scene.render.resolution_x = 640; scene.render.resolution_y = 640; scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'
    destination = ROOT / 'public/images/cases/ender.png'; destination.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(destination)
    bpy.context.window.scene = scene
    bpy.ops.render.render(write_still=True)
    RESULT = {'file': str(destination), 'bytes': destination.stat().st_size}
finally:
    bpy.context.window.scene = previous
    objects = list(scene.objects)
    bpy.data.scenes.remove(scene)
    for obj in objects:
        if obj.users == 0:
            data = obj.data
            bpy.data.objects.remove(obj)
            if data and data.users == 0 and isinstance(data, bpy.types.Camera): bpy.data.cameras.remove(data)
            elif data and data.users == 0 and isinstance(data, bpy.types.Light): bpy.data.lights.remove(data)
