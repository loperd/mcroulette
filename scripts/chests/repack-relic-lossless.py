"""Lossless second pass over existing runtime GLBs. No Draco re-quantization.

Decoded image pixels/dimensions, all non-image buffers, JSON semantics and
animation are checked exactly before replacing a file with a smaller one.
"""
from pathlib import Path
import copy,hashlib,importlib.util,io,json
from PIL import Image

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('relic_runtime_optimizer',HERE/'optimize-relic-runtime.py');api=importlib.util.module_from_spec(spec);spec.loader.exec_module(api)
ROOT=api.ROOT;OUT=ROOT/'artifacts/relic-v4/lossless-study'

def sha(data):return hashlib.sha256(data).hexdigest()

def repack(version):
    folder=ROOT/'assets/chests'/(version+'-runtime');path=folder/'relic.glb';before=path.read_bytes();g,blob=api.read(path);original=copy.deepcopy(g)
    backup=OUT/(version+'-before.glb')
    if not backup.exists():backup.write_bytes(before)
    image_views={im['bufferView']:i for i,im in enumerate(g['images'])};new=bytearray();records=[];non_images=[]
    for vi,v in enumerate(g['bufferViews']):
        data=blob[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
        if vi in image_views:
            im=g['images'][image_views[vi]];image=Image.open(io.BytesIO(data));pixels=image.convert('RGBA').tobytes()
            assert not image.info.get('icc_profile'),'Preserve color profile before repacking'
            # Reuse exhaustive study candidates when their decoded pixels match.
            candidate=OUT/(str(image_views[vi])+'.webp')
            if version=='relic-v4'and candidate.exists()and Image.open(candidate).convert('RGBA').tobytes()==pixels:
                encoded=min([data,candidate.read_bytes()],key=len)
            else:encoded=api.lossless_webp(image,data)
            check=Image.open(io.BytesIO(encoded));assert check.size==image.size and check.convert('RGBA').tobytes()==pixels
            records.append({'image':image_views[vi],'name':im['name'],'beforeBytes':len(data),'afterBytes':len(encoded),'size':list(image.size),'decodedRGBA256':sha(pixels)})
            data=encoded
        else:non_images.append({'view':vi,'sha256':sha(data)})
        new.extend(b'\0'*((-len(new))%4));v.update(byteOffset=len(new),byteLength=len(data));new.extend(data)
    candidate=OUT/(version+'-candidate.glb');api.write(candidate,g,bytes(new));cg,cb=api.read(candidate)
    for entry in non_images:
        v=cg['bufferViews'][entry['view']];assert sha(cb[v['byteOffset']:v['byteOffset']+v['byteLength']])==entry['sha256']
    # Offsets, lengths and overall buffer size are the only JSON changes.
    for key in original:
        if key not in ['buffers','bufferViews']:assert original[key]==cg[key],key
    for a,b in zip(original['bufferViews'],cg['bufferViews']):
        assert {k:v for k,v in a.items()if k not in ['byteOffset','byteLength']}=={k:v for k,v in b.items()if k not in ['byteOffset','byteLength']}
    after=candidate.read_bytes()
    if len(after)<len(before):candidate.replace(path)
    else:candidate.unlink();after=before
    report={'version':version,'inputSha256':sha(before),'outputSha256':sha(after),'beforeBytes':len(before),'afterBytes':len(after),'decodedPixelsBitExact':True,'nonImageBuffersBitExact':True,'jsonExceptLayoutIdentical':True,'textureResolutionUnchanged':True,'nonImageBuffers':non_images,'images':records}
    metadata=json.loads((folder/'optimization.json').read_text());metadata.update(runtimeSha256=sha(after),bytesAfter=len(after),losslessRepack=report)
    by_name={r['name']:r for r in records}
    for texture in metadata['textures']:texture['afterBytes']=by_name[texture['name']]['afterBytes']
    (folder/'optimization.json').write_text(json.dumps(metadata,indent=2));print(version,len(before),'->',len(after),flush=True);return report

if __name__=='__main__':
    OUT.mkdir(parents=True,exist_ok=True);reports=[repack(v)for v in ['relic-v3-geometry','relic-v3-pbr','relic-v4']];(OUT/'repack.json').write_text(json.dumps(reports,indent=2))
