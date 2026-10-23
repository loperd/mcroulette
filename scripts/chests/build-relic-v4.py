"""V4 material-only candidate. Frozen V3 vertices, faces, UVs and animation.

Fields are evaluated in source-object coordinates. No camera/light information
is used in textures. The existing atlas budget and controlled exporter remain.
"""
from pathlib import Path
import hashlib
import importlib.util
import json
import math
import shutil
import sys
import tempfile
import numpy as np
from PIL import Image

HERE=Path(__file__).resolve().parent
def module(name,file):
    spec=importlib.util.spec_from_file_location(name,HERE/file);m=importlib.util.module_from_spec(spec);sys.modules[name]=m;spec.loader.exec_module(m);return m
api=module('v4_export','build-relic.py')
preview=module('v4_preview','build-relic-pbr.py')
ROOT=api.ROOT;SOURCE=ROOT/'assets/chests/relic-v3-pbr';OUT=ROOT/'assets/chests/relic-v4'
DENSITY=8;GUTTER=4

def smooth(a,b,x):
    t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)

def charts(model,images,focus=None):
    """Recover existing charts; do not pack, resize, or change a single UV."""
    result=[[]for _ in images]
    for part in model.parts:
        if focus is not None and part['material']!=focus:continue
        for fi,face in enumerate(part['faces']):
            verts=np.array([part['vertices'][i]for i in face]);n=np.cross(verts,np.roll(verts,-1,axis=0)).sum(axis=0);n/=np.linalg.norm(n)
            t=verts[1]-verts[0];t/=np.linalg.norm(t);b=np.cross(n,t)
            p=np.stack([verts@t,verts@b],axis=-1);p-=p.min(axis=0)
            uv=np.array(part['_uv'][fi])*images[part['material']].size
            xy=np.floor(uv.min(axis=0)+1e-5).astype(int)
            wh=np.maximum(2,np.ceil(np.ptp(p,axis=0)*DENSITY-1e-7).astype(int)+1)
            assert np.max(abs(uv-(p*DENSITY+xy+.5)))<.001
            result[part['material']].append(dict(part=part,face=face,p=p,t=t,b=b,normal=n,x=int(xy[0]),y=int(xy[1]),w=int(wh[0]),h=int(wh[1])))
    return result

def line(u,v,points,width):
    d=np.full_like(u,100.);progress=np.zeros_like(u)
    for i,(a,b) in enumerate(zip(np.array(points),np.array(points[1:]))):
        e=b-a;q=np.clip(((u-a[0])*e[0]+(v-a[1])*e[1])/(e@e),0,1)
        dist=np.hypot(u-a[0]-q*e[0],v-a[1]-q*e[1]);closer=dist<d
        progress=np.where(closer,(i+q)/(len(points)-1),progress);d=np.minimum(d,dist)
    return np.exp(-(d/(width*(1-.65*progress)))**2)*(1-.5*progress)

def field(ch,mi):
    # Two samples per axis anti-alias cuts before encoding, without larger maps.
    w,h=ch['w'],ch['h'];yy,xx=np.mgrid[:h*2,:w*2];du=(xx-.5)/2/DENSITY;dv=(yy-.5)/2/DENSITY
    verts=np.array([ch['part']['vertices'][i]for i in ch['face']]);origin=verts[0]-ch['t']*ch['p'][0,0]-ch['b']*ch['p'][0,1]
    xyz=origin+du[...,None]*ch['t']+dv[...,None]*ch['b'];x,y,z=np.moveaxis(xyz,-1,0)
    name=ch['part']['name'];lo=np.min(ch['part']['vertices'],axis=0);span=np.maximum(np.ptp(ch['part']['vertices'],axis=0),.01)
    seed=int.from_bytes(hashlib.sha256(name.encode()).digest()[:4],'little');phase=seed%1009/1009*math.tau
    axes=np.argsort(span)[-2:];a,c=axes
    u=(xyz[...,a]-lo[a])/span[a];v=(xyz[...,c]-lo[c])/span[c]
    # Continuous three-dimensional fields cross chart seams on a physical part.
    # Grain stays near the existing atlas scale; supersampling suppresses its
    # unresolved components instead of adding very high-frequency white noise.
    grain=(np.sin(x*17+y*23+z*19)*np.sin(x*31-y*13+z*29)+np.sin(x*37+y*33-z*17))*.5
    cloud=(np.sin(x*.83+y*1.21+z*.97+phase)+np.sin(x*2.13-y*.61+z*1.37+phase*2))*.5
    edge=np.minimum.reduce([np.maximum(0,xyz[...,a]-lo[a]),np.maximum(0,lo[a]+span[a]-xyz[...,a]),np.maximum(0,xyz[...,c]-lo[c]),np.maximum(0,lo[c]+span[c]-xyz[...,c])])
    rgb=np.zeros((*u.shape,3));rough=np.zeros_like(u);metal=np.zeros_like(u);height=np.zeros_like(u);emit=np.zeros_like(rgb);ao=np.ones_like(u)
    if mi in [0,1]:
        # Glassy worked mineral, restrained grain. Damage is tied to the real
        # missing flake, not stamped on every panel or repeated per atlas face.
        fresh=np.zeros_like(u);broken=np.zeros_like(u);crack=np.zeros_like(u);fracture=np.zeros_like(u)
        if name=='Body.FrontInsert1':
            u=(x-lo[0])/span[0];v=(y-lo[1])/span[1]
            q=(u-.59)/.43;r=(v-1.04)/.31
            radius=np.sqrt(q*q+r*r);irregular=radius+.035*np.sin(u*23+v*17)+.025*np.sin(v*41)
            fresh=1-smooth(.50,.98,irregular)
            broken=(smooth(.72,.88,irregular)-smooth(.95,1.14,irregular))*(.72+.28*np.sin(u*29-v*9)**2)
            # Nonconcentric overlapping shell fractures. No painted white rims.
            lobe=np.exp(-((u-.54)**2/.024+(v-.91)**2/.006))
            lobe2=np.exp(-((u-.69)**2/.012+(v-.96)**2/.013))
            fracture=.027*lobe-.018*lobe2+.012*fresh*(u-.59)
            crack=line(u,v,[(.585,.997),(.577,.94),(.593,.88),(.572,.82),(.563,.76)],.010)
            crack=np.maximum(crack,line(u,v,[(.59,.89),(.642,.867),(.669,.82)],.006)*.52)
        elif name=='Lid.Slab':
            # A single small exposed edge bruise, much quieter than the hero chip.
            broken=np.exp(-((u-.83)**2/.003+(v-.99)**2/.0015))*.65
        pigment=cloud*.75+grain*.18
        rgb[:]=[34,36,53]if mi==0 else[25,32,43]
        rgb+=pigment[...,None]*[1,1,1.4]+fresh[...,None]*[2,2,3]+broken[...,None]*[5,5,6]-crack[...,None]*[2,2,2]
        rough=np.clip((.43 if mi==0 else .49)+cloud*.035+grain*.008-fresh*.21+broken*.33+crack*.22,.19,.86)
        height=grain*(.0008+broken*.002)+fracture-crack*.016
        ao=1-crack*.09
    elif mi in [2,3]:
        corner=any(k in name for k in ['Corner','Foot','Cap','Plinth'])
        touch=any(k in name for k in ['Clasp','Latch','Lock','Reliquary'])
        exposed=.90 if corner else .60 if touch else .18
        ru=.18+(seed%17)/31;rv=.08+((seed>>5)%13)/19
        patch=np.clip(np.exp(-((u-ru)**2/.08+(v-rv)**2/.13))+.48*np.exp(-((u-.9)**2/.03+(v-.12)**2/.025)),0,1)
        rubbed=np.exp(-edge/.14)*patch*exposed
        # Different machining/contact directions for broad faces and narrow trims.
        brush=np.sin((x*.21+y*.87+z*.36)*19+np.sin(z*3))
        # Small deposits near joints instead of a broad procedural dark stripe.
        deposits=np.exp(-((u-.12)**2/.007+(v-.20)**2/.035))+.6*np.exp(-((u-.91)**2/.012+(v-.80)**2/.009))
        patina=np.clip(deposits*(.34 if corner else .46)*np.exp(-edge/.35),0,.55)
        recess=np.exp(-edge/.07)*(1-patch)*(.12 if corner else .23)
        contact=np.exp(-((u-.61)**2/.04+(v-.53)**2/.09))*(.65 if touch else 0)
        scratch=np.zeros_like(u)
        # Sparse short cuts in frequently exposed/contacted areas, seeded per part.
        if corner or touch:
            for i in range(3 if corner else 2):
                su=.12+((seed>>(i*4))%13)/19;sv=.08+((seed>>(i*5+2))%17)/22
                scratch=np.maximum(scratch,line(u,v,[(su,sv),(su+.11,sv+.018),(su+.18,sv+.013)],.006))
        rgb[:]=[83,112,107]if mi==2 else[48,67,70]
        rgb+=cloud[...,None]*[2,3,2]+rubbed[...,None]*[37,38,32]+contact[...,None]*[11,13,10]-patina[...,None]*[22,17,11]-recess[...,None]*[15,17,14]+scratch[...,None]*[22,25,19]
        rough=np.clip((.39 if mi==2 else .48)+patina*.40+recess*.30-rubbed*.18-contact*.10+brush*.012+scratch*.12,.19,.78)
        metal=np.clip(.96-patina*.70-recess*.24,.43,.97)
        height=brush*.0010*(1-rubbed*.8)-scratch*.006-patina*grain*.0015
        ao=1-recess*.3
    elif mi in [4,5]:
        crown='CrownCrystal'in name
        u=(x-lo[0])/span[0];v=((z-lo[2])/span[2])if crown else(y-lo[1])/span[1]
        # Absorption/color zoning follows the mineral, never a studio highlight.
        growth=.5+.5*np.sin(v*12+u*3+np.sin(u*8)*.55)
        core=np.exp(-((u-.47)**2/.045+(v-.56)**2/.19))
        strand=line(u,v,[(.28,.13),(.39,.36),(.44,.61),(.58,.89)],.038)
        vein=line(u,v,[(.68,.18),(.59,.38),(.65,.63),(.53,.81)],.014)
        zone=np.clip(.12+core*.38+strand*.40+growth*.13,0,1)
        # Intrinsic composition differs across actual physical facets. No normal
        # dot-light, facing ratio or baked lighting, and no flat cyan paint.
        facet=.82+.18*math.sin(float(np.mean(verts[:,0]))*3.7+float(np.mean(verts[:,2]))*2.1)
        rgb[:]=[12,66,75]if mi==4 else[17,83,83]
        rgb+=zone[...,None]*[12,47,30]+vein[...,None]*[5,11,9]
        rough=np.clip(.20+cloud*.025+grain*.004+np.exp(-edge/.06)*.06,.15,.31)
        height=grain*.00008
        luminous=np.clip((.24+zone*.76+vein*.10)*facet,0,1)
        if mi==5:luminous*=.65
        # Stored as sRGB; GLTFLoader decodes before applying a LINEAR factor.
        emit=np.stack([luminous*.42,luminous,luminous*.84],axis=-1)
    else:raise ValueError(mi)
    dy,dx=np.gradient(height,1/(2*DENSITY));normal=np.stack([-dx,-dy,np.ones_like(dx)],axis=-1);normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
    down=lambda a:a.reshape(h,2,w,2,-1).mean(axis=(1,3))
    orm=down(np.stack([ao,rough,metal],axis=-1));normal=down(normal);normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
    return [np.round(np.clip(down(rgb),0,255)).astype('uint8'),np.round(np.clip(orm,0,1)*255).astype('uint8'),np.round((normal*.5+.5)*255).astype('uint8'),np.round(np.clip(down(emit),0,1)*255).astype('uint8')]

def paint(model,images,folder):
    collections=charts(model,images);result=[]
    for mi,collection in enumerate(collections):
        name=api.MATERIALS[mi]['name'].replace('.','-')
        if mi==6:
            for suffix in ['', '-orm','-normal']:shutil.copyfile(SOURCE/(name+suffix+'.png'),folder/(name+suffix+'.png'))
            result.append(Image.open(folder/(name+'.png')).convert('RGB'));continue
        width,height=images[mi].size;canvases=[np.zeros((height,width,3),dtype='uint8')for _ in range(4)]
        canvases[1][:]=[255,128,0];canvases[2][:]=[128,128,255]
        for ch in collection:
            for canvas,sample in zip(canvases,field(ch,mi)):
                pad=np.pad(sample,((GUTTER,GUTTER),(GUTTER,GUTTER),(0,0)),mode='edge');x,y=ch['x']-GUTTER,ch['y']-GUTTER
                canvas[y:y+pad.shape[0],x:x+pad.shape[1]]=pad
        for channel,pixels in zip(['','-orm','-normal','-emissive'],canvases):
            if channel=='-emissive'and mi not in [4,5]:continue
            Image.fromarray(pixels).save(folder/(name+channel+'.png'))
        result.append(Image.open(folder/(name+'.png')).convert('RGB'))
    return result

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    original_hash=hashlib.sha256((SOURCE/'relic.glb').read_bytes()).hexdigest()
    with tempfile.TemporaryDirectory()as tmp:
        api.OUT=Path(tmp);model,images=api.from_bbmodel(SOURCE/'relic.bbmodel')
    api.MATERIALS=json.loads((SOURCE/'materials.json').read_text());api.OUT=OUT
    api.REVISION='relic-v4-material-review';api.TITLE='Relic Chest V4 — material candidate'
    api.MATERIALS[4]['emission']=[.25,1.0,1.0];api.MATERIALS[5]['emission']=[.09,.48,.42]
    images=paint(model,images,OUT)
    api.bbmodel(model,images);preview.api=api;preview.OUT=OUT;preview.blockbench_preview();api.glb(model,images)
    (OUT/'materials.json').write_text(json.dumps(api.MATERIALS,indent=2))
    contract=json.loads((SOURCE/'contract.json').read_text());contract.update(revision=api.REVISION,title=api.TITLE,status='awaiting-runtime-and-art-review',
        sourceSha256=original_hash,geometry='V3 PBR geometry and UVs preserved exactly',
        controlledExport='python3.13 scripts/chests/build-relic.py --from-bbmodel assets/chests/relic-v4/relic.bbmodel --output-dir assets/chests/relic-v4',
        emission='Core glTF surface emission; no transmission, bloom or extra neighbor lights required. Standard raster emissive does not illuminate other geometry.')
    (OUT/'contract.json').write_text(json.dumps(contract,indent=2));shutil.copyfile(SOURCE/'texture-manifest.json',OUT/'texture-manifest.json')
    assert hashlib.sha256((SOURCE/'relic.glb').read_bytes()).hexdigest()==original_hash
    print(json.dumps({'asset':str(OUT/'relic.glb'),'bytes':(OUT/'relic.glb').stat().st_size,'parts':len(model.parts),'sourceUnchanged':True}))

if __name__=='__main__':main()
