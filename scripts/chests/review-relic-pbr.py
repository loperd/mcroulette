"""Re-render accepted Before and V3 After with identical core-map-aware shader.

Standalone CPU evidence, never represented as a WebGL screenshot.
"""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import subprocess
import tempfile
import time

import numpy as np
from PIL import Image,ImageDraw,ImageFont

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('relic_pbr_review',HERE/'review-relic.py');review=importlib.util.module_from_spec(spec);spec.loader.exec_module(review)
ROOT=review.ROOT;OUT=ROOT/'artifacts/relic-pbr-pass/renders';BEFORE=ROOT/'assets/chests/relic-v3-geometry/relic.glb';AFTER=ROOT/'assets/chests/relic-v3-pbr/relic.glb'
VIEW=[1.5,1.15,-1.9]


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--shots',nargs='*');parser.add_argument('--quick',action='store_true');args=parser.parse_args();OUT.mkdir(parents=True,exist_ok=True)
    binary=Path(tempfile.gettempdir())/'mcroulette-relic-pbr-tracer'
    subprocess.run(['clang++','-O3','-std=c++17','-pthread',str(HERE/'review-tracer.cpp'),'-o',str(binary)],check=True)
    # name, source, clay, pose, pixels, samples, camera, scale, target, rig
    shots=[('01-before',BEFORE,False,0,800,256,VIEW,1.62,[0,.48,0],0),
           ('02-after',AFTER,False,0,800,256,VIEW,1.62,[0,.48,0],0),
           ('03-clay',AFTER,True,0,800,144,VIEW,1.62,[0,.48,0],0),
           ('04-showcase',AFTER,False,0,800,256,VIEW,1.62,[0,.48,0],1),
           ('05-stone-detail',AFTER,False,0,800,256,[.35,.20,-1],.32,[.205,.36,-.415],1),
           ('06-metal-detail',AFTER,False,0,800,256,VIEW,.38,[.395,.855,-.395],1),
           ('07-lock-detail',AFTER,False,0,800,256,[.40,.16,-1],.64,[0,.395,-.445],1),
           ('08-top',AFTER,False,0,800,144,[0,1,-.000001],1.18,[0,0,0],0),
           ('09-front',AFTER,False,0,800,144,[0,0,-1],1.18,[0,.48,0],0),
           ('10-open',AFTER,False,105,800,144,VIEW,2.04,[0,.73,0],0),
           ('11-small-128',AFTER,False,0,128,400,VIEW,1.62,[0,.48,0],0),
           ('12-small-64',AFTER,False,0,64,400,VIEW,1.62,[0,.48,0],0),
           ('13-side',AFTER,False,0,800,144,[1,0,0],1.18,[0,.48,0],0)]
    metadata=[];scenes={}
    for name,asset,clay,angle,res,spp,view,scale,target,rig in shots:
        if args.shots and name not in args.shots:continue
        if args.quick:res=min(res,384);spp=36
        if angle:
            _,_,tris,_=review.decode(asset,angle);points=np.concatenate([t['v']for t in tris]);forward=np.array(view,float);forward/=np.linalg.norm(forward);right=np.cross([0,1,0],forward);right/=np.linalg.norm(right);up=np.cross(forward,right)
            px=points@right;py=points@up;target=(right*(px.min()+px.max())/2+up*(py.min()+py.max())/2).tolist();scale=max(np.ptp(px),np.ptp(py))/.86
        key=(asset,angle)
        if key not in scenes:
            scene=OUT/f'.scene-{asset.parent.name}-{angle}.txt';review.scene(scene,angle,asset);scenes[key]=scene
        ppm=OUT/(name+'.ppm');start=time.monotonic()
        subprocess.run([str(binary),str(scenes[key]),str(ppm),str(res),str(spp),str(int(clay)),*map(str,view),str(scale),str(target[1]),str(target[0]),str(target[2]),str(rig)],check=True)
        file=OUT/(name+('-quick'if args.quick else'')+'.png');Image.open(ppm).save(file);ppm.unlink()
        metadata.append(dict(file=file.name,sha256=hashlib.sha256(file.read_bytes()).hexdigest(),asset=str(asset.relative_to(ROOT)),assetSha256=hashlib.sha256(asset.read_bytes()).hexdigest(),clay=clay,angle=angle,size=res,spp=spp,direction=view,orthoScale=float(scale),target=target,rig='showcase'if rig else'neutral',seconds=round(time.monotonic()-start,2)))
        print(name,metadata[-1]['seconds'],flush=True)
    for scene in scenes.values():scene.unlink()
    result={'renderer':'CPU Cook-Torrance GGX / MIS / 5 bounces, real GLB pixels and core PBR maps','rendererSourceSha256':hashlib.sha256((HERE/'review-tracer.cpp').read_bytes()).hexdigest(),
        'color':'sRGB baseColor/emissive decoded to linear; ORM/normal linear; ACES approximation, exposure 1; no bloom',
        'neutralLights':[{'position':[-2.7,3.5,-3.3],'size':2.7,'power':7},{'position':[3.2,2.2,-1.4],'size':2.8,'power':3.2},{'position':[.4,3.4,3.6],'size':2.3,'power':6}],
        'showcaseLights':[{'position':[-2.3,2.4,-3.1],'size':1,'power':40},{'position':[3,1.7,-1],'size':1.4,'power':16},{'position':[.4,3.4,3.6],'size':1.1,'power':32}],
        'limitation':'Offline evidence; normal mapping uses face UV derivative tangent basis. Not a running Three.js screenshot. AO modulates indirect throughput (approximation).','shots':metadata}
    (OUT/('render-quick.json'if args.quick else'render.json')).write_text(json.dumps(result,indent=2))
    if not args.quick and not args.shots:contact_sheets(result)


def contact_sheets(result):
    try:font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',24)
    except OSError:font=ImageFont.load_default()
    sheet=Image.new('RGB',(1640,865),(22,27,34));draw=ImageDraw.Draw(sheet)
    for x,name,label in [(10,'01-before','BEFORE / ACCEPTED GEOMETRY'),(830,'02-after','AFTER / V3 PBR')]:
        draw.text((x+10,15),label,fill=(220,230,232),font=font);sheet.paste(Image.open(OUT/(name+'.png')),(x,55))
    sheet.save(OUT/'before-after.png')
    old,new=result['shots'][:2]
    for key in ['clay','angle','size','spp','direction','orthoScale','target','rig']:assert old[key]==new[key],key
    (OUT/'before-after.json').write_text(json.dumps({'before':old,'after':new,'sameCameraLightsScaleSamplingShader':True,'resizedOrRetouched':False},indent=2))
    panel=Image.new('RGB',(1500,1090),(22,27,34));draw=ImageDraw.Draw(panel)
    for i,(file,label)in enumerate([('02-after','NEUTRAL / PBR'),('03-clay','GEOMETRY / CLAY'),('04-showcase','MATERIAL SHOWCASE'),('05-stone-detail','STONE / MICRO RELIEF'),('06-metal-detail','METAL / WEAR'),('07-lock-detail','CRYSTAL / LATCH')]):
        x=(i%3)*500+10;y=(i//3)*545;draw.text((x+5,y+12),label,fill=(220,230,232),font=font);panel.paste(Image.open(OUT/(file+'.png')).resize((480,480),Image.Resampling.LANCZOS),(x,y+50))
    panel.save(OUT/'review-sheet.png')


if __name__=='__main__':main()
