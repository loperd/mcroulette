"""Derived runtime GLB: Draco + lossless WebP, max 512px texture edge.

Canonical editable/PBR sources remain untouched. Uses Blender's local Draco
bridge as a library, without starting Blender or adding project dependencies.
"""
from pathlib import Path
import argparse, copy, ctypes as C, hashlib, io, json, os, struct
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'artifacts/relic-v4/optimization'
TYPES={5126:'<f4',5123:'<u2',5125:'<u4'}
DIMS={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}

def library():
    base=Path('/Applications/Blender.app/Contents/Resources')
    bridge=os.environ.get('DRACO_BRIDGE')
    if not bridge:
        matches=sorted(base.glob('*/scripts/addons_core/io_scene_gltf2/libbf_intern_draco_bridge.dylib'))
        if not matches:raise RuntimeError('Set DRACO_BRIDGE to a Blender Draco bridge library')
        C.CDLL(str(base/'lib/libdraco.dylib'),mode=C.RTLD_GLOBAL);bridge=str(matches[-1])
    d=C.CDLL(bridge)
    signatures={
      'encoderCreate':(C.c_void_p,[C.c_uint32]),'encoderRelease':(None,[C.c_void_p]),
      'encoderSetCompressionLevel':(None,[C.c_void_p,C.c_uint32]),
      'encoderSetQuantizationBits':(None,[C.c_void_p,*([C.c_uint32]*5)]),
      'encoderSetIndices':(None,[C.c_void_p,C.c_size_t,C.c_uint32,C.c_void_p]),
      'encoderSetAttribute':(C.c_uint32,[C.c_void_p,C.c_char_p,C.c_size_t,C.c_char_p,C.c_void_p,C.c_bool]),
      'encoderEncode':(C.c_bool,[C.c_void_p,C.c_uint8]),
      'encoderGetEncodedVertexCount':(C.c_uint32,[C.c_void_p]),'encoderGetEncodedIndexCount':(C.c_uint32,[C.c_void_p]),
      'encoderGetByteLength':(C.c_uint64,[C.c_void_p]),'encoderCopy':(None,[C.c_void_p,C.c_void_p]),
      'decoderCreate':(C.c_void_p,[]),'decoderRelease':(None,[C.c_void_p]),
      'decoderDecode':(C.c_bool,[C.c_void_p,C.c_void_p,C.c_size_t]),
      'decoderReadAttribute':(C.c_bool,[C.c_void_p,C.c_uint32,C.c_size_t,C.c_char_p]),
      'decoderGetVertexCount':(C.c_uint32,[C.c_void_p]),'decoderGetIndexCount':(C.c_uint32,[C.c_void_p]),
      'decoderGetAttributeByteLength':(C.c_size_t,[C.c_void_p,C.c_uint32]),'decoderCopyAttribute':(None,[C.c_void_p,C.c_uint32,C.c_void_p]),
      'decoderReadIndices':(C.c_bool,[C.c_void_p,C.c_size_t]),'decoderGetIndicesByteLength':(C.c_size_t,[C.c_void_p]),'decoderCopyIndices':(None,[C.c_void_p,C.c_void_p])}
    for name,(ret,args)in signatures.items():getattr(d,name).restype=ret;getattr(d,name).argtypes=args
    return d

def read(path):
    raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0];return json.loads(raw[20:20+n]),raw[28+n:]

def write(path,g,blob):
    g['buffers']=[{'byteLength':len(blob)}];j=json.dumps(g,separators=(',',':')).encode();j+=b' '*((-len(j))%4);blob+=b'\0'*((-len(blob))%4)
    path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(j)+len(blob))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(blob),0x004e4942)+blob)

def raw_accessor(g,blob,i):
    a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];dtype=np.dtype(TYPES[a['componentType']]);dim=DIMS[a['type']]
    return np.ndarray((a['count'],dim),dtype,buffer=blob,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',dtype.itemsize*dim),dtype.itemsize)).copy()

def shrink(image,channel,max_size):
    size=tuple(max(1,round(v*min(1,max_size/max(image.size))))for v in image.size)
    a=np.asarray(image.convert('RGB'),dtype=float)/255
    if size==image.size:return image.convert('RGB')
    if channel=='normal':a=a*2-1
    elif channel in ['base','emissive']:a=np.where(a<=.04045,a/12.92,((a+.055)/1.055)**2.4)
    a=np.stack([np.array(Image.fromarray(a[:,:,i].astype('float32')).resize(size,Image.Resampling.BOX))for i in range(3)],axis=-1)
    if channel=='normal':a/=np.maximum(np.linalg.norm(a,axis=-1,keepdims=True),1e-9);a=a*.5+.5
    elif channel in ['base','emissive']:a=np.where(a<=.0031308,a*12.92,1.055*np.maximum(a,0)**(1/2.4)-.055)
    return Image.fromarray(np.round(np.clip(a,0,1)*255).astype('uint8'))

def lossless_webp(image,existing=None):
    """Quality controls encoder effort here, not pixel fidelity. Keep smallest."""
    candidates=[existing]if existing is not None else []
    for quality in [80,90,100]:
        buffer=io.BytesIO();image.save(buffer,format='WEBP',lossless=True,quality=quality,method=6,exact=True)
        candidates.append(buffer.getvalue())
    result=min(candidates,key=len)
    decoded=Image.open(io.BytesIO(result))
    assert decoded.size==image.size and decoded.convert('RGBA').tobytes()==image.convert('RGBA').tobytes()
    return result

def optimize(version,d,max_size):
    source=ROOT/'assets/chests'/version/'relic.glb';g,blob=read(source);original=copy.deepcopy(g);source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
    folder=ROOT/'assets/chests'/(version+'-runtime');folder.mkdir(parents=True,exist_ok=True)
    views=[];chunks=bytearray();decoded={};geometry=set();stats=[]
    def append(data,target=None):
        chunks.extend(b'\0'*((-len(chunks))%4));v={'buffer':0,'byteOffset':len(chunks),'byteLength':len(data)}
        if target:v['target']=target
        i=len(views);views.append(v);chunks.extend(data);return i
    for mesh in g['meshes']:
        for p in mesh['primitives']:
            attrs=p['attributes'];arrays={k:raw_accessor(original,blob,i)for k,i in attrs.items()};indices=raw_accessor(original,blob,p['indices']);enc=d.encoderCreate(len(arrays['POSITION']));ids={}
            try:
                for name,a in arrays.items():
                    accessor=original['accessors'][attrs[name]]
                    ids[name]=d.encoderSetAttribute(enc,name.encode(),accessor['componentType'],accessor['type'].encode(),a.ctypes.data,accessor.get('normalized',False))
                d.encoderSetIndices(enc,original['accessors'][p['indices']]['componentType'],len(indices),indices.ctypes.data)
                d.encoderSetCompressionLevel(enc,10);d.encoderSetQuantizationBits(enc,16,12,16,12,16)
                # Preserve triangle ranges used by the existing audit metadata.
                assert d.encoderEncode(enc,1),'Draco encode failed'
                encoded=C.create_string_buffer(d.encoderGetByteLength(enc));d.encoderCopy(enc,encoded);encoded=encoded.raw
                vc=d.encoderGetEncodedVertexCount(enc);ic=d.encoderGetEncodedIndexCount(enc);assert ic==len(indices)
            finally:d.encoderRelease(enc)
            p.setdefault('extensions',{})['KHR_draco_mesh_compression']={'bufferView':append(encoded),'attributes':ids}
            dec=d.decoderCreate();decoded_arrays={}
            try:
                assert d.decoderDecode(dec,encoded,len(encoded))
                assert d.decoderReadIndices(dec,original['accessors'][p['indices']]['componentType'])
                buf=C.create_string_buffer(d.decoderGetIndicesByteLength(dec));d.decoderCopyIndices(dec,buf);decoded[p['indices']]=buf.raw
                di=np.frombuffer(buf.raw,dtype=TYPES[original['accessors'][p['indices']]['componentType']]).astype(int)
                for name,id in ids.items():
                    a=g['accessors'][attrs[name]];assert d.decoderReadAttribute(dec,id,a['componentType'],a['type'].encode())
                    buf=C.create_string_buffer(d.decoderGetAttributeByteLength(dec,id));d.decoderCopyAttribute(dec,id,buf);decoded[attrs[name]]=buf.raw
                    da=np.frombuffer(buf.raw,dtype=TYPES[a['componentType']]).reshape(-1,DIMS[a['type']]);decoded_arrays[name]=da
                    # Compare corresponding triangle corners, not reordered vertex IDs.
                    error=np.max(abs(da[di]-arrays[name][indices[:,0].astype(int)]))
                    limit={'POSITION':.00003,'NORMAL':.003,'TEXCOORD_0':.00003}[name];assert error<limit,(name,error)
                    if name=='POSITION':a['min']=da.min(axis=0).tolist();a['max']=da.max(axis=0).tolist()
                    stats.append({'attribute':name,'maxAbsoluteError':float(error)})
            finally:d.decoderRelease(dec)
            for i in [p['indices'],*attrs.values()]:
                geometry.add(i);a=g['accessors'][i];a.pop('bufferView',None);a.pop('byteOffset',None);a['count']=ic if i==p['indices']else vc
    for i,a in enumerate(g['accessors']):
        if i not in geometry:
            old=original['accessors'][i];v=original['bufferViews'][old['bufferView']];data=blob[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']];a['bufferView']=append(data)
    usage={}
    for mat in g['materials']:
        for info,kind in [(mat['pbrMetallicRoughness'].get('baseColorTexture'),'base'),(mat.get('normalTexture'),'normal'),(mat.get('emissiveTexture'),'emissive'),(mat['pbrMetallicRoughness'].get('metallicRoughnessTexture'),'orm')]:
            if info:usage[original['textures'][info['index']]['source']]=kind
    texture_stats=[];memory_before=memory_after=0
    for i,im in enumerate(g['images']):
        v=original['bufferViews'][im['bufferView']];data=blob[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']];before=Image.open(io.BytesIO(data));after=shrink(before,usage[i],max_size)
        webp=lossless_webp(after)
        im.update(bufferView=append(webp),mimeType='image/webp',name=Path(im.get('name',str(i))).stem+'.webp')
        texture_stats.append({'name':im['name'],'channel':usage[i],'before':list(before.size),'after':list(after.size),'beforeBytes':len(data),'afterBytes':len(webp)})
        memory_before+=before.width*before.height*4*4/3;memory_after+=after.width*after.height*4*4/3
    for t in g['textures']:t.setdefault('extensions',{})['EXT_texture_webp']={'source':t.pop('source')}
    g['extensionsUsed']=g['extensionsRequired']=['KHR_draco_mesh_compression','EXT_texture_webp'];g['bufferViews']=views
    target=folder/'relic.glb';write(target,g,bytes(chunks))
    # Canonical audit decoder can render this independently decoded snapshot.
    dg=copy.deepcopy(g)
    for mesh in dg['meshes']:
        for p in mesh['primitives']:p.pop('extensions',None)
    for i,data in decoded.items():dg['accessors'][i]['bufferView']=append(data)
    for t in dg['textures']:t['source']=t.pop('extensions')['EXT_texture_webp']['source']
    dg['extensionsUsed']=dg['extensionsRequired']=[];dg['bufferViews']=views
    snapshot=OUT/(version+'-decoded.glb');write(snapshot,dg,bytes(chunks))
    assert source_hash==hashlib.sha256(source.read_bytes()).hexdigest()
    assert g['nodes']==original['nodes']and g['animations']==original['animations']
    report={'source':str(source),'runtime':str(target),'sourceSha256':source_hash,'runtimeSha256':hashlib.sha256(target.read_bytes()).hexdigest(),'bytesBefore':source.stat().st_size,'bytesAfter':target.stat().st_size,'textureRGBA8WithMipsBefore':round(memory_before),'textureRGBA8WithMipsAfter':round(memory_after),'triangles':sum(original['accessors'][p['indices']]['count']//3 for m in original['meshes']for p in m['primitives']),'drawPrimitives':sum(len(m['primitives'])for m in g['meshes']),'quantizationBits':{'position':16,'normal':12,'uv':16},'triangleOrder':'preserved','hierarchyAnimation':'unchanged','maxTextureEdge':max_size,'webp':'lossless after explicit downscale; renormalized normals and linear-light color resize','attributes':stats,'textures':texture_stats,'decodedSnapshot':str(snapshot),'gpuReview':'pending'}
    (folder/'optimization.json').write_text(json.dumps(report,indent=2))
    contract=json.loads((source.parent/'contract.json').read_text())
    contract.update(revision=contract['revision']+'-runtime',status='awaiting-gpu-and-visual-review',authoringSource=str(source.parent/'relic.bbmodel'),sourceSha256=source_hash,
        controlledExport='python3.13 scripts/chests/optimize-relic-runtime.py --versions '+version,
        compression={'geometry':'KHR_draco_mesh_compression','textures':'EXT_texture_webp','maxTextureEdge':max_size,'quantizationBits':report['quantizationBits']})
    (folder/'contract.json').write_text(json.dumps(contract,indent=2))
    (folder/'README.md').write_text('# Optimized runtime asset\n\nDraco + lossless WebP after explicit downscale. Edit canonical source in `../'+version+'`, then rebuild via `python3.13 scripts/chests/optimize-relic-runtime.py --versions '+version+'`.\n\n`optimization.json` records errors, sizes and hashes. GPU/art review pending.\n')
    print(version,report['bytesBefore'],'->',report['bytesAfter'],flush=True);return report

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--max-texture-size',type=int,default=512);p.add_argument('--versions',nargs='+',default=['relic-v3-geometry','relic-v3-pbr','relic-v4']);args=p.parse_args();OUT.mkdir(parents=True,exist_ok=True)
    d=library();records=[optimize(v,d,args.max_texture_size)for v in args.versions];(OUT/'optimization.json').write_text(json.dumps(records,indent=2))
