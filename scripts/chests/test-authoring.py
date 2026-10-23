"""Integration check: Blockbench source -> edited geometry/UV -> PBR GLB."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import argparse

import numpy as np

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('review_relic',HERE/'review-relic.py')
review=importlib.util.module_from_spec(spec);spec.loader.exec_module(review)


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--asset',type=Path);parser.add_argument('--out',type=Path);args=parser.parse_args()
    if args.asset:review.ASSET=args.asset.resolve()
    if args.out:review.OUT=args.out.resolve();review.OUT.mkdir(parents=True,exist_ok=True)
    asset=review.ASSET;folder=asset.parent;before=hashlib.sha256(asset.read_bytes()).hexdigest()
    with tempfile.TemporaryDirectory(prefix='relic-authoring-')as temporary:
        temp=Path(temporary);source=temp/'relic.bbmodel';source.write_bytes((folder/'relic.bbmodel').read_bytes())
        config=temp/'materials.json';config.write_bytes((folder/'materials.json').read_bytes())
        (temp/'contract.json').write_bytes((folder/'contract.json').read_bytes())
        for material in json.loads(config.read_text()):
            for filename in material.get('maps',{}).values():(temp/filename).write_bytes((folder/filename).read_bytes())
        destination=temp/'output'
        def export():
            subprocess.run([sys.executable,str(HERE/'build-relic.py'),'--from-bbmodel',str(source),'--output-dir',str(destination)],check=True,capture_output=True)
            return destination/'relic.glb'
        unchanged=export();same_bytes=unchanged.read_bytes()==asset.read_bytes();assert same_bytes,'No-edit roundtrip must be byte identical'
        original=json.loads(source.read_text());crystal=next(e for e in original['elements']if e['name']=='Body.HeartCrystal')
        for vertex in crystal['vertices'].values():vertex[0]+=.1
        first_face=next(iter(crystal['faces'].values()));first_key=first_face['vertices'][0]
        first_face['uv'][first_key][0]+=.125
        source.write_text(json.dumps(original))
        materials=json.loads(config.read_text());next(m for m in materials if m['name']=='Vault.Metal')['roughness']=.41;config.write_text(json.dumps(materials))
        edited=export();g,_,new,parts=review.decode(edited);_,_,old,oldparts=review.decode(asset)
        assert np.allclose(parts['Body.HeartCrystal'],oldparts['Body.HeartCrystal']+np.array([.1/16,0,0]))
        nt=[t for t in new if t['name']=='Body.HeartCrystal']
        polygon=np.array([crystal['vertices'][key]for key in first_face['vertices']])
        normal=np.cross(polygon,np.roll(polygon,-1,axis=0)).sum(axis=0);normal/=np.linalg.norm(normal)
        point=np.array(crystal['vertices'][first_key])/16
        tex=original['textures'][first_face['texture']];expected=np.array(first_face['uv'][first_key])/[tex['uv_width'],tex['uv_height']]
        # Ear clipping may reorder the first triangle of an ngon; locate the
        # actual edited vertex on the actual source face instead of assuming i=0.
        samples=[uv for t in nt if np.allclose(t['n'],normal)for vertex,uv in zip(t['v'],t['uv'])if np.allclose(vertex,point)]
        assert samples and all(np.allclose(uv,expected,atol=1e-6)for uv in samples),'Manual UV edit lost'
        metal=next(m for m in g['materials']if m['name']=='Vault.Metal');assert metal['pbrMetallicRoughness']['roughnessFactor']==.41
    assert hashlib.sha256(asset.read_bytes()).hexdigest()==before,'Test modified the deliverable'
    report={'unchangedRoundtripByteIdentical':same_bytes,'manualMeshTranslation':'pass','manualFaceUVEdit':'pass',
            'materialRoughnessEdit':'pass','originalAssetPreserved':'pass',
            'scope':'File-format/controlled exporter check, not a running Blockbench GUI test.'}
    (review.OUT/'authoring-roundtrip.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))


if __name__=='__main__':main()
