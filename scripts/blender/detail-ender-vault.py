"""Add voxel relief and original pixel textures, then merge render parts by hinge ownership."""
import math
import random
import json
from mathutils import Vector
scene=bpy.data.scenes['Voxel Vault Ender V2']
bpy.context.window.scene=scene
scene.frame_set(0)
if scene.get('vault_detailed'):
    raise RuntimeError('Detail pass already applied; inspect before repeating.')
body=scene.objects['Body'];lid=scene.objects['LidAssembly']
folder=ROOT/'assets/chests/ender-v2';texture_folder=folder/'textures';texture_folder.mkdir(parents=True,exist_ok=True)
metal=bpy.data.materials['Vault.Metal'];edge=bpy.data.materials['Vault.Edge'];panel=bpy.data.materials['Vault.Panel'];accent=bpy.data.materials['Vault.Accent'];crystal=bpy.data.materials['Vault.Crystal']


def block(name,location,size,material,parent):
    bpy.ops.mesh.primitive_cube_add(size=1,location=location)
    obj=bpy.context.object;obj.name=name;obj.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    obj.data.materials.append(material)
    matrix=obj.matrix_world.copy();obj.parent=parent;obj.matrix_world=matrix
    return obj

# Pixel-step brackets, inset borders and hammered square rivets.
for side in [-1,1]:
    for y in [-.56,.56]:
        for step in range(3):
            block('Body.SteppedFoot',(side*(.85+.018*step),y,.1+step*.045),(.27-step*.045,.29-step*.035,.045),metal,body)
        block('Lid.CornerPlate',(side*.84,y,1.465),(.25,.27,.045),edge,lid)
        block('Lid.CornerRivet',(side*.84,y,1.50),(.055,.055,.028),metal,lid)
    for x in [-.43,.43]:
        for dx in [-.285,.285]:
            for z in [.4,.82]:
                block('Body.PanelRivet',(x+dx,side*.694,z),(.042,.026,.042),metal,body)
        # Deliberately stepped, protruding frame rather than a smooth drawn border.
        for dx,z in [(-.22,.87),(.22,.87),(-.22,.35),(.22,.35)]:
            block('Body.PanelRelief',(x+dx,side*.691,z),(.11,.035,.035),edge,body)
            block('Body.PanelRelief',(x+dx+(0.04 if dx>0 else -.04),side*.691,z+(-.04 if z>.6 else .04)),(.03,.035,.08),edge,body)
    for y in [-.29,.29]:
        for z in [.4,.82]:
            block('Body.SideRivet',(side*.935,y,z),(.03,.05,.05),metal,body)
        for step in range(3):
            block('Body.SideGlyph',(side*.935,y+step*.055-.055,.59+(1 if step==1 else 0)*.055),(.018,.04,.04),accent,body)
# Ornate stepped lock shoulders and an inset keyhole below the main crystal.
for side in [-1,1]:
    block('Body.LockShoulder',(side*.18,-.735,.69),(.07,.065,.18),metal,body)
    block('Body.LockShoulderStep',(side*.205,-.72,.69),(.04,.04,.10),edge,body)
block('Body.LockSlot',(0,-.797,.57),(.04,.014,.045),edge,body)
# Raised segmented bands and a carved pixel crest on the lid.
for x in [-.73,.73]:
    for y in [-.43,0,.43]:
        block('Lid.BandSegment',(x,y,1.505),(.15,.22,.03),metal,lid)
    for y in [-.52,.52]:
        block('Lid.BandBolt',(x,y,1.529),(.05,.05,.025),edge,lid)
for side in [-1,1]:
    for step in range(3):
        block('Lid.CrestStep',(side*(.21+step*.065),0,1.512-step*.012),(.065,.19-step*.045,.034),metal,lid)
    for x in [-.27,.27]:
        block('Lid.CarvedInlay',(x,side*.31,1.493),(.12,.035,.02),edge,lid)
        block('Lid.CarvedInlay',(x+side*.05,side*.27,1.493),(.035,.09,.02),accent,lid)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.115,location=(0,0,1.59))
obj=bpy.context.object;obj.name='Lid.CrestCrystal';obj.scale=(1.45,1.45,.7);obj.data.materials.append(crystal)
matrix=obj.matrix_world.copy();obj.parent=lid;obj.matrix_world=matrix

# Real raster pixel textures, packed into .blend and GLB. No external image dependency.
for index,name in enumerate(['Shell','Panel','Metal','Edge','Interior']):
    mat=bpy.data.materials['Vault.'+name];nodes=mat.node_tree.nodes;bsdf=nodes.get('Principled BSDF')
    color=list(bsdf.inputs['Base Color'].default_value)
    rng=random.Random(700+index)
    tiles=[[rng.uniform(.67,1.0) for _ in range(16)] for _ in range(16)]
    values=[]
    for y in range(128):
        for x in range(128):
            tile=tiles[y//8][x//8]
            value=max(.35,min(1,tile+rng.uniform(-.045,.045)))
            if name in ['Shell','Panel','Interior']:
                # Coarse stone strata and occasional broken pixel seams.
                if (y%16==0 and (x//8+y//16)%3!=0) or (x%24==0 and y%32<14): value*=.65
                if x%8==1 and y%8==1 and rng.random()<.6: value=min(1,value+.15)
            else:
                # Short directional scratches and old hammered metal pixels.
                if x%19<3 and y%23==4: value=min(1,value+.18)
                if rng.random()<.015: value*=.55
            values.extend([value,value,value,1])
    image=bpy.data.images.new('Vault.Pixel.'+name,width=128,height=128,alpha=True)
    image.pixels.foreach_set(values)
    image.filepath_raw=str(texture_folder/(name.lower()+'.png'));image.file_format='PNG';image.save();image.pack()
    texture=nodes.new('ShaderNodeTexImage');texture.image=image;texture.interpolation='Closest';texture.label='Original 128px pixel surface'
    multiply=nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1;multiply.inputs[2].default_value=color
    mat.node_tree.links.new(texture.outputs['Color'],multiply.inputs[1]);mat.node_tree.links.new(multiply.outputs[0],bsdf.inputs['Base Color'])
    # glTF metallic and roughness remain simple scalar values.
    bsdf.inputs['Roughness'].default_value=.72 if name in ['Shell','Panel'] else .58 if name=='Metal' else .8

# Keep separate rigid body/lid geometry, merge their decorative pieces to limit draw calls.
for part,name in [(body,'Body.Geometry'),(lid,'Lid.Geometry')]:
    meshes=[obj for obj in part.children_recursive if obj.type=='MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes: obj.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0]
    bpy.ops.object.join();bpy.context.object.name=name
scene['vault_detailed']=True;scene['vault_model_revision']='ender-v2.2'
scene.frame_set(0)
bpy.ops.object.select_all(action='DESELECT')
for obj in [scene.objects['VaultRoot']]+list(scene.objects['VaultRoot'].children_recursive): obj.select_set(True)
output=ROOT/'public/models/ender-vault-v2.glb'
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_animations=True,export_frame_range=True)
bpy.ops.wm.save_as_mainfile(filepath=str(folder/'ender-vault.blend'))
scene.render.filepath=str(folder/'closed.png');bpy.ops.render.render(write_still=True)
# Open view pulled back to include the raised lid.
scene.frame_set(38);scene.camera.data.ortho_scale=3.45
scene.render.filepath=str(folder/'open.png');bpy.ops.render.render(write_still=True)
scene.camera.data.ortho_scale=2.85;scene.frame_set(0)
triangles=0
for obj in scene.objects:
    if obj.type=='MESH': obj.data.calc_loop_triangles();triangles+=len(obj.data.loop_triangles)
report={'revision':'ender-v2.2','bytes':output.stat().st_size,'meshes':len([o for o in scene.objects if o.type=='MESH']),'triangles':triangles,'pixel_textures':5,'parts':['Body','LidAssembly']}
(folder/'inspection.json').write_text(json.dumps(report,indent=2));RESULT=report
