"""Composition pass: reuse gate source, author geological volumes, bridge, tunnel and lava."""
import bpy,sys,math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts/blender'))
from miner_environment_tools import Environment
previous=bpy.context.window.scene
scene=bpy.data.scenes.new('MINER_CITADEL_ENVIRONMENT');bpy.context.window.scene=scene;e=Environment(scene)
try:
    hero=e.group('01 — Citadel / independent gate source copy')
    # Append the saved source rather than depending on mutable objects in a prior session.
    with bpy.data.libraries.load(str(ROOT/'assets/environments/miner-gate/miner-gate.blend'),link=False) as (data,dest):dest.scenes=[data.scenes[0]]
    imported=dest.scenes[0];source=next(c for c in imported.collection.children if c.name.startswith('Miner Gate'))
    anchor=bpy.data.objects.new('Citadel adaptation — original gate remains unchanged',None);hero.objects.link(anchor);anchor.scale=(1.06,1,.88)
    materials={}
    for original in source.objects:
        copy=original.copy()
        if original.type=='MESH':
            copy.data=original.data.copy()
            for i,m in enumerate(copy.data.materials):
                if m not in materials:
                    new=m.copy();new.name='Citadel/'+m.name;materials[m]=new
                    if any(k in m.name.lower() for k in ['stone','masonry','graphite']):
                        n=new.node_tree.nodes;l=new.node_tree.links;p=n.get('Principled BSDF')
                        old=p.inputs['Base Color'].links[0].from_socket if p.inputs['Base Color'].is_linked else None
                        if old:
                            mix=n.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(.57,.6,.65,1);l.new(old,mix.inputs[1]);l.new(mix.outputs[0],p.inputs['Base Color'])
                        p.inputs['Roughness'].default_value=.93
                copy.data.materials[i]=materials[m]
        elif original.type=='LIGHT':copy.data=original.data.copy();copy.data.energy=original.data.energy*1.5
        hero.objects.link(copy);copy.parent=anchor
    bpy.data.scenes.remove(imported)
    graphite=e.rock_material('Fractured graphite',(.14,.16,.205));warm=e.rock_material('Iron-bearing schist',(.19,.155,.14));deep=e.rock_material('Blue distant slate',(.12,.17,.24));masonry=e.rock_material('Ancient cut stone',(.205,.21,.24))
    cave=e.group('02 — Geological macro masses')
    # Each footprint and each vertical break has been placed for the camera, not sampled randomly.
    masses=[
      ('Left rear bastion rock',[(-44,4),(-31,-2),(-23,4),(-21,24),(-26,44),(-44,48)],[(-20,1,0,0),(4,1.02,0,0),(7,.93,0,0),(18,.98,-1,0),(21,.85,0,0),(38,.9,-2,0),(47,.7,-2,0)],graphite),
      ('Left mid terraced wall',[(-39,-22),(-28,-28),(-22,-21),(-20,-6),(-25,8),(-39,12)],[(-20,1,0,0),(-1,1,0,0),(2,.91,0,0),(11,.94,-1,0),(14,.77,-1,0),(29,.83,-2,0),(37,.62,-2,0)],warm),
      ('Left front overhang',[(-34,-40),(-24,-45),(-18,-34),(-22,-21),(-36,-20)],[(-17,1,0,0),(0,1,0,0),(4,.9,0,0),(20,.98,-2,0),(24,.7,-1,0),(39,.8,-3,0)],graphite),
      ('Right tall split wall',[(23,-4),(31,-9),(44,0),(45,50),(29,66),(22,42),(20,19)],[(-20,1,0,0),(4,1.05,0,0),(8,.91,1,0),(20,.96,1,0),(24,.8,1,0),(39,.94,2,0),(52,.73,2,0)],graphite),
      ('Right projecting terraces',[(22,-31),(32,-36),(43,-24),(39,1),(27,3),(20,-10)],[(-20,1,0,0),(-1,1,0,0),(3,.9,0,0),(13,.99,1,0),(17,.74,1,0),(30,.87,3,0),(37,.63,3,0)],graphite),
      ('Right near rock frame',[(14,-44),(22,-49),(34,-41),(35,-23),(25,-20),(18,-29)],[(-18,1,0,0),(-4,1,0,0),(0,.84,0,0),(5,.68,1,0),(18,.85,3,0),(28,.65,4,0)],warm),
      ('Ancient rock behind citadel',[(-23,10),(-15,7),(-12,17),(-16,34),(-25,39)],[(-16,1,0,0),(9,1,0,0),(13,.84,0,0),(28,.88,0,0),(40,.66,0,0)],graphite),
      ('Right buried citadel shoulder',[(13,5),(20,0),(26,8),(25,29),(17,35)],[(-16,1,0,0),(7,1,0,0),(12,.9,0,0),(25,.8,1,0),(36,.6,2,0)],graphite),
    ]
    for name,outline,layers,mat in masses:e.rock(cave,name,outline,layers,mat)
    # The roof has depth breaks and an open central well; it is not a flat slab.
    for name,outline,layers in [
      ('Left suspended vault',[(-38,-27),(-16,-30),(-8,-12),(-17,12),(-35,19)],[(25,.7,-3,0),(31,1,0,0),(42,1.1,0,0),(50,1,0,0)]),
      ('Right suspended vault',[(15,-18),(36,-28),(45,0),(29,31),(12,20)],[(28,.6,3,0),(35,1,0,0),(49,1.1,0,0),(57,1,0,0)]),
      ('Distant arching roof',[(-27,38),(-5,31),(19,44),(29,84),(-28,92)],[(38,.85,0,0),(47,1,0,0),(58,1,0,0)]),
    ]:e.rock(cave,name,outline,layers,graphite)
    # Embedded ruined retaining wings bridge the boundary from worked stone to geology.
    wing=e.group('03 — Buried retaining architecture')
    for side in [-1,1]:
        for i in range(4):
            x=side*(15.7+i*1.4);h=[13.5,12.7,10,7.5][i]
            e.box(wing,'Weathered citadel retaining pier',x,2,h/2,1.6,8.5,h,masonry,.14)
    bridge=e.group('04 — Stone railway viaduct')
    e.box(bridge,'Continuous viaduct roadbed',0,-9,-.65,70,7,1.3,masonry,.09)
    for cx in [-30,-22.5,-15,-7.5,0,7.5,15,22.5,30]:
        e.box(bridge,'Viaduct pier anchored in bedrock',cx,-9,-9,2.2,7,16.7,masonry,.12)
        e.box(bridge,'Pier footing',cx,-9,-17,4.0,8.5,1.4,masonry,.15)
    for cx in [-26.25,-18.75,-11.25,-3.75,3.75,11.25,18.75,26.25]:
        e.arch(bridge,'Bridge bearing arch',cx,-9,-6,2.65,1.15,7,masonry,9)
    floor=e.group('05 — Ravine and foreground framing')
    e.rock(floor,'Deep ravine bed',[(-52,-62),(48,-62),(48,35),(-52,35)],[(-23,1,0,0),(-20,1,0,0)],graphite)
    fore=[
      ('Left foreground low shelf',[(-26,-54),(-12,-56),(-8,-46),(-12,-36),(-27,-35)],[(-20,1,0,0),(-8,1,0,0),(-5,.8,0,0),(-1,.65,-1,0)]),
      ('Right foreground broken ledge',[(8,-49),(16,-55),(29,-48),(30,-35),(15,-33)],[(-20,1,0,0),(-6,1,0,0),(-3,.88,0,0),(1,.55,2,0)]),
      ('Right intermediate cliff',[(10,-27),(17,-33),(24,-27),(22,-17),(14,-15)],[(-19,1,0,0),(-7,1,0,0),(-3,.8,0,0),(0,.5,2,0)]),
    ]
    for name,outline,layers in fore:e.rock(floor,name,outline,layers,graphite)
    lava=e.group('06 — Lava ravine primary flow')
    molten=e.emission('Molten lava', (1,.14,.009),4.5)
    # Authored shore lines, broad upstream pool breaks into narrower descending channels.
    pools=[('Lava upper basin',[(-30,-6),(-18,-5),(-15,-12),(-17,-18),(-29,-18)],-2),('Lava middle channel',[(-24,-15),(-17,-15),(-13,-23),(-16,-28),(-25,-26)],-3.8),('Lava lower channel',[(-20,-24),(-14,-24),(-8,-34),(-12,-39),(-20,-35)],-6.1)]
    for name,outline,z in pools:
        e.rock(lava,name+' basalt bed',outline,[(z-1,1.1,0,0),(z-.1,1.05,0,0)],warm)
        e.mesh(lava,name,[(x,y,z) for x,y in outline],[tuple(range(len(outline)))],molten)
    # Distant geology is real geometry behind the gate, not scaled copies on the facade plane.
    distance=e.group('07 — Deep cavern formations')
    for name,x,y,w,h,d in [('Far left pillar',-19,58,13,44,20),('Far right pillar',24,75,17,52,25),('Last cavern skyline',-5,116,40,52,24)]:
        e.rock(distance,name,[(x-w/2,y-d/2),(x+w*.2,y-d*.65),(x+w/2,y),(x+w*.35,y+d/2),(x-w/2,y+d*.4)],[(-14,1,0,0),(10,1,0,0),(16,.8,0,0),(h,.65,0,0)],deep)
    tunnel=e.group('08 — Deep mine barrel passage')
    for y in range(9,94,7):
        for side in [-1,1]:e.box(tunnel,'Tunnel foundation pier',side*4.8,y,2.1,1.15,1,4.2,masonry)
        e.arch(tunnel,'Receding tunnel arch',0,y,4.2,4.2,.65,.9,masonry,11)
    for side in [-1,1]:e.box(tunnel,'Tunnel rock side',side*5.6,51,3.9,1,87,8,graphite)
    e.box(tunnel,'Tunnel floor',0,49,-.6,11,91,1.2,graphite)
    lighting=e.group('09 — Composition lighting')
    world=bpy.data.worlds.new('Miner cavern blue atmosphere');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.045,.075,.13,1);world.node_tree.nodes['Background'].inputs[1].default_value=.5;scene.world=world
    e.light(lighting,'Cold overhead cavern key',(-12,-18,37),12000,(.46,.64,1),22,'AREA',(0,-3,8))
    e.light(lighting,'Warm bounced lava key',(-23,-20,7),7000,(1,.31,.07),15,'AREA',(-8,-3,3))
    e.light(lighting,'Blue right cavern bounce',(28,12,22),11500,(.12,.52,1),16,'AREA',(7,-8,13))
    e.light(lighting,'Soft front readability',(0,-41,19),5000,(.7,.77,1),25,'AREA',(0,0,9))
    for pos in [(-23,-12,0),(-19,-23,-2),(-13,-32,-4)]:e.light(lighting,'Lava reflected radiance',pos,1800,(1,.19,.025),4)
    camera=bpy.data.cameras.new('Reference composition 1536x960');obj=bpy.data.objects.new('Reference camera',camera);scene.collection.objects.link(obj);obj.location=(0,-64,9);obj.rotation_euler=(Vector((0,3,3))-obj.location).to_track_quat('-Z','Y').to_euler();camera.lens=36;camera.sensor_width=36;scene.camera=obj
    scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=.6
    scene['production_stage']='01 macro composition, before meso infrastructure';scene['source_gate']='assets/environments/miner-gate/miner-gate.blend'
    e.save('01-macro-composition.blend');e.render('01-macro-composition.png',24,1200)
    RESULT={'scene':scene.name,'blend':'assets/environments/miner-citadel/01-macro-composition.blend','render':'artifacts/miner-citadel/01-macro-composition.png'}
finally:bpy.context.window.scene=previous
