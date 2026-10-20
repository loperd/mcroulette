"""Second macro pass, based on 01-macro-composition.png, before infrastructure detail."""
import bpy,sys,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts/blender'))
from miner_environment_tools import Environment
previous=bpy.context.window.scene;s=bpy.data.scenes['MINER_CITADEL_ENVIRONMENT'];bpy.context.window.scene=s;e=Environment(s)
try:
    cave=s.collection.children['02 — Geological macro masses']
    for o in cave.objects:
        if o.name.startswith('Left front overhang'):o.location.x=-6
        if o.name.startswith('Right near rock frame'):o.location.x=5;o.location.z=-5
    rock=bpy.data.materials['MineEnv/Fractured graphite'];warm=bpy.data.materials['MineEnv/Iron-bearing schist'];deep=bpy.data.materials['MineEnv/Blue distant slate']
    meso=e.group('10 — Geological terraces and joint planes')
    # Deliberate interconnected ledges, located so platforms can later sit on their upper planes.
    ledges=[
      ('Left lower terrace',[(-31,-18),(-22,-20),(-18,-14),(-20,-5),(-30,-2)],[(-16,1,0,0),(1,1,0,0),(3,.88,0,0)],warm),
      ('Left middle terrace',[(-34,-7),(-23,-9),(-19,-2),(-22,9),(-33,11)],[(0,1,0,0),(9,1,0,0),(11,.86,0,0)],rock),
      ('Left upper terrace',[(-31,9),(-22,6),(-17,15),(-20,26),(-32,27)],[(9,1,0,0),(18,1,0,0),(20,.86,0,0)],rock),
      ('Right lower terrace',[(20,-24),(30,-26),(35,-14),(28,-5),(19,-8)],[(-17,1,0,0),(2,1,0,0),(4,.87,0,0)],rock),
      ('Right mid terrace',[(21,-6),(30,-11),(39,-1),(34,14),(23,17)],[(0,1,0,0),(12,1,0,0),(14,.85,0,0)],rock),
      ('Right high shelf',[(21,15),(31,11),(37,28),(29,42),(19,36)],[(12,1,0,0),(24,1,0,0),(26,.84,0,0)],deep),
      ('Ravine central bedrock',[(-10,-13),(-2,-15),(7,-13),(10,-18),(4,-26),(-5,-25),(-12,-19)],[(-20,1,0,0),(-9,1,0,0),(-6,.9,0,0),(-3.5,.76,0,4)],rock),
      ('Bridge left abutment outcrop',[(-24,-13),(-15,-15),(-11,-9),(-15,-3),(-26,-4)],[(-19,1,0,0),(-6,1,0,0),(-2,.8,0,0)],warm),
      ('Bridge right foundation outcrop',[(9,-16),(16,-17),(22,-10),(18,-4),(10,-6)],[(-20,1,0,0),(-7,1,0,0),(-2,.78,0,0)],rock),
    ]
    for name,outline,layers,mat in ledges:e.rock(meso,name,outline,layers,mat)
    # Faceted bedded surface panels follow a few coherent fracture systems, not isotropic noise.
    bands=[(-1,-23,-15,3,5),(1,25,-9,4,6),(-1,-26,9,12,5),(1,25,23,16,6)]
    for side,x,y,z,count in bands:
        for j in range(count):
            xx=x+side*((j%3)-1)*1.8;yy=y+(j//3)*5.5;zz=z+(j%2)*2.2
            outline=[(xx-2.8,yy-3),(xx+2.3,yy-3.7),(xx+3.2,yy+1),(xx+1.8,yy+4),(xx-2.9,yy+3)]
            e.rock(meso,'Exposed jointed rock escarpment',outline,[(zz-4,1,0,0),(zz+.5,1,0,0),(zz+2,.77,side*.3,.3)],rock if j%3 else warm)
    # Read the real mine passage before the detailed lamps are installed.
    lights=s.collection.children['09 — Composition lighting']
    for y in range(13,90,12):
        e.light(lights,'Tunnel amber bay light',(0,y,6.8),180,(1,.43,.14),.7)
    e.light(lights,'Distant tunnel blue termination',(0,92,5),250,(.13,.43,1),3)
    e.light(lights,'Cold reflected light in ravine',(1,-21,-4),2600,(.24,.39,.65),12,'AREA',(0,-9,-10))
    e.light(lights,'Left middle gallery wash',(-22,-9,15),3300,(1,.51,.23),9,'AREA',(-24,-1,6))
    e.light(lights,'Right high gallery wash',(24,17,29),4000,(.14,.57,1),10,'AREA',(23,-4,10))
    s['production_stage']='02 corrected macro volumes, before infrastructure detail'
    e.save('02-composition-corrected.blend');e.render('02-composition-corrected.png',28,1200)
    RESULT={'blend':'assets/environments/miner-citadel/02-composition-corrected.blend','render':'artifacts/miner-citadel/02-composition-corrected.png'}
finally:bpy.context.window.scene=previous
