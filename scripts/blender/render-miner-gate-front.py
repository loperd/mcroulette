import bpy
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
previous=bpy.context.window.scene
s=bpy.data.scenes['MINER_GATE_ASSET_REVIEW'];camera=s.camera
position=camera.location.copy();rotation=camera.rotation_euler.copy()
try:
    bpy.context.window.scene=s
    camera.location=(0,-51,15);camera.rotation_euler=(Vector((0,0,10.5))-camera.location).to_track_quat('-Z','Y').to_euler()
    s.render.filepath=str(ROOT/'artifacts/gate-asset/blender-front.png')
    bpy.ops.render.render(write_still=True)
    RESULT={'render':s.render.filepath,'renderer':'Blender Cycles CPU','browserScreenshot':False}
finally:
    camera.location=position;camera.rotation_euler=rotation;bpy.context.window.scene=previous
