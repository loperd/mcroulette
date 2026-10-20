"""Material polish on an independent copy of the approved scene. Camera/architecture are locked."""
import bpy,bmesh,sys,math,json,time,hashlib
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts/blender'))
from miner_pbr_surfaces import material
from miner_environment_tools import Environment
OUT=ROOT/'assets/environments/miner-citadel-polish';ART=ROOT/'artifacts/miner-citadel-polish';OUT.mkdir(parents=True,exist_ok=True);ART.mkdir(parents=True,exist_ok=True)
previous=bpy.context.window.scene
# Append saved data: the visible original and its native file stay unchanged.
with bpy.data.libraries.load(str(ROOT/'assets/environments/miner-citadel/miner-citadel.blend'),link=False) as (source,dest):dest.scenes=[source.scenes[0]]
s=dest.scenes[0];s.name='MINER_CITADEL_MATERIAL_POLISH';bpy.context.window.scene=s;e=Environment(s)
try:
    bpy.context.view_layer.update()
    cameraBefore={'matrix':list(v for row in s.camera.matrix_world for v in row),'lens':s.camera.data.lens,'sensorWidth':s.camera.data.sensor_width,'resolution':[1536,960]}
    objectMatrices={o.name:list(v for row in o.matrix_world for v in row) for o in s.objects}
    families={f:material(f) for f in ['slate','iron-shale','dressed-stone','timber','iron','water','lava']}
    # Semantic assignment, not independent random colours across every block.
    count={k:0 for k in families};uvScales=[]
    geology=[];water=[];lava=[]
    for o in list(s.objects):
        if o.type!='MESH':continue
        oldMaterials=list(o.data.materials)
        if not oldMaterials:continue
        family=None
        name=' '.join(m.name.lower() for m in oldMaterials if m)
        if 'falling water' in name:family='water';water.append(o)
        elif 'molten lava' in name:family='lava';lava.append(o)
        elif any(k in name for k in ['fractured graphite','blue distant slate']):family='slate';geology.append(o)
        elif 'iron-bearing schist' in name:family='iron-shale';geology.append(o)
        elif any(k in name for k in ['ancient cut stone','dressed pale','darkened masonry','stained masonry','weathered-graphite']):family='dressed-stone'
        elif any(k in name for k in ['timber','split-oak']):family='timber'
        elif any(k in name for k in ['oxidised rail','forged-iron']):family='iron'
        # Remove the rigid blue rods; water surface/foam will supply the highlights.
        if o.name.startswith('Waterfall glancing highlight'):o.hide_render=True;continue
        if not family:continue
        o.data=o.data.copy();o.data.materials.clear();o.data.materials.append(families[family])
        for p in o.data.polygons:p.material_index=0
        if family in ['slate','iron-shale']:
            for mod in o.modifiers:
                if mod.type=='BEVEL':mod.width=min(mod.width,.035)
        if family=='water':
            for p in o.data.polygons:p.use_smooth=True
        # Project each planar face in physical units. Use the longitudinal axis for wood fibres.
        uv=o.data.uv_layers.get('Physical metres') or o.data.uv_layers.new(name='Physical metres');o.data.uv_layers.active=uv;uv.active_render=True
        world=o.matrix_world
        local=[v.co for v in o.data.vertices];span=[max(v[i] for v in local)-min(v[i] for v in local) for i in range(3)];longAxis=max(range(3),key=lambda i:span[i])
        for p in o.data.polygons:
            if family=='timber':
                axis=max(range(3),key=lambda i:abs(p.normal[i]));axes=[i for i in range(3) if i!=axis]
                if longAxis in axes:axes=[next(i for i in axes if i!=longAxis),longAxis]
                for idx in p.loop_indices:
                    v=o.data.vertices[o.data.loops[idx].vertex_index].co;uv.data[idx].uv=(v[axes[0]]/.75,v[axes[1]]/3)
            else:
                normal=world.to_3x3().inverted().transposed()@p.normal;axis=max(range(3),key=lambda i:abs(normal[i]));axes=[i for i in range(3) if i!=axis]
                for idx in p.loop_indices:
                    v=world@o.data.vertices[o.data.loops[idx].vertex_index].co
                    # Falling water uses vertical V, so the runtime flow has one consistent direction.
                    uv.data[idx].uv=(v.x/3,v.z/3) if family=='water' else (v[axes[0]]/3,v[axes[1]]/3)
        count[family]+=1
    # Directed pressure/weathering chips on existing fracture plates, preserving mass placement.
    chips=0
    for o in geology:
        center=o.matrix_world@(sum((v.co for v in o.data.vertices),Vector())/len(o.data.vertices))
        if not o.name.startswith('Split bedrock plate') or not ((-26<center.x<-18 and -20<center.y<5 and 2<center.z<19) or (21<center.x<26 and -15<center.y<9 and 6<center.z<25)):continue
        if chips>=70:break
        bm=bmesh.new();bm.from_mesh(o.data)
        lo=Vector(tuple(min(v.co[i] for v in bm.verts) for i in range(3)));hi=Vector(tuple(max(v.co[i] for v in bm.verts) for i in range(3)))
        normal=Vector((.55,-.35,1));plane=Vector((hi.x,lo.y,hi.z-.16))
        result=bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.0001,plane_co=plane,plane_no=normal,clear_outer=True,clear_inner=False)
        edges=[g for g in result['geom_cut'] if isinstance(g,bmesh.types.BMEdge)]
        if edges:bmesh.ops.holes_fill(bm,edges=edges,sides=0)
        bm.to_mesh(o.data);bm.free();o.data.update();chips+=1
    # Continuous lava relief is built into the saved source, not tessellated every frame.
    for o in lava:
        if 'cascade' in o.name.lower():continue
        bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=8,use_grid_fill=True)
        for v in bm.verts:
            x,y=v.co.x,v.co.y;v.co.z+=.035*math.sin(x*2.8+math.sin(y*1.7))+.02*math.cos(y*3.3-x*.8)
        bm.to_mesh(o.data);bm.free();o.data.update()
    detail=e.group('26 — Surface-scale geological details')
    # Only natural small features are added; macro structures and primary silhouettes are locked.
    for x,y,z,w,h in [(-20,-19,24,1.7,5),(18,-4,28,1.8,5.5),(-11,23,31,2.3,7)]:
        e.rock(detail,'Stratified cave pendant',[(x-w,y-1),(x+w*.6,y-1.3),(x+w,y+.8),(x-w*.4,y+1.1)],[(z,.12,0,0),(z+h*.42,.55,0,0),(z+h,1,0,0)],families['slate'])
    for x,y,z in [(-16,-7,.3),(-19,-2,5.4),(17,-7,.2),(20,-10,4.1),(-15,1,.4),(22,10,14)]:
        e.rock(detail,'Bedded talus on existing ledge',[(x-.35,y-.4),(x+.5,y-.25),(x+.35,y+.4),(x-.4,y+.3)],[(z,1,0,0),(z+.45,.65,.07,0)],families['iron-shale'])
    # Distant extensions stay behind the cavern; no foreground or central framing is displaced.
    background=e.group('27 — Distant atmospheric rock silhouettes')
    for x,y,z,w,h in [(-29,132,4,12,48),(25,167,8,16,61),(-7,208,13,24,65)]:
        e.rock(background,'Far cavern layered silhouette',[(x-w/2,y-8),(x+w*.3,y-11),(x+w/2,y+7),(x-w*.3,y+12)],[(z,1,0,0),(z+h*.45,.94,0,0),(z+h,.62,2,0)],families['slate'])
    # UVs for the few new natural meshes use the same three-metre physical scale.
    for collection in [detail,background]:
        for o in collection.objects:
            if o.type!='MESH':continue
            uv=o.data.uv_layers.new(name='Physical metres')
            for p in o.data.polygons:
                axis=max(range(3),key=lambda i:abs(p.normal[i]));axes=[i for i in range(3) if i!=axis]
                for idx in p.loop_indices:v=o.data.vertices[o.data.loops[idx].vertex_index].co;uv.data[idx].uv=(v[axes[0]]/3,v[axes[1]]/3)
    # Preserve readable front lighting; deepen the actual back volume, not overall darkness.
    for o in s.objects:
        if o.type=='LIGHT' and o.name.startswith('Tunnel amber bay light'):o.data.energy*=1.1
    s.world=s.world.copy()
    for o in next(c for c in s.collection.children if c.name.startswith('21 — Distant atmospheric scattering')).objects:
        if o.type=='MESH' and o.name.startswith('Distant haze volume'):
            for v in o.data.vertices:
                if v.co.y>90:v.co.y+=85
    # A material-only manifest records world scale and colour-space expectations for Three.js.
    matrixAfter={o.name:list(v for row in o.matrix_world for v in row) for o in s.objects if o.name in objectMatrices}
    cameraAfter={'matrix':list(v for row in s.camera.matrix_world for v in row),'lens':s.camera.data.lens,'sensorWidth':s.camera.data.sensor_width,'resolution':[1536,960]}
    assert cameraBefore==cameraAfter,'The approved camera must not change'
    assert all(matrixAfter[k]==v for k,v in objectMatrices.items()),'No existing object transform may change'
    contract={'source':'assets/environments/miner-citadel/miner-citadel.blend','polishedSource':'assets/environments/miner-citadel-polish/miner-citadel-polished.blend','cameraBefore':cameraBefore,'cameraAfter':cameraAfter,'existingObjectTransformsUnchanged':True,'assignedMeshCounts':count,'directedChippedPlates':chips,'texturePeriodMeters':3,'colorSpace':{'color':'sRGB','normal':'non-color / OpenGL tangent','orm':'non-color: R occlusion, G roughness, B metalness'},'baselineImageType':'Existing Cycles render, not a browser screenshot','browserScreenshots':'blocked by tool approval policy','bloomRuntimeDefault':False}
    (ART/'scene-lock.json').write_text(json.dumps(contract,indent=2))
    s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.samples=48;s.cycles.use_denoising=True;s.cycles.seed=71;s.render.resolution_x=1536;s.render.resolution_y=960;s.render.resolution_percentage=100;s.render.filepath=str(ART/'after-blender.png');s.render.image_settings.file_format='PNG'
    s['polish_stage']='Physical PBR surface families, directed geology, continuous water and lava; fixed camera'
    bpy.data.libraries.write(str(OUT/'miner-citadel-polished.blend'),{s},fake_user=True)
    start=time.perf_counter();bpy.ops.render.render(write_still=True);seconds=time.perf_counter()-start
    bpy.data.libraries.write(str(OUT/'miner-citadel-polished.blend'),{s},fake_user=True)
    (ART/'offline-render-stats.json').write_text(json.dumps({'renderer':'Cycles CPU','samples':48,'seconds':seconds,'resolution':[1536,960],'browserGpuMeasured':False},indent=2))
    RESULT={'source':str(OUT/'miner-citadel-polished.blend'),'after':str(ART/'after-blender.png'),'seconds':seconds,'cameraLocked':True,'surfaceCounts':count}
finally:bpy.context.window.scene=previous
