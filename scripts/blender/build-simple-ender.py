"""Simple familiar silhouette; original pixel surfaces, no Minecraft texture reuse."""
import bpy
import math
import random
import json
import struct
from mathutils import Vector

NAME='Voxel Vault - Simple Ender'
if NAME in bpy.data.scenes:raise RuntimeError('Simple scene exists; inspect it instead of rebuilding.')
scene=bpy.data.scenes.new(NAME);bpy.context.window.scene=scene
scene.render.fps=30;scene.frame_start=0;scene.frame_end=38
folder=ROOT/'assets/chests/ender-v4';folder.mkdir(parents=True,exist_ok=True)

def empty(name,parent=None,location=(0,0,0)):
    obj=bpy.data.objects.new(name,None);scene.collection.objects.link(obj);obj.location=location
    if parent:obj.parent=parent
    return obj
root=empty('VaultRoot');body=empty('Body',root);lid=empty('LidAssembly',root,(0,.43,.64))

def mat(name,color):
    material=bpy.data.materials.new('Simple.'+name);material.diffuse_color=(*color,1);material.use_nodes=True
    bsdf=material.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(*color,1);bsdf.inputs['Roughness'].default_value=.86
    return material
shell=mat('Shell',(.035,.032,.052));panel=mat('Panel',(.045,.080,.077));interior=mat('Interior',(.018,.021,.029));latch=mat('Latch',(.48,.34,.12));slot=mat('Keyhole',(.012,.020,.022))

# Original 32px motifs. Values are neutral so instance palette can tint each zone.
# The border belongs to the painted surface, not protruding metal pieces.
def pixel_surface(material,name,kind):
    rng=random.Random(940+(0 if kind=='stone' else 1));size=32
    chunks=[[rng.uniform(.62,.96) for _ in range(8)] for _ in range(8)]
    pixels=[]
    for y in range(size):
        for x in range(size):
            value=chunks[y//4][x//4]+rng.uniform(-.035,.035)
            edge=min(x,y,size-1-x,size-1-y)
            if edge<2:value*=.48
            elif edge==2:value=min(1,value+.08)
            # Irregular staggered, short mineral inclusions; no copied Ender atlas.
            if 5<x<27 and 5<y<27:
                if (x//2+2*(y//3))%11==0 and y%3<2:value=min(1,value+.17)
                if (x+y*3)%29==0:value*=.72
            value=max(.28,min(1,value));pixels.extend([value,value,value,1])
    image=bpy.data.images.new('Simple.OriginalPixels.'+name,width=size,height=size,alpha=True);image.pixels.foreach_set(pixels)
    image.filepath_raw=str(folder/(name+'-32.png'));image.file_format='PNG';image.save();image.pack()
    nodes=material.node_tree.nodes;bsdf=nodes.get('Principled BSDF');texture=nodes.new('ShaderNodeTexImage');texture.image=image;texture.interpolation='Closest'
    multiply=nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1;multiply.inputs[2].default_value=material.diffuse_color
    material.node_tree.links.new(texture.outputs['Color'],multiply.inputs[1]);material.node_tree.links.new(multiply.outputs[0],bsdf.inputs['Base Color'])
pixel_surface(shell,'obsidian','stone');pixel_surface(panel,'mineral','panel')

# Independent planar UVs let the hand-built surface sit consistently on every face.
def cube(name,center,size,material,parent):
    bpy.ops.mesh.primitive_cube_add(size=1,location=center);obj=bpy.context.object;obj.name=name;obj.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    uv=obj.data.uv_layers.active
    for polygon in obj.data.polygons:
        coords=[obj.data.vertices[obj.data.loops[i].vertex_index].co for i in polygon.loop_indices]
        normal=polygon.normal;axis=max(range(3),key=lambda i:abs(normal[i]));axes=[i for i in range(3) if i!=axis]
        for loop,co in zip(polygon.loop_indices,coords):uv.data[loop].uv=((co[axes[0]]/size[axes[0]])+.5,(co[axes[1]]/size[axes[1]])+.5)
    obj.data.materials.append(material)
    world=obj.matrix_world.copy();obj.parent=parent;obj.matrix_world=world
    return obj
# Plain body, truly hollow. Front and sides are clean flat surfaces.
cube('Body.Floor',(0,0,.07),(1,.875,.1),shell,body)
for side in [-1,1]:
    cube('Body.Side',(side*.47,0,.36),(.06,.875,.58),shell,body)
    cube('Body.End',(0,side*.4075,.36),(.88,.06,.58),shell,body)
# Thin inset surface colour: same plane, only 2 mm of relief, no ornamental armour.
for side in [-1,1]:
    cube('Body.FrontPanel',(0,side*.439,.36),(.88,.004,.47),panel,body)
    cube('Body.SidePanel',(side*.501,0,.36),(.004,.75,.47),panel,body)
cube('Body.InnerFloor',(0,0,.126),(.86,.73,.012),interior,body)
# Cubic lid with a simple dark border painted in its surface texture.
cube('Lid.Ceiling',(0,0,.86),(1,.875,.10),shell,lid)
for side in [-1,1]:
    cube('Lid.Side',(side*.47,0,.735),(.06,.875,.15),shell,lid)
    cube('Lid.End',(0,side*.4075,.735),(.88,.06,.15),shell,lid)
cube('Lid.TopSurface',(0,0,.912),(.9,.775,.004),panel,lid)
# One small familiar latch, all attached to the lid: no floating duplicate tongue.
cube('Lid.Latch',(0,-.465,.65),(.105,.055,.22),latch,lid)
cube('Lid.Keyhole',(0,-.495,.625),(.021,.005,.04),slot,lid)
for part,name in [(body,'Body.Geometry'),(lid,'Lid.Geometry')]:
    meshes=[o for o in part.children_recursive if o.type=='MESH'];bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:obj.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();bpy.context.object.name=name
lid.rotation_mode='XYZ'
for frame,angle in [(0,0),(8,.025),(14,-.13),(30,-1.73),(38,-1.82)]:
    lid.rotation_euler.x=angle;lid.keyframe_insert(data_path='rotation_euler',frame=frame)
lid.animation_data.action.name='Simple.Open';scene.frame_set(0)

# Convert material names to the shared render contract inside the exported file.
def export_model():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [root]+list(root.children_recursive):obj.select_set(True)
    output=ROOT/'public/models/ender-vault-v4.glb'
    bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,use_active_scene=True,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_frame_range=True)
    raw=output.read_bytes();length=struct.unpack_from('<I',raw,12)[0];gltf=json.loads(raw[20:20+length]);rest=raw[20+length:]
    aliases={body.name:'Body',lid.name:'LidAssembly',root.name:'VaultRoot'}
    for node in gltf.get('nodes',[]):node['name']=aliases.get(node.get('name'),node.get('name',''))
    for material in gltf.get('materials',[]):
        source=bpy.data.materials[material['name']]
        material.setdefault('pbrMetallicRoughness',{})['baseColorFactor']=list(source.diffuse_color)
        material['name']=material['name'].replace('Simple.','Vault.')
    for animation in gltf.get('animations',[]):animation['name']='Vault.Open'
    payload=json.dumps(gltf,separators=(',',':')).encode();payload+=b' '*((-len(payload))%4)
    output.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(payload)+len(rest))+struct.pack('<I4s',len(payload),b'JSON')+payload+rest)
    return output,gltf
output,gltf=export_model()
camera_data=bpy.data.cameras.new('Simple Review Camera');camera=bpy.data.objects.new(camera_data.name,camera_data);scene.collection.objects.link(camera)
camera.location=(-2.8,-4,2.2);camera.rotation_euler=(Vector((0,0,.47))-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.type='ORTHO';camera_data.ortho_scale=1.65;scene.camera=camera
for name,position,energy,color in [('Key',(-3,-4,5),450,(.9,1,1)),('Rim',(2,3,4),300,(.72,.67,1)),('Fill',(4,-2,2),120,(.85,.95,1))]:
    data=bpy.data.lights.new('Simple '+name,'AREA');data.energy=energy;data.color=color;data.size=4
    obj=bpy.data.objects.new(data.name,data);scene.collection.objects.link(obj);obj.location=position;obj.rotation_euler=(Vector((0,0,.4))-obj.location).to_track_quat('-Z','Y').to_euler()
scene.world=bpy.data.worlds.new('Simple Review World');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.025,.035,.045,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.3
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.render.resolution_x=800;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene['vault_model_revision']='ender-v4.1'
bpy.ops.wm.save_as_mainfile(filepath=str(folder/'ender-vault.blend'))
scene.render.filepath=str(folder/'mineral.png');bpy.ops.render.render(write_still=True)
# Second palette, identical silhouette, to compare material character rather than add ornaments.
for material,color in [(shell,(.043,.025,.065)),(panel,(.07,.044,.085))]:
    material.diffuse_color=(*color,1)
    next(n for n in material.node_tree.nodes if n.type=='MIX_RGB').inputs[2].default_value=(*color,1)
scene.render.filepath=str(folder/'obsidian.png');bpy.ops.render.render(write_still=True)
for material,color in [(shell,(.035,.032,.052)),(panel,(.045,.080,.077))]:
    material.diffuse_color=(*color,1);next(n for n in material.node_tree.nodes if n.type=='MIX_RGB').inputs[2].default_value=(*color,1)
scene.frame_set(38);target=Vector((0,0,.72));camera.location=target+Vector((-2.8,-4,1.8));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.ortho_scale=2.15
scene.render.filepath=str(folder/'open.png');bpy.ops.render.render(write_still=True)
scene.frame_set(0);camera.location=(-2.8,-4,2.2);camera.rotation_euler=(Vector((0,0,.47))-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.ortho_scale=1.65
for window in bpy.context.window_manager.windows:
    window.scene=scene
    for area in window.screen.areas:
        if area.type=='VIEW_3D':
            space=area.spaces.active;space.shading.type='MATERIAL';space.region_3d.view_location=(0,0,.45);space.region_3d.view_distance=2.8
            space.region_3d.view_rotation=Vector((-3,-4,2)).to_track_quat('Z','Y');area.tag_redraw()
triangles=0
for obj in root.children_recursive:
    if obj.type=='MESH':obj.data.calc_loop_triangles();triangles+=len(obj.data.loop_triangles)
report={'revision':'ender-v4.1','triangles':triangles,'bytes':output.stat().st_size,'materials':[m['name'] for m in gltf.get('materials',[])],'textures':len(gltf.get('images',[]))}
(folder/'inspection.json').write_text(json.dumps(report,indent=2));RESULT=report
