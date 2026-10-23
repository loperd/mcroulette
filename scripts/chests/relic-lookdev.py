"""Three physical materials on frozen real chest patches, not the whole chest.

python3.13 scripts/chests/relic-lookdev.py build
python3.13 scripts/chests/relic-lookdev.py render [--quick]
"""
from pathlib import Path
import argparse
import copy
import hashlib
import importlib.util
import json
import math
import struct
import subprocess
import sys
import tempfile
import time

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE=Path(__file__).resolve().parent
def module(name,file):
    spec=importlib.util.spec_from_file_location(name,HERE/file);m=importlib.util.module_from_spec(spec);sys.modules[name]=m;spec.loader.exec_module(m);return m
api=module('lookdev_export','build-relic.py');layout=module('lookdev_layout','build-relic-pbr.py');review=module('lookdev_review','review-relic.py')
ROOT=api.ROOT;ASSETS=ROOT/'assets/chests/relic-material-lookdev';OUT=ROOT/'artifacts/relic-material-lookdev'
SOURCE=ROOT/'assets/chests/relic-v3-pbr/relic.bbmodel';VARIANTS=['restrained','balanced','weathered']
FAMILIES={'obsidian':{'parts':['Body.FrontInsert1'],'material':0,'scale':.47},
          'metal':{'parts':['Lid.CornerRoof.1.-1','LidAssembly.CornerCap.1.-1'],'material':2,'scale':.32},
          'crystal':{'parts':['Body.HeartCrystal','Body.ReliquaryFrame','Body.ReliquaryRecess','Body.CrystalClaw.-1.4.12','Body.CrystalClaw.1.4.12','Body.CrystalClaw.-1.7.62','Body.CrystalClaw.1.7.62'],'material':4,'scale':.57}}
VIEW=[1.2,.55,-2.2]


def smooth(a,b,x):
    t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)


def polygon(u,v,points):
    inside=np.zeros_like(u,dtype=bool)
    for (x,y),(a,b)in zip(points,points[1:]+points[:1]):
        inside^=((y>v)!=(b>v))&(u<(a-x)*(v-y)/(b-y+1e-12)+x)
    return inside.astype(float)


def lines(u,v,points,width):
    d=np.full_like(u,1e4,dtype=float)
    for a,b in zip(np.array(points),np.array(points[1:])):
        e=b-a;t=np.clip(((u-a[0])*e[0]+(v-a[1])*e[1])/(e@e),0,1)
        d=np.minimum(d,np.hypot(u-a[0]-t*e[0],v-a[1]-t*e[1]))
    return np.exp(-(d/width)**2)


def field(ch,family,severity):
    """Material structure in source-object coordinates, never light/camera data."""
    yy,xx=np.mgrid[:ch['h'],:ch['w']];du=xx/layout.DENSITY;dv=yy/layout.DENSITY
    vertices=np.array([ch['part']['vertices'][i]for i in ch['face']]);origin=vertices[0]-ch['t']*ch['p'][0,0]-ch['b']*ch['p'][0,1]
    world=origin+du[...,None]*ch['t']+dv[...,None]*ch['b'];lo=np.min(ch['part']['vertices'],axis=0);hi=np.max(ch['part']['vertices'],axis=0);span=np.maximum(hi-lo,.01)
    # Front crystal/stone use XY; the cap uses a coherent XZ surface layout.
    if family=='metal':u=(world[...,0]-lo[0])/span[0];v=(world[...,2]-lo[2])/span[2]
    else:u=(world[...,0]-lo[0])/span[0];v=(world[...,1]-lo[1])/span[1]
    points=ch['p'];edge=np.full_like(u,1e4)
    for a,b in zip(points,np.roll(points,-1,axis=0)):
        e=b-a;t=np.clip(((du-a[0])*e[0]+(dv-a[1])*e[1])/(e@e),0,1)
        edge=np.minimum(edge,np.hypot(du-a[0]-t*e[0],dv-a[1]-t*e[1]))
    # Stable coordinate fields rather than new random patterns per variant.
    grain=np.sin(world[...,0]*37+np.sin(world[...,1]*19)*1.2)*np.sin(world[...,2]*31+world[...,1]*43)
    mineral=np.sin(u*12+v*5+np.sin(v*19))*.5+np.cos(v*21-u*8)*.3
    level=[.42,.72,1.][severity]
    if family=='obsidian':
        # The existing chipped top edge is near (u=.59,v=1). Conchoidal fan
        # below it is smooth; a narrow broken rim is rough, not equally noisy.
        r=np.sqrt(((u-.59)/.52)**2+((v-1.02)/.43)**2)
        fan=(1-smooth(.54+.14*level,.74+.22*level,r))*(v>.65-.18*level)
        fracture=fan*(.78+.22*np.sin((u*.6+v)*5))
        rim=(smooth(.35,.50,r)-smooth(.63+.10*level,.77+.20*level,r))*(v>.54)
        cut=polygon(u,v,[(.04,.08),(.28,.03),(.35,.20),(.15,.30)])*(.35 if severity==0 else .8 if severity==1 else 1)
        crack=lines(u,v,[(.59,.99),(.55,.84),(.63,.69),(.57,.50 if severity>0 else .72)],.012)
        if severity>0:crack=np.maximum(crack,lines(u,v,[(.63,.69),(.75,.58),(.81,.40)],.009))
        if severity>1:crack=np.maximum(crack,lines(u,v,[(.57,.50),(.48,.36),(.51,.20)],.010))
        damaged=np.clip(rim*.85+cut*.75+crack*.6,0,1)
        rgb=np.broadcast_to([31.,33.,48.],(*u.shape,3)).copy();rgb+=mineral[...,None]*[3,3,5]
        rgb=rgb*(1-fracture[...,None]*.72)+np.array([53,55,73])*fracture[...,None]*.72
        rgb=rgb*(1-damaged[...,None]*.45)+np.array([25,30,43])*damaged[...,None]*.45
        rgb-=crack[...,None]*[14,15,18];rgb+=grain[...,None]*(.35+damaged[...,None]*1.5)
        rough=np.clip(.49+mineral*.035-fracture*.27+damaged*.34+crack*.10+grain*.025*damaged,.16,.94)
        # Smooth broad fracture plane + curved fracture ledges, rough matrix
        # only in damaged regions; shallow cracks have a distinct cut profile.
        height=fracture*(u*.035+v*.025)+rim*np.sin(r*38)*.008*level-crack*.028*level+grain*(.001+damaged*.010)
        metallic=np.zeros_like(u);ao=1-crack*.22;emission=np.zeros((*u.shape,3))
    elif family=='metal':
        # Selective high-point rub, not a continuous bright rectangle.
        interrupted=smooth(-.1,.6,np.sin(u*13+v*7)+np.cos(v*15-u*4))
        rub=np.exp(-edge/(.10+.08*level))*interrupted
        corner=np.exp(-((u-.87)**2/.035+(v-.10)**2/.065))*level
        patina=smooth(.7-.5*level,1.1-.3*level,np.cos(u*7-v*5)+.35*np.sin(v*15))*level
        # Protected seam near the cap's rear edge / plate junction.
        patina=np.clip(patina+(1-smooth(.01,.18,v))*.25*level,0,.85)
        wear=np.clip(rub*(.5+.5*level)+corner*.8,0,1)
        brush=np.sin(du*43+np.sin(dv*12)*.35)*.5+.5
        scratch=lines(u,v,[(.70,.06),(.65,.21),(.63,.32)],.010)*level
        if severity>0:scratch=np.maximum(scratch,lines(u,v,[(.86,.18),(.73,.25),(.69,.40)],.008))
        if severity>1:scratch=np.maximum(scratch,lines(u,v,[(.20,.68),(.31,.72),(.43,.72)],.009))
        rgb=np.broadcast_to([81.,108.,103.],(*u.shape,3)).copy()
        rgb=rgb*(1-patina[...,None]*.75)+np.array([28,57,53])*patina[...,None]*.75
        rgb=rgb*(1-wear[...,None]*.8)+np.array([119,135,125])*wear[...,None]*.8
        rgb+=scratch[...,None]*[14,17,14]+brush[...,None]*.4
        rough=np.clip(.37+patina*.38-wear*.21+brush*.012+scratch*.10,.14,.88)
        metallic=np.clip(.97-patina*.65,.28,.99)
        height=(brush-.5)*.0005+grain*.0015*patina-scratch*.022+corner*np.sin(u*24+v*12)*.012
        ao=1-patina*.06-scratch*.12;emission=np.zeros((*u.shape,3))
    else:
        # Growth/absorption is spatially coherent across the real crystal.
        core=np.exp(-((u-.53)**2/.038+(v-.48)**2/.24))
        growth=.5+.5*np.sin(v*18+u*4+np.sin(v*5))
        vein=lines(u,v,[(.38,.14),(.46,.33),(.42,.53),(.53,.74),(.49,.90)],.014)
        cloud_area=smooth(.65-.5*level,1.0-.4*level,mineral+.25)
        clouds=cloud_area*(.12+.40*level)
        abrasion=np.exp(-edge/(.055+.11*level))*smooth(.05,.65,np.sin(u*18+v*23))*(.10+.65*level)
        rgb=np.broadcast_to([24.,126.,126.],(*u.shape,3)).copy()
        rgb+=growth[...,None]*[8,27,18]-core[...,None]*[10,38,28]
        rgb+=vein[...,None]*[35,60,45];rgb=rgb*(1-clouds[...,None])+np.array([69,153,143])*clouds[...,None]
        rough=np.clip(.105+clouds*.40+abrasion*.55,.09,.68);metallic=np.zeros_like(u)
        height=grain*.0015*abrasion
        # Bright strands, darker bulk. No white-hot slab or simulated glass.
        luminous=(.08+vein*.68+growth*.06)*(1-clouds)
        emission=np.stack([luminous*.25,luminous,luminous*.72],axis=-1)
        ao=np.ones_like(u)
    # Masking normals at seams avoids visible chart borders while leaving the
    # physically meaningful meso planes and crack relief inside each face.
    height*=smooth(0,.055,edge)
    dy,dx=np.gradient(height,1/layout.DENSITY);normal=np.stack([-dx,-dy,np.ones_like(dx)],axis=-1);normal/=np.linalg.norm(normal,axis=-1)[...,None]
    return [np.clip(rgb,0,255).astype('uint8'),np.round(np.clip(np.stack([ao,rough,metallic],axis=-1),0,1)*255).astype('uint8'),np.round((normal*.5+.5)*255).astype('uint8'),np.round(np.clip(emission,0,1)*255).astype('uint8')]


def build(family_filter=None):
    ASSETS.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
    source_hash=hashlib.sha256(SOURCE.read_bytes()).hexdigest();chest_hash=hashlib.sha256((SOURCE.parent/'relic.glb').read_bytes()).hexdigest()
    with tempfile.TemporaryDirectory(prefix='relic-patch-import-')as tmp:
        api.OUT=Path(tmp);model,_=api.from_bbmodel(SOURCE)
    layout.DENSITY=16 # 256 texels/block, measured on the cropped source surface.
    records=[]
    if family_filter and (ASSETS/"manifest.json").exists():records=[s for s in json.loads((ASSETS/"manifest.json").read_text())["studies"]if s["family"]!=family_filter]
    for family,config in FAMILIES.items():
        if family_filter and family!=family_filter:continue
        patch=api.Model();patch.parts=copy.deepcopy([p for p in model.parts if p['name']in config['parts']]);assert len(patch.parts)==len(config['parts'])
        points=np.concatenate([p['vertices']for p in patch.parts]);lo,hi=points.min(axis=0),points.max(axis=0);translation=-np.array([(lo[0]+hi[0])/2,lo[1]-12.8,(lo[2]+hi[2])/2])
        for part in patch.parts:
            part['vertices']=(np.array(part['vertices'])+translation).tolist();part['group']='Body';part.pop('_uv',None)
            if part['name']!='Body.HeartCrystal'and family=='crystal':part['material']=6
        charts=layout.chart_layout(patch);focus=config['material'];collection=charts[focus];width=collection[0]['size'];height=collection[0]['atlasHeight']
        target=[0,.8+float((hi[1]-lo[1])/32),0]
        for severity,variant in enumerate(VARIANTS):
            folder=ASSETS/family/variant;folder.mkdir(parents=True,exist_ok=True);api.OUT=folder
            # Keep the same seven material slots for reuse of the established
            # exporter. Non-focused holder is neutral gray, deliberately.
            api.MATERIALS[:]=[dict(name=m['name'],color='#777777',metallic=0,roughness=.8)for m in api.MATERIALS]
            canvases=[np.zeros((height,width,3),dtype='uint8')for _ in range(4)];canvases[1][:]=[255,200,0];canvases[2][:]=[128,128,255]
            for ch in collection:
                for canvas,sample in zip(canvases,field(ch,family,severity)):
                    g=layout.GUTTER;padded=np.pad(sample,((g,g),(g,g),(0,0)),mode='edge');x,y=ch['x']-g,ch['y']-g;canvas[y:y+padded.shape[0],x:x+padded.shape[1]]=padded
            images=[]
            for i,mat in enumerate(api.MATERIALS):
                image=Image.fromarray(canvases[0])if i==focus else Image.new('RGB',(16,16),(119,119,119));images.append(image);image.save(folder/(mat['name'].replace('.','-')+'.png'))
            bindings={}
            for channel,canvas in zip(['orm','normal','emissive'],canvases[1:]):
                if channel=='emissive'and family!='crystal':continue
                filename=channel+'.png';Image.fromarray(canvas).save(folder/filename);bindings[channel]=filename
            api.MATERIALS[focus].update(metallic=1,roughness=1,maps=bindings)
            if family=='crystal':api.MATERIALS[focus]['emission']=[.07,.22,.15]
            api.REVISION='relic-material-study';api.TITLE=f'Relic {family} / {variant}'
            api.bbmodel(patch,images);api.glb(patch,images);(folder/'materials.json').write_text(json.dumps(api.MATERIALS,indent=2))
            record={'family':family,'variant':variant,'asset':str((folder/'relic.glb').relative_to(ROOT)),'sha256':hashlib.sha256((folder/'relic.glb').read_bytes()).hexdigest(),'sourceParts':config['parts'],'translationAuthorUnits':translation.tolist(),'camera':{'direction':VIEW,'scale':config['scale'],'target':target},'atlas':[width,height],'texelsPerBlock':256,'focusMaterial':focus,'purpose':'isolated material study, not a production chest or animation asset'}
            (folder/'study.json').write_text(json.dumps(record,indent=2));records.append(record)
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==source_hash
    assert hashlib.sha256((SOURCE.parent/'relic.glb').read_bytes()).hexdigest()==chest_hash
    records.sort(key=lambda s:(list(FAMILIES).index(s['family']),VARIANTS.index(s['variant'])))
    (ASSETS/'manifest.json').write_text(json.dumps({'source':str(SOURCE.relative_to(ROOT)),'sourceSha256':source_hash,'frozenChestSha256':chest_hash,'studies':records},indent=2))
    print('built',len(records),'studies; frozen chest preserved')


LIGHTS={
    'neutral':[{'position':[-1.8,.2,-3.4],'width':2.,'height':.45,'radiance':6.}, {'position':[2.8,2.4,-1.5],'width':2.5,'height':2.5,'radiance':10.}, {'position':[-.5,2.8,2.8],'width':2.,'height':2.,'radiance':6.}],
    'grazing':[{'position':[-3.,.8,-1.6],'width':.8,'height':1.7,'radiance':18.}, {'position':[2.8,2.4,-1.5],'width':2.5,'height':2.5,'radiance':10.}, {'position':[-.5,2.8,2.8],'width':2.,'height':2.,'radiance':6.}]
}


def tracer(suffix):
    binary=Path(tempfile.gettempdir())/('mcroulette-material-study-'+suffix)
    subprocess.run(['clang++','-O3','-std=c++17','-pthread',str(HERE/'review-tracer.cpp'),'-o',str(binary)],check=True)
    return binary


def frame(binary,scene,file,camera,size,spp,mode):
    target=camera['target'];ppm=file.with_suffix('.ppm');start=time.monotonic()
    subprocess.run([str(binary),str(scene),str(ppm),str(size),str(spp),'0',*map(str,camera['direction']),str(camera['scale']),str(target[1]),str(target[0]),str(target[2]),str(mode)],check=True)
    Image.open(ppm).save(file);ppm.unlink()
    return round(time.monotonic()-start,2)


def render(quick=False,rig='both',resume=False):
    OUT.mkdir(parents=True,exist_ok=True);manifest=json.loads((ASSETS/'manifest.json').read_text());binary=tracer('render')
    size=320 if quick else 560;spp=36 if quick else 256
    rigs=['neutral','grazing']if rig=='both'else[rig]
    for rig in rigs:
        records=[];mode=2 if rig=='neutral'else 3
        report=OUT/('render-'+rig+('-quick'if quick else'')+'.json')
        previous=json.loads(report.read_text())if resume and report.exists()else {}
        old={s['file']:s for s in previous.get('shots',[])}if previous.get('shaderSha256')==hashlib.sha256((HERE/'review-tracer.cpp').read_bytes()).hexdigest()else {}
        result={'renderer':'CPU GGX, actual exported GLB maps; not WebGL','shaderSha256':hashlib.sha256((HERE/'review-tracer.cpp').read_bytes()).hexdigest(),'lights':LIGHTS[rig],'lightTarget':[0,.96,0],'exposure':1,'bloom':False,'shots':records}
        for study in manifest['studies']:
            name=study['family']+'-'+study['variant'];file=OUT/(name+'-'+rig+('-quick'if quick else'')+'.png')
            prior=old.get(file.name)
            if prior and prior['sha256']==study['sha256']and prior['camera']==study['camera']and prior['size']==size and prior['spp']==spp and file.exists()and prior['imageSha256']==hashlib.sha256(file.read_bytes()).hexdigest():
                records.append(prior);continue
            scene=OUT/('.'+name+'.scene');review.scene(scene,source=ROOT/study['asset'])
            seconds=frame(binary,scene,file,study['camera'],size,spp,mode);scene.unlink()
            records.append({**study,'file':file.name,'imageSha256':hashlib.sha256(file.read_bytes()).hexdigest(),'size':size,'spp':spp,'rig':rig,'seconds':seconds})
            result={'renderer':'CPU GGX, actual exported GLB maps; not WebGL','shaderSha256':hashlib.sha256((HERE/'review-tracer.cpp').read_bytes()).hexdigest(),'lights':LIGHTS[rig],'lightTarget':[0,.96,0],'exposure':1,'bloom':False,'shots':records}
            report.write_text(json.dumps(result,indent=2));print(name,rig,seconds,flush=True)
        result['shots']=records;report.write_text(json.dumps(result,indent=2))
        sheet(records,quick,rig)


def ablations():
    manifest=json.loads((ASSETS/'manifest.json').read_text());binary=tracer('ablation');records=[]
    baseline=json.loads((OUT/'render-neutral.json').read_text())
    assert baseline['shaderSha256']==hashlib.sha256((HERE/'review-tracer.cpp').read_bytes()).hexdigest()
    for family,channel in [('obsidian','normal'),('obsidian','roughness'),('metal','normal'),('metal','metallic'),('crystal','emissive')]:
        study=next(s for s in manifest['studies']if s['family']==family and s['variant']=='balanced')
        on=next(s for s in baseline['shots']if s['family']==family and s['variant']=='balanced');assert on['sha256']==study['sha256']
        scene=OUT/('.ablation-'+family+'.scene');review.scene(scene,source=ROOT/study['asset']);rows=scene.read_text().splitlines();i=1+study['focusMaterial'];tokens=rows[i].split()
        if channel=='normal':tokens[13]='0'
        elif channel in ['roughness','metallic']:
            # Change only G or B pixels, leaving AO and the other PBR channel
            # intact. This checks texture consumption, not just a scalar knob.
            g,_,_,_=review.decode(ROOT/study['asset']);texture=g['materials'][study['focusMaterial']]['pbrMetallicRoughness']['metallicRoughnessTexture']['index'];image=g['textures'][texture]['source']
            cursor=1+len(g['materials'])
            for image_index in range(len(g['images'])):
                w,h=map(int,rows[cursor].split());cursor+=1
                if image_index==image:
                    for line in range(cursor,cursor+w*h):
                        rgb=rows[line].split();rgb[1 if channel=='roughness'else 2]='.49'if channel=='roughness'else'0';rows[line]=' '.join(rgb)
                    break
                cursor+=w*h
        else:tokens[5:8]=['0','0','0']
        rows[i]=' '.join(tokens);scene.write_text('\n'.join(rows)+'\n');file=OUT/f'{family}-{channel}-off.png'
        seconds=frame(binary,scene,file,study['camera'],on['size'],on['spp'],2);scene.unlink()
        a=np.array(Image.open(OUT/on['file']).convert('RGB')).astype(float);b=np.array(Image.open(file).convert('RGB')).astype(float);delta=abs(a-b)
        record={'family':family,'channelDisabled':channel,'on':on['file'],'off':file.name,'assetSha256':study['sha256'],'sameGeometryCameraLightSampling':True,'meanAbsoluteByteDifference':float(delta.mean()),'changedPixelFraction':float((delta.max(axis=-1)>2).mean()),'seconds':seconds,'scope':'Offline shader channel-consumption test; not Three.js GPU validation'}
        assert record['meanAbsoluteByteDifference']>.05,record
        records.append(record);print(family,channel,record['meanAbsoluteByteDifference'],flush=True)
    (OUT/'channel-ablation.json').write_text(json.dumps(records,indent=2))
    font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',20);panel=Image.new('RGB',(1160,610*len(records)),(22,27,34));draw=ImageDraw.Draw(panel)
    for row,record in enumerate(records):
        y=row*610;draw.text((15,y+8),record['family'].upper()+' / '+record['channelDisabled'].upper()+' ON vs OFF / SAME LIGHT',font=font,fill=(220,230,232))
        panel.paste(Image.open(OUT/record['on']),(10,y+40));panel.paste(Image.open(OUT/record['off']),(590,y+40))
    panel.save(OUT/'channel-ablation.png')


def sheet(records,quick,rig):
    tile=320 if quick else 560;canvas=Image.new('RGB',(tile*3+40,tile*3+175),(22,27,34));draw=ImageDraw.Draw(canvas)
    font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',20)
    for i,variant in enumerate(VARIANTS):draw.text((i*tile+20,12),variant.upper(),font=font,fill=(219,231,234))
    for row,family in enumerate(FAMILIES):
        for col,variant in enumerate(VARIANTS):
            shot=next(r for r in records if r['family']==family and r['variant']==variant);x=20+col*tile;y=55+row*(tile+40);canvas.paste(Image.open(OUT/shot['file']),(x,y));draw.text((x,y+tile+5),family.upper(),font=font,fill=(219,231,234))
    canvas.save(OUT/('matrix-'+rig+('-quick'if quick else'')+'.png'))


def channels():
    """Raw canonical texels on the same visible face, no contrast amplification."""
    font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',18);records=[]
    for family,config in FAMILIES.items():
        panel=Image.new('RGB',(1500,1200),(22,27,34));draw=ImageDraw.Draw(panel)
        for row,variant in enumerate(VARIANTS):
            folder=ASSETS/family/variant;source=json.loads((folder/'relic.bbmodel').read_text());mat=json.loads((folder/'materials.json').read_text())[config['material']]
            part_name={'obsidian':'Body.FrontInsert1','metal':'Lid.CornerRoof.1.-1','crystal':'Body.HeartCrystal'}[family]
            part=next(p for p in source['elements']if p['name']==part_name);direction=np.array([0,1,0]if family=='metal'else[0,0,-1])
            def normal(face):
                v=np.array([part['vertices'][i]for i in face['vertices']]);n=np.cross(v,np.roll(v,-1,axis=0)).sum(axis=0);return n/np.linalg.norm(n)
            def area(face):
                p=np.array(list(face['uv'].values()));q=np.roll(p,-1,axis=0);return abs((p[:,0]*q[:,1]-p[:,1]*q[:,0]).sum())/2
            key,face=max(((k,f)for k,f in part['faces'].items()if normal(f)@direction>.9),key=lambda pair:area(pair[1]));uv=np.array(list(face['uv'].values()));box=(*np.floor(uv.min(axis=0)).astype(int),*np.ceil(uv.max(axis=0)).astype(int))
            color=Image.open(folder/(mat['name'].replace('.','-')+'.png')).convert('RGB');orm=Image.open(folder/'orm.png').convert('RGB');normal_image=Image.open(folder/'normal.png').convert('RGB')
            emissive=Image.open(folder/'emissive.png').convert('RGB')if family=='crystal'else Image.new('RGB',color.size)
            maps=[(color,'BASE COLOR / sRGB'),(orm.getchannel('G').convert('RGB'),'ROUGHNESS / G'),(normal_image,'NORMAL / RGB'),(orm.getchannel('B').convert('RGB'),'METALLIC / B'),(orm.getchannel('R').convert('RGB'),'AO / R'),(emissive,'EMISSIVE / sRGB')]
            y=row*400;draw.text((10,y+6),family.upper()+' / '+variant.upper()+' / RAW MAPS, NEAREST / NO GAIN',font=font,fill=(220,230,232))
            for col,(image,label)in enumerate(maps):
                draw.text((col*250+8,y+33),label,font=font,fill=(220,230,232));crop=image.crop(box);scale=min(234/crop.width,335/crop.height);tile=crop.resize((round(crop.width*scale),round(crop.height*scale)),Image.Resampling.NEAREST);panel.paste(tile,(col*250+8,y+62))
            records.append({'family':family,'variant':variant,'part':part_name,'face':key,'atlasRectPixels':[int(x)for x in box],'normal':normal(face).tolist(),'colorGain':1,'normalGain':1})
        panel.save(OUT/(family+'-channels.png'))
    (OUT/'channel-crops.json').write_text(json.dumps(records,indent=2))


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['build','render','ablations','channels']);parser.add_argument('--quick',action='store_true');parser.add_argument('--rig',choices=['neutral','grazing','both'],default='both');parser.add_argument('--resume',action='store_true');parser.add_argument('--family',choices=list(FAMILIES));args=parser.parse_args()
    if args.action=='build':build(args.family)
    elif args.action=='render':render(args.quick,args.rig,args.resume)
    elif args.action=='ablations':ablations()
    else:channels()
