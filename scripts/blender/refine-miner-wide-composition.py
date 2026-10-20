"""Correct stage A after viewing its first render, before any infrastructure detail."""
import bpy,json,time,math
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets/environments/miner-citadel-wide';ART=ROOT/'artifacts/miner-citadel-wide';previous=bpy.context.window.scene
if 'MINER_CITADEL_WIDE_A' not in bpy.data.scenes:
    with bpy.data.libraries.load(str(OUT/'wide-a.blend'),link=False) as (a,b):b.scenes=[a.scenes[0]]
    b.scenes[0].name='MINER_CITADEL_WIDE_A'
s=bpy.data.scenes['MINER_CITADEL_WIDE_A'];bpy.context.window.scene=s
try:
    old=ART/'A-wide-blockout-blender.png'
    if old.exists():old.rename(ART/'A0-rejected-camera-blender.png')
    s.camera.location=(0,-112,25);target=Vector((0,12,2));s.camera.rotation_euler=(target-s.camera.location).to_track_quat('-Z','Y').to_euler();s.camera.data.lens=38;s['wide_target']=list(target)
    c=next(c for c in s.collection.children if c.name.startswith('W01'))
    for o in c.objects:
        if o.name.startswith('West extraction cliff'):o.location.x-=7
        elif o.name.startswith('East transfer terraces'):o.location.x+=7
        elif o.name.startswith('Citadel west bedrock shoulder'):
            for v in o.data.vertices:
                if v.co.z>13:v.co.z=13+(v.co.z-13)*.52;v.co.y+=5
        elif o.name.startswith('Citadel east buried ridge'):
            for v in o.data.vertices:
                if v.co.z>14:v.co.z=14+(v.co.z-14)*.58;v.co.y+=7
    # Relief belongs to the macro cliff: fault terraces are connected to its body.
    for o in c.objects:
        if not ('cliff' in o.name.lower() or 'terraces' in o.name.lower() or 'karst' in o.name.lower()):continue
        # Horizontal bedding planes shift coherently along the wall, carving broad alcoves.
        side=-1 if 'West' in o.name else 1
        for v in o.data.vertices:
            inner=abs(v.co.x)<57
            if inner:
                band=math.floor((v.co.z+4)/11)
                setback=[0,1.1,-1.2,2.0,-.3,1.6][band%6]
                v.co.x+=side*setback
    basin=next(o for o in s.objects if o.name.startswith('Broad molten basin'))
    poly=[(-50,-94),(-22,-93),(-12,-69),(-17,-40),(-24,-15),(-32,18),(-47,11)]
    for v,(x,y) in zip(basin.data.vertices,poly):v.co=(x,y,-18)
    # Reshape the lower drop into this basin rather than leaving an airborne segment.
    for o in s.objects:
        if o.name.startswith('Lower lava drop'):
            for v in o.data.vertices:
                if v.co.z<-20:v.co.z=-18
        elif o.name.startswith('Mid canyon catchment'):
            for v in o.data.vertices:v.co.z=-17
    plan=json.loads((OUT/'composition.json').read_text());plan['camera'].update(position=[0,-112,25],target=[0,12,2],lensMm=38);plan['lava'].update(footprint=poly,surfaceZ=-18);plan['screenIntent']['citadel']='measured stage-A bounds; approximately x 34–66%, y 26–60%';plan['screenIntent']['bridge']='horizontal axis near 57–62%';(OUT/'composition.json').write_text(json.dumps(plan,indent=2))
    bpy.context.view_layer.update();hero=next(c for c in s.collection.children if c.name.startswith('01'))
    projected=[world_to_camera_view(s,s.camera,o.matrix_world@Vector(v)) for o in hero.all_objects if o.type=='MESH' for v in o.bound_box]
    bounds={'left':min(v.x for v in projected),'right':max(v.x for v in projected),'top':1-max(v.y for v in projected),'bottom':1-min(v.y for v in projected)}
    report=json.loads((ART/'stage-a-composition.json').read_text());report['camera']=plan['camera'];report['projectedHeroBounds']=bounds;report['heroScreenWidth']=bounds['right']-bounds['left'];report['iteration']='A1: aim lower, widen district clearances, expose chasm, reduce smooth buried shoulders';(ART/'stage-a-composition.json').write_text(json.dumps(report,indent=2))
    bpy.data.libraries.write(str(OUT/'wide-a.blend'),{s},fake_user=True);s.render.filepath=str(ART/'A-wide-blockout-blender.png');start=time.perf_counter();bpy.ops.render.render(write_still=True)
    (ART/'stage-a-render.json').write_text(json.dumps({'seconds':time.perf_counter()-start,'renderer':'Cycles CPU','samples':24,'resolution':[1536,960]},indent=2));RESULT={'render':s.render.filepath,'bounds':bounds}
finally:bpy.context.window.scene=previous
