"""Finish only after inspecting the fixed-camera occupied-frontage render."""
import bpy,sys,math,json,time
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts/blender'))
from miner_environment_tools import Environment
OUT=ROOT/'assets/environments/miner-citadel-districts';ART=ROOT/'artifacts/miner-citadel-districts';plan=json.loads((OUT/'plan.json').read_text());previous=bpy.context.window.scene
s=bpy.data.scenes.get('MINER_CITADEL_DISTRICTS')
if not s:
 with bpy.data.libraries.load(str(OUT/'districts-first-pass.blend'),link=False) as (a,b):b.scenes=[a.scenes[0]]
 s=b.scenes[0];s.name='MINER_CITADEL_DISTRICTS'
bpy.context.window.scene=s;e=Environment(s)
try:
 def group(prefix):return next(c for c in s.collection.children if c.name.startswith(prefix))
 def mat(name):return bpy.data.materials.get(name) or next(m for m in bpy.data.materials if m.name.startswith(name+'.'))
 wood=mat('PBR/timber');metal=mat('PBR/iron');stone=mat('PBR/dressed-stone');slate=mat('PBR/slate');shale=mat('PBR/iron-shale');water=mat('PBR/water');amber=mat('MineEnv/Lantern warm panes');cyan=mat('MineEnv/Ore wagon cyan fragments')
 rock=group('D01');rear=group('D06');fixtures=group('D07');details=e.group('D12 — Industrial workstations and stocked yards');bridges=e.group('D13 — Grounded secondary crossings');watergroup=e.group('D14 — Continuous stepped waterfall');cutters=e.group('D15 — Hidden actual excavation solids')
 def box(name,x,y,z,w,d,h,m=wood,c=details):return e.box(c,name,x,y,z,w,d,h,m,.025)
 def beam(name,a,b,w=.3,d=.35,m=wood,c=details):return e.beam(c,name,a,b,w,d,m)
 def lamp(x,y,z):
  box('Working fixture foot',x,y,z-.38,.65,.58,.12,metal,fixtures);box('Working fixture warm glazing',x,y,z,.42,.37,.62,amber,fixtures)
  for dx,dy in [(-.26,-.23),(.26,-.23),(-.26,.23),(.26,.23)]:box('Working fixture iron stile',x+dx,y+dy,z,.055,.055,.8,metal,fixtures)
  e.profile(fixtures,'Working lamp pitched hood',[(x-.43,z+.43),(x,z+.72),(x+.43,z+.43)],y,.7,metal,.015)
 # Replace visually dangling legs with diagonal frames that enter the actual rear rock volumes.
 for o in list(rear.objects):
  if any(k in o.name for k in ['supported knee','rock socket','anchored leg']):bpy.data.objects.remove(o,do_unlink=True)
 for x in [-33,-24,-15]:
  for yy in [64.5,74]:beam('West rear gallery bedrock anchored truss',(x,yy,24.4),(x-1,84,15),.65,.7,c=bridges)
  box('West rear anchor shoe',x-1,84,15,1.8,2.1,1.5,stone,bridges)
 for x in [13,23,33]:
  for yy in [79.5,88]:beam('East rear gallery bedrock anchored truss',(x,yy,29.4),(max(18,x),103,21),.65,.7,c=bridges)
  box('East rear anchor shoe',max(18,x),103,21,1.8,2.1,1.5,stone,bridges)
 # End landings and stair foundations fill real gaps in the initial access layout.
 box('West landing bearing extension',-33.5,9.5,7.65,7,7,.7,stone,bridges)
 for x in [-36,-31]:beam('West landing founded cantilever',(x,5,1),(x,12,7.5),.55,.6,c=bridges)
 box('East service stair turning landing',26,12,8.35,3.5,3.5,.3,wood,bridges)
 for x in [24.7,27.3]:beam('East landing founded upright',(x,11,2),(x,11,8.2),.4,.45,c=bridges)
 # Adit foundations/overburden hide freestanding tunnel shells and provide real excavated interiors.
 for a in plan['adits']:
  x,y,z=a['mouth'];depth=a['depth'];w=4
  e.rock(rock,a['id']+' grounded passage foundation',[(x-w,y-.2),(x+w,y-.2),(x+w+1,y+depth),(x-w-1,y+depth)],[(-43,1,0,0),(z-6,.94,0,0),(z-.3,.9,0,0)],slate)
 for label,x,y,z,depth in [('West ore excavated shoulder',-43,9,8,19),('East ore excavated shoulder',43,6,2,18)]:
  for side in [-1,1]:
   xx=x+side*5.3;e.rock(rock,label+' side bed',[(xx-2.2,y+.8),(xx+2.2,y+1.5),(xx+2.6,y+depth),(xx-2.7,y+depth+1)],[(z-8,1,0,0),(z+3,.95,0,0),(z+6,.74,side*.3,0),(z+9,.4,side*.6,1)],slate)
  e.rock(rock,label+' overburden',[(x-7,y+3),(x+7,y+4),(x+8,y+depth+1),(x-8,y+depth+2)],[(z+7,.85,0,0),(z+9,1,0,0),(z+12,.72,0,1)],slate)
 # Explicit tunnel-shaped subtraction cuts the host geology all the way to the real back wall.
 excavations=[]
 for a in plan['adits']:
  x,y,z=a['mouth'];r=2.62;spring=z+3.4;depth=a['depth']
  outline=[(x-r,z-.12),(x-r,spring)]+[(x+r*math.cos(math.pi-i*math.pi/16),spring+r*math.sin(math.pi-i*math.pi/16)) for i in range(1,17)]+[(x+r,z-.12)]
  cutter=e.profile(cutters,a['id']+' volume cutter',outline,y+(depth-1)/2,depth+3,slate,0);cutter.hide_render=True;cutter.hide_set(True)
  for o in list(rock.objects):
   coords=[o.matrix_world@Vector(v) for v in o.bound_box]
   if max(v.x for v in coords)<x-r or min(v.x for v in coords)>x+r or max(v.y for v in coords)<y-2 or min(v.y for v in coords)>y+depth+1 or max(v.z for v in coords)<z-.1 or min(v.z for v in coords)>spring+r:continue
   mod=o.modifiers.new('Actual excavated adit void','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter;excavations.append({'adit':a['id'],'host':o.name})
 # A real suspended route links the two existing distant platforms; a supported final stair changes level.
 start=Vector((-10,70,25));end=Vector((12,83,25));direction=(end-start).normalized();normal=Vector((-direction.y,direction.x,0));count=38
 for i in range(count):
  t=(i+.5)/count;p=start.lerp(end,t);p.z-=.45*math.sin(math.pi*t)
  beam('Rear suspension walking plank',p-normal*1.45,p+normal*1.45,.6,.16,c=bridges)
 for side in [-1,1]:
  for p in [start,end]:
   q=p+normal*side*1.3;beam('Rear suspension landing tower',q-Vector((0,0,1)),q+Vector((0,0,6)),.45,.5,c=bridges)
  nodes=[]
  for i in range(13):
   t=i/12;p=start.lerp(end,t)+normal*side*1.3;p.z+=5.5-3.6*math.sin(math.pi*t);nodes.append(p)
   q=start.lerp(end,t)+normal*side*1.3;q.z-=.45*math.sin(math.pi*t);beam('Rear bridge iron hanger',q,p,.06,.07,metal,bridges)
  for a,b in zip(nodes,nodes[1:]):beam('Rear bridge continuous suspension cable',a,b,.12,.12,metal,bridges)
  for p,anchor in [(nodes[0],(-17,75,24)),(nodes[-1],(18,90,29))]:beam('Rear bridge anchored backstay',p,anchor,.13,.14,metal,bridges)
 # Receiving ramp floor is part of the existing rear east gallery footprint.
 for i in range(16):
  t=i/15;box('Rear receiving staircase tread',12+8*t,83,25+5*t,.58,2.7,.18,wood,bridges)
 for yy in [81.8,84.2]:
  beam('Rear receiving stair bearer',(12,yy,24.7),(20,yy,29.7),.25,.35,c=bridges);beam('Rear receiving stair rail',(12,yy,26.2),(20,yy,31.2),.13,.15,c=bridges)
 # Winding heads/cages are in service landings, not arbitrary decorative towers.
 def wheel(name,x,y,z,r,axis='Y'):
  verts=[];n=16
  for yy in [y-.15,y+.15]:
   for i in range(n):t=i*math.tau/n;verts.append((x+r*math.cos(t),yy,z+r*math.sin(t)))
  faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
  e.mesh(details,name,verts,faces,metal,.025)
 def hoist(name,x,y,low,high):
  for dx in [-2,2]:
   for dy in [-2,2]:
    beam(name+' structural leg',(x+dx,y+dy,low),(x+dx,y+dy,high+4),.55,.6)
    box(name+' stone foot',x+dx,y+dy,low-.2,1.2,1.3,.5,stone)
   beam(name+' side diagonal',(x+dx,y-2,low+.5),(x+dx,y+2,high+3.5),.35,.4)
   beam(name+' reverse diagonal',(x+dx,y+2,low+.5),(x+dx,y-2,high+3.5),.35,.4)
  for zz in [low+3,high,high+3.6]:box(name+' frame crosshead',x,y,zz,5,4.7,.5)
  wheel(name+' winding drum',x,y,high+3.8,1.2)
  for dx in [-.8,.8]:beam(name+' suspension chain',(x+dx,y,low+.4),(x+dx,y,high+3.4),.08,.08,metal)
  box(name+' cage base',x,y,low+.5,2.4,2.5,.2,metal)
  for dx in [-1.1,1.1]:
   for dy in [-1.1,1.1]:beam(name+' cage upright',(x+dx,y+dy,low+.5),(x+dx,y+dy,low+3),.1,.1,metal)
  box(name+' cage crown',x,y,low+3,2.4,2.5,.15,metal);lamp(x-2,y-2,low+3.5)
 hoist('West dock ore lift',-46,-11,-6,8)
 box('West lift railway landing',-46,-9,7.8,5,5,.4,wood,bridges)
 for x in [-48,-44]:beam('West lift landing founded brace',(x,-7,2),(x,-11,7.7),.4,.45,c=bridges)
 hoist('East receiving shaft',28,8,2,15)
 box('East cage upper landing',28,11,14.8,5,7,.4,wood,bridges)
 for y in [15,22]:beam('Right platform cliff suspension chain',(52,y,15),(60,y+14,37),.1,.1,metal,bridges)
 # A lower industrial gantry creates a distinct production scale above the lava, below the railway.
 for x in [-38,-25]:
  for y in [-22,-12]:beam('Dock ore unloading gantry column',(x,y,-6),(x,y,1.5),.55,.65)
  beam('Dock gantry triangle',(x,-22,-2),(x,-12,1.5),.38,.42)
 for y in [-22,-12]:box('Dock gantry travelling crane beam',-31.5,y,1.5,14,.55,.7)
 wheel('Dock crane pulley',-31,-22,1,.65);beam('Dock crane hoisting line',(-31,-22,1),(-31,-22,-4.5),.07,.07,metal)
 # Warehouses stay on the decks and leave the main routes open.
 def shed(name,x,y,z,w,d):
  for dx in [-w/2,w/2]:
   for dy in [-d/2,d/2]:beam(name+' post',(x+dx,y+dy,z),(x+dx,y+dy,z+4.2),.4,.45)
  for side in [-1,1]:
   e.mesh(details,name+' roof slope',[(x,y-d/2-.5,z+5.4),(x+side*(w/2+.5),y-d/2-.5,z+4.2),(x+side*(w/2+.5),y+d/2+.5,z+4.2),(x,y+d/2+.5,z+5.4)],[(0,1,2,3)],wood,.015)
  beam(name+' gable brace',(x-w/2,y-d/2,z+2.7),(x+w/2,y-d/2,z+4),.22,.25)
  lamp(x-w/2,y-d/2-.2,z+3.2)
 shed('East receiving store',39,-2,2,8,6)
 shed('West tool and timber bay',-34,24,21,7,6)
 def crate(x,y,z,w=1.3):
  box('Stacked mining supply crate',x,y,z+w/2,w,w,w)
  for dz in [.2,w-.2]:box('Crate facing batten',x,y-w/2-.06,z+dz,w+.12,.12,.14)
  for dx in [-w*.36,w*.36]:box('Crate iron strap',x+dx,y-w/2-.14,z+w/2,.08,.08,w,metal)
 for x,y,z in [(-39,-18,-6),(-37.5,-18,-6),(-39,-16.5,-6),(-39,-18,-4.7),(-28,4,8),(37,-1,2),(39,-1,2),(41,1,2),(36,21,15),(38,21,15),(53,45,29),(-31,70,25)]:crate(x,y,z)
 def wagon(x,y,z):
  box('Rail wagon load floor',x,y,z+.4,3.4,2.1,.25,metal)
  for yy in [y-1,y+1]:box('Ore wagon oak side',x,yy,z+1.1,3.5,.15,1.4)
  for xx in [x-1.7,x+1.7]:box('Ore wagon end wall',xx,y,z+1.1,.15,2.1,1.4)
  for dx in [-1.1,1.1]:
   for dy in [-1.1,1.1]:wheel('Ore wagon wheel',x+dx,y+dy,z+.05,.37)
  for dx,dy,h in [(-.8,0,.6),(.2,.4,.7),(.9,-.35,.55)]:e.rock(details,'Wagon angular ore load',[(x+dx-.5,y+dy-.4),(x+dx+.55,y+dy-.3),(x+dx+.4,y+dy+.5),(x+dx-.4,y+dy+.4)],[(z+1.4,1,0,0),(z+1.4+h,.3,.1,0)],slate)
 wagon(-33,-17,-5.55);wagon(-34,-2,8.45);wagon(29,-5,2.45);wagon(44,18,15.45)
 # Water descends OUTSIDE the deck footprints; this geometry uses the existing water material.
 waterpath=[(60,54,37),(60,40,23),(58,32,17),(57,20,7),(52,14,-13)]
 ridge=next(o for o in rock.objects if o.name.startswith('East rear water ridge'))
 # Remove a real open gully in the ridge instead of drawing water inside an opaque rock.
 cutter=e.box(cutters,'Watercourse gully excavation',58,40,19,14,45,50,slate,0);cutter.hide_render=True;cutter.hide_set(True)
 mod=ridge.modifiers.new('Excavated stepped watercourse','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
 for index,(aa,bb) in enumerate(zip(waterpath,waterpath[1:])):
  a=Vector(aa);b=Vector(bb);vertices=[];faces=[];rows=12;columns=6;width=[4.5,4.2,3.4,3.6][index]
  for row in range(rows+1):
   t=row/rows;p=a.lerp(b,t);p.y-=.7*math.sin(math.pi*t)
   for col in range(columns+1):
    u=col/columns;vertices.append(tuple(p+Vector(((u-.5)*width,(.09*math.sin(u*math.pi*4)+.035*math.sin(row*1.7))*math.sin(math.pi*u),0))))
  for row in range(rows):
   for col in range(columns):k=row*(columns+1)+col;faces.append((k,k+1,k+columns+2,k+columns+1))
  e.mesh(watergroup,'Continuous water curtain '+str(index),vertices,faces,water)
  if index<3:
   x,y,z=bb;e.mesh(watergroup,'Water terrace catchment',[(x-2.6,y-1.2,z),(x+2.7,y-1,z),(x+3.1,y+2.3,z),(x-2.5,y+2.9,z)],[(0,1,2,3)],water)
   e.rock(rock,'Watercourse retaining ledge',[(x-3.3,y-1),(x+3.3,y-1),(x+4,y+4),(x-3.6,y+4)],[(z-4,1,0,0),(z-.2,.9,0,0)],slate)
 e.mesh(watergroup,'Lower cold catchment pool',[(48,11,-13),(56,10,-13),(59,19,-13),(50,23,-13),(46,17,-13)],[(0,1,2,3,4)],water)
 e.rock(rock,'Lower pool stone shelf',[(46,9),(58,8),(61,21),(48,25),(44,18)],[(-43,1,0,0),(-18,.95,0,0),(-13.2,.91,0,0)],slate)
 # High cold minerals belong to roof fissures, retaining the previous lighting palette/materials.
 for x,y,z,h in [(-39,52,36,3.5),(-11,121,48,4.2),(34,117,43,4.7),(59,56,39,3.1)]:
  for dx,dy,scale in [(-1,0,.65),(.2,.4,1),(1.4,.2,.45)]:e.rock(details,'High roof fissure mineral',[(x+dx-.4,y+dy-.4),(x+dx+.4,y+dy-.4),(x+dx+.5,y+dy+.4),(x+dx-.4,y+dy+.5)],[(z,1,0,0),(z+h*scale*.72,1,.1,0),(z+h*scale,.02,.1,0)],cyan)
 # Missing roof/district connections are completed by actual paths terminating on the named decks.
 # A short side passage runs from upper west workings to the rear working frontage on a founded ledge.
 for i in range(40):
  t=(i+.5)/40;x=-23-10*t;y=28+36*t;z=21+4*t
  box('West rear access ledge plank',x,y,z,3.2,.82,.18,wood,bridges)
 for offset in [-1.35,1.35]:
  beam('West rear access continuous bearer',(-23+offset,28,20.7),(-33+offset,64,24.7),.35,.45,c=bridges)
  beam('West rear access guardrail',(-23+offset,28,22.4),(-33+offset,64,26.4),.14,.15,c=bridges)
 for i in range(7):
  t=i/6;x=-23-10*t;y=28+36*t;z=21+4*t
  beam('West rear ledge bedrock brace',(x,y,z-.3),(x-5,y+3,z-6),.4,.45,c=bridges)
 # Existing physical UV convention, including consistent vertical water UVs.
 for c in [rock,details,bridges,watergroup,fixtures]:
  for o in c.objects:
   if o.type!='MESH' or o.data.uv_layers.get('Physical metres'):continue
   uv=o.data.uv_layers.new(name='Physical metres');uv.active_render=True
   for p in o.data.polygons:
    axis=max(range(3),key=lambda i:abs(p.normal[i]));axes=[i for i in range(3) if i!=axis]
    for idx in p.loop_indices:
     v=o.matrix_world@o.data.vertices[o.data.loops[idx].vertex_index].co;uv.data[idx].uv=(v.x/3,v.z/3) if c==watergroup else (v[axes[0]]/3,v[axes[1]]/3)
 bpy.context.view_layer.update()
 baseline=json.loads((ART/'baseline-contract.json').read_text());assert [float(v) for row in s.camera.matrix_world for v in row]==baseline['cameraMatrix'];assert s.camera.data.lens==baseline['lens'];assert s.cycles.samples==baseline['samples'];assert s.view_settings.exposure==baseline['exposure']
 s['district_stage']='functional-complex';s.render.filepath=str(ART/'02-connected-mine-blender.png')
 bpy.data.libraries.write(str(OUT/'districts.blend'),{s},fake_user=True)
 report={'cameraUnchanged':True,'renderSettingsUnchanged':True,'newPointLights':0,'newAreaLights':0,'materialsReused':True,'excavations':excavations,'waterPath':waterpath,'connectionsCompleted':['West dock/rail lift','West rail/upper switchback','East receiving/sorting shaft','East sorting/upper stair','Rear west/east suspended bridge and arrival stair','Upper west/rear west ledge'],'browserCapture':'blocked by approval policy; images are explicitly native Blender renders'}
 (ART/'architecture-contract.json').write_text(json.dumps(report,indent=2));start=time.perf_counter();bpy.ops.render.render(write_still=True);(ART/'final-render.json').write_text(json.dumps({'seconds':time.perf_counter()-start,'renderer':'Cycles CPU','samples':s.cycles.samples,'resolution':[1536,960]},indent=2));RESULT={'render':s.render.filepath,'actualExcavationPairs':len(excavations),'cameraUnchanged':True}
finally:bpy.context.window.scene=previous
