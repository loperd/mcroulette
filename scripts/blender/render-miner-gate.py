import bpy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
previous=bpy.context.window.scene
scene=bpy.data.scenes['MINER_GATE_ASSET_REVIEW']
try:
    bpy.context.window.scene=scene
    scene.render.filepath=str(ROOT/'artifacts/gate-asset/blender-three-quarter.png')
    bpy.ops.render.render(write_still=True)
    RESULT={'render':scene.render.filepath,'renderer':'Blender Cycles CPU','browserScreenshot':False}
finally:
    bpy.context.window.scene=previous
