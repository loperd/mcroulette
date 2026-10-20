"""Read-only triangle provenance; does not save or mutate authored geometry/GLB."""
import bpy,json,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
s=bpy.data.scenes.get('MINER_CITADEL_DISTRICTS')
if not s:
 with bpy.data.libraries.load(str(ROOT/'assets/environments/miner-citadel-districts/districts.blend'),link=False) as (a,b):b.scenes=[a.scenes[0]]
 s=b.scenes[0]
previous=bpy.context.window.scene
# Stable IDs, matched to reference-layout.json. Classification is editable here.
category={'01':1,'03':1,'04':4,'08':7,'13':4,'15':1,'16':1,'25':7,'D01':8,'D02':2,'D03':2,'D04':2,'D05':2,'D06':7,'D07':2,'D08':5,'D09':3,'D10':6,'D11':1,'D12':2,'D13':7,'D14':9}
rows={};ambiguous=set();objects=[]
def key(points):
 # Centroid quantized to 1mm. Identical centroids across categories are explicitly unknown.
 return ','.join(str(math.floor(sum(p[i] for p in points)/3*1000+.5)) for i in range(3))
try:
 bpy.context.window.scene=s;bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
 for o in s.objects:
  if o.type not in ['MESH','CURVE'] or o.hide_render:continue
  if any(m and m.use_nodes and any(n.bl_idname=='ShaderNodeVolumePrincipled' for n in m.node_tree.nodes) for m in o.data.materials):continue
  groups=[c.name.split(' ')[0] for c in o.users_collection];id=next((category[g] for g in groups if g in category),0)
  mesh=bpy.data.meshes.new_from_object(o.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps)
  mesh.transform(o.matrix_world);mesh.calc_loop_triangles()
  # Water group contains stone ledges: only water itself belongs to water category.
  ids=[]
  for t in mesh.loop_triangles:
   mat=mesh.materials[t.material_index] if t.material_index<len(mesh.materials) else None
   label=8 if id==9 and mat and not mat.name.startswith('PBR/water') else id
   points=[(mesh.vertices[v].co.x,mesh.vertices[v].co.z,-mesh.vertices[v].co.y) for v in t.vertices]
   k=key(points)
   if k in rows and rows[k]!=label:ambiguous.add(k)
   rows[k]=label;ids.append(label)
  objects.append({'name':o.name,'collections':groups,'category':id,'triangles':len(ids)})
  bpy.data.meshes.remove(mesh)
 for k in ambiguous:rows[k]=0
 out=ROOT/'artifacts/visual-review/source-provenance.json';out.write_text(json.dumps({'method':'Evaluated source triangle centroids, millimetre quantization; ambiguous centroids unknown','triangles':rows,'ambiguous':len(ambiguous),'objects':objects},separators=(',',':')))
 RESULT={'path':str(out),'keys':len(rows),'ambiguous':len(ambiguous)}
finally:bpy.context.window.scene=previous
