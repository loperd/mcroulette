"""Consolidate the editable source into one static GLB mesh with material primitives."""
import bpy,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
previous=bpy.context.window.scene
source=bpy.data.scenes['MINER_GATE_ASSET_REVIEW']
asset=next(c for c in source.collection.children if c.name.startswith('Miner Gate'))
s=bpy.data.scenes.new('Gate runtime export only')
try:
    bpy.context.window.scene=s
    copies=[]
    for original in asset.objects:
        if original.type!='MESH':continue
        copy=original.copy();copy.data=original.data.copy();s.collection.objects.link(copy);copies.append(copy)
    for o in list(bpy.context.selected_objects):o.select_set(False)
    for o in copies:o.select_set(True)
    bpy.context.view_layer.objects.active=copies[0]
    bpy.ops.object.join()
    merged=bpy.context.object;merged.name='Miner_Gate_Authored';merged.data.name='Miner_Gate_Optimized'
    bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/environments/miner-gate.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_cameras=False,export_lights=False,export_animations=False,export_materials='EXPORT',export_yup=True)
    manifest=ROOT/'assets/environments/miner-gate/manifest.json'
    data=json.loads(manifest.read_text());data['sourceMeshes']=len(copies);data['runtimeMeshes']=1;data['runtimeMaterials']=len(merged.data.materials)
    manifest.write_text(json.dumps(data,indent=2))
    RESULT={'sourceMeshes':len(copies),'runtimeMeshes':1,'runtimeMaterials':len(merged.data.materials)}
finally:
    bpy.context.window.scene=previous
    for o in list(s.objects):bpy.data.objects.remove(o,do_unlink=True)
    bpy.data.scenes.remove(s)
