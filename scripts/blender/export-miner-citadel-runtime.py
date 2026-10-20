"""Export the authored scene, not a procedural rebuild. Consolidate by material; preserve camera."""
import bpy,math,json,time
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
PUB=ROOT/'public/models/environments/miner-citadel';PUB.mkdir(parents=True,exist_ok=True)
ART=ROOT/'artifacts/miner-citadel-polish'
previous=bpy.context.window.scene
if 'MINER_CITADEL_MATERIAL_POLISH' not in bpy.data.scenes:
    with bpy.data.libraries.load(str(ROOT/'assets/environments/miner-citadel-polish/miner-citadel-polished.blend'),link=False) as (source,dest):dest.scenes=[source.scenes[0]]
    dest.scenes[0].name='MINER_CITADEL_MATERIAL_POLISH'
s=bpy.data.scenes['MINER_CITADEL_MATERIAL_POLISH'];bpy.context.window.scene=s;bpy.context.view_layer.update()
# Capture source world transforms and lights before entering the temporary runtime scene.
def vec(v):return [float(v[0]),float(v[2]),float(-v[1])]
points=[o for o in s.objects if o.type=='LIGHT' and o.data.type=='POINT' and not o.hide_render]
selected=[o for o in points if o.name.startswith('Lava reflected radiance')][:3]
blue=next((o for o in points if o.name.startswith('Mineral blue bounce') and o.location.x>20),None)
if blue:selected.append(blue)
metadata={'version':1,'source':'assets/environments/miner-citadel-polish/miner-citadel-polished.blend','asset':'models/environments/miner-citadel/citadel.glb','camera':{'position':vec(s.camera.location),'target':[0,.4,-3],'fov':math.degrees(2*math.atan(s.camera.data.sensor_width/(2*s.camera.data.lens*1.6))),'aspect':1.6,'near':.1,'far':420},'fog':{'color':'#263b50','near':68,'far':245},'localLightEncoding':{'attribute':'COLOR_0','decodeScale':4,'description':'Short-range, unoccluded Lambert lamp approximation; not a GI/lightmap bake'},'dynamicPoints':[{'name':o.name,'position':vec(o.location),'color':list(o.data.color),'intensity':o.data.energy*.22,'range':28} for o in selected],'excludedVolumes':[],'runtimeEffects':{'water':'dual-phase PBR UV advection, no reflection/refraction pass','lava':'dual-phase map and emission advection','bloomDefault':False,'bloomRequiresGpuAB':True},'uvPeriodMeters':3}
originals=[o for o in s.objects if o.type in ['MESH','CURVE'] and not o.hide_render]
deps=bpy.context.evaluated_depsgraph_get();runtime=bpy.data.scenes.new('Citadel static runtime export');copies=[];colors=0;start=time.perf_counter()
try:
    for o in originals:
        if any(m and m.use_nodes and any(n.type=='VOLUME_PRINCIPLED' for n in m.node_tree.nodes) for m in o.data.materials):
            metadata['excludedVolumes'].append(o.name);continue
        if o.type=='MESH' and o.name.startswith('Split bedrock plate'):
            data=o.data.copy() # subpixel bevel only is omitted from the far fracture plates
        else:data=bpy.data.meshes.new_from_object(o.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps)
        if not data or not len(data.vertices):continue
        data.transform(o.matrix_world);data.update()
        uv=data.uv_layers.get('Physical metres') or data.uv_layers.active
        if uv:
            wanted=uv.name
            for layer in list(data.uv_layers):
                if layer.name!=wanted:data.uv_layers.remove(layer)
            data.uv_layers.active=data.uv_layers[0];data.uv_layers[0].active_render=True
        # Short range lamp energy is stored as corner data, avoiding dozens of per-pixel lights.
        positions=np.empty(len(data.vertices)*3,dtype=np.float32);data.vertices.foreach_get('co',positions);positions=positions.reshape((-1,3))
        indices=np.empty(len(data.loops),dtype=np.int32);data.loops.foreach_get('vertex_index',indices);pos=positions[indices]
        normals=np.empty(len(data.polygons)*3,dtype=np.float32);data.polygons.foreach_get('normal',normals);normals=normals.reshape((-1,3))
        totals=np.empty(len(data.polygons),dtype=np.int32);data.polygons.foreach_get('loop_total',totals);normal=np.repeat(normals,totals,axis=0)
        lightRGB=np.zeros((len(pos),3),dtype=np.float32)
        low=positions.min(axis=0);high=positions.max(axis=0)
        for light in points:
            if light in selected:continue
            p=np.array(light.location,dtype=np.float32);radius=11 if light.data.energy<800 else 20
            if np.linalg.norm(np.maximum(0,np.maximum(low-p,p-high)))>radius:continue
            delta=p-pos;d2=np.sum(delta*delta,axis=1)+.25;distance=np.sqrt(d2);direction=delta/distance[:,None]
            facing=np.maximum(0,np.sum(normal*direction,axis=1));falloff=np.maximum(0,1-distance/radius)**2
            energy=light.data.energy/(16*math.pi**2*d2)*facing*falloff
            lightRGB+=energy[:,None]*np.array(light.data.color)[None,:]
        color=data.color_attributes.get('StaticLamp') or data.color_attributes.new(name='StaticLamp',type='FLOAT_COLOR',domain='CORNER')
        rgba=np.concatenate([np.clip(lightRGB,0,1),np.ones((len(pos),1))],axis=1).astype(np.float32);color.data.foreach_set('color',rgba.ravel());data.color_attributes.active_color=color;data.color_attributes.render_color_index=list(data.color_attributes).index(color)
        copy=bpy.data.objects.new(o.name,data);runtime.collection.objects.link(copy);copies.append(copy);colors+=len(pos)
    bpy.context.window.scene=runtime
    for o in list(bpy.context.selected_objects):o.select_set(False)
    for o in copies:o.select_set(True)
    bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.join();merged=bpy.context.object;merged.name='Authored_Miner_Citadel'
    props=bpy.ops.export_scene.gltf.get_rna_type().properties
    opts={'filepath':str(PUB/'citadel.glb'),'export_format':'GLB','use_selection':True,'use_active_scene':True,'export_yup':True,'export_cameras':False,'export_lights':False,'export_animations':False,'export_materials':'EXPORT'}
    if 'export_vertex_color' in props:opts['export_vertex_color']='ACTIVE'
    if 'export_all_vertex_colors' in props:opts['export_all_vertex_colors']=False
    bpy.ops.export_scene.gltf(**opts)
    metadata['exportCpuSeconds']=time.perf_counter()-start;metadata['sourceMeshObjects']=len(copies);metadata['runtimeMeshObjects']=1;metadata['materialSlots']=len(merged.data.materials);metadata['staticLampCorners']=colors
    (PUB/'scene.json').write_text(json.dumps(metadata,indent=2));(ART/'runtime-export.json').write_text(json.dumps(metadata,indent=2))
    RESULT={'asset':str(PUB/'citadel.glb'),'seconds':metadata['exportCpuSeconds'],'meshObjects':1,'materialSlots':len(merged.data.materials),'staticLampCorners':colors}
finally:
    bpy.context.window.scene=previous
    for o in list(runtime.objects):bpy.data.objects.remove(o,do_unlink=True)
    bpy.data.scenes.remove(runtime)
