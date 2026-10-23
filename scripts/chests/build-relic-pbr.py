"""Localized V3 polish on the accepted editable model, then core glTF PBR.

Deterministic physical face charts, 128 texels/block before atlas padding.
No image synthesis service, baked lighting, transparent-glass extensions or Rune.
"""
from pathlib import Path
import hashlib
import base64
import importlib.util
import io
import json
import math
import sys

import numpy as np
from PIL import Image

HERE=Path(__file__).resolve().parent
def module(name,file):
    spec=importlib.util.spec_from_file_location(name,HERE/file);m=importlib.util.module_from_spec(spec);sys.modules[name]=m;spec.loader.exec_module(m);return m
api=module('relic_pbr_base','build-relic.py');geo=module('relic_pbr_geometry','relic-geometry.py')
ROOT=api.ROOT;OUT=ROOT/'assets/chests/relic-v3-pbr';EVIDENCE=ROOT/'artifacts/relic-pbr-pass'
DENSITY=8;GUTTER=4


def faceted(model,name,outline,rings,material,group,axis):
    """Cut gemstone: polygon girdle, receding pavilion, broad crown/table.

    Rings (scaleU, scaleV, depth). Front blade has an octagonal XY silhouette;
    crown is a diamond in XZ. Each coplanar crown panel stays one flat facet.
    """
    vertices=[];outline=np.array(outline,float);center=outline.mean(axis=0)
    for su,sv,depth in rings:
        for u,v in (outline-center)*[su,sv]+center:
            vertices.append([u,v,depth]if axis=='z'else[u,depth,-v])
    n=len(outline);faces=[list(range(n-1,-1,-1))]
    for r in range(len(rings)-1):
        for i in range(n):
            j=(i+1)%n;faces.append([r*n+i,r*n+j,(r+1)*n+j,(r+1)*n+i])
    faces.append(list(range((len(rings)-1)*n,len(rings)*n)))
    center=np.array(vertices).mean(axis=0)
    for face in faces:
        p=np.array([vertices[i]for i in face]);normal=np.cross(p,np.roll(p,-1,axis=0)).sum(axis=0)
        if normal@(p.mean(axis=0)-center)<0:face.reverse()
    model.mesh(name,vertices,faces,material,group)


def geometry():
    # Read the accepted editable source, rather than rebuilding its construction.
    model,_=api.from_bbmodel(ROOT/'assets/chests/relic-v3-geometry/relic.bbmodel')
    remove={'Body.HeartCrystal','Lid.CrownCrystal','Lid.DiamondSocket','Lid.ClaspFrame','Body.LockReceiver','Body.FrontInsert1'}
    model.parts[:]=[p for p in model.parts if p['name']not in remove]
    for p in model.parts:p.pop('_uv',None)
    # One shallow missing flake on an exposed panel edge. Geometry, not a dark
    # painted chip; the preserved substrate is visible behind the tiny notch.
    chipped=geo.rectangle(1.65,2.8,4.65,8.05,.38)
    chipped[5:5]=[(3.58,8.05),(3.48,7.91),(3.30,7.94),(3.22,8.05)]
    model.prism('Body.FrontInsert1',chipped,-6.76,-6.52,'shell',axis='z',bevel=.025)
    blade=[(-.32,3.10),(.32,3.10),(.90,4.15),(.96,7.65),(.40,8.95),(-.40,8.95),(-.96,7.65),(-.90,4.15)]
    faceted(model,'Body.HeartCrystal',blade,[(.80,.93,-6.53),(1,1,-7.23),(.62,.62,-7.81)],'crystal','Body','z')
    # Modest raised crown, not more height: preserve accepted maximum Y exactly.
    diamond=[(0,-1.68),(1.02,-.66),(1.68,0),(1.02,.66),(0,1.68),(-1.02,.66),(-1.68,0),(-1.02,-.66)]
    top=15.39+.34*math.sqrt(3)/2
    faceted(model,'Lid.CrownCrystal',diamond,[(.62,.62,14.49),(1,1,14.99),(.38,.38,top)],'crystal','LidAssembly','y')
    outside=[]
    for i in range(8):
        a=(i-2)*math.tau/8;c,s=math.cos(a),math.sin(a)
        outside.append((2.70*c/(abs(c)+abs(s)),2.70*s/(abs(c)+abs(s))))
    geo.ring(model,'Lid.DiamondSocket',outside,(np.array(diamond)*.94).tolist(),14.47,14.95,'metal','LidAssembly',bevel=.035)
    # Magnetic release: a broad keeper/pole shoe aligned across the lid seam.
    # Neither bridges the hinge seam: a mechanical bolt would need its own clip.
    model.box('Body.LockReceiver',[-.63,9.55,-7.30],[.63,10.50,-6.79],'edge',bevel=.075)
    model.box('Body.LatchPole',[-.45,10.22,-7.43],[.45,10.50,-7.19],'metal',bevel=.035)
    model.prism('Lid.ClaspKeeper',geo.rectangle(-.60,10.56,.60,11.95,.12),-7.43,-7.06,'metal','LidAssembly',axis='z',bevel=.045)
    model.box('Lid.ClaspInsulator',[-.31,10.90,-7.46],[.31,11.68,-7.40],'edge','LidAssembly',bevel=.02)
    # Small retaining clips at the plate's existing lower edge, not floating
    # appliques. Left/right offsets differ slightly while the major frame stays.
    for s in [-1,1]:
        for i,z in enumerate([(-2.80 if s==1 else -2.35),(2.35 if s==1 else 2.80)]):
            model.prism(f'Body.PanelRetainer{s}.{i}',geo.rectangle(2.68,z-.32,3.10,z+.32,.07),*sorted([s*6.67,s*6.93]),'metal',axis='x',bevel=.035)
    return model


def chart_layout(model):
    charts=[[]for _ in api.MATERIALS]
    for part in model.parts:
        part['_uv']=[]
        for face in part['faces']:
            vertices=np.array([part['vertices'][i]for i in face]);normal=np.cross(vertices,np.roll(vertices,-1,axis=0)).sum(axis=0);normal/=np.linalg.norm(normal)
            tangent=vertices[1]-vertices[0];tangent/=np.linalg.norm(tangent);bitangent=np.cross(normal,tangent)
            points=np.array([vertices@tangent,vertices@bitangent]).T;lo=points.min(axis=0);span=np.ptp(points,axis=0)
            # Fixed density, with at most one pixel ceiling difference per edge.
            w,h=np.maximum(2,np.ceil(span*DENSITY).astype(int)+1)
            charts[part['material']].append(dict(part=part,face=face,p=points-lo,lo=lo,span=span,w=int(w),h=int(h),normal=normal,t=tangent,b=bitangent))
    for collection in charts:
        size=128
        while True:
            x=y=row=0;valid=True
            for ch in sorted(collection,key=lambda c:-c['h']):
                w,h=ch['w']+2*GUTTER,ch['h']+2*GUTTER
                if x+w>size:y+=row;x=row=0
                if y+h>size or w>size:valid=False;break
                ch.update(x=x+GUTTER,y=y+GUTTER);x+=w;row=max(row,h)
            if valid:break
            size*=2
            if size>2048:raise ValueError('Atlas budget exceeded')
        for ch in collection:
            ch['size']=size
            ch['atlasHeight']=max(64,2**math.ceil(math.log2(y+row)))
            # Top-left atlas V agrees with glTF ImageBitmap flipY=false.
            uv=(ch['p']*DENSITY+[ch['x']+.5,ch['y']+.5])/[size,ch['atlasHeight']]
            ch['part']['_uv'].append(uv.tolist())
    return charts


def shade_chart(ch,index,material):
    w,h=ch['w'],ch['h'];rng=np.random.default_rng(int.from_bytes(hashlib.sha256((ch['part']['name']+str(index)).encode()).digest()[:8],'little'))
    yy,xx=np.mgrid[:h,:w];u=xx/DENSITY;v=yy/DENSITY;p=ch['p'];dist=np.full((h,w),1e6)
    for a,b in zip(p,np.roll(p,-1,axis=0)):
        e=b-a;projection=np.clip(((u-a[0])*e[0]+(v-a[1])*e[1])/(e@e),0,1)
        dist=np.minimum(dist,np.hypot(u-a[0]-projection*e[0],v-a[1]-projection*e[1]))
    # Edge-biased wear, sparse long scratches, and protected/unprotected roles.
    name=ch['part']['name'];metal=material in [2,3];crystal=material in [4,5]
    exposed=any(s in name for s in ['Corner','Clasp','ReliquaryFrame','Latch','Plinth'])
    contact=any(s in name for s in ['Clasp','Latch','Lock','ReliquaryWing'])
    protected=any(s in name for s in ['InsetPanel','Recess','Interior','InnerFloor','Underside'])
    grain=rng.uniform(-1,1,(h,w));coarse=np.array(Image.fromarray(rng.integers(0,256,(max(2,h//12),max(2,w//12)),dtype='uint8')).resize((w,h),Image.Resampling.BILINEAR))/127.5-1
    edge=np.exp(-dist/.16)*(.12+.88*np.clip((coarse+.30)*2,0,1))
    wear=edge*(.75 if exposed else .22 if protected else .4)
    scratch=np.zeros((h,w))
    # Few directional marks; no uniform layer of dense white noise.
    count=int(w*h*(.0018 if contact else .0008 if exposed else .00008))
    if exposed and w*h>100:count=max(1,count)
    for _ in range(count):
        sx,sy=rng.uniform(0,w),rng.uniform(0,h);length=rng.uniform(2,11)
        theta=(.08 if metal else .7)+rng.uniform(-.15,.15)
        along=(xx-sx)*math.cos(theta)+(yy-sy)*math.sin(theta);across=-(xx-sx)*math.sin(theta)+(yy-sy)*math.cos(theta)
        scratch=np.maximum(scratch,np.exp(-across**2/0.24)*np.clip(1-abs(along)/length,0,1))
    scratch*=np.clip(dist/.20,0,1)
    pits=(grain<(-.987 if protected else -.977)+coarse*.012).astype(float)*np.clip(dist/.12,0,1)
    base=np.array([[38,39,57],[25,35,48],[83,117,111],[44,67,72],[38,174,159],[110,218,197],[19,26,34]][material],float)
    if crystal:
        # Different absorption per actual facet, independent of normal/light.
        tone=rng.uniform(.72,1.17);band=np.sin(v*.8+u*.35+rng.uniform(0,6))*.05
        rgb=base*(tone+band)[...,None]
        rgb=np.broadcast_to(rgb,(h,w,3)).copy();rgb+=grain[...,None]*.7
        rough=np.clip(.20+coarse*.025+grain*.009,.14,.29);metallic=np.full((h,w),.03)
        height=grain*.0003;ao=np.ones((h,w));emissive=np.clip(rgb/255*(.48+.2*coarse[...,None]),0,1)
    elif metal:
        patina=np.clip(coarse+.2,0,1)*(.45 if material==3 else .33)
        # Uneven old coating, rubbed only on high/contact regions. Soft patches
        # modulate pigment and roughness together; no painted reflections.
        abrasion=np.clip((coarse-.12)*2,0,1)*np.exp(-dist/.48)*(1 if exposed else .20)
        touch=np.exp(-((u/max(ch['span'][0],.1)-.55)**2/.10+(v/max(ch['span'][1],.1)-.45)**2/.07))*(.5 if contact else 0)
        rgb=base*(1+coarse[...,None]*.13)+wear[...,None]*[25,29,24]-patina[...,None]*[14,12,5]
        rgb+=(abrasion+touch)[...,None]*[14,16,12]+scratch[...,None]*[13,15,13]
        rough=np.clip((.44 if material==2 else .56)+coarse*.13+grain*.018-wear*.18-scratch*.07-(abrasion+touch)*.08,.23,.76)
        metallic=np.clip(.91-patina*.23-wear*.01,.72,.94)
        height=grain*.0020-pits*.008-scratch*.010
        ao=1-.10*np.exp(-dist/.09)*(1-wear)
        emissive=np.zeros((h,w,3))
    else:
        cells=np.array(Image.fromarray(rng.integers(0,256,(max(2,h//3),max(2,w//3)),dtype='uint8')).resize((w,h),Image.Resampling.NEAREST))/127.5-1
        rgb=base*(1+coarse[...,None]*.16+cells[...,None]*.035+grain[...,None]*.015)+wear[...,None]*[10,10,13]-pits[...,None]*[3,3,4]
        rough=np.clip((.69 if material==0 else .76 if material==1 else .88)+coarse*.11+grain*.025-wear*.14+scratch*.04,.45,.96)
        metallic=np.zeros((h,w));height=grain*.0025-pits*.015-scratch*.008
        ao=1-.07*pits;emissive=np.zeros((h,w,3))
    # Fading normals at seams avoids chart-edge discontinuities. RGB is tangent
    # normal with +Y along chart V: GLTFLoader's convention after UV flip.
    height*=np.clip(dist/.15,0,1)
    dy,dx=np.gradient(height,1/DENSITY);n=np.stack([-dx,-dy,np.ones_like(dx)],axis=-1);n/=np.linalg.norm(n,axis=-1)[...,None]
    orm=np.stack([ao,rough,metallic],axis=-1)
    return [np.clip(rgb,0,255).astype('uint8'),np.round(orm*255).astype('uint8'),np.round((n*.5+.5)*255).astype('uint8'),np.round(emissive*255).astype('uint8')]


def maps(model):
    charts=chart_layout(model);albedos=[];manifest=[]
    for mi,collection in enumerate(charts):
        size=collection[0]['size'];height=collection[0]['atlasHeight'];canvases=[np.zeros((height,size,3),dtype='uint8')for _ in range(4)]
        canvases[1][:]=[255,200,0];canvases[2][:]=[128,128,255]
        for i,ch in enumerate(collection):
            samples=shade_chart(ch,i,mi)
            for canvas,sample in zip(canvases,samples):
                # Dilated gutter preserves own colors through first mip levels.
                padded=np.pad(sample,((GUTTER,GUTTER),(GUTTER,GUTTER),(0,0)),mode='edge')
                x,y=ch['x']-GUTTER,ch['y']-GUTTER;canvas[y:y+len(padded),x:x+padded.shape[1]]=padded
        name=api.MATERIALS[mi]['name'].replace('.','-');bindings={}
        for channel,canvas in zip(['color','orm','normal','emissive'],canvases):
            if channel=='emissive'and mi not in [4,5]:continue
            filename=name+(''if channel=='color'else'-'+channel)+'.png';image=Image.fromarray(canvas);image.save(OUT/filename)
            if channel=='color':albedos.append(image)
            else:bindings[channel]=filename
        m=api.MATERIALS[mi];m.update(metallic=1,roughness=1,maps=bindings,normalScale=1,occlusionStrength=1)
        if mi in [4,5]:m['emission']=[.12,.32,.24]if mi==4 else [.15,.40,.29]
        else:m.pop('emission',None)
        manifest.append({'material':m['name'],'size':[size,height],'faceCharts':len(collection),'pixelsPerBlock':DENSITY*16,'gutterPixels':GUTTER,'maps':bindings})
    return albedos,manifest


def blockbench_preview():
    """Native BB uses MER, not glTF ORM; provide a derived viewport preview.

    Canonical maps remain separate for controlled GLB export. BB cannot express
    independent RGB emission + AO in its MER format; do not claim exact parity.
    """
    path=OUT/'relic.bbmodel';source=json.loads(path.read_text())
    for mat in api.MATERIALS:
        name=mat['name'].replace('.','-');orm=np.array(Image.open(OUT/mat['maps']['orm']).convert('RGB'))
        mer=np.zeros_like(orm);mer[:,:,0]=orm[:,:,2];mer[:,:,2]=orm[:,:,1]
        if 'emissive'in mat['maps']:
            base=np.array(Image.open(OUT/(name+'.png')).convert('RGB'))/255
            emission=np.array(Image.open(OUT/mat['maps']['emissive']).convert('RGB'))/255
            tolinear=lambda a:np.where(a<=.04045,a/12.92,((a+.055)/1.055)**2.4)
            ratio=np.mean(tolinear(emission)*mat['emission']/np.maximum(tolinear(base),.002),axis=-1)
            mer[:,:,1]=np.round(np.clip(ratio,0,1)*255).astype('uint8')
        merfile=name+'-bb-mer.png';Image.fromarray(mer).save(OUT/merfile)
        for channel,filename in [('normal',mat['maps']['normal']),('mer',merfile)]:
            image=Image.open(OUT/filename);buffer=io.BytesIO();image.save(buffer,format='PNG')
            source['textures'].append({'name':filename,'id':str(len(source['textures'])),'uuid':api.uid(filename),'width':image.width,'height':image.height,'uv_width':image.width,'uv_height':image.height,'internal':True,'group':api.uid(mat['name']+'/pbr'),'pbr_channel':channel,'source':'data:image/png;base64,'+base64.b64encode(buffer.getvalue()).decode()})
    path.write_text(json.dumps(source,separators=(',',':')))


def main():
    OUT.mkdir(parents=True,exist_ok=True);EVIDENCE.mkdir(parents=True,exist_ok=True)
    api.OUT=OUT;api.REVISION='relic-v3-pbr-review';api.TITLE='Relic Chest V3 — PBR Review'
    model=geometry()
    # Emit a geometry-only candidate before changing materials: verifiable stage.
    images=[Image.open(ROOT/'assets/chests/relic-v3-geometry'/(m['name'].replace('.','-')+'.png')).convert('RGB')for m in api.MATERIALS]
    stage=EVIDENCE/'geometry-stage';stage.mkdir(exist_ok=True);api.OUT=stage
    api.bbmodel(model,images);api.glb(model,images);api.OUT=OUT
    images,manifest=maps(model);api.bbmodel(model,images);blockbench_preview();api.glb(model,images)
    (OUT/'materials.json').write_text(json.dumps(api.MATERIALS,indent=2))
    contract=json.loads((ROOT/'assets/chests/relic-v3-geometry/contract.json').read_text())
    contract.update(revision=api.REVISION,title=api.TITLE,status='awaiting-visual-review',textureWorkflow='face charts, 128 texels/block; sRGB color/emissive, linear ORM/normal; R AO G roughness B metal',
        controlledExport='python3.13 scripts/chests/build-relic.py --from-bbmodel assets/chests/relic-v3-pbr/relic.bbmodel --output-dir assets/chests/relic-v3-pbr',
        lockMechanism='Magnetic keeper/pole shoe; releases before hinge animation; no mechanical bolt clip',assetBudgetBytes=8_000_000)
    (OUT/'contract.json').write_text(json.dumps(contract,indent=2));(OUT/'texture-manifest.json').write_text(json.dumps(manifest,indent=2))
    print(json.dumps({'parts':len(model.parts),'bytes':(OUT/'relic.glb').stat().st_size,'atlases':manifest},indent=2))


if __name__=='__main__':main()
