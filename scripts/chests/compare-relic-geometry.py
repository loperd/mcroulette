"""Before/after evidence: reject camera, sampling or rig mismatch; no retouch."""
from pathlib import Path
import hashlib
import json

from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[2]
BEFORE=ROOT/'artifacts/ender-redesign/relic'
AFTER=ROOT/'artifacts/relic-geometry-pass/relic'


def main():
    old=json.loads((BEFORE/'render.json').read_text());new=json.loads((AFTER/'render.json').read_text())
    b=next(s for s in old['shots']if s['file']=='02-clay.png');a=next(s for s in new['shots']if s['file']=='01-clay.png')
    for field in ['size','spp','clay','angle','direction','orthoScale','target']:assert b[field]==a[field],field
    for field in ['rig','color','rendererSourceSha256']:assert old[field]==new[field],field
    for record,shot,folder in [(old,b,BEFORE),(new,a,AFTER)]:
        assert hashlib.sha256((ROOT/record['input']).read_bytes()).hexdigest()==record['sha256']
        assert hashlib.sha256((folder/shot['file']).read_bytes()).hexdigest()==shot['sha256']
    sheet=Image.new('RGB',(1640,860),(22,27,34));draw=ImageDraw.Draw(sheet)
    try:font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',25)
    except OSError:font=ImageFont.load_default()
    draw.text((20,15),'BEFORE / RELIC V2 / CLAY',fill=(220,230,232),font=font)
    draw.text((840,15),'AFTER / GEOMETRY PASS / CLAY',fill=(220,230,232),font=font)
    sheet.paste(Image.open(BEFORE/b['file']),(10,55));sheet.paste(Image.open(AFTER/a['file']),(830,55))
    sheet.save(AFTER/'before-after.png')
    result={'beforeAsset':old['input'],'beforeAssetSha256':old['sha256'],'beforeImage':str((BEFORE/b['file']).relative_to(ROOT)),
            'afterAsset':new['input'],'afterAssetSha256':new['sha256'],'afterImage':str((AFTER/a['file']).relative_to(ROOT)),
            'cameraAndSamplingEqual':True,'rigAndRendererEqual':True,'modelTexturesAndEmissionDisabled':True,
            'imagesResizedOrRetouched':False,'size':b['size'],'spp':b['spp']}
    (AFTER/'before-after.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))


if __name__=='__main__':main()
