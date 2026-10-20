"""Stage B: connected extraction/transfer districts within the inspected A composition."""
import bpy,sys,math,json,time
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts/blender'))
from miner_environment_tools import Environment
OUT=ROOT/'assets/environments/miner-citadel-wide';ART=ROOT/'artifacts/miner-citadel-wide';previous=bpy.context.window.scene
if 'MINER_CITADEL_WIDE_A' not in bpy.data.scenes:
    with bpy.data.libraries.load(str(OUT/'wide-a.blend'),link=False) as (a,b):b.scenes=[a.scenes[0]]
    b.scenes[0].name='MINER_CITADEL_WIDE_A'
original=bpy.data.scenes['MINER_CITADEL_WIDE_A'];s=original.copy();s.name='MINER_CITADEL_WIDE_B';bpy.context.window.scene=s;e=Environment(s)
try:
    # Camera and retained hero are shared immutable assets. Only environment collections are new.
    envelopes=next(c for c in s.collection.children if c.name.startswith('W05'));s.collection.children.unlink(envelopes)
    # Independent geology copies allow actual side-adit cuts without changing stage A.
    shared=next(c for c in s.collection.children if c.name.startswith('W01'));s.collection.children.unlink(shared);geology=e.group('B01 — Cut and fractured bedrock')
    for o in shared.objects:
        copy=o.copy();copy.data=o.data.copy();geology.objects.link(copy)
    def mat(f):
        return bpy.data.materials.get('PBR/'+f) or next(m for m in bpy.data.materials if m.name.startswith('PBR/'+f+'.'))
    wood=mat('timber');metal=mat('iron');slate=mat('slate');shale=mat('iron-shale');stone=mat('dressed-stone')
    for prefix in ['MineEnv/Lantern warm panes','MineEnv/Ore wagon cyan fragments']:
        if not any(m.name.startswith(prefix) for m in bpy.data.materials):
            with bpy.data.libraries.load(str(ROOT/'assets/environments/miner-citadel-polish/miner-citadel-polished.blend'),link=False) as (a,b):b.materials=[next(name for name in a.materials if name.startswith(prefix))]
    amber=next(m for m in bpy.data.materials if m.name.startswith('MineEnv/Lantern warm panes'))
    cyan=next(m for m in bpy.data.materials if m.name.startswith('MineEnv/Ore wagon cyan fragments'))
    galleries=e.group('B02 — Extraction and transfer district frames');tracks=e.group('B03 — Connected ore transport');lamps=e.group('B04 — Working light fixtures');props=e.group('B05 — Hoist and storage');cuts=e.group('B06 — Side adit cutters')
    def lamp(x,y,z,scale=1):
        # Same forged fixture construction and materials as the approved native scene.
        e.box(lamps,'Forged lamp base',x,y,z-.38*scale,.65*scale,.58*scale,.12*scale,metal,.02)
        e.box(lamps,'Warm lamp panes',x,y,z,.42*scale,.37*scale,.62*scale,amber,.025)
        for dx,dy in [(-.26,-.23),(.26,-.23),(-.26,.23),(.26,.23)]:e.box(lamps,'Forged lamp stile',x+dx*scale,y+dy*scale,z,.055*scale,.055*scale,.8*scale,metal,.008)
        e.profile(lamps,'Forged pitched hood',[(x-.43*scale,z+.43*scale),(x,z+.72*scale),(x+.43*scale,z+.43*scale)],y,.7*scale,metal,.015)
        e.light(lamps,'Wide district amber lamp',(x,y-.3,z),260*scale,(1,.38,.095),.5*scale)
    def railpath(name,points):
        for a,b in zip(points,points[1:]):
            a=Vector(a);b=Vector(b);direction=(b-a).normalized();normal=Vector((-direction.y,direction.x,0));length=(b-a).length
            for side in [-1,1]:e.beam(tracks,name+' steel rail',a+normal*side*.95+Vector((0,0,.28)),b+normal*side*.95+Vector((0,0,.28)),.12,.16,metal)
            for i in range(math.ceil(length/.9)):
                p=a+(b-a)*((i+.5)/math.ceil(length/.9));e.beam(tracks,name+' sleeper',p-normal*1.5,p+normal*1.5,.2,.22,wood)
    def gallery(name,x,y,length,z,width,side,rail=False):
        # Cliff-facing back edge anchors the cantilever, open edge bears a continuous guardrail.
        inner=x-side*(width/2-.35);back=x+side*(width/2-.35)
        for j in range(math.ceil(length/.65)):
            yy=y+(j+.5)*length/math.ceil(length/.65);e.box(galleries,name+' deck board',x,yy,z,width,.6,.2,wood,.025)
        for xx in [x-width*.36,x+width*.36]:e.box(galleries,name+' continuous stringer',xx,y+length/2,z-.5,.38,length+.5,.65,wood)
        for j in range(math.ceil(length/4)+1):
            yy=y+min(length,j*4);e.box(galleries,name+' cross bearer',x,yy,z-.35,width+.5,.5,.55,wood)
            e.beam(galleries,name+' cliff socket brace',(back+side*1.6,yy,z-7),(inner,yy,z-.45),.42,.48,wood)
            e.box(galleries,name+' anchor shoe',back+side*1.6,yy,z-7.3,1.2,1.3,1,stone)
            e.box(galleries,name+' open side guard post',inner,yy,z+.9,.24,.25,1.9,wood)
            if j%2==0:
                e.box(galleries,name+' gallery roof column',back,yy,z+3,.45,.5,6,wood)
                e.beam(galleries,name+' roof knee',(back,yy,z+4),(inner+side*1.5,yy,z+6),.28,.32,wood)
                e.box(galleries,name+' canopy cross beam',x,yy,z+6,width+.8,.45,.4,wood)
        for zz in [z+.65,z+1.55]:e.box(galleries,name+' open side rail',inner,y+length/2,zz,.17,length,.17,wood)
        e.box(galleries,name+' overhead spine',back,y+length/2,z+6,.4,length,.45,wood)
        for yy in [y+1,y+length*.55,y+length-1]:
            e.box(lamps,name+' lamp post',inner,yy,z+1.2,.24,.28,2.4,wood);lamp(inner,yy,z+2.8,1.1)
        if rail:railpath(name,[(x,y,z+.15),(x,y+length,z+.15)])
        return (inner,back)
    gallery('West lower extraction',-31,-13,32,8,11,-1,True)
    gallery('West cutting gallery',-37,14,29,22,11,-1,True)
    gallery('West crown scaffold',-45,39,30,35,12,-1)
    gallery('East receiving yard',33,-10,28,6,13,1,True)
    gallery('East transfer hall',39,21,33,22,15,1,True)
    gallery('East upper hoist gallery',46,49,33,38,13,1)
    gallery('Rear extraction railway',-29,75,39,23,9,-1,True)
    # Retaining shelves make anchor sockets visibly part of continuous rock volumes.
    for name,x,y,z,w,d in [('West lower bedrock',-37,0,.5,10,35),('West middle socket ledge',-43,28,14,12,34),('East receiving socket',42,4,-1,14,33),('East middle socket',49,38,14,16,40),('Rear shelf',-36,94,15,12,46)]:
        e.rock(geology,name,[(x-w/2,y-d/2),(x+w*.5,y-d*.47),(x+w*.4,y+d/2),(x-w*.45,y+d*.47)],[(z-7,1,0,0),(z-1,.96,0,0),(z,.88,0,0)],slate)
    def stair(name,a,b,width=2.6):
        a=Vector(a);b=Vector(b);run=Vector((b.x-a.x,b.y-a.y,0));normal=Vector((-run.y,run.x,0)).normalized();count=math.ceil(abs(b.z-a.z)/.45)
        for j in range(count):
            p=a+(b-a)*(j/(count-1));o=e.box(galleries,name+' supported tread',p.x,p.y,p.z,width,run.length/count+.1,.2,wood,.02);o.rotation_euler.z=math.atan2(-run.x,run.y)
        for sign in [-1,1]:
            e.beam(galleries,name+' stair stringer',a+normal*sign*width*.45-Vector((0,0,.25)),b+normal*sign*width*.45-Vector((0,0,.25)),.28,.4,wood)
            e.beam(galleries,name+' handrail',a+normal*sign*width*.45+Vector((0,0,1.4)),b+normal*sign*width*.45+Vector((0,0,1.4)),.15,.17,wood)
    stair('West access ramp',(-32,-9,.5),(-31,2,8))
    stair('West cutting access',(-30,2,8),(-35,22,22))
    stair('West crown access',(-37,29,22),(-42,48,35))
    stair('East receiving access',(32,-9,.5),(33,3,6))
    stair('East transfer access',(34,4,6),(37,28,22))
    stair('East upper service',(40,29,22),(44,56,38))
    # Transfer route follows grades and shared landings; no rails floating over the chasm.
    railpath('West ore grade',[(-34,-9,.5),(-31,2,8),(-31,18,8)])
    railpath('East ore grade',[(34,-9,.5),(33,4,6),(33,17,6)])
    # Structural trestles carry the two short ore grades onto the established viaduct.
    for side in [-1,1]:
        points=[(side*34,-9,.5),(side*(31 if side<0 else 33),3,8 if side<0 else 6)]
        for sideOffset in [-1.5,1.5]:e.beam(galleries,'Ore incline continuous girder',(points[0][0]+sideOffset,points[0][1],points[0][2]-.3),(points[1][0]+sideOffset,points[1][1],points[1][2]-.3),.36,.5,wood)
        for j in range(5):
            t=j/4;x=points[0][0]*(1-t)+points[1][0]*t;y=-9+12*t;z=.5*(1-t)+points[1][2]*t
            e.box(galleries,'Ore grade founded trestle',x,y,z-1.3,3.8,.5,.5,wood)
            for dx in [-1.5,1.5]:e.beam(galleries,'Ore grade rock anchored strut',(x+dx,y,z-1),(x+dx+side*4,y,z-7),.35,.4,wood)
    # Rear suspension crossing, safely behind the citadel silhouette.
    y=94;z=30;a=-34;b=40
    for i in range(100):
        t=(i+.5)/100;x=a+(b-a)*t;zz=z-.9*math.sin(math.pi*t);e.box(galleries,'Rear suspended deck plank',x,y,zz,.7,3.2,.18,wood,.02)
    for yy in [y-1.45,y+1.45]:
        for xx in [a,b]:
            e.box(galleries,'Suspension tower founded upright',xx,yy,z+4,.65,.65,13,wood)
            e.beam(galleries,'Suspension tower buttress',(xx,yy,z+6),(xx+(-5 if xx<0 else 5),yy,z-3),.5,.55,wood)
        nodes=[]
        for i in range(17):
            t=i/16;xx=a+(b-a)*t;cableZ=z+10-8*math.sin(math.pi*t);nodes.append((xx,yy,cableZ));deckZ=z-.9*math.sin(math.pi*t)
            e.beam(galleries,'Suspension iron dropper',(xx,yy,deckZ),(xx,yy,cableZ),.07,.07,metal)
            if i%4==0:lamp(xx,yy,deckZ+2,1.1)
        for aa,bb in zip(nodes,nodes[1:]):e.beam(galleries,'Load bearing suspension chain',aa,bb,.12,.12,metal)
        e.beam(galleries,'Suspension anchoring chain',(a,yy,z+10),(a-10,yy,z-4),.14,.14,metal);e.beam(galleries,'Suspension anchoring chain',(b,yy,z+10),(b+10,yy,z-4),.14,.14,metal)
    stair('Rear workings ascent',(-29,99,23),(-34,94,30))
    gallery('Rear receiving landing',41,89,13,30,8,1)
    # Industrial hoist is located on the east transfer yard, linked to upper workings.
    hx,hy,hz=40,31,22
    for dx in [-3,3]:
        for dy in [-3,3]:
            e.box(props,'Hoist headframe leg',hx+dx,hy+dy,hz+8,.7,.8,16,wood)
            e.box(props,'Hoist bedrock footing',hx+dx,hy+dy,hz-.2,1.6,1.6,.7,stone)
        e.beam(props,'Hoist frame X brace',(hx+dx,hy-3,hz+1),(hx+dx,hy+3,hz+15),.4,.45,wood)
        e.beam(props,'Hoist frame reverse brace',(hx+dx,hy+3,hz+1),(hx+dx,hy-3,hz+15),.4,.45,wood)
    for dz in [6,15]:e.box(props,'Headframe bearing beam',hx,hy,hz+dz,7.5,7,.55,wood)
    for xx in [hx-.8,hx+.8]:e.beam(props,'Vertical cage chain',(xx,hy,hz+.7),(xx,hy,hz+14),.09,.09,metal)
    e.box(props,'Ore cage load platform',hx,hy,hz+1,2.4,2.2,.25,metal)
    for xx in [hx-1.1,hx+1.1]:
        for yy in [hy-1,hy+1]:e.box(props,'Cage steel frame',xx,yy,hz+2.5,.12,.12,3,metal)
    e.box(props,'Cage crown',hx,hy,hz+4,2.5,2.3,.16,metal);lamp(hx-3,hy-3,hz+7,1.2)
    # Open receiving sheds share the same deck, rather than arbitrary decorative buildings.
    for name,x,y,z,w,d in [('West sorting shed',-31,10,8,8,7),('East ore warehouse',38,45,22,10,7),('Upper repair bay',47,65,38,9,8)]:
        for dx in [-w/2,w/2]:
            for dy in [-d/2,d/2]:e.box(props,name+' frame post',x+dx,y+dy,z+2.7,.45,.5,5.4,wood)
        e.profile(props,name+' pitched plank roof',[(x-w*.6,z+5.2),(x,z+7),(x+w*.6,z+5.2)],y,d+1,wood,.02)
        e.beam(props,name+' gable brace',(x-w/2,y-d/2,z+3.8),(x+w/2,y-d/2,z+5.5),.25,.28,wood)
        for xx,yy in [(x-w*.3,y),(x+w*.3,y+1),(x,y+2)]:
            e.box(props,'Stored timber ore crate',xx,yy,z+.7,1.7,1.6,1.4,wood)
            for dz in [.25,1.1]:e.box(props,'Crate front batten',xx,yy-.85,z+dz,1.85,.12,.16,wood)
        lamp(x-w/2,y-d/2,z+3.4,1)
    # Mesoscale geology: explicit rockfall ribs and split beds follow the district terrace breaks.
    ribs=[(-42,-9,0,6,9,18),(-45,17,17,5,8,14),(-51,40,30,7,12,18),(-28,64,8,6,11,16),(-42,103,24,8,15,25),(39,-9,-8,7,11,20),(46,15,8,8,10,17),(54,39,27,6,13,18),(59,68,36,9,14,24),(35,117,20,8,15,32)]
    for i,(x,y,z,w,d,h) in enumerate(ribs):
        side=-1 if x<0 else 1
        e.rock(geology,'Coherent fault buttress',[(x-w*.5,y-d*.5),(x+w*.46,y-d*.48),(x+w*.5,y+d*.24),(x+w*.1,y+d*.5),(x-w*.45,y+d*.4)],[(z,1,0,0),(z+h*.26,.95,-side*.3,0),(z+h*.34,.77,-side*.7,0),(z+h*.62,.83,-side*.4,0),(z+h*.7,.63,side*.3,0),(z+h,.4,side,0)],shale if i in [0,3,6] else slate)
    # Actual carved side passages, arch supports, floor and repeated inner collars.
    for name,x,y,z in [('West cutting adit',-37,32,22),('East transfer adit',43,43,22),('Rear extraction adit',-29,108,23)]:
        r=2.4;spring=3.2;outline=[(x-r,z-.3),(x-r,z+spring)]+[(x+r*math.cos(math.pi-i*math.pi/12),z+spring+r*math.sin(math.pi-i*math.pi/12)) for i in range(1,13)]+[(x+r,z-.3)]
        cutter=e.profile(cuts,name+' carving solid',outline,y+8,22,slate,0);cutter.hide_render=True;cutter.hide_set(True)
        for rock in list(geology.objects):
            if rock==cutter:continue
            coords=[rock.matrix_world@Vector(v) for v in rock.bound_box]
            if max(v.x for v in coords)<x-r or min(v.x for v in coords)>x+r or max(v.y for v in coords)<y-3 or min(v.y for v in coords)>y+19 or max(v.z for v in coords)<z:continue
            mod=rock.modifiers.new('Designed side adit subtraction','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
        e.box(galleries,name+' supported floor',x,y+7,z-.3,5.5,21,.6,stone)
        for yy in [y-1,y+4,y+9,y+14]:
            for xx in [x-r-.2,x+r+.2]:e.box(galleries,name+' socketed collar post',xx,yy,z+1.5,.5,.55,3.2,wood)
            e.arch(galleries,name+' true arch collar',x,yy,z+spring,r,.42,.65,wood,7)
        railpath(name,[(x,y-3,z+.1),(x,y+17,z+.1)]);lamp(x-r,y,z+3.5,.9);lamp(x+r,y+9,z+3.5,.8)
    # Crystal clusters occupy surveyed high contrast shelves, not the central architecture.
    for x,y,z,h in [(-29,1,10,2),(-43,36,26,3.5),(-52,56,42,4),(30,12,9,2.7),(47,27,28,3.6),(53,66,45,4.2),(-25,122,35,5)]:
        for dx,dy,scale in [(-.8,0,.65),(.3,.3,1),(1.2,.1,.52)]:
            xx=x+dx;yy=y+dy;w=.42*scale;e.rock(geology,'Angular exposed mineral crystal',[(xx-w,yy-w),(xx+w,yy-w),(xx+w,yy+w),(xx-w,yy+w)],[(z,1,0,0),(z+h*scale*.75,1,.1,0),(z+h*scale,.03,.1,0)],cyan)
        e.light(lamps,'Wide crystal blue radiance',(x,y-1,z+1.7),650,(.06,.55,1),1.5)
    # Existing near-right shelf gains only a small working edge, leaving lower centre open.
    gallery('Near right survey ledge',24,-79,8,-.5,7,1)
    # New meshes get the same physically scaled UV convention, no material rewrite.
    for group in [geology,galleries,tracks,lamps,props]:
        for o in group.objects:
            if o.type!='MESH' or o.data.uv_layers.get('Physical metres'):continue
            uv=o.data.uv_layers.new(name='Physical metres');uv.active_render=True
            for p in o.data.polygons:
                axis=max(range(3),key=lambda i:abs(p.normal[i]));axes=[i for i in range(3) if i!=axis]
                for i in p.loop_indices:v=o.data.vertices[o.data.loops[i].vertex_index].co;uv.data[i].uv=(v[axes[0]]/3,v[axes[1]]/3)
    s['wide_stage']='B';s.cycles.samples=32;s.render.filepath=str(ART/'B-environment-architecture-blender.png')
    bpy.context.view_layer.update();assert s.camera==original.camera,'A/B camera must be identical'
    lock=json.loads((ART/'stage-a-composition.json').read_text())['heroOriginalMatrices'];hero=next(c for c in s.collection.children if c.name.startswith('01'))
    assert all([float(v) for row in o.matrix_world for v in row]==lock[o.name] for o in hero.all_objects),'Hero asset was modified'
    report={'stage':'B','cameraSharedWithA':True,'heroMatricesUnchanged':True,'districts':['West extraction: levels 8/22/35m','East receiving/transfer/hoist: levels 6/22/38m','Rear workings: 23m, suspension crossing 30m'],'connectivity':'Grade tracks connect to retained viaduct; switchback stairs connect decks; rear suspension anchors terminate in bedrock','newGeometryObjects':sum(len(g.objects) for g in [geology,galleries,tracks,lamps,props]),'browserCapture':'blocked; native image explicitly labelled','materialsReused':True}
    (ART/'stage-b-architecture.json').write_text(json.dumps(report,indent=2));bpy.data.libraries.write(str(OUT/'wide-b.blend'),{s},fake_user=True)
    start=time.perf_counter();bpy.ops.render.render(write_still=True);(ART/'stage-b-render.json').write_text(json.dumps({'seconds':time.perf_counter()-start,'renderer':'Cycles CPU','samples':32,'resolution':[1536,960]},indent=2));RESULT={'render':s.render.filepath,**report}
finally:bpy.context.window.scene=previous
