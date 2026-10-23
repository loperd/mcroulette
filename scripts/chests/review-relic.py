"""Read the exported GLB and render it with the CPU GGX path tracer.

python3.13 scripts/chests/review-relic.py [--quick]
All images come from final GLB vertex buffers, PNGs, PBR factors and animation.
No connection to an application, browser or GPU is made by this tool.
"""
from pathlib import Path
import argparse
import hashlib
import io
import json
import math
import struct
import subprocess
import tempfile
import time

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[2]
ASSET=ROOT/'assets/chests/relic-v2/relic.glb'
OUT=ROOT/'artifacts/ender-redesign/relic'


def part_assemblies(g):
    """Use node hierarchy, not part-name prefixes, to identify moving parts."""
    result={}
    def visit(i,assembly=None):
        node=g['nodes'][i]
        if node.get('name')in ['Body','LidAssembly']:assembly=node['name']
        if 'mesh'in node:
            for primitive in g['meshes'][node['mesh']]['primitives']:
                for part in primitive.get('extras',{}).get('parts',[{'name':node['name']}]):result[part['name']]=assembly
        for j in node.get('children',[]):visit(j,assembly)
    for i in g['scenes'][g.get('scene',0)]['nodes']:visit(i)
    return result


def decode(path=None, angle=None):
    path=path or ASSET
    raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+n]);binary=raw[28+n:]
    def read(i):
        a=g['accessors'][i];v=g['bufferViews'][a['bufferView']]
        dtype={5126:'<f4',5123:'<u2',5125:'<u4'}[a['componentType']];dim={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
        return np.frombuffer(binary,dtype=dtype,count=a['count']*dim,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,dim).astype(float)
    data_images=set()
    for material in g['materials']:
        for info in [material.get('normalTexture'),material.get('occlusionTexture'),material.get('pbrMetallicRoughness',{}).get('metallicRoughnessTexture')]:
            if info:data_images.add(g['textures'][info['index']]['source'])
    images=[]
    for image_index,image in enumerate(g['images']):
        v=g['bufferViews'][image['bufferView']];pixels=np.array(Image.open(io.BytesIO(binary[v['byteOffset']:v['byteOffset']+v['byteLength']])).convert('RGB'))/255
        images.append(pixels if image_index in data_images else np.where(pixels<=.04045,pixels/12.92,((pixels+.055)/1.055)**2.4))
    triangles=[];parts={}
    def visit(i,parent):
        node=g['nodes'][i];matrix=np.eye(4);matrix[:3,3]=node.get('translation',[0,0,0])
        if angle is not None and node['name']=='LidAssembly':
            a=math.radians(angle);c,s=math.cos(a),math.sin(a);matrix[:3,:3]=[[1,0,0],[0,c,-s],[0,s,c]]
        world=parent@matrix
        if 'mesh'in node:
            points=[]
            for p in g['meshes'][node['mesh']]['primitives']:
                v=read(p['attributes']['POSITION'])@world[:3,:3].T+world[:3,3];normal=read(p['attributes']['NORMAL'])@world[:3,:3].T;uv=read(p['attributes']['TEXCOORD_0'])
                if 'indices'in p:
                    idx=read(p['indices']).astype(int).ravel();v,normal,uv=v[idx],normal[idx],uv[idx]
                ranges=p.get('extras',{}).get('parts',[{'name':node['name'],'firstIndex':0,'indexCount':len(v)}])
                for item in ranges:
                    start=item['firstIndex'];end=start+item['indexCount']
                    for j in range(start,end,3):triangles.append({'v':v[j:j+3],'n':normal[j],'uv':uv[j:j+3],'mat':p['material'],'name':item['name']})
                    parts[item['name']]=v[start:end]
        for j in node.get('children',[]):visit(j,world)
    for i in g['scenes'][g.get('scene',0)]['nodes']:visit(i,np.eye(4))
    return g,images,triangles,parts


def scene(path,angle=0,source=None):
    g,images,triangles,_=decode(source,angle)
    with path.open('w')as f:
        f.write(f'{len(g["materials"])} {len(triangles)} {len(images)}\n')
        for material in g['materials']:
            p=material['pbrMetallicRoughness'];color=p.get('baseColorFactor',[1,1,1,1])[:3];emission=material.get('emissiveFactor',[0,0,0]);tex=g['textures'][p['baseColorTexture']['index']]['source']
            def texture(info):return g['textures'][info['index']]['source']if info else -1
            values=color+[p.get('metallicFactor',1),p.get('roughnessFactor',1)]+emission+[tex,texture(p.get('metallicRoughnessTexture')),texture(material.get('normalTexture')),texture(material.get('emissiveTexture')),texture(material.get('occlusionTexture')),material.get('normalTexture',{}).get('scale',1),material.get('occlusionTexture',{}).get('strength',1)]
            f.write(' '.join(map(str,values))+'\n')
        for image in images:
            f.write(f'{image.shape[1]} {image.shape[0]}\n');np.savetxt(f,image.reshape(-1,3),fmt='%.7g')
        for triangle in triangles:
            values=[triangle['mat'],*triangle['n']]
            for v,uv in zip(triangle['v'],triangle['uv']):values.extend([*v,*uv])
            f.write(' '.join(f'{v:.8g}'for v in values)+'\n')


def sheet(geometry=False):
    tiles=[('01-beauty.png','BEAUTY / PBR'),('02-clay.png','CLAY / NO TEXTURES'),('03-front.png','FRONT / ORTHO'),
           ('04-side.png','SIDE / ORTHO'),('05-top.png','TOP / ORTHO'),('08-open.png','OPEN / 105 DEGREES')]
    if geometry:tiles=[('01-clay.png','CLAY / GEOMETRY'),('02-front.png','FRONT / CLAY'),('03-side.png','SIDE / CLAY'),
                       ('04-top.png','TOP / CLAY'),('05-open.png','OPEN / CLAY'),('06-lock-detail.png','LOCK / CLAY')]
    panel=Image.new('RGB',(1500,1080),(22,27,34));draw=ImageDraw.Draw(panel)
    try:font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',20)
    except OSError:font=ImageFont.load_default()
    for i,(file,label)in enumerate(tiles):
        p=Image.open(OUT/file).resize((480,480),Image.Resampling.LANCZOS);x=(i%3)*500+10;y=(i//3)*540
        draw.text((x+8,y+12),label,font=font,fill=(215,225,229));panel.paste(p,(x,y+45))
    panel.save(OUT/'review-sheet.png')


def main():
    global ASSET, OUT
    parser=argparse.ArgumentParser();parser.add_argument('--quick',action='store_true');parser.add_argument('--shots',nargs='*')
    parser.add_argument('--asset',type=Path);parser.add_argument('--out',type=Path);parser.add_argument('--geometry-only',action='store_true');args=parser.parse_args()
    if args.asset:ASSET=args.asset.resolve()
    if args.out:OUT=args.out.resolve()
    OUT.mkdir(parents=True,exist_ok=True)
    binary=Path(tempfile.gettempdir())/'mcroulette-relic-review-tracer'
    subprocess.run(['clang++','-O3','-std=c++17','-pthread',str(Path(__file__).with_name('review-tracer.cpp')),'-o',str(binary)],check=True)
    scale=1.62;direction=[1.5,1.15,-1.9];size=384 if args.quick else 800;samples=16 if args.quick else 144
    shots=[('01-beauty',direction,False,0,size,samples,scale,.48),
           ('02-clay',direction,True,0,size,samples,scale,.48),
           ('03-front',[0,0,-1],False,0,size,samples,1.18,.48),
           ('04-side',[1,0,0],False,0,size,samples,1.18,.48),
           ('05-top',[0,1,-.000001],False,0,size,samples,1.18,0),
           ('06-small-128',direction,False,0,128,256,scale,.48),
           ('07-small-64',direction,False,0,64,256,scale,.48),
           ('08-open',direction,False,105,size,samples,2.04,.73),
           ('09-open-clay',direction,True,105,size,samples,2.04,.73)]
    targets={}
    if args.geometry_only:
        shots=[('01-clay',direction,True,0,size,samples,scale,.48),
               ('02-front',[0,0,-1],True,0,size,samples,1.18,.48),
               ('03-side',[1,0,0],True,0,size,samples,1.18,.48),
               ('04-top',[0,1,-.000001],True,0,size,samples,1.18,0),
               ('05-open',direction,True,105,size,samples,2.04,.73),
               ('06-lock-detail',[0,.15,-1],True,0,size,samples,.68,.38),
               ('07-corner-detail',direction,True,0,size,samples,.56,.86),
               ('08-hinge-detail',[0,.45,1],True,45,size,samples,.44,.66),
               ('09-small-128',direction,True,0,128,256,scale,.48),
               ('10-small-64',direction,True,0,64,256,scale,.48)]
        targets={'06-lock-detail':[0,.38,-.45],'07-corner-detail':[.4,.86,-.4],'08-hinge-detail':[.21875,.659375,.478125]}
    metadata=[]
    for name,view,clay,angle,res,spp,ortho,cy in shots:
        if args.shots and name not in args.shots:continue
        # Keep the main Before/After at the original 144 spp. Geometry-only
        # diagnostics need no material microtexture sampling; record their64 spp.
        if args.geometry_only and name!='01-clay'and res==size and not args.quick:spp=64
        input_path=OUT/f'.scene-{angle}.txt'
        camera_target=np.array(targets.get(name,[0.,cy,0.]))
        if angle and name not in targets:
            _,_,triangles,_=decode(angle=angle);points=np.concatenate([t['v']for t in triangles])
            forward=np.array(view,float);forward/=np.linalg.norm(forward);right=np.cross([0,1,0],forward);right/=np.linalg.norm(right);up=np.cross(forward,right)
            px=points@right;py=points@up
            camera_target=right*(px.min()+px.max())/2+up*(py.min()+py.max())/2
            ortho=max(np.ptp(px),np.ptp(py))/0.86
        scene(input_path,angle)
        ppm=OUT/(name+'.ppm');t=time.monotonic()
        subprocess.run([str(binary),str(input_path),str(ppm),str(res),str(spp),str(int(clay)),*map(str,view),str(ortho),str(camera_target[1]),str(camera_target[0]),str(camera_target[2])],check=True)
        Image.open(ppm).save(OUT/(name+'.png'));ppm.unlink();input_path.unlink()
        metadata.append({'file':name+'.png','sha256':hashlib.sha256((OUT/(name+'.png')).read_bytes()).hexdigest(),'size':res,'spp':spp,'clay':clay,'angle':angle,'direction':view,'orthoScale':ortho,'target':camera_target.tolist(),'seconds':round(time.monotonic()-t,2)})
        print(name,metadata[-1]['seconds'],flush=True)
    if not args.shots:sheet(args.geometry_only)
    (OUT/('render-quick.json'if args.quick else'render.json')).write_text(json.dumps({
        'renderer':'CPU path tracing / Lambert + Cook-Torrance GGX / MIS / 5 bounces',
        'input':str(ASSET.relative_to(ROOT))if ASSET.is_relative_to(ROOT)else str(ASSET),'sha256':hashlib.sha256(ASSET.read_bytes()).hexdigest(),
        'lights':'three white area lights; same rig for beauty and clay; no bloom or AO textures',
        'rig':{'areaLights':[{'position':[-2.7,3.5,-3.3],'size':2.7,'radiance':7.0},
                             {'position':[3.2,2.2,-1.4],'size':2.8,'radiance':3.2},
                             {'position':[.4,3.4,3.6],'size':2.3,'radiance':6.0}],
               'worldRadiance':[.12,.12,.12],'lightPanelsVisibleToCamera':False,
               'lightPanelsVisibleInReflections':True,'maxBounces':5},
        'rendererSourceSha256':hashlib.sha256(Path(__file__).with_name('review-tracer.cpp').read_bytes()).hexdigest(),
        'color':'linear input; ACES approximation followed by sRGB encoding; exposure 1',
        'limitation':'Offline CPU evidence, not a Three.js/WebGL or Blender screenshot; native GUI not verified.',
        'shots':metadata},indent=2))


if __name__=='__main__':main()
