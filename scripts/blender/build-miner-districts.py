"""Specific inhabited frontages: replace blank side walls, keep the approved hero/camera/materials."""
import bpy,sys,math,json,time
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts/blender'))
from miner_environment_tools import Environment
OUT=ROOT/'assets/environments/miner-citadel-districts';ART=ROOT/'artifacts/miner-citadel-districts';plan=json.loads((OUT/'plan.json').read_text());previous=bpy.context.window.scene
source=bpy.data.scenes.get('MINER_CITADEL_WIDE_B')
if not source:
 with bpy.data.libraries.load(str(ROOT/'assets/environments/miner-citadel-wide/wide-b.blend'),link=False) as (a,b):b.scenes=[a.scenes[0]]
 source=b.scenes[0]
s=source.copy();s.name='MINER_CITADEL_DISTRICTS';bpy.context.window.scene=s;e=Environment(s)
try:
 keep=['01','03','04','08','13','15','16','25','W06','W07','B07']
 for c in list(s.collection.children):
  if not any(c.name.startswith(k) for k in keep):s.collection.children.unlink(c)
 def mat(name):return bpy.data.materials.get(name) or next(m for m in bpy.data.materials if m.name.startswith(name+'.'))
 stone=mat('PBR/dressed-stone');slate=mat('PBR/slate');shale=mat('PBR/iron-shale');wood=mat('PBR/timber');iron=mat('PBR/iron');molten=mat('PBR/lava');water=mat('PBR/water');amber=mat('MineEnv/Lantern warm panes');cyan=mat('MineEnv/Ore wagon cyan fragments')
 rock=e.group('D01 — Excavated bedrock and grounded foundations');west=e.group('D02 — West occupied three-level frontage');east=e.group('D03 — East asymmetric occupied frontage');links=e.group('D04 — Real access routes and ore rail');rooms=e.group('D05 — Deep side passages');rear=e.group('D06 — Receding inhabited galleries');fixtures=e.group('D07 — Attached work lamps');lava=e.group('D08 — Connected lava ravine');roof=e.group('D09 — Broken cave vault');foreground=e.group('D10 — Foreground split ledges');wings=e.group('D11 — Citadel lateral fortifications')
 # One bedrock floor under the foundations, never a visible wall across the image.
 e.mesh(rock,'Deep ravine bedrock floor',[(-90,-110,-43),(90,-110,-43),(90,310,-43),(-90,310,-43)],[(0,1,2,3)],slate)
 # Geological masses sit BEHIND occupied rooms; gaps are deliberately retained between buttresses.
 for name,foot,layers in [
  ('West behind extraction chambers',[(-70,31),(-49,24),(-45,48),(-22,55),(-22,79),(-69,93)],[(-35,1,0,0),(7,1,0,0),(19,.95,-1,0),(22,.89,-2,0),(30,.9,-1,0),(35,.72,-3,2),(48,.66,-4,4)]),
  ('West outside retaining buttress',[(-64,-18),(-50,-20),(-49,17),(-55,28),(-67,23)],[(-40,1,0,0),(-9,1,0,0),(4,.83,0,0),(11,.79,-1,0),(19,.61,-2,2),(29,.48,-3,2)]),
  ('West upper adit backstone',[(-50,49),(-19,49),(-17,67),(-28,83),(-57,72)],[(0,1,0,0),(21,1,0,0),(29,.94,-1,0),(33,.75,-2,1),(45,.53,-3,2)]),
  ('East rear water ridge',[(55,11),(66,9),(71,55),(58,80),(52,62),(54,38)],[(-38,1,0,0),(1,1,0,0),(13,.94,0,0),(18,.85,1,0),(29,.87,0,0),(34,.73,2,0),(43,.6,2,2),(52,.43,3,4)]),
  ('East chamber backstone',[(30,31),(52,27),(57,54),(61,77),(37,83),(27,56)],[(-31,1,0,0),(6,1,0,0),(13,.94,1,0),(17,.86,2,0),(28,.74,3,7),(37,.59,5,11),(45,.43,6,15)]),
  ('Rear west gallery cliff',[(-48,76),(-15,78),(-12,108),(-28,124),(-54,114)],[(-22,1,0,0),(17,1,0,0),(24,.89,0,0),(28,.81,-1,1),(44,.68,-2,5),(61,.45,-4,9)]),
  ('Rear east gallery cliff',[(12,93),(41,87),(55,122),(29,147),(14,126)],[(-26,1,0,0),(21,1,0,0),(29,.84,0,0),(34,.75,1,1),(49,.68,3,4),(67,.41,4,7)])]:e.rock(rock,name,foot,layers,slate)
 # The original viaduct footings now actually bear on bedrock above the lava channel.
 for i,x in enumerate([-30,-22.5,-15,-7.5,0,7.5,15,22.5,30]):
  e.rock(rock,'Viaduct natural foundation '+str(i),[(x-3.3,-14),(x+3.4,-13),(x+3,-4),(x-3.2,-3)], [(-43,1,0,0),(-30,.9,0,0),(-23,.82,0,0),(-17.7,.72,0,0)],slate)
 def post(c,name,x,y,z0,z1,w=.42):return e.box(c,name,x,y,(z0+z1)/2,w,w,z1-z0,wood,.025)
 def lamp(x,y,z,c=fixtures):
  e.box(c,'Forged fixture base',x,y,z-.38,.65,.58,.12,iron,.02);e.box(c,'Existing warm glass panes',x,y,z,.42,.37,.62,amber,.02)
  for dx,dy in [(-.26,-.23),(.26,-.23),(-.26,.23),(.26,.23)]:e.box(c,'Forged fixture stile',x+dx,y+dy,z,.055,.055,.8,iron,.008)
  e.profile(c,'Pitched iron fixture hood',[(x-.43,z+.43),(x,z+.72),(x+.43,z+.43)],y,.7,iron,.015)
  # No new point or area lights in this first pass: baseline render settings stay comparable.
 def guard(c,name,x0,x1,y,z):
  count=math.ceil((x1-x0)/3.2)
  for i in range(count+1):post(c,name+' guard post',x0+(x1-x0)*i/count,y,z,z+1.6,.2)
  for dz in [.65,1.4]:e.box(c,name+' rail', (x0+x1)/2,y,z+dz,x1-x0,.16,.16,wood,.02)
 def deck(c,name,x0,x1,y0,y1,z,kind='wood'):
  if kind=='stone':e.box(c,name+' stone platform',(x0+x1)/2,(y0+y1)/2,z-.35,x1-x0,y1-y0,.7,stone,.06)
  else:
   count=math.ceil((x1-x0)/.65)
   for i in range(count):e.box(c,name+' deck board',x0+(i+.5)*(x1-x0)/count,(y0+y1)/2,z-.1,(x1-x0)/count-.035,y1-y0,.2,wood,.025)
   for yy in [y0+.65,(y0+y1)/2,y1-.65]:e.box(c,name+' continuous girder',(x0+x1)/2,yy,z-.5,x1-x0+.4,.48,.65,wood)
  guard(c,name,x0,x1,y0-.15,z)
 def arcade(c,name,x0,x1,y,z,floor,depth,bays):
  width=(x1-x0)/bays;r=width*.37;spring=z-1.7-r;top=z-.35
  deck(c,name,x0,x1,y,y+depth,z,'stone')
  for i in range(bays+1):
   x=x0+i*width;w=width-2*r
   height=spring-floor;courses=math.ceil(height/1.2)
   for j in range(courses):e.box(c,name+' coursed bearing pier',x,y+.45,floor+(j+.5)*height/courses,w,2.2,height/courses-.035,stone,.05)
   # Full-depth longitudinal bearing wall separates real rooms.
   e.box(c,name+' room dividing wall',x,y+depth/2,floor+(z-floor)/2,.85,depth,z-floor,stone,.035)
   e.box(c,name+' stone founding pad',x,y+.45,floor-.45,w+1.1,3.1,.9,stone)
  for i in range(bays):
   x=x0+(i+.5)*width;e.arch(c,name+' load bearing arch',x,y+.4,spring,r,.75,2.1,stone,11)
   arc=[(x+r*.99*math.cos(math.pi-j*math.pi/16),spring+r*.99*math.sin(math.pi-j*math.pi/16)) for j in range(17)]
   e.profile(c,name+' arch spandrel',arc+[(x+r,top),(x-r,top)],y+.6,1.6,stone,.025)
   e.box(c,name+' room floor',x,y+depth/2,floor-.2,width-.9,depth,.4,stone)
   # Rear collar makes the room visibly deep even from the fixed front camera.
   e.arch(c,name+' inner vault collar',x,y+depth-1,spring,r,.55,.7,stone,9)
   post(c,name+' fixture bracket',x-r-.25,y-.8,floor+1,floor+3.1,.2);lamp(x-r-.25,y-1,floor+3.6)
  for x in [x0+1,x1-1]:post(c,name+' terrace lamp post',x,y-.15,z,z+2.1,.25);lamp(x,y-.15,z+2.6)
 def frame_gallery(c,name,x0,x1,y0,y1,z):
  deck(c,name,x0,x1,y0,y1,z)
  for i in range(math.ceil((x1-x0)/4)+1):
   x=min(x1,x0+i*4)
   e.box(c,name+' cross bearer',x,(y0+y1)/2,z-.5,.55,y1-y0+1,.6,wood)
   for yy in [y0+.4,y1-.4]:post(c,name+' gallery upright',x,yy,z,z+5.2,.4)
   e.box(c,name+' roof frame',x,(y0+y1)/2,z+5.2,.4,y1-y0+.6,.4,wood)
   e.beam(c,name+' supported knee',(x,y1+2,z-5),(x,y0+.3,z-.4),.4,.45,wood)
   e.box(c,name+' rock socket',x,y1+2,z-5.3,1.1,1.1,.9,stone)
  for yy in [y0+.4,y1-.4]:e.box(c,name+' header',(x0+x1)/2,yy,z+5.1,x1-x0,.4,.45,wood)
  # Partial roof sections leave the working bays and adits visible.
  for lo,hi in [(x0,x0+(x1-x0)*.27),(x1-(x1-x0)*.18,x1)]:
   for i in range(math.ceil((hi-lo)/.65)):
    x=lo+(i+.5)*(hi-lo)/math.ceil((hi-lo)/.65);e.beam(c,name+' sloped roof board',(x,y0-.5,z+5.2),(x,y1+.5,z+5.9),.6,.14,wood)
  for x in [x0+1,(x0+x1)/2,x1-1]:lamp(x,y0-.4,z+3)
 def stairs(name,points,c=links,width=2.4):
  for start,end in zip(points,points[1:]):
   a=Vector(start);b=Vector(end);run=Vector((b.x-a.x,b.y-a.y,0));length=run.length
   if length<.01:continue
   normal=Vector((-run.y,run.x,0)).normalized();count=max(2,math.ceil(max(abs(b.z-a.z)/.36,length/.6)))
   for i in range(count):
    p=a+(b-a)*i/(count-1);tangent=run.normalized();v=[p+normal*xx+tangent*yy+Vector((0,0,zz)) for xx,yy,zz in [(-width/2,-length/count/2,-.2),(width/2,-length/count/2,-.2),(width/2,length/count/2,-.2),(-width/2,length/count/2,-.2),(-width/2,-length/count/2,0),(width/2,-length/count/2,0),(width/2,length/count/2,0),(-width/2,length/count/2,0)]]
    e.mesh(c,name+' real tread',v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],wood,.015)
   for side in [-1,1]:
    offset=normal*side*(width/2-.1);e.beam(c,name+' stringer',a+offset-Vector((0,0,.3)),b+offset-Vector((0,0,.3)),.25,.35,wood)
    e.beam(c,name+' handrail',a+offset+Vector((0,0,1.3)),b+offset+Vector((0,0,1.3)),.13,.15,wood)
    for t in [0,.33,.66,1]:p=a+(b-a)*t+offset;post(c,name+' handrail post',p.x,p.y,p.z,p.z+1.3,.13)
 def rails(name,points,c=links):
  for aa,bb in zip(points,points[1:]):
   a=Vector(aa);b=Vector(bb);d=(b-a).normalized();n=Vector((-d.y,d.x,0));length=(b-a).length
   for side in [-1,1]:e.beam(c,name+' rail',a+n*.85*side+Vector((0,0,.28)),b+n*.85*side+Vector((0,0,.28)),.12,.15,iron)
   for i in range(math.ceil(length/.85)):
    p=a+(b-a)*(i+.5)/math.ceil(length/.85);e.beam(c,name+' sleeper',p-n*1.4,p+n*1.4,.18,.22,wood)
 def adit(name,x,y,z,depth,c=rooms):
  r=2.6;spring=z+3.4
  # Tunnel is an actual barrel shell with repeated collars, floor, side walls and distant back wall.
  e.box(c,name+' continuous floor',x,y+depth/2,z-.25,6.2,depth,.5,stone)
  for xx in [x-r-.45,x+r+.45]:e.box(c,name+' tunnel sidewall',xx,y+depth/2,z+1.7,.9,depth,3.4,stone)
  for i in range(9):
   a=i*math.pi/9;b=(i+1)*math.pi/9
   outline=[(x+rr*math.cos(t),spring+rr*math.sin(t)) for rr,t in [(r,a),(r+.8,a),(r+.8,b),(r,b)]];e.profile(c,name+' deep vault shell',outline,y+depth/2,depth,slate,.02)
  for yy in [y+.1,y+5,y+10,y+depth-1]:
   for xx in [x-r-.15,x+r+.15]:post(c,name+' inner timber support',xx,yy,z,spring,.35)
   e.arch(c,name+' timber arch collar',x,yy,spring,r-.12,.28,.45,wood,7)
  e.box(c,name+' distant chamber back',x,y+depth,z+2.5,6.1,.7,5,slate)
  rails(name+' ore line',[(x,y-2,z+.1),(x,y+depth-1,z+.1)])
  lamp(x-r,y-.6,z+3.8);lamp(x+r,y+depth*.65,z+3.8)
 # LEFT: three broad, readable frontages; the lower dock enters the stone rooms underneath the railway.
 arcade(west,'West railway terrace',-49,-19,-7,8,-6,15,3)
 deck(west,'West industrial dock',-47,-19,-24,-7,-6)
 for x in [-45,-36,-27,-20]:
  for yy in [-22,-9]:
   e.box(west,'Dock bedrock pier',x,yy,-15.5,1.5,1.8,18,stone)
   e.beam(west,'Dock triangular bearing brace',(x,yy,-12),(x+2.7,yy,-6.5),.45,.5,wood)
 e.rock(rock,'West dock foundation ridge',[(-51,-27),(-18,-26),(-18,-5),(-48,-3)],[(-43,1,0,0),(-30,.96,0,0),(-24,.84,-1,0)],shale)
 frame_gallery(west,'West upper occupied gallery',-49,-22,19,29,21)
 e.rock(rock,'West upper retaining bench',[(-53,28),(-20,28),(-19,46),(-53,45)],[(-10,1,0,0),(14,.98,0,0),(20,.92,0,0)],slate)
 rails('West middle ore railway',[(-47,-2,8.1),(-25,-2,8.1),(-22,1,8.1),(-22,6,8.1)])
 rails('West dock receiving track',[(-45,-17,-5.9),(-22,-17,-5.9)])
 stairs('West dock service stair',[(-20,-16,-6),(-27,-7,1),(-20,3,8)])
 stairs('West upper switchback',[(-23,6,8),(-34,7,14.5)])
 deck(links,'West stair intermediate landing',-35.5,-31.5,6,13,14.5)
 for x in [-35,-32]:post(links,'Landing founded upright',x,11,8,14.5,.4)
 stairs('West upper return flight',[(-33,12,14.5),(-23,22,21)])
 # RIGHT: broad lower masonry, offset suspended sorting deck, smaller rear high terrace.
 arcade(east,'East receiving vaults',23,49,-11,2,-10,16,3)
 frame_gallery(east,'East suspended sorting deck',31,54,14,24,15)
 arcade(east,'East high extraction terrace',35,58,39,29,20,11,3)
 for x in [37,45,55]:e.rock(rock,'High east terrace bedrock socket',[(x-3,38),(x+3,38),(x+4,51),(x-4,52)],[(-30,1,0,0),(9,.94,0,0),(19.8,.83,0,0)],slate)
 deck(east,'East lift lower approach',24,33,1,12,2,'stone')
 for x in [25,32]:e.box(east,'Lift approach bearing pier',x,9,-5,1.3,1.5,14,stone)
 deck(east,'East lift upper approach',27,34,12,18,15)
 stairs('East service stair',[ (26,1,2),(26,12,8.5),(33,18,15)])
 stairs('East upper stair',[(35,21,15),(45,40,29)])
 rails('East loading tracks',[(25,-5,2.1),(46,-5,2.1)])
 rails('East suspended sorting line',[(32,18,15.1),(52,18,15.1)])
 # Crystal niches are real masonry recesses; their back plane is several metres behind the mouth.
 for name,x,y,z in [('East mid mineral recess',49,25,15),('East upper mineral recess',39,51,29)]:
  for xx in [x-3.3,x+3.3]:e.box(east,name+' stone cheek',xx,y+2,z+2.5,1,5,5,stone)
  e.box(east,name+' deep rear wall',x,y+5,z+2.6,7,.9,5.2,slate);e.arch(east,name+' rock lintel',x,y+.4,z+3,3,.9,2,slate,7)
  for dx,dy,h in [(-1.1,1,2.3),(.3,2.5,3.7),(1.3,2,1.8)]:
   xx=x+dx;yy=y+dy;e.rock(east,'Exposed mineral inside recess',[(xx-.45,yy-.4),(xx+.45,yy-.4),(xx+.5,yy+.4),(xx-.4,yy+.45)],[(z,1,0,0),(z+h*.7,1,.15,0),(z+h,.02,.15,0)],cyan)
 # Citadel wings continue the retained architecture laterally, filling the SVG hero-complex zone.
 arcade(wings,'West citadel fortified wing',-29,-16.1,9,12,2,10,2)
 arcade(wings,'East citadel fortified wing',16.1,28,10,11,1,10,2)
 stairs('Gate to western wing',[(-17,2,0),(-19,10,2)])
 stairs('Gate to eastern wing',[(17,3,0),(19,10,1)])
 stairs('West railway to wing rooftop',[(-29.5,5,8),(-28.5,15,12)])
 stairs('Main bridge to west railway',[(-20,-8,0),(-20,5,8)])
 stairs('Main bridge to east receiving',[(18,-7,0),(23,-7,2)])
 for a in plan['adits']:adit(a['id'],*a['mouth'],a['depth'])
 # Background frontages remain visible above/around the retained hero, with a gap along the centre axis.
 frame_gallery(rear,'Rear west working frontage',-34,-9,64,75,25)
 frame_gallery(rear,'Rear east working frontage',10,35,79,90,30)
 for x,y,z in [(-31,72,25),(-13,72,25),(14,86,30),(31,86,30)]:post(rear,'Rear gallery anchored leg',x,y,z-8,z,.65)
 # Geometry of the ravine exposes lava under the main bridge, receding behind its stone supports.
 e.mesh(lava,'Left irregular lava basin',[(-52,-76,-22),(-31,-82,-22),(-19,-57,-22),(-18,-31,-22),(-6,-13,-22),(-11,15,-22),(-31,32,-22),(-47,7,-22)],[(0,1,2,3,4,5,6,7)],molten)
 e.mesh(lava,'Under viaduct lava tributary',[(-19,-19,-22),(3,-14,-22),(10,3,-22),(4,31,-22),(-1,48,-22),(-11,42,-22),(-12,17,-22),(-21,1,-22)],[(0,1,2,3,4,5,6,7)],molten)
 # Foreground is several separated blades and steps, not one wall hiding the workplaces.
 for name,foot,layers in [
  ('Near west framing blade',[(-36,-73),(-28,-76),(-25,-66),(-29,-54),(-38,-56)],[(-43,1,0,0),(-12,1,0,0),(-3,.73,-2,0),(4,.39,-3,0)]),
  ('West lower broken shelf',[(-37,-49),(-29,-51),(-23,-42),(-27,-31),(-38,-33)],[(-43,1,0,0),(-23,.94,0,0),(-17,.77,-1,0),(-12,.42,-2,0)]),
  ('Right near outer blade',[(26,-79),(36,-85),(44,-69),(39,-52),(29,-57)],[(-43,1,0,0),(-11,1,0,0),(-3,.8,2,0),(4,.43,3,0)]),
  ('Right separate work shelf',[(18,-59),(25,-63),(33,-52),(29,-39),(21,-40)],[(-43,1,0,0),(-19,.95,0,0),(-9,.8,1,0),(-5,.58,2,0)]),
  ('Right inner low rubble spur',[(10,-36),(16,-41),(23,-32),(20,-22),(12,-23)],[(-43,1,0,0),(-27,.94,0,0),(-19,.66,1,0),(-14,.38,2,0)])]:e.rock(foreground,name,foot,layers,shale if 'west' in name.lower() else slate)
 # Three deep natural roof arches replace the previous flat vertical columns.
 for name,y,spring,r,thickness,depth,shift in [('Near broken vault',66,16,36,7,13,-2),('Middle receding vault',123,18,42,9,16,5),('Far offset vault',210,22,49,11,21,-7)]:
  for i in range(9):
   a=i*math.pi/9;b=(i+1)*math.pi/9;da=[0,.7,-.4,.8,-.6,.3,-.2,.6,0][i]
   outline=[(shift+rr*math.cos(t),spring+rr*math.sin(t)+da) for rr,t in [(r,a),(r+thickness,a),(r+thickness,b),(r,b)]];e.profile(roof,name+' geological arch segment',outline,y,depth,slate,.06)
  for side in [-1,1]:
   x=shift+side*r;e.rock(roof,name+' irregular bearing rib',[(x-6,y-9),(x+6,y-8),(x+8,y+11),(x-7,y+15)],[(-22,1,0,0),(7,.94,0,0),(spring,.86,0,0)],slate)
 # Only coherent geological spans above edge districts; not a flat ceiling plane.
 for name,foot,layers in [
  ('West close vault root',[(-66,-17),(-50,-20),(-39,8),(-43,29),(-63,37)],[(30,.37,-3,0),(37,.68,-2,0),(49,1,0,0),(61,1,0,0)]),
  ('East close roof root',[(49,18),(66,13),(74,48),(61,68),(42,57)],[(37,.4,3,0),(44,.73,1,0),(58,1,0,0),(70,1,0,0)])]:e.rock(roof,name,foot,layers,slate)
 for x,y,z,w,h in [(-43,19,26,2.3,13),(-32,56,31,3.1,17),(-14,70,36,2.5,14),(8,76,38,3,12),(31,85,30,2.4,18),(46,44,32,2.7,13),(-29,126,35,3.4,22),(15,153,40,3.2,18)]:
  e.rock(roof,'Stratified vault pendant',[(x-w,y-w*.8),(x+w*.8,y-w),(x+w,y+w*.5),(x-w*.5,y+w)],[(z,.04,0,0),(z+h*.3,.4,.3,0),(z+h*.68,.68,0,0),(z+h,1,0,0)],slate)
 # UV scale is the established three metres, using the existing maps and materials.
 for group in [rock,west,east,links,rooms,rear,fixtures,lava,roof,foreground,wings]:
  for o in group.objects:
   if o.type!='MESH':continue
   uv=o.data.uv_layers.new(name='Physical metres');uv.active_render=True
   for p in o.data.polygons:
    axis=max(range(3),key=lambda i:abs(p.normal[i]));axes=[i for i in range(3) if i!=axis]
    for idx in p.loop_indices:v=o.matrix_world@o.data.vertices[o.data.loops[idx].vertex_index].co;uv.data[idx].uv=(v[axes[0]]/3,v[axes[1]]/3)
 s['wide_stage']='C';s['district_stage']='inhabited-frontages';bpy.context.view_layer.update()
 baseline=json.loads((ART/'baseline-contract.json').read_text());current={'cameraMatrix':[float(v) for row in s.camera.matrix_world for v in row],'lens':s.camera.data.lens,'sensor':s.camera.data.sensor_width,'resolution':[s.render.resolution_x,s.render.resolution_y,s.render.resolution_percentage],'engine':s.render.engine,'samples':s.cycles.samples,'viewTransform':s.view_settings.view_transform,'exposure':s.view_settings.exposure,'gamma':s.view_settings.gamma,'globalLightEnergy':{o.name:o.data.energy for o in s.objects if o.type=='LIGHT' and o.data.type=='AREA'}}
 assert baseline==current,'First-pass camera/render/global lighting must match the baseline exactly'
 projections=[]
 for p in plan['platforms']:
  a,b=p['bounds'];v=world_to_camera_view(s,s.camera,Vector(((a[0]+b[0])/2,(a[1]+b[1])/2,a[2])))
  projections.append({'id':p['id'],'centerUV':[v.x,1-v.y],'inFrame':0<v.x<1 and 0<v.y<1})
 report={'baselineSettingsUnchanged':True,'settings':current,'platformProjections':projections,'note':'Projection inside frame does not prove visibility; inspect the rendered first pass before proceeding.','materialSystemReused':True,'nativeOnly':'Browser capture blocked by tool approval policy'}
 (ART/'first-pass-contract.json').write_text(json.dumps(report,indent=2));s.render.filepath=str(ART/'01-inhabited-frontages-blender.png');bpy.data.libraries.write(str(OUT/'districts-first-pass.blend'),{s},fake_user=True)
 start=time.perf_counter();bpy.ops.render.render(write_still=True);(ART/'first-pass-render.json').write_text(json.dumps({'seconds':time.perf_counter()-start,'renderer':'Cycles CPU','samples':s.cycles.samples,'resolution':[1536,960]},indent=2));RESULT={'render':s.render.filepath,'settingsUnchanged':True,'platforms':projections}
finally:bpy.context.window.scene=previous
