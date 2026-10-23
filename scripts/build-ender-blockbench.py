"""Build editable Blockbench chests and self-contained glTF 2.0 review exports.

Run: /opt/homebrew/bin/python3.13 scripts/build-ender-blockbench.py
Requires Pillow and numpy for the CPU review renderer; no GUI or GPU required.
The authoring and export paths share face vertices/UVs. Review images are decoded
from the exported GLBs, not from an independent approximation of the model.
"""
from pathlib import Path
import base64
import io
import json
import math
import struct
import uuid

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/chests/blockbench-ender'
REVIEW = ROOT / 'artifacts/ender-blockbench'
SOURCE = Path('/Users/loper/Downloads/Minecraft Ender Chest Textures')
HINGE = [0, 10.25, 7]
OPEN_ANGLE = 105


def uid(name):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, 'mcroulette/ender/' + name))


def detail_atlas(variant, folder):
    original = SOURCE / f'{variant}_ender_chest_atlas_64.png'
    if not original.exists():
        original = folder / 'source-atlas.png'
    image = Image.open(original).convert('RGBA')
    image.save(folder / 'source-atlas.png')
    # Additional trim swatches occupy formerly unused atlas space. Existing UV
    # islands and every original pixel outside these swatches remain untouched.
    colors = {
        'relic': [(77, 112, 109), (41, 67, 73), (73, 216, 193), (14, 25, 37)],
        'rune': [(92, 108, 129), (48, 66, 85), (119, 222, 230), (16, 27, 42)],
    }[variant]
    for tile, color in enumerate(colors):
        for y in range(8):
            for x in range(8):
                variation = .88 + ((x * 7 + y * 13 + (x // 2) * 17) % 13) / 52
                if y == 0 or x == 0:
                    variation += .13
                if y == 7 or x == 7:
                    variation -= .14
                image.putpixel((16 + tile * 8 + x, 48 + y), tuple(min(255, round(c * variation)) for c in color) + (255,))
    image.save(folder / 'atlas.png')
    return image


TILES = {'metal': [16, 48, 24, 56], 'dark': [24, 48, 32, 56],
         'glow': [32, 48, 40, 56], 'inner': [40, 48, 48, 56]}


def build(variant):
    parts = []

    def box(name, low, high, texture='metal', group='Body', faces=None, glow=False):
        uv = TILES[texture] if isinstance(texture, str) else texture
        uv_faces = {face: {'uv': list(uv), 'texture': 0} for face in ('north', 'east', 'south', 'west', 'up', 'down')}
        for face, rect in (faces or {}).items():
            uv_faces[face]['uv'] = rect
        parts.append({'name': name, 'uuid': uid(variant + '/' + name), 'type': 'cube',
                      'from': low, 'to': high, 'origin': [0, 0, 0],
                      'rotation': [0, 0, 0], 'autouv': 0, 'box_uv': False,
                      'rescale': False, 'locked': False, 'visibility': True,
                      'export': True, 'faces': uv_faces, '_group': group, '_glow': glow})

    # Hollow body. The visible panels use the supplied Minecraft chest islands,
    # while hidden inside faces use the explicit cavity swatch.
    box('Body.Floor', [-7, 0, -7], [7, .65, 7], 'inner', faces={'down': [14, 19, 28, 33], 'up': [14, 19, 28, 33]})
    box('Body.Front', [-7, .65, -7], [7, 10, -6.35], 'inner', faces={'north': [14, 33, 28, 43]})
    box('Body.Back', [-7, .65, 6.35], [7, 10, 7], 'inner', faces={'south': [42, 33, 56, 43]})
    box('Body.Right', [6.35, .65, -6.35], [7, 10, 6.35], 'inner', faces={'east': [28, 33, 42, 43]})
    box('Body.Left', [-7, .65, -6.35], [-6.35, 10, 6.35], 'inner', faces={'west': [0, 33, 14, 43]})
    box('Lid.Slab', [-7, 10.25, -7], [7, 14.25, 7], [14, 0, 28, 14], 'LidAssembly', faces={
        'up': [28, 0, 42, 14], 'down': [28, 19, 42, 33],
        'north': [14, 14, 28, 18], 'east': [28, 14, 42, 18],
        'south': [42, 14, 56, 18], 'west': [0, 14, 14, 18]})
    # Continuous dark seams, edge rails and four readable corner pillars.
    for sign in [-1, 1]:
        z = sign * 7
        box(f'Body.Rim.Z{sign}', [-5.3, 9.5, z - .17], [5.3, 10.05, z + .17], 'dark')
        box(f'Body.FootRail.Z{sign}', [-5.3, .15, z - .12], [5.3, .65, z + .12], 'dark')
        x = sign * 7
        box(f'Body.Rim.X{sign}', [x - .17, 9.5, -5.3], [x + .17, 10.05, 5.3], 'dark')
        box(f'Body.FootRail.X{sign}', [x - .12, .15, -5.3], [x + .12, .65, 5.3], 'dark')
        for other in [-1, 1]:
            cx, cz = sign * 6.5, other * 6.5
            tag = f'{sign}.{other}'
            box('Body.Pillar.' + tag, [cx-.8, .5, cz-.8], [cx+.8, 9.55, cz+.8], 'dark')
            box('Body.CornerFoot.' + tag, [cx-1.4, -.15, cz-1.4], [cx+1.4, 1.85, cz+1.4])
            box('Body.CornerShoulder.' + tag, [cx-1.4, 8.05, cz-1.4], [cx+1.4, 9.7, cz+1.4])
            box('Lid.CornerCap.' + tag, [cx-1.4, 12.3, cz-1.4], [cx+1.4, 14.65, cz+1.4], 'metal', 'LidAssembly')
            # Small inlaid studs on both outside faces of each cap and foot.
            for y, group in [(.7, 'Body'), (13.5, 'LidAssembly')]:
                zz = cz + other * 1.41
                xx = cx + sign * 1.41
                box(f'{group}.StudZ.{tag}.{y}', [cx-.24, y-.24, zz-.025], [cx+.24, y+.24, zz+.025], 'glow', group, glow=True)
                box(f'{group}.StudX.{tag}.{y}', [xx-.025, y-.24, cz-.24], [xx+.025, y+.24, cz+.24], 'glow', group, glow=True)
            # Narrow vertical mineral channels, separate from the painted panels.
            zz = cz + other * .82
            xx = cx + sign * .82
            box('Body.ChannelZ.' + tag, [cx-.14, 2.8, zz-.025], [cx+.14, 7.4, zz+.025], 'glow', glow=True)
            box('Body.ChannelX.' + tag, [xx-.025, 2.8, cz-.14], [xx+.025, 7.4, cz+.14], 'glow', glow=True)
    # Lid top framing leaves the supplied central seal fully visible.
    for s in [-1, 1]:
        box(f'Lid.TopRailX{s}', [s*5.55-.2, 14.26, -5.5], [s*5.55+.2, 14.37, 5.5], 'dark', 'LidAssembly')
        box(f'Lid.TopRailZ{s}', [-5.5, 14.26, s*5.55-.2], [5.5, 14.37, s*5.55+.2], 'dark', 'LidAssembly')
        box(f'Body.Hinge{s}', [s*3.5-.65, 9.05, 7.05], [s*3.5+.65, 10, 7.65], 'metal')
        box(f'Lid.Hinge{s}', [s*3.5-.65, 10.25, 7.05], [s*3.5+.65, 11.4, 7.65], 'dark', 'LidAssembly')
    # Latch follows the lid; no geometry spans the moving hinge.
    box('Lid.LatchRecess', [-.8, 7.3, -7.42], [.8, 12.25, -7.03], 'inner', 'LidAssembly')
    for s in [-1, 1]:
        box(f'Lid.LatchFrame{s}', [s*.85-.19, 7.15, -7.65], [s*.85+.19, 12.4, -7.12], 'metal', 'LidAssembly')
    for y in [7.15, 12.1]:
        box(f'Lid.LatchEnd{y}', [-1.04, y, -7.65], [1.04, y+.3, -7.12], 'metal', 'LidAssembly')
    if variant == 'relic':
        for i, width in enumerate([.26, .47, .58, .58, .47, .26]):
            y = 8 + i * .53
            box(f'Lid.CrystalFacet{i}', [-width, y, -7.93], [width, y+.54, -7.6], 'glow', 'LidAssembly', glow=True)
        for s in [-1, 1]:
            box(f'Lid.LatchWing{s}', [s*1.17-.17, 9.1, -7.5], [s*1.17+.17, 10.1, -7.08], 'metal', 'LidAssembly')
    else:
        box('Lid.RuneLatch', [-.42, 8.05, -7.89], [.42, 11.4, -7.6], 'glow', 'LidAssembly', glow=True)
        # Octagonal inlaid seal and relief border on the front body.
        # Discrete axis-aligned segments stay native, editable Blockbench cubes.
        for i, (x, y, w, h) in enumerate([(-1.4, 5.8, 2.8,.28), (-2.25,5.1,.85,.28),
                (1.4,5.1,.85,.28), (-2.55,2.8,.28,2.3), (2.27,2.8,.28,2.3),
                (-2.25,2.3,.85,.28), (1.4,2.3,.85,.28), (-1.4,1.8,2.8,.28)]):
            box(f'Body.RuneSeal{i}', [x,y,-7.13], [x+w,y+h,-7.04], 'glow', glow=True)
        box('Body.RuneBoss', [-.55,3.5,-7.4], [.55,4.6,-7.12], 'metal')
        box('Body.RuneCore', [-.23,3.82,-7.44], [.23,4.28,-7.4], 'glow', glow=True)
    return parts


def faces(part):
    x0,y0,z0 = part['from']; x1,y1,z1 = part['to']
    # Counterclockwise outside; UV order matches Blockbench cube faces.
    return {
        'north': ([(x1,y1,z0),(x0,y1,z0),(x0,y0,z0),(x1,y0,z0)], (0,0,-1)),
        'south': ([(x0,y1,z1),(x1,y1,z1),(x1,y0,z1),(x0,y0,z1)], (0,0,1)),
        'east': ([(x1,y1,z1),(x1,y1,z0),(x1,y0,z0),(x1,y0,z1)], (1,0,0)),
        'west': ([(x0,y1,z0),(x0,y1,z1),(x0,y0,z1),(x0,y0,z0)], (-1,0,0)),
        'up': ([(x0,y1,z0),(x1,y1,z0),(x1,y1,z1),(x0,y1,z1)], (0,1,0)),
        'down': ([(x0,y0,z1),(x1,y0,z1),(x1,y0,z0),(x0,y0,z0)], (0,-1,0)),
    }


def save_bbmodel(variant, parts, image, folder):
    groups = [{'name': name, 'uuid': uid(variant+'/'+name),
               'origin': HINGE if name == 'LidAssembly' else [0,0,0],
               'rotation': [0,0,0], 'export': True, 'isOpen': True,
               'children': [p['uuid'] for p in parts if p['_group'] == name]}
              for name in ['Body', 'LidAssembly']]
    png = io.BytesIO(); image.save(png, format='PNG')
    animation = {'uuid': uid(variant+'/open'), 'name': 'Vault.Open', 'loop': 'hold',
                 'length': 1, 'anim_time_update': '', 'blend_weight': '',
                 'animators': {uid(variant+'/LidAssembly'): {
                     'name': 'LidAssembly', 'type': 'bone', 'keyframes': [
                         {'channel':'rotation', 'data_points':[{'x':str(angle),'y':'0','z':'0'}],
                          'uuid':uid(variant+f'/frame/{t}'), 'time':t, 'color':-1,
                          'interpolation':'linear'} for t,angle in [(0,0),(.15,0),(1,OPEN_ANGLE)]]}}}
    model = {'meta': {'format_version':'4.10','model_format':'free','box_uv':False},
             'name': variant.title()+' Ender Chest', 'model_identifier':variant+'_ender_chest',
             'resolution': {'width':64,'height':64}, 'visible_box':[1,1,0],
             'elements': [{k:v for k,v in p.items() if not k.startswith('_')} for p in parts],
             'outliner': groups, 'animations':[animation],
             'textures':[{'name':'atlas.png','id':'0','uuid':uid(variant+'/atlas'),
                          'relative_path':'atlas.png','width':64,'height':64,
                          'uv_width':64,'uv_height':64, 'render_mode':'default',
                          'visible':True,'internal':True,'saved':True,
                          'source':'data:image/png;base64,'+base64.b64encode(png.getvalue()).decode()}]}
    (folder / (variant+'-ender-chest.bbmodel')).write_text(json.dumps(model, indent=2))


def save_glb(variant, parts, image, folder):
    binary = bytearray(); views=[]; accessors=[]
    def view(data, target=None):
        while len(binary)%4: binary.append(0)
        v = {'buffer':0,'byteOffset':len(binary),'byteLength':len(data)}
        if target: v['target']=target
        views.append(v); binary.extend(data); return len(views)-1
    def accessor(data, kind):
        a = np.array(data, dtype='<f4')
        v = view(a.tobytes(),34962)
        accessors.append({'bufferView':v,'componentType':5126,'count':len(a),
                          'type':kind,'min':a.min(axis=0).tolist(),'max':a.max(axis=0).tolist()})
        return len(accessors)-1
    meshes=[]; nodes=[{'name':'VaultRoot','children':[1,2]},
                     {'name':'Body','children':[]},
                     {'name':'LidAssembly','translation':[v/16 for v in HINGE],'children':[]}]
    # Merge static cubes per assembly and material. Semantic cube names remain
    # in the bbmodel while exported mesh count stays low.
    for group in ['Body','LidAssembly']:
        for emissive in [False,True]:
            positions=[]; normals=[]; uvs=[]
            for p in parts:
                if p['_group']!=group or p['_glow']!=emissive: continue
                for face,(corners,normal) in faces(p).items():
                    x0,y0,x1,y1 = p['faces'][face]['uv']
                    quad_uv=[(x0/64,1-y0/64),(x1/64,1-y0/64),(x1/64,1-y1/64),(x0/64,1-y1/64)]
                    for i in [0,2,1,0,3,2]:
                        positions.append([(corners[i][a]-(HINGE[a] if group=='LidAssembly' else 0))/16 for a in range(3)])
                        normals.append(normal);uvs.append(quad_uv[i])
            if not positions: continue
            mesh={'name':group+('.Glow' if emissive else '.Surface'),
                  'primitives':[{'attributes':{'POSITION':accessor(positions,'VEC3'),
                                               'NORMAL':accessor(normals,'VEC3'),
                                               'TEXCOORD_0':accessor(uvs,'VEC2')},
                                 'material':1 if emissive else 0}]}
            meshes.append(mesh);ni=len(nodes);nodes.append({'name':mesh['name'],'mesh':len(meshes)-1})
            nodes[1 if group=='Body' else 2]['children'].append(ni)
    # UV coordinates in glTF have their origin at the TOP of the PNG.
    for a in accessors:
        if a['type']=='VEC2':
            v=views[a['bufferView']]; arr=np.frombuffer(binary,dtype='<f4',count=a['count']*2,offset=v['byteOffset']).reshape(-1,2)
            arr[:,1]=1-arr[:,1];a['min']=arr.min(axis=0).tolist();a['max']=arr.max(axis=0).tolist();del arr
    time_access=accessor([[0],[.15],[1]],'SCALAR');accessors[time_access]['min']=[0];accessors[time_access]['max']=[1]
    angle=math.radians(OPEN_ANGLE)
    rotation=accessor([[0,0,0,1],[0,0,0,1],[math.sin(angle/2),0,0,math.cos(angle/2)]],'VEC4')
    png=io.BytesIO();image.save(png,format='PNG');image_view=view(png.getvalue())
    gltf={'asset':{'version':'2.0','generator':'MC Roulette / Blockbench-compatible cube authoring'},
          'scene':0,'scenes':[{'name':variant.title()+' Ender Chest','nodes':[0]}],
          'nodes':nodes,'meshes':meshes,'bufferViews':views,'accessors':accessors,
          'images':[{'bufferView':image_view,'mimeType':'image/png','name':variant+'-atlas'}],
          'samplers':[{'magFilter':9728,'minFilter':9728,'wrapS':33071,'wrapT':33071}],
          'textures':[{'sampler':0,'source':0}],
          'materials':[{'name':'Vault.Surface','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':.08,'roughnessFactor':.85}},
                       {'name':'Vault.Glow','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':.7},
                        'emissiveTexture':{'index':0},'emissiveFactor':[.5,.75,.75]}],
          'animations':[{'name':'Vault.Open','samplers':[{'input':time_access,'output':rotation,'interpolation':'LINEAR'}],
                         'channels':[{'sampler':0,'target':{'node':2,'path':'rotation'}}]}],
          'buffers':[{'byteLength':len(binary)}]}
    payload=json.dumps(gltf,separators=(',',':')).encode();payload+=b' '*((-len(payload))%4)
    binary.extend(b'\0'*((-len(binary))%4))
    raw=struct.pack('<4sII',b'glTF',2,28+len(payload)+len(binary))+struct.pack('<I4s',len(payload),b'JSON')+payload+struct.pack('<I4s',len(binary),b'BIN\0')+binary
    path=folder/(variant+'-ender-chest.glb');path.write_bytes(raw)
    return path


def read_glb(path, opened=False):
    raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+n]);binary=raw[28+n:]
    def read(index):
        a=g['accessors'][index];v=g['bufferViews'][a['bufferView']]
        dim={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
        return np.frombuffer(binary,dtype='<f4',count=a['count']*dim,offset=v.get('byteOffset',0)).reshape(-1,dim).astype(float)
    iv=g['bufferViews'][g['images'][0]['bufferView']]
    tex=np.array(Image.open(io.BytesIO(binary[iv['byteOffset']:iv['byteOffset']+iv['byteLength']])).convert('RGB'))
    all_triangles=[]
    def visit(i, matrix):
        node=g['nodes'][i];local=np.eye(4);local[:3,3]=node.get('translation',[0,0,0])
        if opened and node.get('name')=='LidAssembly':
            s=g['animations'][0]['samplers'][0];q=read(s['output'])[-1];a=2*math.atan2(q[0],q[3]);c,s=math.cos(a),math.sin(a)
            local[:3,:3]=[[1,0,0],[0,c,-s],[0,s,c]]
        world=matrix@local
        if 'mesh'in node:
            for p in g['meshes'][node['mesh']]['primitives']:
                attrs=p['attributes'];v=read(attrs['POSITION']);v=v@world[:3,:3].T+world[:3,3]
                normals=read(attrs['NORMAL'])@world[:3,:3].T;uv=read(attrs['TEXCOORD_0'])
                for j in range(0,len(v),3):all_triangles.append((v[j:j+3],normals[j],uv[j:j+3],p['material']==1))
        for child in node.get('children',[]):visit(child,world)
    visit(0,np.eye(4));return all_triangles,tex,g


def render(path, target, direction, opened=False, wire=False, size=800):
    triangles,texture,_=read_glb(path,opened)
    forward=np.array(direction,dtype=float);forward/=np.linalg.norm(forward)
    right=np.cross([0,1,0],forward);right/=np.linalg.norm(right);up=np.cross(forward,right)
    points=np.concatenate([t[0]for t in triangles]);center=(points.max(axis=0)+points.min(axis=0))/2
    # Fixed closed framing allows useful A/B comparisons. Opened shot fits lid.
    px=(points-center)@right;py=(points-center)@up
    scale=size*.86/max(np.ptp(px),np.ptp(py)) if opened else size/1.65
    offset_x=(px.min()+px.max())/2;offset_y=(py.min()+py.max())/2
    screen=np.full((size,size,3),[18,23,34],dtype=np.uint8);depth=np.full((size,size),-np.inf)
    light=np.array([-.4,.85,-.5]);light/=np.linalg.norm(light)
    projected=[]
    for vertices,normal,uv,emissive in triangles:
        if normal@forward <= 1e-6:continue
        v=vertices-center;xy=np.column_stack(((v@right-offset_x)*scale+size/2,-(v@up-offset_y)*scale+size/2));z=v@forward
        x0=max(0,int(np.floor(xy[:,0].min())));x1=min(size-1,int(np.ceil(xy[:,0].max())))
        y0=max(0,int(np.floor(xy[:,1].min())));y1=min(size-1,int(np.ceil(xy[:,1].max())))
        if x1<x0 or y1<y0:continue
        xx,yy=np.meshgrid(np.arange(x0,x1+1)+.5,np.arange(y0,y1+1)+.5)
        a,b,c=xy;den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        if abs(den)<1e-8:continue
        u=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den
        v=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den;w=1-u-v
        zz=u*z[0]+v*z[1]+w*z[2];dest=depth[y0:y1+1,x0:x1+1]
        mask=(u>=-1e-6)&(v>=-1e-6)&(w>=-1e-6)&(zz>dest)
        tu=u*uv[0,0]+v*uv[1,0]+w*uv[2,0];tv=u*uv[0,1]+v*uv[1,1]+w*uv[2,1]
        color=texture[np.clip((tv*64).astype(int),0,63),np.clip((tu*64).astype(int),0,63)].astype(float)
        lighting=.63+.32*max(0,float(normal@light))+.12*max(0,float(normal@np.array([.8,.2,.4])))
        if emissive:lighting=1.18
        color=np.clip(color*lighting,0,255).astype(np.uint8)
        dest[mask]=zz[mask];screen[y0:y1+1,x0:x1+1][mask]=color[mask]
        projected.append((xy,z))
    im=Image.fromarray(screen)
    if wire:
        draw=ImageDraw.Draw(im)
        # Only draw segments whose midpoint is visible in the depth buffer.
        for xy,z in projected:
            for i,j in [(0,1),(1,2),(2,0)]:
                for t in np.linspace(0,1,30):
                    p=xy[i]*(1-t)+xy[j]*t;zz=z[i]*(1-t)+z[j]*t;x,y=int(p[0]),int(p[1])
                    if 0<=x<size and 0<=y<size and zz>=depth[y,x]-.003:draw.point((x,y),fill=(155,210,208))
    im.save(target)


def main():
    OUT.mkdir(parents=True,exist_ok=True);REVIEW.mkdir(parents=True,exist_ok=True)
    report=[]
    for variant in ['relic','rune']:
        folder=OUT/variant;folder.mkdir(exist_ok=True);images=REVIEW/variant;images.mkdir(exist_ok=True)
        texture=detail_atlas(variant,folder);parts=build(variant)
        save_bbmodel(variant,parts,texture,folder);path=save_glb(variant,parts,texture,folder)
        for name,view,opened,wire in [
            ('01-three-quarter', (1.45,1.05,-1.8),False,False),
            ('02-front',(0,.05,-1),False,False),
            ('03-right',(1,.05,0),False,False),
            ('04-rear',(-1.5,1.1,1.8),False,False),
            ('05-top',(0,1,-.001),False,False),
            ('06-open',(1.4,1,-1.8),True,False),
            ('07-wire',(1.45,1.05,-1.8),False,True)]:
            render(path,images/(name+'.png'),view,opened,wire)
        triangles,_,g=read_glb(path)
        assert len(g['animations'])==1 and len(g['images'])==1
        assert all(np.isfinite(t[0]).all() for t in triangles)
        assert all((t[2]>=0).all() and (t[2]<=1).all() for t in triangles)
        assert all(np.cross(t[0][1]-t[0][0],t[0][2]-t[0][0])@t[1]>0 for t in triangles), 'Reversed winding'
        report.append({'variant':variant,'cubes':len(parts),'triangles':len(triangles),
                       'meshes':len(g['meshes']),'materials':len(g['materials']),
                       'bytes':path.stat().st_size,'selfContained':True,'animation':'Vault.Open'})
    # Comparison at useful review resolution, with the same lighting and scale.
    sheet=Image.new('RGB',(1600,940),(18,23,34));draw=ImageDraw.Draw(sheet)
    try:font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',28)
    except OSError:font=ImageFont.load_default()
    for i,variant in enumerate(['relic','rune']):
        sheet.paste(Image.open(REVIEW/variant/'01-three-quarter.png'),(i*800,70))
        draw.text((i*800+40,25),variant.upper()+' / GLB REVIEW',font=font,fill=(205,228,234))
    draw.text((40,885),'64px nearest atlas / separate animated lid / CPU orthographic render',font=font,fill=(131,157,175))
    sheet.save(REVIEW/'comparison.png')
    (REVIEW/'inspection.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))


if __name__=='__main__':main()
