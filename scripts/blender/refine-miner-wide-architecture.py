"""Screen-led B correction: fracture large faces and expose the functional hoist."""
import bpy,sys,math,time,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts/blender'))
from miner_environment_tools import Environment
OUT=ROOT/'assets/environments/miner-citadel-wide';ART=ROOT/'artifacts/miner-citadel-wide';previous=bpy.context.window.scene;s=bpy.data.scenes['MINER_CITADEL_WIDE_B'];bpy.context.window.scene=s;e=Environment(s)
try:
    old=ART/'B-environment-architecture-blender.png'
    if old.exists():old.rename(ART/'B0-before-rock-relief-blender.png')
    props=next(c for c in s.collection.children if c.name.startswith('B05'))
    for o in props.objects:
        if o.name.startswith(('Hoist ','Headframe ','Vertical cage','Ore cage','Cage ')):o.location.x-=5;o.location.y-=4
    geology=next(c for c in s.collection.children if c.name.startswith('B01'))
    bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();changed=[]
    for o in list(geology.objects):
        if not o.name.startswith(('West foreground escarpment','West extraction cliff','East near split cliff','East transfer terraces','Citadel west bedrock shoulder','Citadel east buried ridge')):continue
        # Evaluate real adit cuts first; relief changes the surface of this same rock, not floating debris.
        evaluated=bpy.data.meshes.new_from_object(o.evaluated_get(deps),depsgraph=deps);evaluated.update()
        vertices=[];faces=[]
        def vertex(p):vertices.append(tuple(p));return len(vertices)-1
        for face in evaluated.polygons:
            p=[evaluated.vertices[i].co.copy() for i in face.vertices];n=face.normal
            if len(p)!=4 or abs(n.z)>.64 or face.area<14:
                faces.append(tuple(vertex(v) for v in p));continue
            # Authored bedding sizes, with wide and narrow joints rather than a unit-cube grid.
            a,b,c,d=p;spanU=((b-a).length+(c-d).length)/2;spanV=((d-a).length+(c-b).length)/2
            nu=max(1,math.ceil(spanU/4.8));nv=max(1,math.ceil(spanV/4.1))
            def point(u,v):return a*(1-u)*(1-v)+b*u*(1-v)+c*u*v+d*(1-u)*v
            widths=[1,.71,1.23,.87,1.16];total=sum(widths[i%5] for i in range(nu));edges=[0]
            for i in range(nu):edges.append(edges[-1]+widths[i%5]/total)
            for row in range(nv):
                v0=row/nv;v1=(row+1)/nv
                for col in range(nu):
                    u0=edges[col];u1=edges[col+1]
                    border=[point(u0,v0),point(u1,v0),point(u1,v1),point(u0,v1)]
                    # Parallel fracture planes vary by geological course, not random mesh noise.
                    relief=[.6,1.05,.38,.82][row%4]
                    if spanU/nu<2 or spanV/nv<2:relief*=.4
                    inset=[point(u0+(u1-u0)*.13,v0+(v1-v0)*.18)+n*relief,point(u1-(u1-u0)*.11,v0+(v1-v0)*.13)+n*(relief*.82),point(u1-(u1-u0)*.2,v1-(v1-v0)*.16)+n*(relief*.93),point(u0+(u1-u0)*.09,v1-(v1-v0)*.12)+n*(relief*1.08)]
                    ids=[vertex(v) for v in border+inset];faces.append(tuple(ids[4:]))
                    for k in range(4):faces.append((ids[k],ids[(k+1)%4],ids[(k+1)%4+4],ids[k+4]))
        data=bpy.data.meshes.new(o.name+' integral fracture surface');data.from_pydata(vertices,[],faces);data.update()
        for m in o.data.materials:data.materials.append(m)
        o.data=data;o.modifiers.clear();uv=data.uv_layers.new(name='Physical metres');uv.active_render=True
        for face in data.polygons:
            axis=max(range(3),key=lambda i:abs(face.normal[i]));axes=[i for i in range(3) if i!=axis]
            for idx in face.loop_indices:v=o.matrix_world@data.vertices[data.loops[idx].vertex_index].co;uv.data[idx].uv=(v[axes[0]]/3,v[axes[1]]/3)
        changed.append({'name':o.name,'faces':len(data.polygons)})
    lighting=e.group('B07 — District readability lighting')
    e.light(lighting,'West inhabited cliff fill',(-22,-30,32),11000,(1,.57,.27),23,'AREA',(-35,24,21))
    e.light(lighting,'East industrial district fill',(24,-20,34),12500,(.55,.71,1),24,'AREA',(39,29,23))
    # Extend the visible lava chasm leftward by moving only the obstructing foreground escarpment.
    for o in geology.objects:
        if o.name.startswith('West foreground escarpment'):o.location.x-=6
    # Background vertical spines receive stepped geological profiles instead of uninterrupted pillars.
    background=next(c for c in s.collection.children if c.name.startswith('W02'));s.collection.children.unlink(background);own=e.group('B08 — Fractured far cavern profiles')
    for o in background.objects:
        copy=o.copy();copy.data=o.data.copy();own.objects.link(copy)
        if not o.name.startswith('Distant isolated geological spine'):continue
        for v in copy.data.vertices:
            z=v.co.z
            v.co.x+=1.8*math.floor(z/14)%5-2
    bpy.context.view_layer.update();s.render.filepath=str(ART/'B-environment-architecture-blender.png');bpy.data.libraries.write(str(OUT/'wide-b.blend'),{s},fake_user=True)
    start=time.perf_counter();bpy.ops.render.render(write_still=True);elapsed=time.perf_counter()-start
    (ART/'stage-b-render.json').write_text(json.dumps({'seconds':elapsed,'renderer':'Cycles CPU','samples':32,'resolution':[1536,960],'iteration':'B1: integrated cliff relief, exposed hoist, visible wider chasm'},indent=2));(ART/'stage-b-relief.json').write_text(json.dumps({'integralRockSurfaces':changed,'cameraUnchanged':True},indent=2));RESULT={'render':s.render.filepath,'seconds':elapsed,'surfaces':len(changed)}
finally:bpy.context.window.scene=previous
