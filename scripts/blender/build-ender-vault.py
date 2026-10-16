"""Original voxel-inspired vault; separate hollow shell, hinged lid and appearance slots."""
import math
import json
from mathutils import Vector

NAME = 'Voxel Vault Ender V2'
if NAME in bpy.data.scenes:
    raise RuntimeError('V2 scene already exists. Inspect it before rebuilding.')
scene = bpy.data.scenes.new(NAME)
bpy.context.window.scene = scene
scene.render.fps = 30
scene.frame_start = 0
scene.frame_end = 38


def material(name, color, metallic=0, roughness=0.65, emission=0):
    mat = bpy.data.materials.new('Vault.' + name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = (*color, 1)
    node.inputs['Metallic'].default_value = metallic
    node.inputs['Roughness'].default_value = roughness
    if emission:
        node.inputs['Emission Color'].default_value = (*color, 1)
        node.inputs['Emission Strength'].default_value = emission
    return mat

shell = material('Shell', (0.025,0.037,0.049), .45, .5)
panel = material('Panel', (0.035,0.13,0.14), .25, .65)
metal = material('Metal', (0.46,0.28,0.105), .75, .4)
edge = material('Edge', (0.09,0.12,0.14), .65, .45)
inside = material('Interior', (0.018,0.033,0.042), .1, .9)
accent = material('Accent', (0.035,0.7,0.46), .2, .35, .65)
crystal = material('Crystal', (0.07,0.9,0.67), .35, .25, 1.1)


def empty(name, parent=None, location=(0,0,0)):
    obj = bpy.data.objects.new(name, None)
    scene.collection.objects.link(obj)
    obj.location = location
    if parent: obj.parent = parent
    return obj

root = empty('VaultRoot')
body = empty('Body', root)
lid = empty('LidAssembly', root, (0, .58, 1.02))
body['vault_part'] = 'body'; lid['vault_part'] = 'lid'


def parent_keep(obj, parent):
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world


def box(name, location, dimensions, mat, parent=body, bevel=.018):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object; obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Crafted edges', 'BEVEL'); mod.width = bevel; mod.segments = 1
        bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
        bpy.ops.object.modifier_apply(modifier=obj.modifiers[-1].name)
    parent_keep(obj, parent)
    return obj

# A genuinely hollow body: no solid cube blocking the opening.
box('Body.Base', (0,0,.13), (1.8,1.3,.18), shell, bevel=.045)
box('Body.InnerFloor', (0,0,.235), (1.58,1.08,.035), inside, bevel=.01)
for side in [-1, 1]:
    box('Body.SideWall', (side*.85,0,.63), (.1,1.25,.87), shell)
    box('Body.EndWall', (0,side*.60,.63), (1.6,.1,.87), shell)
    box('Body.SideRim', (side*.85,0,1.035), (.12,1.3,.075), metal)
    box('Body.EndRim', (0,side*.60,1.035), (1.6,.12,.075), metal)
    for x in [-.43,.43]:
        box('Body.InsetPanel', (x,side*.661,.61), (.69,.032,.55), panel, bevel=.038)
        box('Body.PanelFooter', (x,side*.687,.365), (.5,.025,.035), edge, bevel=.006)
    for y in [-.29,.29]:
        box('Body.SidePanel', (side*.91,y,.61), (.028,.46,.55), panel, bevel=.035)
    for y in [-.56,.56]:
        box('Body.CornerPillar', (side*.85,y,.59), (.17,.18,.94), edge, bevel=.03)
        box('Body.CornerShoe', (side*.85,y,.17), (.23,.24,.28), metal, bevel=.035)
        box('Body.CornerCap', (side*.85,y,.98), (.22,.23,.19), metal, bevel=.03)
        box('Body.CornerLight', (side*.946,y,.91), (.012,.075,.09), accent, bevel=.003)
# Fine luminous channel along the front and side rims.
box('Body.FrontChannel', (0,-.668,.97), (1.4,.016,.018), accent, bevel=.003)
for x in [-.85,.85]:
    box('Body.SideChannel', (x,0,1.078), (.025,.88,.012), accent, bevel=.002)
# Front centre reads as a vault latch, with a faceted crystal instead of Minecraft's yellow bar.
box('Body.LatchMount', (0,-.70,.69), (.32,.095,.4), edge, bevel=.045)
box('Body.LatchBezel', (0,-.76,.69), (.24,.055,.31), metal, bevel=.032)

def gem(name, center, width, height, depth, mat, parent):
    x,y,z = center
    vertices = [(x,y-depth,z), (x-width/2,y,z), (x,y,z+height/2), (x+width/2,y,z), (x,y,z-height/2), (x,y+depth*.2,z)]
    faces = [(0,1,2),(0,2,3),(0,3,4),(0,4,1),(5,2,1),(5,3,2),(5,4,3),(5,1,4)]
    mesh = bpy.data.meshes.new(name); mesh.from_pydata(vertices, [], faces); mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh); scene.collection.objects.link(obj); parent_keep(obj,parent)
    return obj

gem('Body.HeartCrystal', (0,-.80,.69), .15,.23,.07, crystal,body)
for x in [-.57,.57]:
    for z in [.48,.67,.84]:
        rune=box('Body.InlayRune', (x,-.686,z), (.055,.014,.055), accent, bevel=.002)
        rune.rotation_euler.y = math.pi/4
# Lid is also hollow, with an inside ceiling and skirt attached to one hinge pivot.
box('Lid.TopShell', (0,0,1.36), (1.85,1.35,.16), shell,lid,.055)
box('Lid.InnerCeiling', (0,0,1.265), (1.58,1.08,.03), inside,lid,.01)
for side in [-1,1]:
    box('Lid.SideSkirt', (side*.865,0,1.18), (.12,1.32,.24), shell,lid,.02)
    box('Lid.EndSkirt', (0,side*.61,1.18), (1.65,.12,.24), shell,lid,.02)
    box('Lid.LongTrim', (side*.73,0,1.463), (.13,1.1,.04), metal,lid,.016)
    for y in [-.55,.55]:
        box('Lid.ArmoredCorner', (side*.84,y,1.29), (.22,.25,.3), metal,lid,.035)
box('Lid.CrownPanel', (0,0,1.457), (1.18,.94,.045), panel,lid,.07)
# A deliberately geometric crest and small pixel inlays.
crest=box('Lid.CrestFrame', (0,0,1.496), (.43,.43,.035), metal,lid,.02)
crest.rotation_euler.z = math.pi/4
crest=box('Lid.Crest', (0,0,1.52), (.28,.28,.035), crystal,lid,.02)
crest.rotation_euler.z = math.pi/4
for side in [-1,1]:
    for y in [-.35,-.23,.23,.35]:
        box('Lid.TopRune', (side*.43,y,1.493), (.07,.07,.018), accent,lid,.004)
box('Lid.LatchTongue', (0,-.69,1.10), (.16,.08,.20), metal,lid,.025)
for x in [-.55,.55]:
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=.075, depth=.30, location=(x,.665,1.04), rotation=(0,math.pi/2,0))
    obj=bpy.context.object;obj.name='Body.Hinge';obj.data.materials.append(metal);parent_keep(obj,body)

# Stable clip name and hinge origin; normalised closed shape is the collider source.
lid.rotation_mode='XYZ'
for frame, angle in [(0,0),(7,.025),(13,-.12),(29,-1.72),(38,-1.83)]:
    lid.rotation_euler.x=angle;lid.keyframe_insert(data_path='rotation_euler',frame=frame)
open_action=lid.animation_data.action;open_action.name='Open'
scene.frame_set(0)
scene['vault_model_revision']='ender-v2.1'
scene['vault_material_slots']='Shell,Panel,Metal,Accent,Crystal'

# Export only this model. Scene camera/lights are added after the game export.
bpy.ops.object.select_all(action='DESELECT')
for obj in scene.objects: obj.select_set(True)
output=ROOT/'public/models/ender-vault-v2.glb'
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_animations=True,export_frame_range=True)
# A neutral studio for reviewing the same model, not baked into the game asset.
camera_data=bpy.data.cameras.new('Vault Review Camera');camera=bpy.data.objects.new(camera_data.name,camera_data);scene.collection.objects.link(camera)
camera.location=(-3.1,-4.4,2.7);camera.rotation_euler=(Vector((0,0,.77))-camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.type='ORTHO';camera_data.ortho_scale=2.85;scene.camera=camera
for name,location,energy,color,size in [('Key',(-3,-4,5),500,(.8,1,.95),4),('Rim',(2,3,4),700,(.2,1,.75),3),('Fill',(4,-2,3),220,(.85,.9,1),3)]:
    data=bpy.data.lights.new('Vault Review '+name,'AREA');data.energy=energy;data.color=color;data.shape='DISK';data.size=size
    obj=bpy.data.objects.new(data.name,data);scene.collection.objects.link(obj);obj.location=location;obj.rotation_euler=(Vector((0,0,.7))-obj.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24
scene.render.resolution_x=960;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Vault Review World');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.035,.05,.065,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.35
scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
folder=ROOT/'assets/chests/ender-v2';folder.mkdir(parents=True,exist_ok=True)
scene.render.filepath=str(folder/'closed.png')
bpy.ops.wm.save_as_mainfile(filepath=str(folder/'ender-vault.blend'))
bpy.ops.render.render(write_still=True)
scene.frame_set(38);scene.render.filepath=str(folder/'open.png');bpy.ops.render.render(write_still=True)
scene.frame_set(0)
report={'scene':scene.name,'model':str(output),'bytes':output.stat().st_size,'meshes':len([o for o in scene.objects if o.type=='MESH']),'triangles':sum(len(o.data.polygons) for o in scene.objects if o.type=='MESH'),'parts':['Body','LidAssembly'],'materials':[m.name for m in [shell,panel,metal,edge,inside,accent,crystal]],'revision':'ender-v2.1'}
(folder/'inspection.json').write_text(json.dumps(report,indent=2))
RESULT=report
