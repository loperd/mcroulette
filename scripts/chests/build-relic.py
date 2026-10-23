"""Relic v2 mesh authoring. No baked lighting; GLB + editable Blockbench mesh.

python3.13 scripts/chests/build-relic.py
The legacy two-variant builder and all Rune artifacts are intentionally separate.
"""
from pathlib import Path
import base64
import argparse
import importlib.util
import io
import json
import math
import struct
import uuid

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/chests/relic-v2'
REVIEW = ROOT / 'artifacts/ender-redesign/relic'
PIVOT = np.array([0., 10.55, 7.65])
ANGLE = 105
REVISION = 'relic-v2-prototype'
TITLE = 'Relic Chest v2'


def uid(name):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, 'mcroulette/relic-v2/' + name))


def linear(hex_color):
    a = np.array([int(hex_color[i:i+2], 16) / 255 for i in (1,3,5)])
    return np.where(a <= .04045, a / 12.92, ((a + .055) / 1.055) ** 2.4).tolist()


# Color inputs are sRGB. glTF baseColorFactor and emission are linear.
MATERIALS = [
    {'name':'Vault.Shell','color':'#242738','metallic':0.,'roughness':.83,'texture':True},
    {'name':'Vault.Panel','color':'#17242d','metallic':0.,'roughness':.76,'texture':True},
    {'name':'Vault.Metal','color':'#668c88','metallic':.78,'roughness':.34},
    {'name':'Vault.Edge','color':'#344b50','metallic':.62,'roughness':.44},
    {'name':'Vault.Crystal','color':'#48cbb9','metallic':.08,'roughness':.22,'emission':[.025,.12,.095]},
    {'name':'Vault.Accent','color':'#91f1d6','metallic':.02,'roughness':.36,'emission':[.10,.38,.26]},
    {'name':'Vault.Interior','color':'#151d26','metallic':0.,'roughness':.91},
]
MAT = {m['name'].split('.')[-1].lower():i for i,m in enumerate(MATERIALS)}


def triangulate(points):
    """Ear clipping for planar convex or concave Blockbench mesh faces."""
    p=np.asarray(points);normal=np.cross(p[1]-p[0],p[2]-p[0]);axis=int(np.argmax(abs(normal)))
    q=np.delete(p,axis,axis=1)
    area=sum(q[i,0]*q[(i+1)%len(q),1]-q[(i+1)%len(q),0]*q[i,1] for i in range(len(q)))
    orient=1 if area>0 else -1
    def cross(a,b):return a[0]*b[1]-a[1]*b[0]
    ids=list(range(len(p)));tris=[]
    while len(ids)>3:
        for k,b in enumerate(ids):
            a,c=ids[k-1],ids[(k+1)%len(ids)]
            if orient*cross(q[b]-q[a],q[c]-q[b])<1e-9:continue
            if any(all(orient*cross(q[y]-q[x],q[d]-q[x])>=-1e-9 for x,y in [(a,b),(b,c),(c,a)]) for d in ids if d not in [a,b,c]):continue
            tris.append([a,b,c]);ids.pop(k);break
        else:raise ValueError('Cannot triangulate polygon')
    tris.append(ids);return tris


class Model:
    def __init__(self):self.parts=[]

    def mesh(self,name,vertices,faces,material,group='Body'):
        verts=np.asarray(vertices,dtype=float)
        self.parts.append({'name':name,'vertices':verts.tolist(),'faces':faces,
                           'material':MAT[material],'group':group})

    def prism(self,name,outline,low,high,material,group='Body',axis='y',bevel=0):
        p=np.array(outline,dtype=float)
        # Outline CCW. Offset each edge inwards; concave L corners remain concave.
        shoelace=sum(p[i,0]*p[(i+1)%len(p),1]-p[i,1]*p[(i+1)%len(p),0] for i in range(len(p)))
        if shoelace<0:p=p[::-1]
        def inset(distance):
            result=[]
            for i,b in enumerate(p):
                a=p[i-1];c=p[(i+1)%len(p)]
                e1=(b-a)/np.linalg.norm(b-a);e2=(c-b)/np.linalg.norm(c-b)
                n1=np.array([-e1[1],e1[0]]);n2=np.array([-e2[1],e2[0]])
                result.append(b+(n1+n2)*distance/(1+np.dot(n1,n2)))
            return np.array(result)
        rings=[(p,low),(p,high)] if not bevel else [(inset(bevel),low),(p,low+bevel),(p,high-bevel),(inset(bevel),high)]
        vertices=[]
        # This embedding is right handed: outline cross product points +axis.
        for ring,level in rings:
            for a,b in ring:
                vertices.append([a,level,-b] if axis=='y' else ([a,b,level] if axis=='z' else [level,a,b]))
        n=len(p);faces=[list(range(n-1,-1,-1))]
        for r in range(len(rings)-1):
            for i in range(n):
                j=(i+1)%n;faces.append([r*n+i,r*n+j,(r+1)*n+j,(r+1)*n+i])
        faces.append(list(range((len(rings)-1)*n,len(rings)*n)))
        self.mesh(name,vertices,faces,material,group)

    def box(self,name,lo,hi,material,group='Body',bevel=.08):
        x0,y0,z0=lo;x1,y1,z1=hi
        bevel=min(bevel,.45*min(x1-x0,y1-y0,z1-z0))
        # Real perimeter bevel on the upper and lower edge loops.
        self.prism(name,[(x0,-z1),(x1,-z1),(x1,-z0),(x0,-z0)],y0,y1,material,group,bevel=bevel)

    def bar(self,name,start,end,width,height,level,material,group='Body',plane='xz'):
        a=np.array(start,float);b=np.array(end,float);d=b-a;n=np.array([-d[1],d[0]])/np.linalg.norm(d)*width/2
        shape=[a-n,b-n,b+n,a+n]
        axis={'xz':'y','xy':'z','yz':'x'}[plane]
        # xz uses negated z coordinate inside the right-handed prism convention.
        if plane=='xz':shape=[np.array([p[0],-p[1]])for p in shape][::-1]
        self.prism(name,shape,level,level+height,material,group,axis,bevel=min(.035,width*.18,height*.25))

    def crystal(self,name,center,radius,length,depth,group='Body',vertical=True):
        cx,cy,cz=center
        # Hexagonal belt, real asymmetric crown/pavilion, pointed terminations.
        belt=[]
        for h,r in [(-.29*length,1.),(.28*length,.91)]:
            for i in range(6):
                a=i*math.tau/6;u=math.cos(a)*radius*r;v=math.sin(a)*depth*r
                belt.append([cx+u,cy+h,cz+v] if vertical else [cx+u,cy+v,cz+h])
        tips=([[cx,cy-length/2,cz],[cx+.08*radius,cy+length/2,cz]] if vertical
              else [[cx,cy,cz-length/2],[cx,cy+.08*depth,cz+length/2]])
        v=belt+tips;faces=[]
        for i in range(6):
            j=(i+1)%6;faces.extend([[12,j,i],[i,j,6+j],[i,6+j,6+i],[13,6+i,6+j]])
        # Orient convex crystal faces by their centroid, flat normals preserved.
        center=np.array(center)
        for f in faces:
            p=np.array([v[i]for i in f]);n=np.cross(p[1]-p[0],p[2]-p[0])
            if np.dot(n,p.mean(axis=0)-center)<0:f.reverse()
        self.mesh(name,v,faces,'crystal',group)


def build():
    m=Model();b=m.box
    # Sealed outer volume and an actual cavity, including a finished underside.
    b('Body.Floor',[-6.85,.3,-6.85],[6.85,1.05,6.85],'shell',bevel=.10)
    b('Body.InnerFloor',[-6.18,1.05,-6.18],[6.18,1.15,6.18],'interior',bevel=.025)
    b('Body.FrontWall',[-6.85,1.05,-6.85],[6.85,10.35,-6.18],'shell',bevel=.10)
    b('Body.BackWall',[-6.85,1.05,6.18],[6.85,10.35,6.85],'shell',bevel=.10)
    b('Body.RightWall',[6.18,1.05,-6.16],[6.85,10.35,6.16],'shell',bevel=.08)
    b('Body.LeftWall',[-6.85,1.05,-6.16],[-6.18,10.35,6.16],'shell',bevel=.08)
    for s in [-1,1]:
        z=s*6.9
        b(f'Body.InsetPanelZ{s}',[-5.15,2.05,z-.065],[5.15,8.65,z+.065],'panel',bevel=.045)
        x=s*6.9
        b(f'Body.InsetPanelX{s}',[x-.065,2.05,-5.15],[x+.065,8.65,5.15],'panel',bevel=.045)
        for y,h in [(1.3,.42),(8.9,.44),(9.7,.45)]:
            b(f'Body.FrameZ{s}.{y}',[-5.25,y,z-.26],[5.25,y+h,z+.26],'edge',bevel=.065)
            b(f'Body.FrameX{s}.{y}',[x-.26,y,-5.25],[x+.26,y+h,5.25],'edge',bevel=.065)
        # Recessed planar borders: the frame is proud of the dark panel.
        for u in [-4.85,4.85]:
            b(f'Body.PanelUprightZ{s}.{u}',[u-.15,2,z-.21],[u+.15,8.7,z+.21],'edge',bevel=.035)
            b(f'Body.PanelUprightX{s}.{u}',[x-.21,2,u-.15],[x+.21,8.7,u+.15],'edge',bevel=.035)
    # Independent pillars, massive corner shoes and L-shaped lid armor.
    for sx in [-1,1]:
        for sz in [-1,1]:
            x,z=sx*6.35,sz*6.35;tag=f'{sx}.{sz}'
            b('Body.CornerSpine.'+tag,[x-.75,1.3,z-.75],[x+.75,9.1,z+.75],'edge',bevel=.14)
            # Concave outline is a wrap-around bracket, not a solid corner cube.
            shape=[(-1.6,.05),(.05,.05),(.05,-1.6),(1.38,-1.6),(1.38,1.38),(-1.6,1.38)]
            poly=[(x+sx*a,-(z+sz*c))for a,c in shape]
            for name,y0,y1,group in [('Foot',0,2,'Body'),('Shoulder',8.25,10.3,'Body'),('Cap',12.65,15.4,'LidAssembly')]:
                m.prism(group+'.Corner'+name+'.'+tag,poly,y0,y1,'metal',group,bevel=.13)
            # Dark inlaid plates and isolated teal studs on two exposed faces.
            for y in [.86,13.8]:
                group='Body' if y<2 else 'LidAssembly'
                b(f'{group}.StudSeatZ.{tag}.{y}',[x-.52,y-.55,sz*7.695-.055],[x+.52,y+.55,sz*7.695+.055],'edge',group,bevel=.025)
                b(f'{group}.StudSeatX.{tag}.{y}',[sx*7.695-.055,y-.55,z-.52],[sx*7.695+.055,y+.55,z+.52],'edge',group,bevel=.025)
                b(f'{group}.StudZ.{tag}.{y}',[x-.17,y-.26,sz*7.77-.02],[x+.17,y+.26,sz*7.77+.02],'accent',group,bevel=.01)
                b(f'{group}.StudX.{tag}.{y}',[sx*7.77-.02,y-.26,z-.17],[sx*7.77+.02,y+.26,z+.17],'accent',group,bevel=.01)
            # Interrupted energy veins have stone between the glowing segments.
            for y0,y1 in [(2.45,4.3),(5.35,7.65)]:
                b(f'Body.SpineInlayZ.{tag}.{y0}',[x-.15,y0,sz*7.12-.03],[x+.15,y1,sz*7.12+.03],'crystal',bevel=.015)
                b(f'Body.SpineInlayX.{tag}.{y0}',[sx*7.12-.03,y0,z-.15],[sx*7.12+.03,y1,z+.15],'crystal',bevel=.015)
    # Mineral channels on side panels, framed by dark geometric cut-outs.
    for sx in [-1,1]:
        for j,route in enumerate([[(-3.4,2.1),(-3.4,5.8),(-2.6,5.8),(-2.6,7.6)],[(.2,2.05),(.2,3.8),(1.0,3.8),(1.0,8.25)],[(3.45,2.7),(3.45,6.7)]]):
            for k,(a,c) in enumerate(zip(route,route[1:])):
                # XY of the side is (height,z); map into prism x-axis embedding.
                aa=[a[1],a[0]];cc=[c[1],c[0]]
                m.bar(f'Body.SideChannelBed{sx}.{j}.{k}',aa,cc,.46,.08,sx*6.97-.04,'edge',plane='yz')
                m.bar(f'Body.SideMineral{sx}.{j}.{k}',aa,cc,.19,.10,sx*7.02-.05,'crystal',plane='yz')
    # Front vertical reliquary belongs entirely to the stationary body. The
    # distinct lid clasp stops above the seam; no tongue can sweep into the rim.
    b('Body.ReliquaryRecess',[-1.35,2.35,-7.14],[1.35,10.1,-6.98],'interior',bevel=.12)
    for s in [-1,1]:
        b(f'Body.ReliquaryRail{s}',[s*1.2-.22,2.15,-7.58],[s*1.2+.22,10.15,-7.13],'metal',bevel=.075)
        b(f'Body.ReliquaryWing{s}',[s*1.7-.28,5.4,-7.35],[s*1.7+.28,8.2,-7.03],'metal',bevel=.07)
    for y in [2.15,9.75]:
        b(f'Body.ReliquaryEnd{y}',[-1.42,y,-7.58],[1.42,y+.4,-7.13],'metal',bevel=.075)
    m.crystal('Body.HeartCrystal',[0,6.15,-7.31],.78,6.2,.61)
    b('Lid.Slab',[-6.9,10.55,-6.9],[6.9,14.8,6.9],'shell','LidAssembly',bevel=.17)
    b('Lid.Underside',[-6.1,10.46,-6.1],[6.1,10.54,6.1],'interior','LidAssembly',bevel=.02)
    for s in [-1,1]:
        z=s*6.96;x=s*6.96
        b(f'Lid.LowerRimZ{s}',[-5.1,10.65,z-.20],[5.1,11.12,z+.20],'edge','LidAssembly',bevel=.07)
        b(f'Lid.LowerRimX{s}',[x-.20,10.65,-5.1],[x+.20,11.12,5.1],'edge','LidAssembly',bevel=.07)
        # Genuine recessed stripe along lid fascia, not a texture light.
        b(f'Lid.FasciaZ{s}',[-4.8,11.5,z-.08],[4.8,11.87,z+.08],'panel','LidAssembly',bevel=.025)
        for xloc in [-4.2,-2.6,2.6,4.2]:
            b(f'Lid.FasciaInsetZ{s}.{xloc}',[xloc-.13,11.5,z-.12],[xloc+.13,12.15,z+.12],'crystal','LidAssembly',bevel=.025)
        b(f'Lid.TopFrameX{s}',[s*5.1-.24,14.82,-4.9],[s*5.1+.24,15.05,4.9],'metal','LidAssembly',bevel=.055)
        b(f'Lid.TopFrameZ{s}',[-4.85,14.82,s*5.1-.24],[4.85,15.05,s*5.1+.24],'metal','LidAssembly',bevel=.055)
        # Back hinge leaves have axial clearance around the rotation center.
        b(f'Body.HingeBase{s}',[s*3.5-.6,9.15,6.9],[s*3.5+.6,10.28,7.6],'edge',bevel=.07)
        b(f'Body.HingeSupport{s}',[s*3.5-.35,9.8,7.35],[s*3.5+.35,10.48,7.75],'edge',bevel=.045)
        pin=[(10.55+.13*math.cos(i*math.tau/8),7.65+.13*math.sin(i*math.tau/8))for i in range(8)]
        m.prism(f'Body.HingePin{s}',pin,s*3.5-.7,s*3.5+.7,'metal',axis='x',bevel=.02)
        b(f'Lid.HingeLeaf{s}',[s*3.5-.5,10.6,6.92],[s*3.5+.5,11.5,7.48],'metal','LidAssembly',bevel=.065)
    # Raised diamond on top: concentric metal socket and low faceted crystal.
    for radius,y0,y1,material in [(2.95,14.8,15.0,'edge'),(2.55,14.99,15.18,'metal'),(2.05,15.17,15.23,'interior')]:
        m.prism('Lid.DiamondSocket.'+material,[(0,-radius),(radius,0),(0,radius),(-radius,0)],y0,y1,material,'LidAssembly',bevel=.04)
    m.crystal('Lid.CrownCrystal',[0,15.39,0],1.52,3.5,.34,'LidAssembly',vertical=False)
    for i,(a,c) in enumerate([((-4.6,-3.4),(-2.8,-3.4)),((-2.8,-3.4),(-2.8,-1.7)),((2.8,1.7),(2.8,3.4)),((2.8,3.4),(4.6,3.4))]):
        m.bar(f'Lid.EnergyBed{i}',a,c,.42,.10,14.82,'edge','LidAssembly')
        m.bar(f'Lid.EnergyInlay{i}',a,c,.16,.11,14.88,'crystal','LidAssembly')
    b('Lid.ClaspMount',[-.95,10.55,-7.25],[.95,12.55,-7.01],'edge','LidAssembly',bevel=.08)
    b('Lid.ClaspFace',[-.70,10.65,-7.52],[.70,12.35,-7.26],'metal','LidAssembly',bevel=.08)
    b('Lid.ClaspInlay',[-.22,10.85,-7.57],[.22,11.8,-7.52],'crystal','LidAssembly',bevel=.015)
    return m


def textures():
    images=[];rng=np.random.default_rng(704)
    for index,m in enumerate(MATERIALS):
        # Small albedo-only tile. No painted bevel, highlights, AO or shadows.
        size=64 if m.get('texture') else 16
        rgb=np.array([int(m['color'][i:i+2],16)for i in (1,3,5)])
        values=np.ones((size,size))
        if m.get('texture'):
            cells=rng.uniform(.86,1.12,(size//4,size//4));values=np.repeat(np.repeat(cells,4,0),4,1)
            values+=rng.uniform(-.025,.025,(size,size))
        else:values+=rng.uniform(-.018,.018,(size,size))
        a=np.clip(rgb*values[...,None],0,255).astype('uint8')
        image=Image.fromarray(a);image.save(OUT/(m['name'].replace('.','-')+'.png'));images.append(image)
    return images


def face_data(part,face):
    v=np.array([part['vertices'][i]for i in face]);n=np.cross(v,np.roll(v,-1,axis=0)).sum(axis=0);n/=np.linalg.norm(n)
    axis=int(np.argmax(abs(n)));axes=[a for a in range(3)if a!=axis]
    # Projected world UVs, identical texel density on all stone surfaces. Keep
    # within [0,1] without per-face full texture stretching or painted highlights.
    uv=(v[:,axes]+np.array([8 if a!=1 else 0 for a in axes]))/16
    uv[:,1]=1-uv[:,1]
    if '_uv' in part:uv=np.array(part['_uv'][part['faces'].index(face)],dtype=float)
    return v,n,uv


def bbmodel(model,images):
    elements=[]
    for part in model.parts:
        verts={f'v{i}':v for i,v in enumerate(part['vertices'])};faces={}
        size=np.array(images[part['material']].size)
        for i,face in enumerate(part['faces']):
            _,_,uv=face_data(part,face)
            faces[f'f{i}']={'vertices':[f'v{j}'for j in face],
                           'uv':{f'v{j}':(uv[k]*size).tolist()for k,j in enumerate(face)},
                           'texture':part['material']}
        elements.append({'name':part['name'],'uuid':uid(part['name']),'type':'mesh','origin':[0,0,0],
                         'rotation':[0,0,0],'vertices':verts,'faces':faces,'visibility':True,'export':True})
    textures=[]
    for mat,image in zip(MATERIALS,images):
        buffer=io.BytesIO();image.save(buffer,format='PNG')
        textures.append({'name':mat['name'].replace('.','-')+'.png','id':str(len(textures)),
                         'uuid':uid(mat['name']),'width':image.width,'height':image.height,
                         'uv_width':image.width,'uv_height':image.height,'internal':True,
                         'group':uid(mat['name']+'/pbr'),'pbr_channel':'color',
                         'source':'data:image/png;base64,'+base64.b64encode(buffer.getvalue()).decode()})
    groups=[{'name':group,'uuid':uid(group),'origin':PIVOT.tolist()if group=='LidAssembly'else[0,0,0],
             'rotation':[0,0,0],'children':[uid(p['name'])for p in model.parts if p['group']==group]}
            for group in ['Body','LidAssembly']]
    # Blockbench getFixed and glTF use the same positive X hinge rotation.
    animation={'name':'Vault.Open','uuid':uid('open'),'length':1,'loop':'hold','animators':{uid('LidAssembly'):{
        'name':'LidAssembly','type':'bone','keyframes':[
            {'uuid':uid(f'kf{t}'),'channel':'rotation','time':t,'interpolation':'linear',
             'data_points':[{'x':str(a),'y':'0','z':'0'}]}for t,a in [(0,0),(.15,0),(1,ANGLE)]]}}}
    material_groups=[]
    for mat in MATERIALS:
        albedo=np.array(linear(mat['color']));emission=np.array(mat.get('emission',[0,0,0]))
        strength=float(np.clip(np.dot(albedo,emission)/max(np.dot(albedo,albedo),1e-9),0,1))
        material_groups.append({'uuid':uid(mat['name']+'/pbr'),'name':mat['name'],'is_material':True,
            'material_config':{'color_value':[255,255,255,255],
                               'mer_value':[mat['metallic']*255,strength*255,mat['roughness']*255]}})
    result={'meta':{'format_version':'4.10','model_format':'free','box_uv':False},
            'name':TITLE,'resolution':{'width':64,'height':64},
            'elements':elements,'outliner':groups,'textures':textures,'texture_groups':material_groups,'animations':[animation]}
    (OUT/'relic.bbmodel').write_text(json.dumps(result,separators=(',',':')))


def glb(model,images):
    binary=bytearray();views=[];accessors=[]
    def view(data,target=None):
        binary.extend(b'\0'*((-len(binary))%4));v={'buffer':0,'byteOffset':len(binary),'byteLength':len(data)}
        if target:v['target']=target
        views.append(v);binary.extend(data);return len(views)-1
    def accessor(data,kind,indices=False):
        a=np.array(data,dtype='<u2'if indices else'<f4');target=34963 if indices else (34962 if kind in ['VEC2','VEC3']else None)
        accessors.append({'bufferView':view(a.tobytes(),target),'componentType':5123 if indices else 5126,
                          'count':len(a),'type':kind,'min':a.min(axis=0).reshape(-1).tolist(),'max':a.max(axis=0).reshape(-1).tolist()})
        return len(accessors)-1
    nodes=[{'name':'VaultRoot','children':[1,2]},{'name':'Body','children':[]},
           {'name':'LidAssembly','translation':(PIVOT/16).tolist(),'children':[]}];meshes=[]
    for group in ['Body','LidAssembly']:
        for material in range(len(MATERIALS)):
            pos=[];norm=[];uvs=[];indices=[];ranges=[];unique={}
            pivot=PIVOT if group=='LidAssembly'else np.zeros(3)
            for part in model.parts:
                if part['group']!=group or part['material']!=material:continue
                start=len(indices)
                for face in part['faces']:
                    v,n,uv=face_data(part,face)
                    for tri in triangulate(v):
                        for i in tri:
                            point=(v[i]-pivot)/16;key=tuple(np.round(np.r_[point,n,uv[i]],9))
                            if key not in unique:
                                unique[key]=len(pos);pos.append(point);norm.append(n);uvs.append(uv[i])
                            indices.append(unique[key])
                ranges.append({'name':part['name'],'firstIndex':start,'indexCount':len(indices)-start})
            if not pos:continue
            prim={'attributes':{'POSITION':accessor(pos,'VEC3'),'NORMAL':accessor(norm,'VEC3'),'TEXCOORD_0':accessor(uvs,'VEC2')},
                  'indices':accessor([[i]for i in indices],'SCALAR',True),'material':material,'extras':{'parts':ranges}}
            name=group+'.'+MATERIALS[material]['name'].split('.')[-1]
            meshes.append({'name':name,'primitives':[prim]});ni=len(nodes)
            nodes.append({'name':name,'mesh':len(meshes)-1})
            nodes[1 if group=='Body'else 2]['children'].append(ni)
    image_defs=[]
    for image in images:
        data=io.BytesIO();image.save(data,format='PNG');image_defs.append({'mimeType':'image/png','bufferView':view(data.getvalue())})
    # Optional core glTF maps. Old assets without bindings retain byte-identical
    # export; the manifest is also used by controlled Blockbench re-export.
    map_indices={}
    for m in MATERIALS:
        for filename in m.get('maps',{}).values():
            if filename not in map_indices:
                map_indices[filename]=len(image_defs)
                image_defs.append({'name':filename,'mimeType':'image/png','bufferView':view((OUT/filename).read_bytes())})
    materials=[]
    for i,m in enumerate(MATERIALS):
        mat={'name':m['name'],'pbrMetallicRoughness':{'baseColorTexture':{'index':i},'metallicFactor':m['metallic'],'roughnessFactor':m['roughness']}}
        if m.get('emission'):mat['emissiveFactor']=m['emission']
        maps=m.get('maps',{})
        if 'orm'in maps:
            mat['pbrMetallicRoughness']['metallicRoughnessTexture']={'index':map_indices[maps['orm']]}
            mat['occlusionTexture']={'index':map_indices[maps['orm']],'strength':m.get('occlusionStrength',1)}
        if 'normal'in maps:mat['normalTexture']={'index':map_indices[maps['normal']],'scale':m.get('normalScale',1)}
        if 'emissive'in maps:mat['emissiveTexture']={'index':map_indices[maps['emissive']]}
        materials.append(mat)
    times=accessor([[0],[.15],[1]],'SCALAR');a=math.radians(ANGLE)
    rotations=accessor([[0,0,0,1],[0,0,0,1],[math.sin(a/2),0,0,math.cos(a/2)]],'VEC4')
    g={'asset':{'version':'2.0','generator':('Relic v2 mesh authoring'if REVISION=='relic-v2-prototype'else REVISION)},'scene':0,
       'scenes':[{'name':TITLE,'nodes':[0]}],'nodes':nodes,'meshes':meshes,
       'accessors':accessors,'bufferViews':views,'buffers':[{'byteLength':len(binary)}],
       'materials':materials,'images':image_defs,
       'samplers':[{'magFilter':9728,'minFilter':9987,'wrapS':33071,'wrapT':33071}],
       'textures':[{'source':i,'sampler':0}for i in range(len(image_defs))],
       'animations':[{'name':'Vault.Open','samplers':[{'input':times,'output':rotations,'interpolation':'LINEAR'}],
                      'channels':[{'sampler':0,'target':{'node':2,'path':'rotation'}}]}]}
    raw=json.dumps(g,separators=(',',':')).encode();raw+=b' '*((-len(raw))%4);binary+=b'\0'*((-len(binary))%4)
    (OUT/'relic.glb').write_bytes(struct.pack('<4sII',b'glTF',2,28+len(raw)+len(binary))+struct.pack('<I4s',len(raw),b'JSON')+raw+struct.pack('<I4s',len(binary),b'BIN\0')+binary)


def from_bbmodel(path):
    """Preserve hand-edited vertices, face UVs and bitmaps; apply canonical PBR.

    Element transforms are baked into mesh vertices. Body/lid root transforms
    and hinge stay contractual. Unexpected structure fails rather than exporting
    silently broken animation. Native GLB export from the installed Blockbench
    switches to textured view and cannot be relied on to preserve PBR groups.
    """
    source=json.loads(path.read_text());model=Model();elements={e['uuid']:e for e in source['elements']}
    images=[];texture_material={}
    for mat in MATERIALS:
        candidates=[(i,t)for i,t in enumerate(source['textures'])if t['name'].removesuffix('.png').replace('-','.')==mat['name']]
        if len(candidates)!=1:raise ValueError('Missing or ambiguous texture '+mat['name'])
        i,tex=candidates[0];image=Image.open(io.BytesIO(base64.b64decode(tex['source'].split(',',1)[1]))).convert('RGB');images.append(image)
        texture_material[i]=len(images)-1;texture_material[tex.get('uuid')]=len(images)-1
        image.save(OUT/(mat['name'].replace('.','-')+'.png'))
    def transform(rotation):
        x,y,z=np.radians(rotation);cx,sx=math.cos(x),math.sin(x);cy,sy=math.cos(y),math.sin(y);cz,sz=math.cos(z),math.sin(z)
        rx=np.array([[1,0,0],[0,cx,-sx],[0,sx,cx]]);ry=np.array([[cy,0,sy],[0,1,0],[-sy,0,cy]]);rz=np.array([[cz,-sz,0],[sz,cz,0],[0,0,1]])
        return rx@ry@rz
    def visit(node,group):
        if not isinstance(node,str):raise ValueError('Keep editable meshes directly in Body / LidAssembly (no nested transforms).')
        e=elements[node]
        if e.get('type')!='mesh':raise ValueError('Convert newly added cubes to meshes before controlled GLB export: '+e['name'])
        keys=list(e['vertices']);lookup={key:i for i,key in enumerate(keys)};origin=np.array(e.get('origin',[0,0,0]))
        v=np.array([e['vertices'][key]for key in keys])@transform(e.get('rotation',[0,0,0])).T+origin
        by_material={}
        for face in e['faces'].values():
            tex=face['texture'];material=texture_material.get(tex)
            if material is None:raise ValueError('Unknown material assignment in '+e['name'])
            if len(face['vertices'])<3:continue
            size=np.array([images[material].width,images[material].height])
            indices=[lookup[key]for key in face['vertices']]
            uv=[(np.array(face['uv'][key])/size).tolist()for key in face['vertices']]
            by_material.setdefault(material,[]).append((indices,uv))
        for material,items in by_material.items():
            name=e['name']+(('.'+str(material))if len(by_material)>1 else'')
            model.mesh(name,v,[item[0]for item in items],MATERIALS[material]['name'].split('.')[-1].lower(),group)
            model.parts[-1]['_uv']=[item[1]for item in items]
    roots={g['name']:g for g in source['outliner']if isinstance(g,dict)}
    if set(roots)!=set(['Body','LidAssembly']):raise ValueError('Expected Body and LidAssembly roots')
    for group,node in roots.items():
        expected=PIVOT if group=='LidAssembly'else np.zeros(3)
        if not np.allclose(node.get('origin',[0,0,0]),expected)or not np.allclose(node.get('rotation',[0,0,0]),0):raise ValueError('Root hinge/rest pose must match contract')
        for child in node['children']:visit(child,group)
    return model,images


def main():
    global OUT, REVISION, TITLE
    existing={}
    parser=argparse.ArgumentParser();parser.add_argument('--from-bbmodel',type=Path);parser.add_argument('--output-dir',type=Path)
    parser.add_argument('--geometry-pass',action='store_true');args=parser.parse_args()
    if args.geometry_pass:
        REVISION='relic-v3-geometry-review';TITLE='Relic Chest — Geometry Review';OUT=ROOT/'assets/chests/relic-v3-geometry'
    elif args.from_bbmodel and (args.from_bbmodel.parent/'contract.json').exists():
        existing=json.loads((args.from_bbmodel.parent/'contract.json').read_text())
        REVISION=existing['revision'];TITLE=existing.get('title','Relic Chest — Geometry Review'if REVISION=='relic-v3-geometry-review'else TITLE)
        if not args.output_dir:OUT=args.from_bbmodel.parent.resolve()
    if args.output_dir:OUT=args.output_dir.resolve()
    OUT.mkdir(parents=True,exist_ok=True);REVIEW.mkdir(parents=True,exist_ok=True)
    if args.from_bbmodel:
        config=args.from_bbmodel.parent/'materials.json'
        if config.exists():
            loaded=json.loads(config.read_text())
            if [m['name']for m in loaded]!=[m['name']for m in MATERIALS]:raise ValueError('PBR material contract changed')
            MATERIALS[:]=loaded
            for mat in MATERIALS:
                for filename in mat.get('maps',{}).values():
                    source=args.from_bbmodel.parent/filename
                    if source.resolve()!=(OUT/filename).resolve():(OUT/filename).write_bytes(source.read_bytes())
        model,images=from_bbmodel(args.from_bbmodel)
    elif args.geometry_pass:
        spec=importlib.util.spec_from_file_location('relic_geometry',Path(__file__).with_name('relic-geometry.py'))
        geometry=importlib.util.module_from_spec(spec);spec.loader.exec_module(geometry)
        import sys
        model=geometry.build(sys.modules[__name__]);images=[]
        for mat in MATERIALS:
            path=ROOT/'assets/chests/relic-v2'/(mat['name'].replace('.','-')+'.png')
            image=Image.open(path).convert('RGB');image.save(OUT/path.name);images.append(image)
        bbmodel(model,images)
    else:
        model=build();images=textures();bbmodel(model,images)
    glb(model,images)
    (OUT/'materials.json').write_text(json.dumps(MATERIALS,indent=2))
    relative=OUT.relative_to(ROOT)if OUT.is_relative_to(ROOT)else OUT
    (OUT/'contract.json').write_text(json.dumps({**existing,'revision':REVISION,'status':'geometry-review-material-pass-deferred'if REVISION=='relic-v3-geometry-review'else'awaiting-visual-review',
        'closedEnvelope':{'min':[-.5,0,-.5],'max':[.5,1,.5]},'units':'one GLB unit = one block',
        'authoringScale':16,'front':'-Z','body':'Body','lid':'LidAssembly','pivot':(PIVOT/16).tolist(),
        'openingClips':['Vault.Open'],'rotationY':0,'openAngleDegrees':ANGLE,
        'materials':[m['name']for m in MATERIALS],'runtimeProfile':'not activated; existing reference model is unchanged',
        'bbmodel':'free format mesh + PBR texture groups; canonical factors in materials.json; controlled re-export required',
        'controlledExport':f'python3.13 scripts/chests/build-relic.py --from-bbmodel {relative}/relic.bbmodel --output-dir {relative}'},indent=2))
    print(json.dumps({'parts':len(model.parts),'glbBytes':(OUT/'relic.glb').stat().st_size,'path':str(OUT/'relic.glb')}))


if __name__=='__main__':main()
