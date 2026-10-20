"""Author one editable environment asset in an isolated Blender scene; never rebuild the world.
Run through the existing Blender bridge. Asset geometry, UVs and maps are stored in .blend/GLB.
"""
import bpy, bmesh, math, random, json
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/environments/miner-gate'; OUT.mkdir(parents=True,exist_ok=True)
PUB=ROOT/'public/models/environments'; PUB.mkdir(parents=True,exist_ok=True)
ART=ROOT/'artifacts/gate-asset'; ART.mkdir(parents=True,exist_ok=True)
previous=bpy.context.window.scene
scene=bpy.data.scenes.new('MINER_GATE_ASSET_REVIEW')
bpy.context.window.scene=scene
asset=bpy.data.collections.new('Miner Gate — authored asset'); scene.collection.children.link(asset)
rng=random.Random(716)
objects=[]

def texture(name,kind):
    n=512; yy,xx=np.mgrid[0:n,0:n]; x=xx/n; y=yy/n
    gen=np.random.default_rng(sum(map(ord,name)))
    noise=gen.random((n,n))
    coarse=np.sin(x*31+np.sin(y*17))*np.sin(y*23+np.sin(x*11))
    if kind=='stone':
        h=.43+coarse*.08+(noise-.5)*.12
        chips=(np.sin(x*61+np.sin(y*19)*2)+np.sin(y*79+x*8)>1.84)
        seams=np.maximum(0,1-np.abs(np.sin(x*24+y*11+np.sin(y*24)*.5))*45)
        h-=chips*.13+seams*.12
        rgb=np.array([.32,.34,.39])[None,None,:]*(.75+h[:,:,None]*.6)
        rgb+=(noise[:,:,None]-.5)*.065
        rough=.76+noise*.16
    elif kind=='wood':
        grain=np.sin(x*280+np.sin(y*11)*3+np.sin(x*30+y*8)*2)
        h=.5+grain*.12+(noise-.5)*.08
        rgb=np.array([.30,.16,.065])[None,None,:]*(.65+h[:,:,None]*.8)
        rgb+=(noise[:,:,None]-.5)*.035; rough=.69+noise*.2
    elif kind=='metal':
        h=.5+(noise-.5)*.12
        rust=np.maximum(0,coarse)*.13
        rgb=np.stack([.115+rust,.12+rust*.32,.14+rust*.1],axis=2)+(noise[:,:,None]-.5)*.045
        rough=.43+noise*.28
    else:
        weave=(np.sin(xx*math.pi/2)*np.sin(yy*math.pi/2))*.04
        h=.5+weave
        rgb=np.array([.35,.035,.027])[None,None,:]*(.8+h[:,:,None]*.4)
        rough=np.full((n,n),.96)
    gy,gx=np.gradient(h); normals=np.stack([-gx*2,-gy*2,np.ones_like(h)],axis=2); normals/=np.linalg.norm(normals,axis=2)[:,:,None]
    values={'color':np.clip(rgb,0,1),'normal':normals*.5+.5,'roughness':np.repeat(np.clip(rough,0,1)[:,:,None],3,axis=2)}
    images={}
    for suffix,data in values.items():
        image=bpy.data.images.new(name+'-'+suffix,width=n,height=n,alpha=True)
        if suffix!='color': image.colorspace_settings.name='Non-Color'
        rgba=np.concatenate([data,np.ones((n,n,1))],axis=2).astype(np.float32)
        image.pixels.foreach_set(rgba.ravel()); image.filepath_raw=str(OUT/(name+'-'+suffix+'.png'));image.file_format='PNG';image.save();image.pack(); images[suffix]=image
    return images

def material(name,kind,metal=0):
    maps=texture(name,kind);m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Metallic'].default_value=metal
    for channel,socket in [('color','Base Color'),('roughness','Roughness')]:
        t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=maps[channel];m.node_tree.links.new(t.outputs['Color'],p.inputs[socket])
    t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=maps['normal'];normal=m.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.65
    m.node_tree.links.new(t.outputs['Color'],normal.inputs['Color']);m.node_tree.links.new(normal.outputs[0],p.inputs['Normal'])
    return m
stone=material('weathered-graphite','stone');wood=material('split-oak','wood');iron=material('forged-iron','metal',.78);cloth=material('oxblood-woven-banner','cloth')
trim=stone.copy();trim.name='Pale worn archstone';trim.diffuse_color=(.38,.39,.42,1)
gold=bpy.data.materials.new('Tarnished brass');gold.diffuse_color=(.48,.26,.075,1);gold.use_nodes=True
gold.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.48,.26,.075,1);gold.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value=.7;gold.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.48
ember=bpy.data.materials.new('Lantern amber glass');ember.use_nodes=True
p=ember.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=(1,.35,.035,1);p.inputs['Emission Color'].default_value=(1,.22,.012,1);p.inputs['Emission Strength'].default_value=5;p.inputs['Roughness'].default_value=.35

def mesh(name,verts,faces,mat,bevel=.025,uv=True):
    data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
    o=bpy.data.objects.new(name,data);asset.objects.link(o);objects.append(o);data.materials.append(mat)
    if uv:
        layer=data.uv_layers.new(name='Material UV')
        for poly in data.polygons:
            normal=poly.normal; axis=max(range(3),key=lambda j:abs(normal[j]));axes=[j for j in range(3) if j!=axis]
            for idx in poly.loop_indices:
                v=data.vertices[data.loops[idx].vertex_index].co
                layer.data[idx].uv=(v[axes[0]]*.5,v[axes[1]]*.5)
    if bevel:
        mod=o.modifiers.new('Worn cut edge','BEVEL');mod.width=bevel;mod.segments=1
        bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.modifier_apply(modifier=mod.name);o.select_set(False)
    return o

def box(name,x,y,z,w,d,h,mat=stone,bevel=.035):
    verts=[(x+sx*w/2,y+sy*d/2,z+sz*h/2) for sx,sy,sz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    return mesh(name,verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat,bevel)

def profile(name,points,y,depth,mat=stone,bevel=.03):
    n=len(points);v=[(x,dy,z) for dy in [y-depth/2,y+depth/2] for x,z in points]
    f=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    o=mesh(name,v,f,mat,bevel)
    return o

def beam(name,a,b,width,depth,mat=wood):
    mid=(Vector(a)+Vector(b))*.5;length=(Vector(b)-Vector(a)).length
    o=box(name,0,0,0,width,depth,length,mat,.022);o.location=mid;o.rotation_euler=(Vector(b)-Vector(a)).to_track_quat('Z','Y').to_euler();return o

def ashlar(name,x,y,z,w,d,h):
    o=box(name,x,y,z,w-.045,d,h-.045,stone,.045)
    # Very small damage variation affects local edges, never the architectural composition.
    for v in o.data.vertices:
        v.co.x+=rng.uniform(-.012,.012);v.co.z+=rng.uniform(-.012,.012)
    return o

# Coursed, fully modelled tower shells with real recessed lantern chambers.
for side in [-1,1]:
    cx=side*9.2
    box('Tower foundation',cx,.3,.45,8.4,9.6,.9)
    box('Lower plinth moulding',cx,-.1,1.1,8.1,8.8,.4,stone,.07)
    for row in range(15):
        z=1.4+row*1.12
        for col in range(4):
            x=cx-2.85+col*1.9+(0 if row%2==0 else .1)
            if abs(x-cx)<1.1 and 3.4<z<6.8: continue
            ashlar('Tower face ashlar',x,-3.65-rng.uniform(0,.12),z,1.88,1.2,1.1)
        # Exposed returns on both sides carry the same stonework into depth.
        for edge in [-1,1]:
            for j in range(4): ashlar('Tower return ashlar',cx+edge*3.7,-2.5+j*1.75,z,.95,1.74,1.1)
        for col in range(4): ashlar('Tower rear ashlar',cx-2.8+col*1.85,3.7,z,1.82,1.1,1.1)
    # Chamber backing is recessed behind the opening; ledge and frame project towards camera.
    box('Lantern niche back',cx,-2.35,5.15,2.1,.3,3.6)
    box('Niche sill',cx,-3.9,3.5,2.6,1.7,.35,stone,.06)
    for dx in [-1.15,1.15]:box('Niche reveal',cx+dx,-3.6,5.1,.32,1.4,3.4)
    profile('Niche pointed lintel',[(cx-1.4,6.6),(cx,7.35),(cx+1.4,6.6),(cx+1.4,6.25),(cx,6.9),(cx-1.4,6.25)],-3.95,.8)
    for z,w,d in [(8.2,8.1,8.8),(14.8,8.3,9),(17.8,8.6,9.4)]:
        box('Tower string course',cx,.1,z,w,d,.28,stone,.055)
        box('String course drip edge',cx,-4.5,z-.22,w+.2,.35,.22,stone,.025)
    # Uneven supported crown has broad silhouettes and individually chamfered merlons.
    for i,h in enumerate([1.1,2.1,1.5,2.7] if side<0 else [2.2,1.2,2.8,1.6]):
        x=cx-2.9+i*1.9;box('Broken tower crown',x,.2,18+h/2,1.8,8.4,h)
        box('Crown cap slab',x,-.1,18+h,1.95,8.6,.25,stone,.06)
    # Deep tapered buttresses, section profiles make genuine sloping shoulders.
    for dx in [-3.2,3.2]:
        x=cx+dx
        profile('Tapered stone buttress',[(x-1.0,.9),(x+1.0,.9),(x+1.0,8.8),(x+.62,10.4),(x+.62,13),(x-.62,13),(x-.62,10.4),(x-1,8.8)],-4.9,2.5,stone,.08)
        for z,w in [(2,2.4),(6.5,2.25),(10.2,1.8),(13.1,1.65)]:box('Buttress cap',x,-4.9,z,w,2.8,.35,stone,.07)
    # Solid buttress grooves / face joints are geometric, not black painted stripes.
    for z in [3.1,4.3,5.5,7.7,8.8,11.4]:
        for dx in [-3.2,3.2]:box('Buttress dressed joint',cx+dx,-6.18,z,1.7,.08,.05,iron,.007)

# Central barrel passage and masonry spandrel have a true curved boundary.
R=4.15; spring=5.8
arc=[(R*math.cos(a),spring+R*math.sin(a)) for a in np.linspace(math.pi,0,25)]
profile('Arch spandrel structural mass',[(-5.9,spring)]+arc+[(5.9,spring),(5.9,18.7),(-5.9,18.7)],.3,6.5,stone,.035)
# 3 deep voussoir rings, front/back and inner barrel are actual wedge solids.
for y,inner,outer,depth in [(-4.1,4.15,5.48,1.1),(-3.1,4.12,4.7,1.0),(-1.9,4.12,4.65,1.4),(0,4.12,4.65,2.3),(2,4.12,5.15,1.4)]:
    for i in range(15):
        a=i*math.pi/15+.008;b=(i+1)*math.pi/15-.008
        poly=[(inner*math.cos(a),spring+inner*math.sin(a)),(outer*math.cos(a),spring+outer*math.sin(a)),(outer*math.cos(b),spring+outer*math.sin(b)),(inner*math.cos(b),spring+inner*math.sin(b))]
        profile('Cut arch voussoir',poly,y,depth,stone,.035)
for side in [-1,1]:
    for row in range(5):
        box('Portal jamb',side*4.8,-.3,.6+row*1.14,1.35,8.4,1.1,stone,.055)
    box('Spring impost',side*4.8,-.5,5.75,1.8,8.7,.38,stone,.06)
profile('Oversized carved keystone',[(-.42,9.6),(.42,9.6),(.7,11.6),(-.7,11.6)],-4.55,1.2,stone,.07)
for row in range(6):
    for col in range(8):
        x=-5.15+col*1.47;z=11.2+row*1.1
        if row==0 and abs(x)<.9: continue
        ashlar('Overgate masonry',x,-3.4-rng.uniform(0,.12),z,1.43,.5,1.06)
for z in [13.6,17.8,19]:box('Overgate cornice',0,-3.3,z,12.2,1.7,.3,stone,.06)
for i,h in enumerate([1.5,2.8,2.1,3.1,1.7,2.3]):
    box('Uneven upper crenellation',-4.8+i*1.95,-.1,19.15+h/2,1.8,6.6,h)
    box('Crenellation cap',-4.8+i*1.95,-.1,19.15+h,1.95,6.8,.22,stone,.04)

# Timber gallery over the arch: structured joists, planking, braces and iron straps.
for x in [-4.6,-2.3,0,2.3,4.6]:
    box('Timber cantilever',x,-4.45,11.6,.4,2.9,.45,wood)
    beam('Timber diagonal brace',(x,-3.2,9.9),(x,-5.2,11.6),.22,.25)
for i in range(24):box('Gallery plank',-5.5+i*.48,-4.8,11.95,.45,2.2,.16,wood,.015)
for x in [-5.5,-2.75,0,2.75,5.5]:
    box('Balcony upright',x,-5.7,12.7,.22,.24,1.5,wood)
    box('Balcony iron shoe',x,-5.72,12.15,.3,.3,.32,iron,.015)
for z in [12.65,13.35]:box('Balcony handrail',0,-5.7,z,11.4,.19,.18,wood,.02)
# Raised forged portcullis, terminates inside the arch rather than cutting through stone.
for x in np.arange(-3.75,4,.75):
    top=spring+math.sqrt(max(0,R*R-x*x))-.2
    box('Portcullis vertical',float(x),-.6,(top+4.8)/2,.11,.15,top-4.8,iron,.018)
    profile('Portcullis forged point',[(x-.09,4.9),(x+.09,4.9),(x,4.45)],-.6,.16,iron,.01)
for z in [5.6,6.7,7.8]:
    half=math.sqrt(max(0,R*R-max(0,z-spring)**2))-.15
    box('Portcullis crossbar',0,-.66,z,half*2,.18,.13,iron,.02)
    for x in np.arange(-half+.3,half,.7):box('Portcullis rivet',float(x),-.79,z,.13,.08,.13,gold,.025)

# Mesh cloth, shaped lower edge, rolled hems and gold pickaxe appliqué, no billboard.
def clothY(x,z):return -4.68-.12*math.sin(x*3.4+z*.8)-.05*math.sin(z*2)
for side in [-1,1]:
    cx=side*9.2;top=15.4;w=2.25;h=5.6;nx=14;ny=28;verts=[];faces=[]
    for j in range(ny+1):
        for i in range(nx+1):
            x=cx+(i/nx-.5)*w;z=top-j/ny*h+(j/ny)**10*(abs(i/nx-.5)*.65)
            verts.append((x,clothY(x,z),z))
    for j in range(ny):
        for i in range(nx):a=j*(nx+1)+i;faces.append((a,a+1,a+nx+2,a+nx+1))
    banner=mesh('Guild banner cloth',verts,faces,cloth,0)
    mod=banner.modifiers.new('Cloth thickness','SOLIDIFY');mod.thickness=.025
    bpy.context.view_layer.objects.active=banner;banner.select_set(True);bpy.ops.object.modifier_apply(modifier=mod.name);banner.select_set(False)
    box('Banner hanging rod',cx,-4.68,top+.16,2.8,.16,.16,iron,.03)
    for x in [cx-w/2+.08,cx+w/2-.08]:
        for j in range(22):
            z=top-.2-j*.235;box('Stitched brass banner border',x,clothY(x,z)-.025,z,.035,.025,.17,gold,.006)
    for direction in [-1,1]:
        a=(cx-direction*.64,-4.9,11.65);b=(cx+direction*.5,-4.9,13.4)
        beam('Pickaxe embroidered handle',a,b,.095,.05,gold)
        profile('Pickaxe gold blade',[(cx+direction*.15,13.45),(cx+direction*.57,13.7),(cx+direction*1.0,13.32),(cx+direction*.88,13.0),(cx+direction*.48,13.42)],-4.94,.06,gold,.01)

# Lanterns have mesh roofs, glazing, feet, corner frames and warm emissive inner cores.
def lantern(x,y,z):
    box('Niche lantern base',x,y,z-.6,.94,.74,.15,iron,.04)
    box('Warm lantern glass',x,y,z,.66,.48,1.0,ember,.035)
    for dx in [-.4,.4]:
        for dy in [-.3,.3]:box('Lantern forged corner',x+dx,y+dy,z,.09,.09,1.2,iron,.018)
    for zz in [-.5,.15,.55]:box('Lantern front frame',x,y-.32,z+zz,.86,.09,.065,iron,.015)
    profile('Lantern pitched canopy',[(x-.6,z+.64),(x,z+1.06),(x+.6,z+.64)],y,.9,iron,.025)
    box('Lantern cap handle',x,y,z+1.12,.16,.16,.18,gold,.02)
    light=bpy.data.lights.new('Lantern point','POINT');light.energy=160;light.color=(1,.36,.08);light.shadow_soft_size=.5
    o=bpy.data.objects.new('Lantern light',light);asset.objects.link(o);objects.append(o);o.location=(x,y-.6,z)
for side in [-1,1]:
    lantern(side*9.2,-3.75,5.1);lantern(side*5.9,-5,7.7)
    # Chain geometry reuses a shaped link mesh, alternates orientation; follows a load-bearing line.
    for i in range(36):
        a=i*math.pi/2
        points=[(side*6.2+.11*math.cos(t)*math.cos(a),-4.65+.11*math.cos(t)*math.sin(a),18.7-i*.25+.17*math.sin(t)) for t in np.linspace(0,2*math.pi,9)[:-1]]
        curve=bpy.data.curves.new('Forged chain link','CURVE');curve.dimensions='3D';curve.resolution_u=1;curve.bevel_depth=.035;curve.bevel_resolution=0
        sp=curve.splines.new('POLY');sp.points.add(len(points)-1)
        for p,co in zip(sp.points,points):p.co=(*co,1)
        sp.use_cyclic_u=True;o=bpy.data.objects.new('Counterweight chain',curve);asset.objects.link(o);objects.append(o);curve.materials.append(iron)
        bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');objects[-1]=bpy.context.object;objects[-1].select_set(False)
# Irregular paving and dressed stair nosings make the asset land on the ground.
for j in range(4):
    for i in range(18):ashlar('Threshold paving',-13.2+i*1.55,-5.8+j*1.5,.13,1.52,1.47,.26)
for i in range(3):box('Entrance stair nosing',0,-6.8-i*.55,-.12-i*.18,11,.55,.35,stone,.055)

# Compact by material for runtime. Named source parts retained in a separate source .blend first.
scene['asset']='Miner gate';scene['authoring']='Blender mesh / UV PBR / no runtime architecture generator'
scene['coordinate_system']='Blender Z up, front -Y. GLB converts to Y up, front +Z.'
# Studio belongs to review scene only, never exported as asset geometry.
studio=bpy.data.collections.new('Review studio — excluded from GLB');scene.collection.children.link(studio)
def studioObject(name,data,location):
    o=bpy.data.objects.new(name,data);studio.objects.link(o);o.location=location;return o
world=bpy.data.worlds.new('Cold blue studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.07,.1,.16,1);world.node_tree.nodes['Background'].inputs[1].default_value=.4;scene.world=world
for name,loc,power,color,size in [('Cool upper key',(-13,-17,26),4200,(.6,.75,1),12),('Warm frontal softbox',(4,-18,12),2100,(1,.69,.43),10),('Blue rim',(12,7,22),5300,(.35,.55,1),9)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.color=color;data.shape='DISK';data.size=size;o=studioObject(name,data,loc);o.rotation_euler=(Vector((0,0,10))-o.location).to_track_quat('-Z','Y').to_euler()
cam=bpy.data.cameras.new('Asset review camera');o=studioObject('Asset review camera',cam,(27,-43,23));o.rotation_euler=(Vector((0,0,10))-o.location).to_track_quat('-Z','Y').to_euler();cam.lens=48;scene.camera=o
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=40;scene.cycles.use_denoising=True
scene.render.resolution_x=1200;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG'
# Native source includes the individually editable construction; runtime export consolidates meshes.
bpy.data.libraries.write(str(OUT/'miner-gate.blend'),{scene},fake_user=True)
for o in list(bpy.context.selected_objects):o.select_set(False)
for o in asset.objects:
    if o.type=='MESH':o.select_set(True)
bpy.context.view_layer.objects.active=next(o for o in asset.objects if o.type=='MESH')
# Keep logical source mesh names in .blend. GLB combines by material through exporter shared data.
bpy.ops.export_scene.gltf(filepath=str(PUB/'miner-gate.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_cameras=False,export_lights=False,export_animations=False,export_materials='EXPORT',export_yup=True)
manifest={'source':'assets/environments/miner-gate/miner-gate.blend','runtime':'public/models/environments/miner-gate.glb','objects':len([o for o in asset.objects if o.type=='MESH']),'materials':[m.name for m in [stone,wood,iron,cloth,gold,ember]],'dimensions':'~29 × 23 × 13 m including threshold','front':'+Z (glTF)','up':'+Y (glTF)','origin':'threshold at y=0','browserScreenshot':False,'status':'candidate — requires visual review'}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
RESULT=manifest
bpy.context.window.scene=previous
