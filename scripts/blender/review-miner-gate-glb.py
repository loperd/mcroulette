"""Render the actual shipped GLB after importing it back, not the editable source."""
import bpy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
previous=bpy.context.window.scene
source=bpy.data.scenes['MINER_GATE_ASSET_REVIEW']
s=bpy.data.scenes.new('Gate GLB roundtrip review')
try:
    bpy.context.window.scene=s
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models/environments/miner-gate.glb'))
    s.world=source.world
    for o in source.objects:
        if o.type not in ['CAMERA','LIGHT']:continue
        copy=o.copy();s.collection.objects.link(copy)
        if copy.type=='CAMERA':s.camera=copy
    s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.samples=40;s.cycles.use_denoising=True
    s.render.resolution_x=1200;s.render.resolution_y=1000;s.render.resolution_percentage=100
    s.view_settings.view_transform='AgX';s.render.image_settings.file_format='PNG'
    s.render.filepath=str(ROOT/'artifacts/gate-asset/glb-roundtrip-blender.png')
    bpy.ops.render.render(write_still=True)
    RESULT={'render':s.render.filepath,'input':'public/models/environments/miner-gate.glb','browserScreenshot':False}
finally:
    bpy.context.window.scene=previous
    for o in list(s.objects):bpy.data.objects.remove(o,do_unlink=True)
    bpy.data.scenes.remove(s)
