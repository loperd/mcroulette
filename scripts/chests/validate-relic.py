"""Geometric checks of decoded export, including triangle-level hinge sweep.

The moving/static surface test samples every degree, not just the two poses.
It does not assert an exact continuous solid-volume collision proof.
"""
from pathlib import Path
import hashlib
import importlib.util
import json
import argparse

import numpy as np

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('review_relic',HERE/'review-relic.py')
review=importlib.util.module_from_spec(spec);spec.loader.exec_module(review)


def segment_hits(start,end,triangles):
    direction=end-start;e1=triangles[:,1]-triangles[:,0];e2=triangles[:,2]-triangles[:,0]
    p=np.cross(direction,e2);det=(e1*p).sum(axis=1);valid=abs(det)>1e-11
    inv=np.divide(1,det,out=np.zeros_like(det),where=valid);delta=start-triangles[:,0]
    u=(delta*p).sum(axis=1)*inv;q=np.cross(delta,e1);v=(direction*q).sum(axis=1)*inv;t=(e2*q).sum(axis=1)*inv
    return valid&(u>1e-7)&(v>1e-7)&(u+v<1-1e-7)&(t>1e-7)&(t<1-1e-7)


def crossing(a,b):
    a=np.asarray(a,dtype=float);b=np.asarray(b,dtype=float)
    bmin=b.min(axis=1);bmax=b.max(axis=1)
    for tri in a:
        candidates=b[((bmax>=tri.min(axis=0)-1e-8)&(bmin<=tri.max(axis=0)+1e-8)).all(axis=1)]
        if not len(candidates):continue
        for i,j in [(0,1),(1,2),(2,0)]:
            if segment_hits(tri[i],tri[j],candidates).any():return True
        for other in candidates:
            for i,j in [(0,1),(1,2),(2,0)]:
                if segment_hits(other[i],other[j],tri[None,...]).any():return True
    return False


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--asset',type=Path);parser.add_argument('--out',type=Path);args=parser.parse_args()
    if args.asset:review.ASSET=args.asset.resolve()
    if args.out:review.OUT=args.out.resolve();review.OUT.mkdir(parents=True,exist_ok=True)
    g,images,triangles,parts=review.decode()
    points=np.concatenate([t['v']for t in triangles]);bounds={'min':points.min(axis=0).tolist(),'max':points.max(axis=0).tolist()}
    assert(points>=np.array([-.5,0,-.5])-1e-7).all()and(points<=np.array([.5,1,.5])+1e-7).all(),bounds
    for t in triangles:
        normal=np.cross(t['v'][1]-t['v'][0],t['v'][2]-t['v'][0]);assert np.linalg.norm(normal)>1e-10,t['name']
        assert normal@t['n']>0,t['name'];assert abs(np.linalg.norm(t['n'])-1)<1e-6
        assert np.isfinite(t['v']).all()and np.isfinite(t['uv']).all()
        assert(t['uv']>=-1e-7).all()and(t['uv']<=1+1e-7).all(),t['name']
    for name,vertices in parts.items():
        tris=vertices.reshape(-1,3,3)
        volume=(np.cross(tris[:,0],tris[:,1])*tris[:,2]).sum()/6
        assert volume>1e-13,('inverted or empty solid',name,volume)
        edges={}
        for tri in vertices.reshape(-1,3,3):
            for i,j in [(0,1),(1,2),(2,0)]:
                a=tuple(np.round(tri[i],7));b=tuple(np.round(tri[j],7));key=tuple(sorted((a,b)))
                edges[key]=edges.get(key,0)+1
        assert all(n==2 for n in edges.values()),('non-manifold',name)
    assemblies=review.part_assemblies(g)
    static={name:p.reshape(-1,3,3)for name,p in parts.items()if assemblies[name]=='Body'}
    collisions=[];candidate_pairs=0
    for angle in range(106):
        _,_,_,pose=review.decode(angle=angle)
        for name,tri in static.items():assert np.allclose(pose[name],parts[name]),'Body moves'
        for lid_name,p in pose.items():
            if assemblies[lid_name]!='LidAssembly':continue
            low=p.min(axis=0);high=p.max(axis=0)
            for body_name,body in static.items():
                if not((body.max(axis=(0,1))>=low)&(body.min(axis=(0,1))<=high)).all():continue
                candidate_pairs+=1
                if crossing(p.reshape(-1,3,3),body):collisions.append({'angle':angle,'lid':lid_name,'body':body_name})
        if angle%20==0:print('sweep',angle,'collisions',len(collisions),flush=True)
    # Mesh authoring must survive scale/UV conversion: no missing outliner items.
    bb=json.loads((review.ASSET.parent/'relic.bbmodel').read_text());assert len(bb['elements'])==len(parts)
    result={'assetSha256':hashlib.sha256(review.ASSET.read_bytes()).hexdigest(),'bounds':bounds,
            'triangles':len(triangles),'parts':len(parts),'renderPrimitives':sum(len(m['primitives'])for m in g['meshes']),
            'materials':len(g['materials']),'embeddedImages':len(images),'bytes':review.ASSET.stat().st_size,
            'finitePositionsNormalsUV':'pass','unitNormalsOutwardWinding':'pass','nondegenerateTriangles':'pass',
            'closedPartManifolds':'pass','positivePartVolumes':'pass','envelope':'pass','bodyStatic':'pass','bbmodelPartCount':'pass',
            'hingeSweep':{'degrees':[0,105],'step':1,'movingParts':sum(a=='LidAssembly'for a in assemblies.values()),'candidatePairs':candidate_pairs,'surfaceCrossings':collisions,
                          'limitation':'Discrete triangle surface intersections; not continuous-time or containment proof.'}}
    (review.OUT/'geometry-validation.json').write_text(json.dumps(result,indent=2))
    print(json.dumps(result,indent=2));assert not collisions,'Hinge sweep has surface intersections'


if __name__=='__main__':main()
