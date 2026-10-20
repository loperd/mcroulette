"""Export each reviewed wide stage; existing material and Three PBR pipeline remain in use."""
import bpy,json,math,time
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets/environments/miner-citadel-wide';ART=ROOT/'artifacts/miner-citadel-wide'
previous=bpy.context.window.scene
results=[]
try:
 for stage in globals().get('CITADEL_EXPORT_STAGES',['A','B']):
    name='MINER_CITADEL_DISTRICTS' if stage=='C' else 'MINER_CITADEL_WIDE_'+stage
    s=bpy.data.scenes.get(name)
    native=ROOT/'assets/environments/miner-citadel-districts/districts.blend' if stage=='C' else OUT/('wide-'+stage.lower()+'.blend')
    if not s:
        if not native.exists():continue
        with bpy.data.libraries.load(str(native),link=False) as (a,b):b.scenes=[a.scenes[0]]
        s=b.scenes[0];s.name=name
    bpy.context.window.scene=s;bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
    pub=ROOT/'public/models/environments/miner-citadel-districts' if stage=='C' else ROOT/'public/models/environments/miner-citadel-wide'/stage.lower()
    pub.mkdir(parents=True,exist_ok=True)
    def vec(v):return [float(v[0]),float(v[2]),float(-v[1])]
    lights=[o for o in s.objects if o.type=='LIGHT' and o.data.type=='POINT' and not o.hide_render]
    dynamic=[o for o in lights if o.name.startswith('Lava reflected radiance wide')][:3]
    nearestBlue=next((o for o in lights if o.name.startswith('Wide crystal')),None)
    if nearestBlue:dynamic.append(nearestBlue)
    temporary=bpy.data.scenes.new('Wide stage export temporary');copies=[];start=time.perf_counter();omitted=[]
    try:
        for o in list(s.objects):
            if o.type not in ['MESH','CURVE'] or o.hide_render:continue
            if any(m and m.use_nodes and any(n.bl_idname=='ShaderNodeVolumePrincipled' for n in m.node_tree.nodes) for m in o.data.materials):omitted.append(o.name);continue
            # Evaluate Blender architectural components; no runtime world generation.
            data=bpy.data.meshes.new_from_object(o.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps)
            if not data or not data.vertices:continue
            data.transform(o.matrix_world);data.update()
            uv=data.uv_layers.get('Physical metres') or data.uv_layers.active
            if uv:
                wanted=uv.name
                for layer in list(data.uv_layers):
                    if layer.name!=wanted:data.uv_layers.remove(layer)
                data.uv_layers.active=data.uv_layers[0];data.uv_layers[0].active_render=True
            vertices=np.empty(len(data.vertices)*3,dtype=np.float32);data.vertices.foreach_get('co',vertices);vertices=vertices.reshape((-1,3))
            indices=np.empty(len(data.loops),dtype=np.int32);data.loops.foreach_get('vertex_index',indices);pos=vertices[indices]
            normals=np.empty(len(data.polygons)*3,dtype=np.float32);data.polygons.foreach_get('normal',normals);normals=normals.reshape((-1,3))
            totals=np.empty(len(data.polygons),dtype=np.int32);data.polygons.foreach_get('loop_total',totals);normal=np.repeat(normals,totals,axis=0)
            lit=np.zeros_like(pos);low=vertices.min(axis=0);high=vertices.max(axis=0)
            for light in lights:
                if light in dynamic:continue
                p=np.array(light.matrix_world.translation);radius=16 if light.data.energy<900 else 30
                if np.linalg.norm(np.maximum(0,np.maximum(low-p,p-high)))>radius:continue
                delta=p-pos;d2=np.sum(delta*delta,axis=1)+.3;distance=np.sqrt(d2)
                strength=light.data.energy/(16*math.pi**2*d2)*np.maximum(0,np.sum(normal*delta/distance[:,None],axis=1))*np.maximum(0,1-distance/radius)**2
                lit+=strength[:,None]*np.array(light.data.color)
            color=data.color_attributes.get('StaticLamp') or data.color_attributes.new(name='StaticLamp',type='FLOAT_COLOR',domain='CORNER')
            rgba=np.concatenate([np.clip(lit,0,1),np.ones((len(pos),1))],axis=1).astype(np.float32);color.data.foreach_set('color',rgba.ravel());data.color_attributes.active_color=color;data.color_attributes.render_color_index=list(data.color_attributes).index(color)
            obj=bpy.data.objects.new(o.name,data);temporary.collection.objects.link(obj);copies.append(obj)
        bpy.context.window.scene=temporary
        for o in bpy.context.selected_objects:o.select_set(False)
        for o in copies:o.select_set(True)
        bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.join();merged=bpy.context.object;merged.name='Authored_Wide_Mine_'+stage
        options={'filepath':str(pub/'citadel.glb'),'export_format':'GLB','use_selection':True,'use_active_scene':True,'export_yup':True,'export_cameras':False,'export_lights':False,'export_animations':False,'export_materials':'EXPORT'}
        if 'export_vertex_color' in bpy.ops.export_scene.gltf.get_rna_type().properties:options['export_vertex_color']='ACTIVE'
        bpy.ops.export_scene.gltf(**options)
        spec={'version':1,'stage':stage,'source':str(native.relative_to(ROOT)),'asset':str((pub/'citadel.glb').relative_to(ROOT/'public')),'camera':{'position':vec(s.camera.location),'target':vec(s['wide_target']),'fov':math.degrees(2*math.atan(36/(2*s.camera.data.lens*1.6))),'aspect':1.6,'near':.1,'far':650},'fog':{'color':'#263b50','near':s['runtime_fog_near'],'far':s['runtime_fog_far']},'dynamicPoints':[{'position':vec(o.matrix_world.translation),'color':list(o.data.color),'intensity':o.data.energy*.22,'range':36} for o in dynamic],'wideLighting':True,'bloom':False,'localLightEncoding':'COLOR_0, short-range unoccluded Lambert approximation decoded x4; not GI bake','omittedVolumes':omitted,'exportCpuSeconds':time.perf_counter()-start,'sourceObjects':len(copies),'browserVerified':False}
        (pub/'scene.json').write_text(json.dumps(spec,indent=2));results.append(spec)
    finally:
        bpy.context.window.scene=s
        for o in list(temporary.objects):bpy.data.objects.remove(o,do_unlink=True)
        bpy.data.scenes.remove(temporary)
 report=ROOT/'artifacts/miner-citadel-districts' if globals().get('CITADEL_EXPORT_STAGES')==['C'] else ART
 (report/'runtime-export.json').write_text(json.dumps(results,indent=2))
 RESULT=[{'stage':r['stage'],'exportSeconds':r['exportCpuSeconds'],'objects':r['sourceObjects']} for r in results]
finally:bpy.context.window.scene=previous
