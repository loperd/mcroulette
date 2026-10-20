"""Art pass with explicit baked PNG colours; no Blender-only shader math at runtime."""
import bpy,random
import numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/environments/miner-gate'
s=bpy.data.scenes['MINER_GATE_ASSET_REVIEW'];asset=next(c for c in s.collection.children if c.name.startswith('Miner Gate'))
stone=bpy.data.materials['weathered-graphite'];source=bpy.data.images['weathered-graphite-color']
pixels=np.empty(len(source.pixels),dtype=np.float32);source.pixels.foreach_get(pixels);pixels=pixels.reshape((-1,4))
variants=[]
names=['Dressed pale archstone','Iron stained masonry','Soot darkened masonry']
for name,color in zip(names,[(1.2,1.17,1.11),(.97,.83,.72),(.74,.79,.86)]):
    m=bpy.data.materials.get(name) or stone.copy();m.name=name
    image=bpy.data.images.new(name+'-baked',width=512,height=512,alpha=True)
    values=pixels.copy();values[:,:3]=np.clip(values[:,:3]*np.array(color),0,1)
    image.pixels.foreach_set(values.ravel());image.filepath_raw=str(OUT/(name.lower().replace(' ','-')+'-color.png'));image.file_format='PNG';image.save();image.pack()
    nodes=m.node_tree.nodes;links=m.node_tree.links;p=nodes.get('Principled BSDF')
    node=nodes.new('ShaderNodeTexImage');node.name='Baked base colour';node.image=image;links.new(node.outputs['Color'],p.inputs['Base Color'])
    for old in list(nodes):
        if old.type=='MIX_RGB':nodes.remove(old)
    variants.append(m)
r=random.Random(219)
for o in asset.objects:
    if o.type!='MESH' or not o.data.materials:continue
    current=o.data.materials[0]
    if current!=stone and current.name not in names:continue
    o.data.materials[0]=stone
    if any(o.name.startswith(n) for n in ['Cut arch voussoir','Portal jamb','Oversized carved keystone','Spring impost','Niche sill','Buttress cap','Crown cap slab']):o.data.materials[0]=variants[0]
    elif any(o.name.startswith(n) for n in ['Tower face ashlar','Tower return ashlar','Tower rear ashlar','Overgate masonry']):
        roll=r.random()
        if roll<.22:o.data.materials[0]=variants[1]
        elif roll<.4:o.data.materials[0]=variants[2]
s['art_pass']='Baked pale dressed archstone, mineral staining and soot-darkened ashlar'
bpy.data.libraries.write(str(OUT/'miner-gate.blend'),{s},fake_user=True)
RESULT={'nativeSource':'assets/environments/miner-gate/miner-gate.blend','bakedStoneVariants':3}
