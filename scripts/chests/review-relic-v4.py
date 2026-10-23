"""Matched V3/V4 evidence from exported GLB. Offline, not a GPU substitute."""
from pathlib import Path
import argparse
import copy
import hashlib
import json
import subprocess
import tempfile
import time
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import importlib.util
import sys

HERE=Path(__file__).resolve().parent
def module(name,file):
    spec=importlib.util.spec_from_file_location(name,HERE/file);m=importlib.util.module_from_spec(spec);sys.modules[name]=m;spec.loader.exec_module(m);return m
v4=module('v4_materials','build-relic-v4.py');api=v4.api
review=module('v4_readback','review-relic.py');ROOT=api.ROOT;OUT=ROOT/'artifacts/relic-v4';ASSET=v4.OUT
FONT='/System/Library/Fonts/Supplemental/Arial.ttf'

def studies():
    records=[]
    for family,focus in [('obsidian',0),('metal',2),('crystal',4)]:
        before=ROOT/'assets/chests/relic-material-lookdev'/family/'balanced';folder=ASSET/'studies'/family;folder.mkdir(parents=True,exist_ok=True)
        info=json.loads((before/'study.json').read_text())
        with tempfile.TemporaryDirectory()as tmp:
            api.OUT=Path(tmp);model,images=api.from_bbmodel(before/'relic.bbmodel')
        api.MATERIALS=json.loads((before/'materials.json').read_text());api.MATERIALS[focus]=copy.deepcopy(json.loads((ASSET/'materials.json').read_text())[focus])
        width,height=images[focus].size;v4.DENSITY=16;collection=v4.charts(model,images,focus)[focus]
        canvases=[np.zeros((height,width,3),dtype='uint8')for _ in range(4)];canvases[1][:]=[255,128,0];canvases[2][:]=[128,128,255]
        # Evaluate the same full-chest field in its ORIGINAL coordinates, then
        # present it on the exact geometry/UV/camera used by the Balanced study.
        for ch in collection:
            ch=copy.deepcopy(ch);ch['part']['vertices']=(np.array(ch['part']['vertices'])-info['translationAuthorUnits']).tolist()
            for canvas,sample in zip(canvases,v4.field(ch,focus)):
                pad=np.pad(sample,((4,4),(4,4),(0,0)),mode='edge');x,y=ch['x']-4,ch['y']-4;canvas[y:y+pad.shape[0],x:x+pad.shape[1]]=pad
        name=api.MATERIALS[focus]['name'].replace('.','-')
        for suffix,pixels in zip(['','-orm','-normal','-emissive'],canvases):
            if suffix=='-emissive'and family!='crystal':continue
            Image.fromarray(pixels).save(folder/(name+suffix+'.png'))
        for i,image in enumerate(images):
            if i==focus:images[i]=Image.fromarray(canvases[0])
            else:image.save(folder/(api.MATERIALS[i]['name'].replace('.','-')+'.png'))
        api.OUT=folder;api.REVISION='relic-v4-isolated-study';api.TITLE='Relic V4 '+family
        api.bbmodel(model,images);api.glb(model,images);(folder/'materials.json').write_text(json.dumps(api.MATERIALS,indent=2))
        record={**info,'before':str(before/'relic.glb'),'after':str(folder/'relic.glb'),'variant':'v4'};records.append(record)
        (folder/'study.json').write_text(json.dumps(record,indent=2))
    v4.DENSITY=8;(OUT/'studies.json').write_text(json.dumps(records,indent=2))

def render(quick=False,section='all'):
    binary=Path(tempfile.gettempdir())/('mcroulette-v4-tracer-'+section);subprocess.run(['clang++','-O3','-std=c++17','-pthread',str(HERE/'review-tracer.cpp'),'-o',str(binary)],check=True)
    report=OUT/('render-'+section+('-quick'if quick else'')+'.json')
    records=json.loads(report.read_text())if report.exists()else []
    scenes={};shader=hashlib.sha256((HERE/'review-tracer.cpp').read_bytes()).hexdigest()
    def shot(name,asset,camera,mode=0,light=1,clay=0,angle=0,off=None,small=None):
        size=small or (280 if quick else 560);spp=36 if quick else (576 if name.endswith('-macro') else 256 if '/studies/' in str(asset) or 'relic-material-lookdev/' in str(asset) else 144)
        filename=name+('-quick'if quick else'')+'.png';path=OUT/filename
        assetHash=hashlib.sha256(Path(asset).read_bytes()).hexdigest();key=(str(asset),assetHash,angle,off)
        meta=dict(file=filename,asset=str(asset),assetSha256=assetHash,camera=camera,rig=mode,lightScale=light,clay=clay,angle=angle,disabled=list(off)if off else None,size=size,spp=spp,exposure=1,bloom=False,assetEmission='primary surface only; no neighboring illumination',shaderSha256=shader)
        previous=next((r for r in records if all(r.get(k)==v for k,v in meta.items())),None)
        if previous and path.exists()and previous['imageSha256']==hashlib.sha256(path.read_bytes()).hexdigest():return
        if key not in scenes:
            sc=OUT/('.'+section+('-quick'if quick else'')+'-'+str(len(scenes))+'.scene');review.scene(sc,angle=angle,source=Path(asset))
            assert hashlib.sha256(Path(asset).read_bytes()).hexdigest()==assetHash,'Asset edited during scene decode'
            if off:
                rows=sc.read_text().splitlines();mat,channel=off;tokens=rows[1+mat].split()
                if channel=='normal':tokens[13]='0'
                elif channel=='emissive':tokens[5:8]=['0']*3
                else:
                    g,_,_,_=review.decode(Path(asset));ti=g['materials'][mat]['pbrMetallicRoughness']['metallicRoughnessTexture']['index'];im=g['textures'][ti]['source'];cursor=1+len(g['materials'])
                    for index in range(len(g['images'])):
                        w,h=map(int,rows[cursor].split());cursor+=1
                        if index==im:
                            for j in range(cursor,cursor+w*h):
                                rgb=rows[j].split();rgb[1 if channel=='roughness'else 2]='.43'if channel=='roughness'else'0';rows[j]=' '.join(rgb)
                            break
                        cursor+=w*h
                rows[1+mat]=' '.join(tokens);sc.write_text('\n'.join(rows)+'\n')
            scenes[key]=sc
        target=camera['target'];ppm=path.with_suffix('.ppm');start=time.monotonic()
        subprocess.run([str(binary),str(scenes[key]),str(ppm),str(size),str(spp),str(clay),*map(str,camera['direction']),str(camera['scale']),str(target[1]),str(target[0]),str(target[2]),str(mode),str(light),'1'],check=True)
        Image.open(ppm).save(path);ppm.unlink();meta.update(imageSha256=hashlib.sha256(path.read_bytes()).hexdigest(),seconds=round(time.monotonic()-start,2))
        records[:]=[r for r in records if r['file']!=filename];records.append(meta);report.write_text(json.dumps(records,indent=2));print(filename,meta['seconds'],flush=True)
    if section in ['all','studies']:
        for study in json.loads((OUT/'studies.json').read_text()):
            family=study['family'];cam=study['camera'];a=study['after'];f=study['focusMaterial']
            for version in ['before','after']:
                for rig in ['neutral','grazing']:shot(f'{family}-{version}-{rig}',study[version],cam,2 if rig=='neutral'else 3)
            macro=copy.deepcopy(cam);macro['scale']*=.65
            shot(f'{family}-macro',a,macro,3)
            if family=='crystal':
                shot('crystal-neutral-emissive-off',a,cam,2,off=(f,'emissive'))
                shot('crystal-lowlight-on',a,cam,2,light=.04)
                shot('crystal-lowlight-off',a,cam,2,light=.04,off=(f,'emissive'))
            if family=='obsidian':
                for channel in ['normal','roughness']:shot('obsidian-'+channel+'-off',a,cam,3,off=(f,channel))
            if family=='metal':shot('metal-metallic-off',a,cam,3,off=(f,'metallic'))
    if section in ['all','full']:
        cam=dict(direction=[1.5,1.15,-1.9],scale=1.62,target=[0,.48,0]);a=ASSET/'relic.glb';b=v4.SOURCE/'relic.glb'
        for version,asset in [('v3',b),('v4',a)]:
            shot('full-'+version+'-neutral',asset,cam)
            shot('full-'+version+'-showcase',asset,cam,1)
        shot('full-v4-clay',a,cam,clay=1)
        shot('full-v4-front',a,dict(direction=[0,0,-1],scale=1.18,target=[0,.49,0]))
        shot('full-v4-top',a,dict(direction=[0,1,-.000001],scale=1.16,target=[0,.48,0]))
        shot('full-v4-close',a,dict(direction=[1.2,.65,-2.2],scale=.90,target=[0,.58,-.25]),1)
        shot('full-v4-stone-close',a,dict(direction=[.3,.12,-1],scale=.31,target=[.19,.36,-.42]),3)
        shot('full-v4-metal-close',a,dict(direction=[1,.7,-1.5],scale=.33,target=[.40,.80,-.39]),1)
        shot('full-v4-lock-close',a,dict(direction=[.5,.2,-1.8],scale=.57,target=[0,.38,-.46]),1)
        shot('full-v4-open',a,dict(direction=[1.5,1.15,-1.9],scale=2.45,target=[0,.87,0]),angle=105)
        shot('full-v4-lowlight',a,cam,light=.04)
        for size in [128,64]:shot('preview-'+str(size),a,cam,small=size)
    for scene in scenes.values():scene.unlink()
    sheets(quick)

def pair(files,file,labels):
    images=[Image.open(OUT/f).convert('RGB')for f in files];w,h=images[0].size;panel=Image.new('RGB',(w*len(images),h+35),(22,27,34));d=ImageDraw.Draw(panel);font=ImageFont.truetype(FONT,17)
    for i,(im,label)in enumerate(zip(images,labels)):panel.paste(im,(i*w,35));d.text((i*w+8,7),label,font=font,fill=(220,230,232))
    panel.save(OUT/file)

def sheets(quick=False):
    s='-quick'if quick else''
    groups=[('full-neutral-compare',['full-v3-neutral','full-v4-neutral'],['V3 / neutral','V4 / neutral']),('full-showcase-compare',['full-v3-showcase','full-v4-showcase'],['V3 / showcase','V4 / showcase']),('crystal-emission',['crystal-lowlight-on','crystal-lowlight-off'],['EMISSION ON / light 4% / exposure 1','EMISSION OFF / light 4% / exposure 1'])]
    for family in ['obsidian','metal','crystal']:
        for rig in ['neutral','grazing']:groups.append((family+'-'+rig+'-compare',[family+'-before-'+rig,family+'-after-'+rig],['Balanced / '+rig,'V4 / '+rig]))
    for name,items,labels in groups:
        files=[f+s+'.png'for f in items]
        if all((OUT/f).exists()for f in files):pair(files,name+s+'.png',labels)

def channels():
    records=[]
    for family,partname,normal in [('obsidian','Body.FrontInsert1',[0,0,-1]),('metal','Lid.CornerRoof.1.-1',[0,1,0]),('crystal','Body.HeartCrystal',[0,0,-1])]:
        folder=ASSET/'studies'/family;bb=json.loads((folder/'relic.bbmodel').read_text());part=next(p for p in bb['elements']if p['name']==partname)
        def area(face):
            verts=np.array([part['vertices'][i]for i in face['vertices']]);n=np.cross(verts,np.roll(verts,-1,axis=0)).sum(axis=0);n/=np.linalg.norm(n)
            if n@normal<.99:return -1
            uv=np.array(list(face['uv'].values()));q=np.roll(uv,-1,axis=0);return abs((uv[:,0]*q[:,1]-uv[:,1]*q[:,0]).sum())
        face=max(part['faces'].values(),key=area);uv=np.array(list(face['uv'].values()));box=tuple(np.floor(uv.min(axis=0)).astype(int))+tuple(np.ceil(uv.max(axis=0)).astype(int));mat=next(m for m in json.loads((folder/'materials.json').read_text())if m.get('maps'))
        name=mat['name'].replace('.','-');base=Image.open(folder/(name+'.png')).convert('RGB');orm=Image.open(folder/mat['maps']['orm']).convert('RGB');nm=Image.open(folder/mat['maps']['normal']).convert('RGB');em=Image.open(folder/mat['maps']['emissive']).convert('RGB')if'emissive'in mat['maps']else Image.new('RGB',base.size)
        panel=Image.new('RGB',(1440,420),(22,27,34));draw=ImageDraw.Draw(panel);font=ImageFont.truetype(FONT,16)
        for i,(im,label)in enumerate([(base,'Base / sRGB'),(orm.getchannel('G'),'Roughness / G'),(nm,'Normal / linear'),(orm.getchannel('B'),'Metal / B'),(orm.getchannel('R'),'AO / R'),(em,'Emission / sRGB')]):
            crop=im.crop(box).convert('RGB');scale=min(226/crop.width,375/crop.height);crop=crop.resize((round(crop.width*scale),round(crop.height*scale)),Image.Resampling.NEAREST);panel.paste(crop,(i*240+7,35));draw.text((i*240+7,8),label,font=font,fill=(220,230,232))
        panel.save(OUT/(family+'-channels.png'));records.append(dict(family=family,part=partname,crop=box,gain=1))
    (OUT/'channel-crops.json').write_text(json.dumps(records,indent=2,default=int))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('command',choices=['build','render','channels']);p.add_argument('--quick',action='store_true');p.add_argument('--section',default='all',choices=['all','studies','full']);args=p.parse_args();OUT.mkdir(parents=True,exist_ok=True)
    if args.command=='build':studies();channels()
    elif args.command=='channels':channels()
    else:render(args.quick,args.section)
