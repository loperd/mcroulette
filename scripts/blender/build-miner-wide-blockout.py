"""Authored wide composition. Retain hero assets, replace old surrounding layout by a measured plan."""
import bpy,sys,json,math,time
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts/blender'))
from miner_environment_tools import Environment
OUT=ROOT/'assets/environments/miner-citadel-wide';ART=ROOT/'artifacts/miner-citadel-wide'
plan=json.loads((OUT/'composition.json').read_text());previous=bpy.context.window.scene
with bpy.data.libraries.load(str(ROOT/'assets/environments/miner-citadel-polish/miner-citadel-polished.blend'),link=False) as (a,b):b.scenes=[a.scenes[0]]
s=b.scenes[0];s.name='MINER_CITADEL_WIDE_A';bpy.context.window.scene=s;e=Environment(s)
try:
    # Old environment is replaced, not buried under more objects. Retain authored architecture only.
    keep={'01','03','04','08','13','15','16','25'}
    removed=[]
    for c in list(s.collection.children):
        if c.name[:2] not in keep:
            removed.append(c.name);s.collection.children.unlink(c)
    hero=next(c for c in s.collection.children if c.name.startswith('01'))
    heroLock={o.name:[float(v) for row in o.matrix_world for v in row] for o in hero.all_objects}
    def material(f):
        return next(m for m in bpy.data.materials if m.name=='PBR/'+f)
    slate=material('slate');shale=material('iron-shale');stone=material('dressed-stone');wood=material('timber');iron=material('iron');lava=material('lava')
    c=e.group('W01 — Wide geological structure')
    # Six explicit longitudinal geological volumes; shelf setbacks follow coherent bedding.
    masses=[
      ('West foreground escarpment',[(-80,-83),(-29,-80),(-23,-62),(-29,-40),(-36,-19),(-76,-10)],[(-40,1,0,0),(-12,.98,0,0),(1,.94,-1,0),(7,.86,-2,0),(18,.88,-1,0),(24,.71,-6,0),(40,.77,-5,0),(49,.55,-8,0)],shale),
      ('West extraction cliff',[(-81,-13),(-35,-18),(-27,-1),(-30,24),(-25,53),(-39,94),(-83,100)],[(-38,1,0,0),(6,1,0,0),(9,.91,-1,0),(19,.96,0,0),(22,.82,-3,0),(33,.88,-3,0),(37,.71,-5,0),(59,.78,-5,0),(73,.54,-10,0)],slate),
      ('West rear karst',[(-89,82),(-40,65),(-31,87),(-36,125),(-19,154),(-42,199),(-91,210)],[(-28,1,0,0),(20,.97,0,0),(25,.85,-1,0),(44,.9,-2,0),(50,.72,-2,0),(81,.78,-7,0),(106,.45,-8,0)],slate),
      ('East near split cliff',[(30,-66),(53,-80),(86,-65),(90,-18),(49,-14),(32,-35)],[(-40,1,0,0),(-4,1,0,0),(4,.89,2,0),(12,.94,3,0),(16,.73,5,0),(33,.87,4,0),(47,.55,10,0)],slate),
      ('East transfer terraces',[(31,-12),(49,-25),(91,-9),(94,100),(40,109),(29,68),(27,31)],[(-38,1,0,0),(5,1,0,0),(8,.88,2,0),(22,.95,1,0),(25,.8,3,0),(38,.87,4,0),(43,.7,7,0),(70,.78,8,0),(88,.46,15,0)],shale),
      ('East deep ridge',[(37,111),(58,88),(105,117),(101,256),(36,263),(22,221),(31,165)],[(-30,1,0,0),(16,1,0,0),(28,.87,0,0),(49,.9,4,0),(57,.72,5,0),(93,.8,8,0),(119,.42,13,0)],slate),
    ]
    for name,foot,layers,mat in masses:e.rock(c,name,foot,layers,mat)
    # Buried shoulders keep the gate rooted while opening side sight-lines.
    for name,foot,layers in [
      ('Citadel west bedrock shoulder',[(-30,2),(-17,5),(-15,16),(-19,36),(-30,39)],[(-24,1,0,0),(10,1,0,0),(15,.8,0,0),(28,.75,-1,0),(38,.45,-3,0)]),
      ('Citadel east buried ridge',[(16,7),(28,3),(30,30),(23,49),(17,29)],[(-26,1,0,0),(9,1,0,0),(14,.83,1,0),(25,.76,2,0),(34,.42,2,0)])]:e.rock(c,name,foot,layers,slate)
    # Ceiling buttresses leave a deep central slot, no flat lid.
    roof=e.group('W02 — Vault spans and distant silhouettes')
    for name,foot,layers in [
      ('Near west roof buttress',[(-71,-74),(-33,-79),(-19,-49),(-24,-11),(-59,6) ],[(36,.37,-10,0),(48,.73,-5,0),(65,1,0,0),(87,1,0,0)]),
      ('East broken vault',[(24,-34),(63,-64),(97,-12),(76,72),(34,83),(19,45)],[(51,.4,10,0),(65,.82,3,0),(87,1,0,0),(101,1,0,0)]),
      ('Rear west hanging rib',[(-56,90),(-21,78),(-8,114),(-23,157),(-63,170)],[(56,.24,-8,0),(72,.76,-3,0),(98,1,0,0),(118,1,0,0)]),
      ('Far cavern offset crown',[(-53,222),(-9,201),(42,224),(60,310),(-51,328)],[(64,.68,0,0),(96,1,0,0),(134,.83,0,0)])]:e.rock(roof,name,foot,layers,slate)
    for x,y,w,z,h in [(-24,139,15,-18,78),(19,185,18,-22,107),(-9,264,24,-28,116),(41,300,29,-25,132)]:
        e.rock(roof,'Distant isolated geological spine',[(x-w/2,y-9),(x+w*.45,y-11),(x+w/2,y+13),(x-w*.4,y+19)],[(z,1,0,0),(z+h*.45,.89,0,0),(z+h*.7,.72,2,0),(z+h,.31,1,0)],slate)
    floor=e.group('W03 — Chasm banks and near framing')
    e.rock(floor,'Ravine distant floor',[(-94,-111),(88,-111),(88,165),(-94,165)],[(-45,1,0,0),(-42,1,0,0)],slate)
    for name,foot,layers,mat in [
      ('Near left shattered lip',[(-35,-100),(-20,-99),(-12,-84),(-19,-72),(-36,-73)],[(-42,1,0,0),(-8,1,0,0),(-3,.76,0,0),(3,.52,-2,0)],shale),
      ('Near right camera ledge',[(12,-92),(24,-104),(42,-94),(40,-72),(23,-66),(14,-74)],[(-43,1,0,0),(-11,1,0,0),(-6,.91,0,0),(1,.68,1,0),(7,.46,3,0)],slate),
      ('East lower working bedrock',[(11,-42),(20,-49),(30,-40),(34,-17),(19,-13),(12,-25)],[(-42,1,0,0),(-14,1,0,0),(-10,.82,1,0),(-5,.61,2,0)],slate),
      ('West viaduct anchored abutment',[(-43,-14),(-29,-16),(-25,-4),(-34,10),(-47,3)],[(-43,1,0,0),(-8,1,0,0),(-1,.8,-2,0)],slate),
      ('East viaduct anchored abutment',[(27,-16),(44,-12),(47,10),(31,9),(25,-2)],[(-43,1,0,0),(-7,1,0,0),(-1,.81,2,0)],slate),
    ]:e.rock(floor,name,foot,layers,mat)
    flow=e.group('W04 — Deep lava basin')
    polygon=plan['lava']['footprint'];z=plan['lava']['surfaceZ'];e.profile # basin has explicit irregular footprint
    e.mesh(flow,'Broad molten basin below fractured banks',[(x,y,z) for x,y in polygon],[tuple(range(len(polygon)))],lava)
    # Reservoir descends in physical levels toward the foreground basin.
    for name,poly,z in [('West feeder shelf',[(-48,-20),(-36,-19),(-28,-35),(-31,-48),(-44,-43)],-13),('Mid canyon catchment',[(-39,-43),(-29,-46),(-23,-61),(-28,-68),(-40,-60)],-19)]:
        e.mesh(flow,name,[(x,y,z) for x,y in poly],[tuple(range(len(poly)))],lava)
    e.mesh(flow,'Upper lava drop',[(-36,-34,-13),(-30,-36,-13),(-29,-46,-19),(-36,-44,-19)],[(0,1,2,3)],lava)
    e.mesh(flow,'Lower lava drop',[(-29,-59,-19),(-24,-60,-19),(-18,-75,-25),(-26,-73,-25)],[(0,1,2,3)],lava)
    districts=e.group('W05 — A district envelopes')
    for name,x,y,z,w,d in [('West lower extraction deck',-34,7,8,18,18),('West upper cutting bench',-38,24,22,17,23),('West crown gallery',-44,41,35,17,23),('East ore receiving deck',34,1,6,16,18),('East transfer yard',38,29,22,20,23),('East upper hoist gallery',44,54,38,20,28),('Rear workings',-30,85,23,18,28)]:
        e.box(districts,name,x,y,z-.5,w,d,1,wood,0)
    light=e.group('W06 — Wide spatial lighting')
    e.light(light,'Wide cold upper key',(-18,-15,64),34000,(.43,.64,1),45,'AREA',(0,25,10))
    e.light(light,'Wide front readable fill',(2,-82,30),19000,(.68,.75,1),38,'AREA',(0,5,12))
    e.light(light,'West lava bounce',(-30,-60,-16),11000,(1,.24,.045),20,'AREA',(-25,-10,8))
    e.light(light,'West mine work light',(-40,9,20),5500,(1,.51,.2),16,'AREA',(-29,17,15))
    e.light(light,'East shaft cold rim',(35,77,54),22000,(.18,.52,1),30,'AREA',(16,20,12))
    e.light(light,'Far cavern blue depth',(0,173,63),36000,(.22,.47,1),45,'AREA',(0,101,36))
    e.light(light,'Citadel broad amber fill',(-7,-26,20),5800,(1,.61,.3),15,'AREA',(0,0,10))
    for x,y,z in [(-30,-70,-21),(-34,-41,-15),(-38,-22,-9)]:e.light(light,'Lava reflected radiance wide',(x,y,z),1600,(1,.2,.025),3)
    # Subtle real-depth volume; not postprocessing or a replacement for silhouettes.
    haze=e.group('W07 — Distant atmosphere')
    m=bpy.data.materials.new('Wide depth volume');m.use_nodes=True;n=m.node_tree.nodes;n.clear();p=n.new('ShaderNodeVolumePrincipled');p.inputs['Color'].default_value=(.25,.38,.55,1);p.inputs['Density'].default_value=.0035;out=n.new('ShaderNodeOutputMaterial');m.node_tree.links.new(p.outputs['Volume'],out.inputs['Volume'])
    e.box(haze,'Cold deep cavern atmosphere',0,188,38,205,252,185,m,0)
    cam=bpy.data.objects.new('Wide mine composition camera',bpy.data.cameras.new('Wide 42mm camera'));s.collection.objects.link(cam);cam.location=plan['camera']['position'];target=Vector(plan['camera']['target']);cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=42;cam.data.sensor_width=36;cam.data.clip_end=600;s.camera=cam
    s['wide_target']=list(target);s['wide_stage']='A';s['runtime_fog_near']=155;s['runtime_fog_far']=440
    s.world=s.world.copy();s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.samples=24;s.cycles.use_denoising=True;s.render.resolution_x=1536;s.render.resolution_y=960;s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG';s.compositing_node_group=None
    # Three-metre UV convention preserved; no new material system.
    for collection in list(s.collection.children):
        if not collection.name.startswith('W'):continue
        for o in collection.all_objects:
            if o.type!='MESH':continue
            uv=o.data.uv_layers.new(name='Physical metres');uv.active_render=True
            for face in o.data.polygons:
                axis=max(range(3),key=lambda i:abs(face.normal[i]));axes=[i for i in range(3) if i!=axis]
                for i in face.loop_indices:v=o.data.vertices[o.data.loops[i].vertex_index].co;uv.data[i].uv=(v[axes[0]]/3,v[axes[1]]/3)
    bpy.context.view_layer.update()
    vertices=[world_to_camera_view(s,cam,o.matrix_world@Vector(v)) for o in hero.all_objects if o.type=='MESH' for v in o.bound_box]
    bounds={'left':min(v.x for v in vertices),'right':max(v.x for v in vertices),'top':1-max(v.y for v in vertices),'bottom':1-min(v.y for v in vertices)}
    report={'stage':'A','camera':plan['camera'],'projectedHeroBounds':bounds,'heroScreenWidth':bounds['right']-bounds['left'],'heroOriginalMatrices':heroLock,'removedOldCollections':removed,'browserCapture':'blocked by approval policy; native render is explicitly labelled'}
    (ART/'stage-a-composition.json').write_text(json.dumps(report,indent=2))
    bpy.data.libraries.write(str(OUT/'wide-a.blend'),{s},fake_user=True)
    s.render.filepath=str(ART/'A-wide-blockout-blender.png');start=time.perf_counter();bpy.ops.render.render(write_still=True)
    (ART/'stage-a-render.json').write_text(json.dumps({'seconds':time.perf_counter()-start,'renderer':'Cycles CPU','samples':24,'resolution':[1536,960]},indent=2))
    RESULT={'scene':s.name,'render':s.render.filepath,'heroScreenBounds':bounds}
finally:bpy.context.window.scene=previous
