"""A recognisable Ender direction: obsidian pixels, iron bindings, gold latch and Eye of Ender."""
import bmesh
import math
import random
import json
import struct
from mathutils import Vector
scene=bpy.data.scenes['Voxel Vault Ender V2'];bpy.context.window.scene=scene;scene.frame_set(0)
if scene.get('vault_minecraft_pass'):raise RuntimeError('Minecraft pass already applied.')
root=scene.objects['VaultRoot'];body=scene.objects['Body'];lid=scene.objects['LidAssembly']
folder=ROOT/'assets/chests/ender-v3';folder.mkdir(parents=True,exist_ok=True)
# Remove glowing diodes, crystal badges and the small central high-tech crest.
for obj in root.children_recursive:
    if obj.type!='MESH':continue
    mesh=bmesh.new();mesh.from_mesh(obj.data)
    remove=[]
    for face in mesh.faces:
        name=obj.data.materials[face.material_index].name
        center=obj.matrix_world@face.calc_center_median()
        if name in ['Vault.Accent','Vault.Crystal'] or (center.z>1.485 and abs(center.x)<.55 and abs(center.y)<.47):remove.append(face)
    bmesh.ops.delete(mesh,geom=remove,context='FACES');mesh.to_mesh(obj.data);mesh.free()
    for polygon in obj.data.polygons:polygon.use_smooth=False

colors={'Shell':(.027,.019,.043),'Panel':(.047,.036,.064),'Metal':(.16,.18,.20),'Edge':(.063,.057,.080),'Interior':(.02,.014,.028)}
for index,(name,color) in enumerate(colors.items()):
    mat=bpy.data.materials['Vault.'+name];mat.diffuse_color=(*color,1)
    bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(*color,1);bsdf.inputs['Metallic'].default_value=.25 if name=='Metal' else .05;bsdf.inputs['Roughness'].default_value=.88
    mix=next(n for n in mat.node_tree.nodes if n.type=='MIX_RGB');mix.inputs[2].default_value=(*color,1)
    rng=random.Random(401+index);coarse=[[rng.uniform(.5,.95) for _ in range(8)] for _ in range(8)];pixels=[]
    for y in range(32):
        for x in range(32):
            value=coarse[y//4][x//4]+rng.uniform(-.06,.06)
            if name in ['Shell','Panel'] and (x+y//4*3)%13==0 and y%8<5:value*=.55
            if name=='Metal' and (x%11==0 or y%15==0):value*=.7
            value=max(.25,min(1,value));pixels.extend([value,value,value,1])
    image=bpy.data.images.new('Vault.MinecraftPixels.'+name,width=32,height=32,alpha=True);image.pixels.foreach_set(pixels)
    image.filepath_raw=str(folder/(name.lower()+'-32.png'));image.file_format='PNG';image.save();image.pack()
    texture=next(n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE');texture.image=image;texture.interpolation='Closest'

def material(name,color):
    mat=bpy.data.materials.new('Vault.'+name);mat.diffuse_color=(*color,1);mat.use_nodes=True
    node=mat.node_tree.nodes.get('Principled BSDF');node.inputs['Base Color'].default_value=(*color,1);node.inputs['Roughness'].default_value=.85
    return mat

gold=material('Latch',(.58,.39,.09));green=material('EyeOuter',(.035,.12,.035));sage=material('EyeStone',(.28,.36,.09));iris=material('EyeIris',(.035,.28,.14));black=material('EyeDark',(.008,.014,.008));shine=material('EyeGlint',(.65,.72,.47))

def block(name,location,dimensions,mat,parent):
    bpy.ops.mesh.primitive_cube_add(size=1,location=location);obj=bpy.context.object;obj.name=name;obj.dimensions=dimensions
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);obj.data.materials.append(mat)
    world=obj.matrix_world.copy();obj.parent=parent;obj.matrix_world=world;return obj

# Clear gold rectangle is intentionally familiar; its top tongue follows the lid.
block('Body.GoldLatch',(0,-.84,.69),(.18,.065,.29),gold,body)
block('Body.KeyHole',(0,-.876,.66),(.038,.009,.065),black,body)
block('Lid.GoldLatchTongue',(0,-.744,1.10),(.14,.035,.18),gold,lid)
# Chunky raised obsidian tiles instead of a smooth technological lid.
shell=bpy.data.materials['Vault.Shell'];panel=bpy.data.materials['Vault.Panel']
for x in [-.44,0,.44]:
    for y in [-.29,0,.29]:
        if x==0 and y==0:continue
        block('Lid.ObsidianTile',(x,y,1.475),(.42,.27,.045),shell if x else panel,lid)
pattern=['  GGGGG  ',' GGYYYGG ','GYYDKDYYG','GYDKWKDYG','GYYDKDYYG',' GGYYYGG ','  GGGGG  ']
materials={'G':green,'Y':sage,'D':black,'K':iris,'W':shine}
for j,row in enumerate(pattern):
    for i,pixel in enumerate(row):
        if pixel==' ':continue
        block('Lid.EnderEyePixel',((i-4)*.068,(j-3)*.068,1.535),(.068,.068,.025 if pixel in 'GY' else .035),materials[pixel],lid)
# Coarse corner studs and stone chips preserve a Minecraft silhouette.
for x in [-.84,.84]:
    for y in [-.56,.56]:
        block('Body.StoneKnuckle',(x,y,.84),(.22,.22,.13),shell,body)

for part,name in [(body,'Body.Geometry'),(lid,'Lid.Geometry')]:
    meshes=[o for o in part.children_recursive if o.type=='MESH'];bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:obj.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();bpy.context.object.name=name
scene['vault_minecraft_pass']=True;scene['vault_model_revision']='ender-v3.1'
scene.frame_set(0);bpy.ops.object.select_all(action='DESELECT')
for obj in [root]+list(root.children_recursive):obj.select_set(True)
output=ROOT/'public/models/ender-vault-v3.glb'
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,use_active_scene=True,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_frame_range=True)
raw=output.read_bytes();length=struct.unpack_from('<I',raw,12)[0];gltf=json.loads(raw[20:20+length]);rest=raw[20+length:]
for mat in gltf.get('materials',[]):
    if mat.get('name') in bpy.data.materials:mat.setdefault('pbrMetallicRoughness',{})['baseColorFactor']=list(bpy.data.materials[mat['name']].diffuse_color)
for animation in gltf.get('animations',[]):animation['name']='Vault.Open'
payload=json.dumps(gltf,separators=(',',':')).encode();payload+=b' '*((-len(payload))%4)
output.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(payload)+len(rest))+struct.pack('<I4s',len(payload),b'JSON')+payload+rest)
# More neutral lighting keeps the obsidian purple and avoids a sci-fi teal wash.
for obj in scene.objects:
    if obj.type=='LIGHT' and 'Rim' in obj.name:obj.data.color=(.65,.6,1);obj.data.energy=400
scene.camera.location=(-3.1,-4.4,2.7);scene.camera.rotation_euler=(Vector((0,0,.77))-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.camera.data.ortho_scale=2.85
bpy.ops.wm.save_as_mainfile(filepath=str(folder/'ender-vault.blend'))
scene.render.filepath=str(folder/'closed.png');bpy.ops.render.render(write_still=True)
scene.frame_set(38);target=Vector((0,0,1.14));scene.camera.location=target+Vector((-3.1,-4.4,2.0));scene.camera.rotation_euler=(target-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.camera.data.ortho_scale=3.8
scene.render.filepath=str(folder/'open.png');bpy.ops.render.render(write_still=True)
scene.frame_set(0);scene.camera.location=(-3.1,-4.4,2.7);scene.camera.rotation_euler=(Vector((0,0,.77))-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.camera.data.ortho_scale=2.85
triangles=0
for obj in root.children_recursive:
    if obj.type=='MESH':obj.data.calc_loop_triangles();triangles+=len(obj.data.loop_triangles)
report={'revision':'ender-v3.1','bytes':output.stat().st_size,'triangles':triangles,'parts':['Body','LidAssembly'],'animations':[a['name'] for a in gltf.get('animations',[])],'textures':len(gltf.get('images',[]))}
(folder/'inspection.json').write_text(json.dumps(report,indent=2));RESULT=report
