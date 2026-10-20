"""Create green and purple surface variants on the currently used chest geometry."""
import json
import math
import random
import struct
from pathlib import Path
from mathutils import Vector

SOURCE = ROOT / 'public/models/ender-chest.glb'
VARIANTS = {
    'green': {
        'base': (0.10, 0.16, 0.13), 'shade': (0.045, 0.075, 0.064),
        'accent': (0.08, 0.52, 0.31), 'bright': (0.24, 0.88, 0.57),
        'metal': (0.30, 0.29, 0.23), 'latch': (0.66, 0.48, 0.19),
    },
    'purple': {
        'base': (0.12, 0.095, 0.17), 'shade': (0.05, 0.04, 0.08),
        'accent': (0.39, 0.18, 0.66), 'bright': (0.72, 0.42, 0.96),
        'metal': (0.29, 0.27, 0.34), 'latch': (0.66, 0.48, 0.19),
    },
}


def shade(color, amount):
    return tuple(min(1, max(0, component * amount)) for component in color)


def paint_line(pixels, size, points, color, width=1):
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        steps = max(abs(x1 - x0), abs(y1 - y0), 1)
        for step in range(steps + 1):
            x = round(x0 + (x1 - x0) * step / steps)
            y = round(y0 + (y1 - y0) * step / steps)
            low = -(width // 2)
            for dy in range(low, low + width):
                for dx in range(low, low + width):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < size and 0 <= yy < size:
                        pixels[yy * size + xx] = color


def fill_rect(pixels, size, x0, y0, x1, y1, color):
    for y in range(max(0, y0), min(size, y1 + 1)):
        for x in range(max(0, x0), min(size, x1 + 1)):
            pixels[y * size + x] = color


def create_texture(bpy, variant, name, colors, folder, role):
    size = 64
    rng = random.Random((1 if variant == 'green' else 2) * 100 + len(role))
    pixels = []
    for y in range(size):
        for x in range(size):
            variation = .78 + rng.random() * .28
            if role == 'latch':
                pixels.append(shade(colors['metal'] if x < 5 or x > 58 or y < 5 or y > 58 else colors['latch'], variation))
                continue
            if x < 4 or x > 59 or y < 4 or y > 59:
                variation *= .48
            elif x in (4, 5, 58, 59) or y in (4, 5, 58, 59):
                variation *= 1.4
            elif x < 9 or x > 54 or y < 9 or y > 54:
                variation *= .7
            pixels.append(shade(colors['base'], variation))

    if role == 'vault':
        # Layered cut-metal frame, stepped energy channels and a faceted inset seal.
        fill_rect(pixels, size, 8, 8, 55, 55, shade(colors['metal'], .65))
        fill_rect(pixels, size, 10, 10, 53, 53, colors['base'])
        fill_rect(pixels, size, 12, 12, 51, 51, shade(colors['base'], .78))
        fill_rect(pixels, size, 13, 13, 50, 50, colors['base'])
        # Panel bevels and a lower inset shadow give the flat texture depth.
        paint_line(pixels, size, [(11, 11), (52, 11), (52, 52)], shade(colors['bright'], .48), 2)
        paint_line(pixels, size, [(11, 12), (11, 52), (51, 52)], shade(colors['metal'], .48), 2)
        paint_line(pixels, size, [(15, 17), (15, 46), (23, 46), (23, 50), (40, 50), (40, 44),
                                  (48, 44), (48, 25), (43, 25), (43, 17), (36, 17)],
                   shade(colors['metal'], .3), 8)
        route = [(15, 16), (15, 43), (22, 43), (22, 47), (37, 47), (37, 41),
                 (45, 41), (45, 24), (40, 24), (40, 16), (34, 16)]
        paint_line(pixels, size, route, shade(colors['accent'], .48), 6)
        paint_line(pixels, size, route, colors['accent'], 3)
        paint_line(pixels, size, [(x, y - 1) for x, y in route], shade(colors['bright'], .82), 1)
        # A recessed, beveled diamond seal with a bright pixel core.
        gem = [(32, 19), (43, 30), (43, 34), (32, 45), (21, 34), (21, 30), (32, 19)]
        paint_line(pixels, size, [(x, y + 2) for x, y in gem], shade(colors['metal'], .32), 9)
        paint_line(pixels, size, gem, shade(colors['metal'], .72), 7)
        paint_line(pixels, size, [(32, 21), (41, 30), (41, 34), (32, 43), (23, 34), (23, 30), (32, 21)], colors['accent'], 4)
        fill_rect(pixels, size, 29, 28, 35, 35, colors['bright'])
        fill_rect(pixels, size, 31, 30, 33, 33, shade(colors['bright'], 1.15))
        for x, y in ((8, 8), (55, 8), (8, 55), (55, 55)):
            fill_rect(pixels, size, x - 2, y - 2, x + 2, y + 2, shade(colors['latch'], .9))
            pixels[y * size + x] = colors['bright']
        # Tiny chipped highlights break up the machined surfaces.
        for x, y in ((18, 13), (47, 14), (18, 52), (49, 48), (27, 12), (39, 53), (12, 30), (53, 37)):
            pixels[y * size + x] = shade(colors['bright'], .7)
    else:
        # Fine hammered pixels and tiny edge highlights on the brass latch.
        for y in range(4, 29, 5):
            for x in range(4 + y % 3, 29, 7):
                pixels[y * size + x] = shade(colors['latch'], .78)
        for y in range(size):
            for x in range(size):
                if x in (0, 1, 30, 31) or y in (0, 1, 30, 31):
                    pixels[y * size + x] = shade(colors['metal'], .65)

    image = bpy.data.images.new('Vault.' + variant.title() + '.' + role.title(), width=size, height=size, alpha=True)
    image.pixels.foreach_set([channel for pixel in pixels for channel in (*pixel, 1)])
    image.filepath_raw = str(folder / 'textures' / (name + '-32.png'))
    image.file_format = 'PNG'
    image.save()
    image.pack()
    return image


def make_material(bpy, variant, role, colors, folder):
    material = bpy.data.materials.new('Vault.' + variant.title() + '.' + role.title())
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    shader = nodes.new('ShaderNodeBsdfPrincipled')
    shader.inputs['Roughness'].default_value = .74 if role == 'vault' else .58
    shader.inputs['Metallic'].default_value = .06 if role == 'vault' else .48
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = create_texture(bpy, variant, role, colors, folder, role)
    texture.interpolation = 'Closest'
    material.node_tree.links.new(texture.outputs['Color'], shader.inputs['Base Color'])
    material.node_tree.links.new(shader.outputs['BSDF'], output.inputs['Surface'])
    material.diffuse_color = (1, 1, 1, 1)
    return material


def remap_uv_per_face(mesh):
    uv = mesh.uv_layers.active or mesh.uv_layers.new(name='PaletteUV')
    bounds_min = [min(vertex.co[i] for vertex in mesh.vertices) for i in range(3)]
    bounds_max = [max(vertex.co[i] for vertex in mesh.vertices) for i in range(3)]
    for polygon in mesh.polygons:
        normal = polygon.normal
        axis = max(range(3), key=lambda idx: abs(normal[idx]))
        axes = [idx for idx in range(3) if idx != axis]
        coords = [mesh.vertices[mesh.loops[loop_index].vertex_index].co for loop_index in polygon.loop_indices]
        minimum = [bounds_min[coord] for coord in axes]
        maximum = [bounds_max[coord] for coord in axes]
        for loop_index, point in zip(polygon.loop_indices, coords):
            uv.data[loop_index].uv = tuple((point[coord] - minimum[i]) / max(.0001, maximum[i] - minimum[i]) for i, coord in enumerate(axes))


def normalize_glb(path):
    raw = path.read_bytes()
    json_size = struct.unpack_from('<I', raw, 12)[0]
    gltf = json.loads(raw[20:20 + json_size])
    binary_chunk = raw[20 + json_size:]
    for animation in gltf.get('animations', []):
        animation['name'] = 'Open'
    payload = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
    payload += b' ' * ((-len(payload)) % 4)
    path.write_bytes(struct.pack('<4sII', b'glTF', 2, 20 + len(payload) + len(binary_chunk))
                     + struct.pack('<I4s', len(payload), b'JSON') + payload + binary_chunk)


def main():
    import bpy

    if not SOURCE.exists():
        raise FileNotFoundError(f'Current chest model is missing: {SOURCE}')
    original_scene = bpy.context.window.scene if bpy.context.window else bpy.context.scene
    prior_objects = set(bpy.data.objects)
    prior_scenes = set(bpy.data.scenes)
    prior_datablocks = {
        collection: set(getattr(bpy.data, collection))
        for collection in ('meshes', 'materials', 'images', 'actions', 'cameras', 'lights', 'worlds')
    }
    work_scene = bpy.data.scenes.new('Vault palette workbench')
    bpy.context.window.scene = work_scene
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    imported = [obj for obj in work_scene.objects if obj not in prior_objects]
    root = next((obj for obj in imported if obj.name == 'chest'), None)
    if root is None:
        raise RuntimeError('Current GLB does not contain the expected chest root.')
    if any(obj.name.lower() == 'block' for obj in imported):
        raise RuntimeError('Unexpected prize block found in current model; refusing to export it.')
    chest_meshes = [obj for obj in imported if obj.type == 'MESH']
    originals = {obj.name: obj.data.copy() for obj in chest_meshes}
    actions = [action for action in bpy.data.actions if action not in []]
    action_end = max([action.frame_range[1] for action in actions] or [38])
    work_scene.frame_start = 0
    work_scene.frame_end = max(38, round(action_end))
    work_scene.render.engine = 'CYCLES'
    work_scene.cycles.device = 'CPU'
    work_scene.cycles.samples = 24
    work_scene.render.resolution_x = 800
    work_scene.render.resolution_y = 800
    work_scene.render.resolution_percentage = 100
    work_scene.render.film_transparent = True
    work_scene.render.image_settings.file_format = 'PNG'
    work_scene.render.image_settings.color_mode = 'RGBA'

    camera_data = bpy.data.cameras.new('Palette Preview Camera')
    camera = bpy.data.objects.new('Palette Preview Camera', camera_data)
    work_scene.collection.objects.link(camera)
    target = Vector((0, 0, .47))
    camera.location = Vector((-2.8, -4, 2.2))
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = 2.65
    work_scene.camera = camera
    for name, position, energy, color in [
        ('Key', (-3, -4, 5), 450, (.9, 1, 1)),
        ('Rim', (2, 3, 4), 320, (.72, .67, 1)),
        ('Fill', (4, -2, 2), 140, (.85, .95, 1)),
    ]:
        data = bpy.data.lights.new('Palette ' + name, 'AREA')
        data.energy = energy
        data.color = color
        data.size = 4
        light = bpy.data.objects.new('Palette ' + name, data)
        work_scene.collection.objects.link(light)
        light.location = position
        light.rotation_euler = (target - light.location).to_track_quat('-Z', 'Y').to_euler()
    work_scene.world = bpy.data.worlds.new('Palette Preview World')
    work_scene.world.use_nodes = True
    work_scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.035, .045, .06, 1)
    work_scene.world.node_tree.nodes['Background'].inputs[1].default_value = .25

    for variant, colors in VARIANTS.items():
        folder = ROOT / ('assets/chests/ender-v5-' + variant)
        (folder / 'textures').mkdir(parents=True, exist_ok=True)
        for obj in chest_meshes:
            obj.data = originals[obj.name].copy()
            role = 'latch' if obj.name == 'e516d948-1af8-52ff-c195-b07266936ce7' else 'vault'
            material = make_material(bpy, variant, role, colors, folder)
            obj.data.materials.clear()
            obj.data.materials.append(material)
            remap_uv_per_face(obj.data)

        work_scene.frame_set(0)
        bpy.ops.object.select_all(action='DESELECT')
        export_objects = [root, *root.children_recursive]
        for obj in export_objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = root
        glb = folder / 'ender-vault.glb'
        bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', use_selection=True,
                                  use_active_scene=True, export_animations=True,
                                  export_animation_mode='ACTIVE_ACTIONS', export_frame_range=True)
        normalize_glb(glb)

        work_scene.render.filepath = str(folder / 'closed.png')
        work_scene.frame_set(0)
        bpy.ops.render.render(write_still=True)
        work_scene.render.filepath = str(folder / 'open.png')
        work_scene.frame_set(work_scene.frame_end)
        bpy.ops.render.render(write_still=True)
        bpy.data.libraries.write(str(folder / 'ender-vault.blend'), {work_scene},
                                 path_remap='RELATIVE', fake_user=True, compress=True)

    if bpy.context.window:
        bpy.context.window.scene = original_scene
    if work_scene not in prior_scenes:
        temporary_objects = list(work_scene.objects)
        bpy.data.scenes.remove(work_scene)
        for obj in temporary_objects:
            if obj not in prior_objects and obj.name in bpy.data.objects:
                bpy.data.objects.remove(obj, do_unlink=True)
    for name, collection in (
        ('meshes', bpy.data.meshes), ('materials', bpy.data.materials), ('images', bpy.data.images),
        ('actions', bpy.data.actions), ('cameras', bpy.data.cameras), ('lights', bpy.data.lights),
        ('worlds', bpy.data.worlds),
    ):
        for datablock in list(collection):
            if datablock not in prior_datablocks[name]:
                collection.remove(datablock, do_unlink=True)
    return {
        'variants': [str(ROOT / ('assets/chests/ender-v5-' + variant)) for variant in VARIANTS],
        'geometry': 'public/models/ender-chest.glb; mesh positions and Open animation preserved',
        'currentSceneRestored': original_scene.name if original_scene else None,
    }


RESULT = main()
