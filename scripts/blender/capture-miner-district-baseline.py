import bpy,json,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];ART=ROOT/'artifacts/miner-citadel-districts';previous=bpy.context.window.scene
s=bpy.data.scenes.get('MINER_CITADEL_WIDE_B')
if not s:
 with bpy.data.libraries.load(str(ROOT/'assets/environments/miner-citadel-wide/wide-b.blend'),link=False) as (a,b):b.scenes=[a.scenes[0]]
 s=b.scenes[0]
try:
 bpy.context.window.scene=s;bpy.context.view_layer.update()
 contract={'cameraMatrix':[float(v) for row in s.camera.matrix_world for v in row],'lens':s.camera.data.lens,'sensor':s.camera.data.sensor_width,'resolution':[s.render.resolution_x,s.render.resolution_y,s.render.resolution_percentage],'engine':s.render.engine,'samples':s.cycles.samples,'viewTransform':s.view_settings.view_transform,'exposure':s.view_settings.exposure,'gamma':s.view_settings.gamma,'globalLightEnergy':{o.name:o.data.energy for o in s.objects if o.type=='LIGHT' and o.data.type=='AREA'}}
 (ART/'baseline-contract.json').write_text(json.dumps(contract,indent=2))
 original=s.render.filepath;s.render.filepath=str(ART/'baseline-blender.png');start=time.perf_counter();bpy.ops.render.render(write_still=True);s.render.filepath=original
 RESULT={'render':str(ART/'baseline-blender.png'),'seconds':time.perf_counter()-start,'camera':contract}
finally:bpy.context.window.scene=previous
