"""Independent construction measurements / support graph from final GLB.

Support means touching within 0.0064 authoring units or solid overlap. This is
not a welding/boolean union claim. Bearing clearance is checked independently.
"""
from pathlib import Path
import importlib.util
import json
import hashlib
import argparse

import numpy as np

HERE=Path(__file__).resolve().parent
def module(name,file):
    spec=importlib.util.spec_from_file_location(name,HERE/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
review=module('relic_review','review-relic.py');validation=module('relic_validation','validate-relic.py')
ASSET=review.ROOT/'assets/chests/relic-v3-geometry/relic.glb';OUT=review.ROOT/'artifacts/relic-geometry-pass/relic'


def point_distance(point,tris):
    a,b,c=tris[:,0],tris[:,1],tris[:,2];e1=b-a;e2=c-a;normal=np.cross(e1,e2);n2=(normal*normal).sum(axis=1)
    relative=point-a;d=(relative*normal).sum(axis=1)
    q=relative-normal*(d/n2)[:,None]
    d00=(e1*e1).sum(axis=1);d01=(e1*e2).sum(axis=1);d11=(e2*e2).sum(axis=1)
    d20=(q*e1).sum(axis=1);d21=(q*e2).sum(axis=1);den=d00*d11-d01*d01
    u=(d11*d20-d01*d21)/den;v=(d00*d21-d01*d20)/den
    distance=np.where((u>=-1e-8)&(v>=-1e-8)&(u+v<=1+1e-8),d*d/n2,np.inf)
    for start,end in [(a,b),(b,c),(c,a)]:
        e=end-start;t=np.clip(((point-start)*e).sum(axis=1)/(e*e).sum(axis=1),0,1)
        delta=point-start-e*t[:,None];distance=np.minimum(distance,(delta*delta).sum(axis=1))
    return float(distance.min())**.5


def contained(point,triangles):
    # Non-axis-aligned ray; collapse triangulation duplicates at the same hit t.
    direction=np.array([.932,.337,.127]);e1=triangles[:,1]-triangles[:,0];e2=triangles[:,2]-triangles[:,0]
    p=np.cross(direction,e2);det=(e1*p).sum(axis=1);mask=abs(det)>1e-12
    inv=np.divide(1,det,out=np.zeros_like(det,dtype=float),where=mask);delta=point-triangles[:,0]
    u=(delta*p).sum(axis=1)*inv;q=np.cross(delta,e1);v=(direction*q).sum(axis=1)*inv;t=(e2*q).sum(axis=1)*inv
    valid=mask&(u>=0)&(v>=0)&(u+v<=1)&(t>1e-8)
    return len(np.unique(np.round(t[valid],8)))%2==1


def connected(a,b,tolerance):
    if validation.crossing(a,b):return True
    pa=np.unique(a.reshape(-1,3),axis=0);pb=np.unique(b.reshape(-1,3),axis=0)
    if contained(pa[0],b)or contained(pb[0],a):return True
    return any(point_distance(p,b)<=tolerance for p in pa)or any(point_distance(p,a)<=tolerance for p in pb)


def main():
    global ASSET,OUT
    parser=argparse.ArgumentParser();parser.add_argument("--asset",type=Path);parser.add_argument("--out",type=Path);parser.add_argument('--baseline',type=Path);args=parser.parse_args()
    if args.asset:ASSET=args.asset.resolve()
    if args.out:OUT=args.out.resolve()
    g,_,new_triangles,parts=review.decode(ASSET);_,_,old_triangles,old=review.decode(args.baseline or review.ASSET);assemblies=review.part_assemblies(g)
    bounds={k:(v.min(axis=0),v.max(axis=0))for k,v in parts.items()};graph={k:set()for k in parts};tolerance=.0004
    names=list(parts);tested=0
    for i,name in enumerate(names):
        lo,hi=bounds[name]
        for other in names[i+1:]:
            if assemblies[name]!=assemblies[other]:continue
            low,high=bounds[other]
            if not((lo<=high+tolerance)&(hi>=low-tolerance)).all():continue
            tested+=1
            if connected(parts[name].reshape(-1,3,3),parts[other].reshape(-1,3,3),tolerance):graph[name].add(other);graph[other].add(name)
    components=[];remaining=set(names)
    while remaining:
        group=set();stack=[remaining.pop()]
        while stack:
            node=stack.pop()
            if node in group:continue
            group.add(node);remaining.discard(node);stack.extend(graph[node]-group)
        components.append(sorted(group))
    def extent(mapping,name):p=mapping[name];return(p.max(axis=0)-p.min(axis=0))*16
    # Real exported bounds: the five relief levels have a strict depth ordering.
    levels={label:float(bounds[name][1][0]*16)for label,name in [
        ('panel','Body.InsetPanelX1'),('insert','Body.SideInsertX1.0'),('shell','Body.WallX1'),('frame','Body.PanelFrameX1'),('armor','Body.CornerShoulder.1.1')]}
    assert levels['panel']<levels['insert']<levels['shell']<levels['frame']<levels['armor']
    old_points=np.concatenate(list(old.values()));new_points=np.concatenate(list(parts.values()))
    assert abs(np.ptp(old_points[:,0])-np.ptp(new_points[:,0]))<1e-6
    assert abs(old_points[:,1].max()-new_points[:,1].max())<1e-6
    contract=json.loads((ASSET.parent/'contract.json').read_text());assert np.allclose(contract['pivot'],[0,10.55/16,7.65/16])
    g,_,_,_=review.decode(ASSET)
    assert np.allclose(next(n for n in g['nodes']if n['name']=='LidAssembly')['translation'],contract['pivot'])
    # Pin circumradius .10; barrel inner apothem .15*cos(pi/12).
    pivot=np.array([10.55,7.65])/16
    barrel=parts['Lid.HingeBarrel1'];pin=parts['Body.HingePin1']
    pin_radius=np.linalg.norm(pin[:,1:]-pivot,axis=1).max()*16
    yz=barrel[:,1:]-pivot;r=np.linalg.norm(yz,axis=1)*16
    inner_radius=r.min();inner_apothem=inner_radius*np.cos(np.pi/12)
    assert inner_apothem-pin_radius>.04
    axial=min(bounds['Body.HingeCheek1.1'][0][0]-bounds['Lid.HingeBarrel1'][1][0],
              bounds['Lid.HingeBarrel1'][0][0]-bounds['Body.HingeCheek1.-1'][1][0])*16
    assert axial>.12
    def facet_angles(triangles):
        angles=[float(np.degrees(np.arctan2(abs(t['n'][0]),-t['n'][2])))for t in triangles
                if t['name']=='Body.HeartCrystal'and abs(t['n'][1])<.04 and t['n'][2]<-.3]
        return [min(angles),max(angles)]
    report={'asset':str(ASSET.relative_to(review.ROOT)),'assetSha256':hashlib.sha256(ASSET.read_bytes()).hexdigest(),'supportToleranceBlockUnits':tolerance,
            'contactCandidatePairs':tested,'assemblyComponents':components,'floatingParts':[c for c in components if len(c)==1],
            'reliefDepthAuthoringUnits':levels,
            'lidThicknessBefore':float(extent(old,'Lid.Slab')[1]),'lidThicknessAfter':float(extent(parts,'Lid.Slab')[1]),
            'pinRadius':float(pin_radius),'barrelInnerApothem':float(inner_apothem),'bearingRadialClearance':float(inner_apothem-pin_radius),
            'bearingAxialClearance':float(axial),'frontFacetAngleBefore':facet_angles(old_triangles),'frontFacetAngleAfter':facet_angles(new_triangles),
            'pivot':'pass','widthAndHeightPreserved':'pass','scope':'Solid support graph per assembly, not welded-union or durability analysis.'}
    OUT.mkdir(parents=True,exist_ok=True);(OUT/'construction-validation.json').write_text(json.dumps(report,indent=2))
    print(json.dumps({k:v for k,v in report.items()if k!='assemblyComponents'},indent=2))
    assert len(components)==2 and all(len(set(assemblies[n]for n in c))==1 for c in components), 'Disconnected support components'


if __name__=='__main__':main()
