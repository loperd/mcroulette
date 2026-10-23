"""Inspect real exported PNG values, their bindings and physical UV density."""
from pathlib import Path
import hashlib
import importlib.util
import io
import json
import struct

import numpy as np
from PIL import Image

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('pbr_validation_review',HERE/'review-relic.py');review=importlib.util.module_from_spec(spec);spec.loader.exec_module(review)
ROOT=review.ROOT;ASSET=ROOT/'assets/chests/relic-v4/relic.glb';OUT=ROOT/'artifacts/relic-v4/validation'


def main():
    raw=ASSET.read_bytes();length=struct.unpack_from('<I',raw,12)[0];binary=raw[28+length:];g,_,triangles,_=review.decode(ASSET)
    images=[]
    for image in g['images']:
        view=g['bufferViews'][image['bufferView']];png=binary[view['byteOffset']:view['byteOffset']+view['byteLength']]
        images.append(np.array(Image.open(io.BytesIO(png)).convert('RGB')))
        if image.get('name'):assert png==(ASSET.parent/image['name']).read_bytes(),image['name']
    def sample(index,uv):
        pixels=images[g['textures'][index]['source']];h,w=pixels.shape[:2];x,y=np.clip((uv*[w,h]).astype(int),[0,0],[w-1,h-1]);return pixels[y,x]
    records=[];densities=[]
    for mi,material in enumerate(g['materials']):
        p=material['pbrMetallicRoughness'];orm=p['metallicRoughnessTexture']['index'];normal=material['normalTexture']['index']
        assert material['occlusionTexture']['index']==orm
        assert all(info.get('texCoord',0)==0 for info in [material['normalTexture'],material['occlusionTexture'],p['metallicRoughnessTexture']])
        values=[];normals=[]
        for tri in triangles:
            if tri['mat']!=mi:continue
            uv=tri['uv'];points=tri['v'];area=np.linalg.norm(np.cross(points[1]-points[0],points[2]-points[0]))
            shape=images[g['textures'][p['baseColorTexture']['index']]['source']].shape
            a=(uv[1]-uv[0])*[shape[1],shape[0]];b=(uv[2]-uv[0])*[shape[1],shape[0]];texarea=abs(a[0]*b[1]-a[1]*b[0])
            density=(texarea/area)**.5;densities.append(density)
            assert abs(density-128)<.64,('texel stretching',tri['name'],density)
            for weight in [[.6,.2,.2],[.2,.6,.2],[.2,.2,.6],[1/3]*3]:
                point=np.array(weight)@uv;values.append(sample(orm,point)/255);normals.append(sample(normal,point)/127.5-1)
        values=np.array(values);normals=np.array(normals);crystal=mi in [4,5];metal=mi in [2,3]
        assert np.std(values[:,1])>.005,'Missing roughness variation'
        if not crystal:assert np.max(np.linalg.norm(normals[:,:2],axis=1))>.01,('Missing stone/metal micro relief',material['name'],float(np.max(np.linalg.norm(normals[:,:2],axis=1))))
        assert np.max(abs(np.linalg.norm(normals,axis=1)-1))<.012
        assert normals[:,2].min()>.9,'Excessive micro-normal amplitude'
        if metal:assert values[:,2].mean()>.7
        elif not crystal:assert values[:,2].max()==0
        if crystal:assert 0<material['emissiveFactor'][1]<=1 and 'emissiveTexture'in material
        records.append({'material':material['name'],'samples':len(values),'AO_R_range':[float(values[:,0].min()),float(values[:,0].max())],
            'roughness_G_range':[float(values[:,1].min()),float(values[:,1].max())],'metallic_B_range':[float(values[:,2].min()),float(values[:,2].max())],
            'normalXYMax':float(np.linalg.norm(normals[:,:2],axis=1).max()),'normalLengthErrorMax':float(abs(np.linalg.norm(normals,axis=1)-1).max())})
    report={'assetSha256':hashlib.sha256(raw).hexdigest(),'embeddedMapBytesMatchSource':True,'maps':len(images),'uvTexelsPerBlockRange':[float(min(densities)),float(max(densities))],
        'uvDensityAndFiniteNormals':'pass','coreChannels':'baseColor/sRGB; emissive/sRGB; normal and R=AO G=roughness B=metallic/linear','materials':records,
        'limitation':'Pixel/binding and loader checks cannot establish real WebGL appearance.'}
    OUT.mkdir(parents=True,exist_ok=True);(OUT/'pbr-validation.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))


if __name__=='__main__':main()
