import json
import struct
from mathutils import Vector
scene=bpy.data.scenes['Voxel Vault Ender V2'];bpy.context.window.scene=scene
folder=ROOT/'assets/chests/ender-v2'
scene.frame_set(0)
lid=scene.objects['LidAssembly'];lid.animation_data.action.name='Vault.Open'
bpy.ops.object.select_all(action='DESELECT')
root=scene.objects['VaultRoot']
for obj in [root]+list(root.children_recursive):obj.select_set(True)
output=ROOT/'public/models/ender-vault-v2.glb'
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,use_active_scene=True,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_frame_range=True)
# Blender's exporter keeps the image from the multiply node but omits the tint factor.
# Restore explicit glTF factors so Blender and Three.js sample the same grayscale texture.
raw=output.read_bytes();json_length=struct.unpack_from('<I',raw,12)[0]
gltf=json.loads(raw[20:20+json_length]);rest=raw[20+json_length:]
for material in gltf.get('materials',[]):
    name=material.get('name','')
    if name.startswith('Vault.') and name in bpy.data.materials:
        material.setdefault('pbrMetallicRoughness',{})['baseColorFactor']=list(bpy.data.materials[name].diffuse_color)
payload=json.dumps(gltf,separators=(',',':')).encode();payload+=b' '*((-len(payload))%4)
output.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(payload)+len(rest))+struct.pack('<I4s',len(payload),b'JSON')+payload+rest)
# Fit the complete open silhouette rather than cropping the lid.
scene.frame_set(38)
points=[]
for obj in root.children_recursive:
    if obj.type=='MESH':points.extend(obj.matrix_world@Vector(corner) for corner in obj.bound_box)
low=Vector(tuple(min(p[i] for p in points) for i in range(3)));high=Vector(tuple(max(p[i] for p in points) for i in range(3)))
target=(low+high)*.5
scene.camera.location=target+Vector((-3.1,-4.4,2.0))
scene.camera.rotation_euler=(target-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.camera.data.ortho_scale=3.8
scene.render.filepath=str(folder/'open.png');bpy.ops.render.render(write_still=True)
scene.frame_set(0);scene.camera.location=(-3.1,-4.4,2.7);scene.camera.rotation_euler=(Vector((0,0,.77))-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.camera.data.ortho_scale=2.85
bpy.ops.wm.save_as_mainfile(filepath=str(folder/'ender-vault.blend'))
report={'revision':'ender-v2.2','bytes':output.stat().st_size,'scenes':len(gltf.get('scenes',[])),'meshes':len(gltf.get('meshes',[])),'materials':[m['name'] for m in gltf.get('materials',[])],'animations':[a.get('name') for a in gltf.get('animations',[])],'pixel_textures':len(gltf.get('images',[])),'triangles':4700}
(folder/'inspection.json').write_text(json.dumps(report,indent=2));RESULT=report
