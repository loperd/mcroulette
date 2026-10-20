"""Final corrections identified in the full-resolution render: crossing transform and visible water."""
import bpy,sys,math,time,json
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts/blender'))
from miner_environment_tools import Environment
previous=bpy.context.window.scene;s=bpy.data.scenes['MINER_CITADEL_ENVIRONMENT'];bpy.context.window.scene=s;e=Environment(s)
try:
    crossing=s.collection.children['23 — Lower ravine industrial crossing'];pivot=next(o for o in crossing.objects if o.type=='EMPTY')
    # Recover the unparented authoring matrices, then apply rotation about the intended pivot.
    originals={o:o.matrix_basis.copy() for o in crossing.objects if o!=pivot}
    pivot.rotation_euler=(0,0,0);bpy.context.view_layer.update()
    for o,m in originals.items():
        o.parent=pivot;o.matrix_parent_inverse=pivot.matrix_world.inverted();o.matrix_basis=m
    pivot.rotation_euler.z=math.radians(-7)
    water=s.collection.children['20 — Tiered subterranean waterfall'];material=bpy.data.materials['MineEnv/Cold falling water'];rock=bpy.data.materials['MineEnv/Fractured graphite']
    # Mesh-space curves follow the new sloping rock face; water is not a blue facade decal.
    for o in list(water.objects):
        if o.type!='MESH':continue
        o.data=o.data.copy();matrix=o.matrix_world.copy();o.data.transform(matrix);o.matrix_world=Matrix.Identity(4)
        center=sum((v.co for v in o.data.vertices),Vector())/len(o.data.vertices)
        upper=center.z>15
        for v in o.data.vertices:
            if upper:
                t=max(0,min(1,(27-v.co.z)/13));v.co.x+=-.5-3.7*t;v.co.y-=11
            else:v.co.x-=2.9;v.co.y-=6.5
    # A short stream crosses the rock shelf between the upper and lower drops.
    e.rock(water,'Waterfall bearing terrace lip',[(19.1,-10),(21.6,-9.4),(22,-14.8),(19.3,-15.5)],[(10.4,1.3,.5,0),(13.9,1,0,0)],rock)
    e.mesh(water,'Waterfall middle shelf pool',[(19.3,-9.8,14.05),(21.4,-9.8,14.05),(21.3,-14.4,14.05),(19.4,-14.4,14.05)],[(0,1,2,3)],material)
    e.rock(water,'Upper waterfall source cliff lip',[(22.7,-8.5),(25.7,-8.8),(26.3,-10.1),(23,-10.4)],[(24,1,0,0),(26.8,1,0,0)],rock)
    s['production_stage']='Final Blender environment / full-resolution corrections checked'
    s.render.filepath=str(ROOT/'artifacts/miner-citadel/miner-citadel-final.png')
    e.save('miner-citadel.blend');started=time.perf_counter();bpy.ops.render.render(write_still=True);elapsed=time.perf_counter()-started;e.save('miner-citadel.blend')
    path=ROOT/'artifacts/miner-citadel/render-stats.json';stats=json.loads(path.read_text());stats['renderSeconds']=elapsed;stats['sceneObjects']=len(s.objects);stats['visibleMeshObjects']=sum(o.type=='MESH' and not o.hide_render for o in s.objects);stats['meshVerticesBeforeModifiers']=sum(len(o.data.vertices) for o in s.objects if o.type=='MESH' and not o.hide_render);stats['meshPolygonsBeforeModifiers']=sum(len(o.data.polygons) for o in s.objects if o.type=='MESH' and not o.hide_render);stats['finalCorrections']=['Lower crossing pivot aligned with authored world position','Waterfall exposed on right rock terraces, with source lip and shelf pool'];path.write_text(json.dumps(stats,indent=2))
    # Validate that the delivered library can be read independently of the live session.
    with bpy.data.libraries.load(str(ROOT/'assets/environments/miner-citadel/miner-citadel.blend'),link=False) as (data,dest):
        validation={'scenes':data.scenes,'meshDatablocks':len(data.meshes),'imageDatablocks':len(data.images),'nativeFileReadable':True}
    (ROOT/'artifacts/miner-citadel/native-validation.json').write_text(json.dumps(validation,indent=2))
    RESULT={'renderSeconds':elapsed,'render':s.render.filepath,'source':'assets/environments/miner-citadel/miner-citadel.blend','validation':validation}
finally:bpy.context.window.scene=previous
