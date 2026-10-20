"""Final composition corrections after reviewing 04; keep the result as a native Blender scene."""
import bpy,sys,math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts/blender'))
from miner_environment_tools import Environment
previous=bpy.context.window.scene;s=bpy.data.scenes['MINER_CITADEL_ENVIRONMENT'];bpy.context.window.scene=s;e=Environment(s)
try:
    rock=bpy.data.materials['MineEnv/Fractured graphite'];warm=bpy.data.materials['MineEnv/Iron-bearing schist'];deep=bpy.data.materials['MineEnv/Blue distant slate'];wood=bpy.data.materials['MineEnv/Dark ancient timber'];metal=bpy.data.materials['MineEnv/Oxidised rail steel']
    c=e.group('22 — Final geological silhouette')
    for o in s.collection.children['15 — Pressure fractures and buried citadel'].objects:
        if o.name.startswith(('Left roof overburden','Right roof overburden')):o.hide_render=True
    formations=[
      ('Left slipped shoulder lower',[(-21,3),(-17,-2),(-13,-1),(-12,4),(-14,10),(-21,11)],[(9,1,0,0),(15.7,1,0,0),(17,.8,-.4,.3)],warm),
      ('Left slipped shoulder middle',[(-19,3),(-16,-1),(-12,1),(-12,5),(-17,8)],[(15,1,0,0),(19.5,1,0,0),(21,.7,-.6,1)],rock),
      ('Left shoulder top fracture',[(-19,7),(-15,4),(-12,5),(-13,11),(-19,12)],[(19,1,0,0),(23,1,0,0),(25,.6,-.2,1)],rock),
      ('Right shoulder basal rock',[(13,3),(19,-1),(23,4),(21,12),(14,12)],[(8,1,0,0),(16.5,1,0,0),(18,.82,.5,.5)],rock),
      ('Right upper shoulder',[ (14,8),(19,4),(24,10),(21,18),(15,17)],[(16,1,0,0),(22,1,0,0),(24,.65,1,1)],rock),
    ]
    for name,outline,layers,mat in formations:e.rock(c,name,outline,layers,mat)
    # A few broad fractures make those shoulder planes read as layered rock, not upright slabs.
    for side,x,y,z in [(-1,-16,-1,13),(-1,-15,1,18),(1,18,0,15),(1,20,5,20)]:
        e.rock(c,'Rock shoulder split face',[(x-2,y-1),(x+1.8,y-1.4),(x+2.4,y+1.2),(x-1.7,y+1.7)],[(z-1.7,1,0,0),(z+1.3,.88,side*.15,0)],rock)
    # Cold background rock shafts occupy the actual spaces above and behind the fortress.
    for x,y,z,w in [(-8,39,29,4),(9,48,33,5),(-2,73,39,6)]:
        e.rock(c,'Deep cavern hanging formation',[(x-w/2,y-3),(x+w*.4,y-4),(x+w/2,y+3),(x-w*.3,y+4)],[(z-7,.3,0,0),(z,1,0,0),(z+18,1.25,0,0)],deep)
        e.light(c,'Cold distant geological rim',(x,y-4,z-2),750,(.08,.35,.8),4)
    # Slightly broaden the adapted citadel; source gate and its successful arch are preserved.
    anchor=next(o for o in s.collection.children['01 — Citadel / independent gate source copy'].objects if o.type=='EMPTY');anchor.scale.x=1.15
    fg=s.collection.children['18 — Foreground working platforms']
    for y in [-38.8,-35.4]:
        e.beam(fg,'Near platform continuous rock anchor',(7,y,-1.8),(21,y,-1.8),.5,.65,wood)
        e.beam(fg,'Near platform load bearing diagonal',(20,y,-7),(8,y,-1.9),.45,.5,wood)
    # Lower crossing rests on the intermediate rock shelves at both ends, with trestles below.
    crossing=e.group('23 — Lower ravine industrial crossing')
    for i in range(41):e.box(crossing,'Ravine crossing timber plank',-10+i*.5,-25,-7,.45,2.8,.2,wood,.025)
    for y in [-26.2,-23.8]:
        e.box(crossing,'Ravine crossing continuous beam',0,y,-7.3,21,.4,.6,wood)
        for x in [-10,-5,0,5,10]:
            e.box(crossing,'Ravine crossing guard post',x,y,-6.2,.2,.2,1.6,wood)
        e.box(crossing,'Ravine crossing handrail',0,y,-5.5,21,.15,.16,wood)
    for x in [-6,6]:
        for y in [-26,-24]:e.box(crossing,'Rock founded trestle leg',x,y,-13,.55,.6,12,wood)
    for x in [-6,6]:e.beam(crossing,'Lower bridge trestle brace',(x,-26,-16),(x,-24,-8),.35,.4,wood)
    # Suspension support visibly reaches the cliff above the right hanging lantern.
    lamps=s.collection.children['17 — Lantern network and chains']
    e.beam(lamps,'Right suspension bearing beam',(17,-11,26.8),(28,-11,26.8),.55,.65,wood)
    e.beam(lamps,'Right suspension triangular brace',(26,-11,22),(18,-11,26.5),.4,.45,wood)
    # Small finished mining props are placed on working surfaces, not scattered in the frame.
    props=e.group('24 — Ore wagons and mining supplies');ore=e.emission('Ore wagon cyan fragments',(.015,.32,.44),1.0)
    def wagon(cx,y,z):
        e.box(props,'Wagon undercarriage',cx,y,z-.45,2.4,1.6,.3,metal)
        for sy in [-1,1]:e.box(props,'Ore wagon plank side',cx,y+sy*.8,z+.25,2.5,.14,1.2,wood)
        for sx in [-1,1]:e.box(props,'Ore wagon end',cx+sx*1.2,y,z+.25,.16,1.6,1.2,wood)
        for sx in [-1,1]:
            for sy in [-1,1]:
                e.box(props,'Wagon forged corner strap',cx+sx*1.24,y+sy*.74,z+.25,.14,.17,1.4,metal,.025)
                # Wheel discs and hub geometry are real meshes, aligned along the axle.
                verts=[]
                for yy in [y+sy*.94-.07,y+sy*.94+.07]:
                    for k in range(10):a=k*math.pi*2/10;verts.append((cx+sx*.8+.29*math.cos(a),yy,z-.64+.29*math.sin(a)))
                faces=[tuple(reversed(range(10))),tuple(range(10,20))]+[(k,(k+1)%10,(k+1)%10+10,k+10) for k in range(10)]
                e.mesh(props,'Cast iron mine wagon wheel',verts,faces,metal,.02)
        for j in range(9):
            xx=cx-.75+(j%3)*.7;yy=y-.4+(j//3)*.38
            e.rock(props,'Wagon broken ore',[(xx-.2,yy-.2),(xx+.27,yy-.15),(xx+.13,yy+.25),(xx-.24,yy+.12)],[(z+.45,1,0,0),(z+.8,.65,0,0)],ore if j%3==0 else rock)
    wagon(-26,-9.6,1.0);wagon(26,-9.6,1.0)
    for cx,y,z in [(9,-36,-.8),(-20,-3,5.9),(21,-1,9.9)]:
        e.box(props,'Mining supply crate',cx,y,z,1.15,1.1,1.3,wood,.055)
        for zz in [z-.45,z+.45]:e.box(props,'Crate front cross batten',cx,y-.57,zz,1.28,.12,.15,wood,.02)
        for xx in [cx-.45,cx+.45]:e.box(props,'Crate corner iron',xx,y-.62,z,.08,.08,1.3,metal,.015)
    # Fog fills the depth between rock pillars without hiding the bridge or the portal.
    atmosphere=s.collection.children['21 — Distant atmospheric scattering'];fog=bpy.data.materials['MineEnv/Ravine low mist']
    e.box(atmosphere,'Deep central ravine atmosphere',0,-18,-11,27,28,12,fog,0)
    e.light(atmosphere,'Cool light through lower ravine',(1,-13,-10),650,(.14,.3,.5),5)
    e.light(atmosphere,'Distant cavern blue atmospheric opening',(0,39,30),12000,(.13,.36,.7),22,'AREA',(0,4,21))
    # Window temperature is amber rather than opaque white, keeping its metal housing readable.
    amber=bpy.data.materials['MineEnv/Lantern warm panes'];p=amber.node_tree.nodes['Principled BSDF'];p.inputs['Emission Color'].default_value=(1,.2,.012,1);p.inputs['Emission Strength'].default_value=3.5
    s.camera.rotation_euler=(Vector((0,3,.4))-s.camera.location).to_track_quat('-Z','Y').to_euler()
    focus=bpy.data.objects.new('Focus — citadel portal stone',None);s.collection.objects.link(focus);focus.location=(0,-2,7)
    s.camera.data.dof.use_dof=True;s.camera.data.dof.focus_object=focus;s.camera.data.dof.aperture_fstop=1.8
    s['production_stage']='05 full Blender environment composition, final preview before high resolution'
    e.save('05-composition-polish.blend');e.render('05-composition-polish.png',40,1200)
    RESULT={'blend':'assets/environments/miner-citadel/05-composition-polish.blend','render':'artifacts/miner-citadel/05-composition-polish.png'}
finally:bpy.context.window.scene=previous
