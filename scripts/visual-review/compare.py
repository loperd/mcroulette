"""Composition evaluation, not pixel difference. Pillow/numpy; never fabricates a missing capture."""
import argparse,json,hashlib
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont,ImageFilter
ROOT=Path(__file__).resolve().parents[2]
try: FONT=ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf",20)
except OSError: FONT=ImageFont.load_default()
def region_mask(polygon,w,h):
 im=Image.new('L',(w,h));ImageDraw.Draw(im).polygon([(round(x*(w-1)),round(y*(h-1))) for x,y in polygon],fill=255);return np.asarray(im)>0

def bounds(mask):
 y,x=np.where(mask)
 if not len(x):return None
 h,w=mask.shape;return [float(x.min()/w),float(y.min()/h),float((x.max()+1)/w),float((y.max()+1)/h)]

def centroid(mask):
 y,x=np.where(mask);h,w=mask.shape
 return [float((x.mean()+.5)/w),float((y.mean()+.5)/h)] if len(x) else None

def brightness(image,mask):
 rgb=np.asarray(image.convert('RGB'),dtype=float)/255
 rgb=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4);lum=rgb@np.array([.2126,.7152,.0722]);v=lum[mask]
 return {'linearMean':float(v.mean()) if len(v) else None,'histogram':np.histogram(v,bins=[0,.02,.08,.2,.5,1.001])[0].tolist(),'histogramEdges':[0,.02,.08,.2,.5,1.001]}

def annotated(image,layout,ids=None):
 out=image.convert('RGBA');w,h=out.size
 colors={c['id']:tuple(c['color']) for c in layout['categories']}
 for zone in layout['zones']:
  overlay=Image.new('RGBA',out.size);d=ImageDraw.Draw(overlay);pts=[(int(x*(w-1)),int(y*(h-1))) for x,y in zone['polygon']];d.polygon(pts,fill=colors[zone['categories'][0]]+(12,));out=Image.alpha_composite(out,overlay)
 d=ImageDraw.Draw(out)
 label_positions={'hero':(.42,.07),'west':(.02,.27),'east':(.86,.27),'vault':(.02,.01),'far':(.65,.025),'bridge':(.43,.59),'lava':(.05,.73),'foreground':(.69,.93)}
 for zone in layout['zones']:
  pts=[(int(x*(w-1)),int(y*(h-1))) for x,y in zone['polygon']];color=colors[zone['categories'][0]];d.line(pts+[pts[0]],fill=color+(255,),width=3)
  x,y=label_positions[zone['id']];d.text((int(x*w),int(y*h)),zone['id'],font=FONT,fill=color,stroke_width=2,stroke_fill='black')
  if ids is not None:
   mask=np.isin(ids,zone['categories']);box=bounds(mask)
   if box:d.rectangle([int(box[0]*w),int(box[1]*h),int(box[2]*w)-1,int(box[3]*h)-1],outline=(255,255,255,210),width=2)
 return out.convert('RGB')

def evaluate(layout,ids,depth,beauty,reference):
 h,w=ids.shape;zones=[]
 for z in layout['zones']:
  target=region_mask(z['polygon'],w,h);actual=np.isin(ids,z['categories']);union=target|actual;inter=target&actual
  box=bounds(actual);refbox=bounds(target);c=centroid(actual);rc=centroid(target)
  # Coarse occupancy envelope IoU is explicitly approximate; not an art quality score.
  coarse=lambda m:np.asarray(Image.fromarray((m*255).astype('uint8')).resize((64,40),Image.Resampling.BOX))>64
  aa,tt=coarse(actual),coarse(target)
  valid=actual&np.isfinite(depth)
  zones.append({'id':z['id'],'priority':z['priority'],'confidence':z['confidence'],'referenceEnvelopeBounds':refbox,'visibleBounds':box,'referenceEnvelopeFraction':float(target.mean()),'visibleScreenFraction':float(actual.mean()),'zoneOccupancy':float(inter.sum()/max(1,target.sum())),'rockFractionInZone':float(((ids==8)&target).sum()/max(1,target.sum())),'centroid':c,'referenceEnvelopeCentroid':rc,'centroidOffset':float(np.linalg.norm(np.array(c)-np.array(rc))) if c else None,'coarseEnvelopeIoU':float((aa&tt).sum()/max(1,(aa|tt).sum())),'silhouetteCaveat':'Reference is a hand-drawn envelope containing gaps/occlusion; IoU is a locator, not exact silhouette accuracy','depthHistogram':np.histogram(depth[valid],bins=layout['depthBins'])[0].tolist(),'meanDepth':float(depth[valid].mean()) if valid.any() else None,'brightnessReference':brightness(reference,target),'brightnessCurrent':brightness(beauty,target)})
 by={z['id']:z for z in zones};findings=[]
 hero=by['hero'];b=hero['visibleBounds'];width=0 if b is None else b[2]-b[0];expected=next(z for z in layout['zones'] if z['id']=='hero')['expectedWidth'];delta=max(expected[0]-width,0,width-expected[1]);direction='too small' if width<expected[0] else 'too large' if width>expected[1] else 'within annotated width interval'
 findings.append({'topic':'citadel_scale','score':delta/.6,'status':'deviation' if delta else 'not_confirmed','finding':direction,'evidence':{'visibleWidth':width,'referenceApproximateWidthInterval':expected,'centroidOffset':hero['centroidOffset'],'screenFraction':hero['visibleScreenFraction']},'controls':'01/03/15/16/D11 citadel and wings; camera FOV and target','minimalExperiment':'First test visibility/occlusion and lateral wings. If the entire composition is undersized, test a small lens change in a separate camera variant; do not scale the gate blindly.'})
 sides=[by['west'],by['east']];occupancy=min(z['zoneOccupancy'] for z in sides);empty=max(0,.18-occupancy)
 findings.append({'topic':'side_architecture_voids','score':empty/.18,'status':'deviation' if empty else 'not_confirmed','finding':'insufficient visible side infrastructure' if empty else 'side emptiness not established by this capture','evidence':[{k:z[k] for k in ['id','zoneOccupancy','rockFractionInZone']} for z in sides],'controls':'D02/D03 frontages and D01 occluding geology','minimalExperiment':'Move one occluded gallery frontage into its intended screen zone or open the specific blocking rock mass; retain camera and overall cave size.'})
 far=by['far'];far_mask=(ids==7)&np.isfinite(depth);hero_z=hero['meanDepth'];threshold=(hero_z+30) if hero_z else 150;deep_fraction=float((far_mask&(depth>threshold)).mean());expected_far=.0035;deficit=max(0,expected_far-deep_fraction)
 findings.append({'topic':'architectural_depth','score':deficit/expected_far,'status':'deviation' if deficit else 'not_confirmed','finding':'little visible architecture substantially behind citadel' if deficit else 'metric far-plane deficit not established','evidence':{'visibleFarArchitectureScreenFraction':deep_fraction,'minimumHeuristicFraction':expected_far,'behindHeroByWorldUnits':30,'referenceDepth':'qualitative only, not measured','depthHistogram':far['depthHistogram'],'zoneOccupancy':far['zoneOccupancy']},'controls':'D06/D13 distant galleries; 08/25 tunnel; D01 occluders','minimalExperiment':'Expose one connected rear gallery through an existing rock opening; test without fog adjustment before adding more architecture.'})
 # Broader composition issues can outrank the requested hypotheses if actual evidence warrants it.
 lava=by['lava'];lv=lava['visibleScreenFraction'];lo,hi=next(z for z in layout['zones'] if z['id']=='lava')['expectedOccupiedFraction'];diff=max(lo-lv,0,lv-hi)
 findings.append({'topic':'lava_extent','score':diff/.12,'status':'deviation' if diff else 'not_confirmed','finding':'lava screen extent outside annotated interval' if diff else 'lava extent within annotated interval','evidence':{'fraction':lv,'approximateInterval':[lo,hi]},'controls':'D08 lava geometry and foreground occluders','minimalExperiment':'Test one bank/ledge occlusion while keeping the lava material unchanged.'})
 findings.sort(key=lambda f:f['score'],reverse=True)
 return {'zones':zones,'findings':findings,'topThree':[f for f in findings if f['status']=='deviation'][:3],'depthReferenceLimitation':'No metric reference depth. Current view-space depth is measured; target expectations remain editable qualitative hypotheses.','scoreLimitation':'Heuristic prioritization only; not a perceptual similarity or beauty score.'}

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--capture',default='artifacts/visual-review/current');parser.add_argument('--out',default='artifacts/visual-review');args=parser.parse_args()
 out=ROOT/args.out;out.mkdir(parents=True,exist_ok=True);layout=json.loads((ROOT/'public/diagnostics/reference-layout.json').read_text());ref=Image.open(ROOT/'public/diagnostics/reference.png').convert('RGB');annotated(ref,layout).save(out/'reference-annotated.png')
 capture=ROOT/args.capture
 if not (capture/'diagnostic.json').exists():
  pending={'status':'blocked','referenceAnnotation':'complete; approximate manual zones','currentCapture':None,'metrics':None,'topThree':None,'reason':'Playwright MCP denied by approval policy; no current WebGL image available. Do not substitute Blender renders.','pendingHypotheses':['citadel_scale','side_architecture_voids','architectural_depth']}
  (out/'diagnostic.json').write_text(json.dumps(pending,indent=2));print('Reference annotated; current capture absent. No measured deviations reported.');return
 meta=json.loads((capture/'diagnostic.json').read_text());beauty=Image.open(capture/'beauty.png').convert('RGB');mask=np.asarray(Image.open(capture/'semanticRaw.png').convert('RGB'))[:,:,0];packed=np.asarray(Image.open(capture/'depthRaw.png').convert('RGB'),dtype=np.uint32);n=packed[:,:,0]*65536+packed[:,:,1]*256+packed[:,:,2];depth=meta['camera']['near']+n/16777214*(meta['camera']['far']-meta['camera']['near']);depth[n==16777215]=np.nan
 if list(beauty.size)!=layout['resolution'] or mask.shape!=depth.shape or mask.shape!=(beauty.height,beauty.width):raise ValueError('Capture/reference dimensions differ')
 digest=hashlib.sha256((capture/'beauty.png').read_bytes()).hexdigest()
 if meta.get('beautySha256')!=digest:raise ValueError('Beauty checksum differs from capture metadata')
 current=json.loads((ROOT/'public/diagnostics/miner-categories.json').read_text())
 if meta['assetSha256']!=current['assetSha256']:raise ValueError('Stale capture asset hash')
 if meta['capture']['errors']:raise ValueError('Browser errors invalidate capture')
 result=evaluate(layout,mask,depth,beauty,ref);result.update(status='measured',capture=meta,referenceAnnotation=layout['annotationMethod']);(out/'diagnostic.json').write_text(json.dumps(result,indent=2,allow_nan=False))
 refanno=annotated(ref,layout);curanno=annotated(beauty,layout,mask);curanno.save(out/'current-annotated.png');pair=Image.new('RGB',(ref.width*2,ref.height));pair.paste(refanno);pair.paste(curanno,(ref.width,0));pair.save(out/'comparison.png')
 # Per-zone discrepancy panels avoid overlapping categories contaminating each other.
 panels=[]
 for z in layout['zones']:
  target=region_mask(z['polygon'],*beauty.size);actual=np.isin(mask,z['categories']);rgba=np.zeros((beauty.height,beauty.width,4),dtype=np.uint8);rgba[target&~actual]=[255,40,170,100];rgba[actual&~target]=[0,230,255,100];panel=Image.alpha_composite(beauty.convert('RGBA'),Image.fromarray(rgba)).convert('RGB');ImageDraw.Draw(panel).text((20,20),z['id']+' | magenta: envelope without class; cyan: class outside envelope',fill='white',font=FONT);panel.save(out/('difference-'+z['id']+'.png'))
 lines=['# Measured composition findings','Reference polygons are approximate; unconfirmed hypotheses are not promoted to findings.']
 for f in result['topThree']:lines.extend(['## '+f['topic'],f['finding'],'Evidence: `'+json.dumps(f['evidence'])+'`','Controls: '+f['controls'],'Minimal experiment: '+f['minimalExperiment']])
 if len(result['topThree'])<3:lines.append('Fewer than three deviations passed the configured thresholds; do not invent additional findings.')
 (out/'measured-findings.md').write_text('\n\n'.join(lines));print('Comparison written to',out)
if __name__=='__main__':main()
