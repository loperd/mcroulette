"""Synthetic classifier tests, explicitly NOT screenshots or evidence about the current scene."""
import unittest,json,importlib.util
from pathlib import Path
import numpy as np
from PIL import Image
spec=importlib.util.spec_from_file_location('comparison',Path(__file__).with_name('compare.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
layout=json.loads((m.ROOT/'public/diagnostics/reference-layout.json').read_text())
class CompositionTest(unittest.TestCase):
 def run_case(self,ids,depth):
  image=Image.new('RGB',(320,200),'gray');return m.evaluate(layout,ids,depth,image,image)
 def test_detects_three_failures_without_pixel_difference(self):
  ids=np.full((200,320),8,dtype=np.uint8);ids[65:120,125:195]=1;depth=np.full(ids.shape,100.)
  r=self.run_case(ids,depth)
  topics={f['topic'] for f in r['findings'] if f['status']=='deviation'}
  self.assertTrue({'citadel_scale','side_architecture_voids','architectural_depth'}<=topics)
  self.assertEqual(next(z for z in r['zones'] if z['id']=='hero')['brightnessCurrent'],next(z for z in r['zones'] if z['id']=='hero')['brightnessReference'])
 def test_does_not_force_expected_failures(self):
  ids=np.full((200,320),8,dtype=np.uint8);ids[40:115,70:250]=1;ids[20:120,:65]=2;ids[20:120,255:]=2;ids[0:25,100:220]=7;ids[140:170,0:80]=5
  depth=np.full(ids.shape,100.);depth[ids==7]=220
  r=self.run_case(ids,depth);f={x['topic']:x['status'] for x in r['findings']}
  self.assertEqual(f['citadel_scale'],'not_confirmed');self.assertEqual(f['side_architecture_voids'],'not_confirmed');self.assertEqual(f['architectural_depth'],'not_confirmed')
 def test_far_label_at_near_depth_does_not_prove_depth(self):
  ids=np.full((200,320),8,dtype=np.uint8);ids[40:115,70:250]=1;ids[0:25,100:220]=7
  result=self.run_case(ids,np.full(ids.shape,100.));self.assertEqual(next(f for f in result['findings'] if f['topic']=='architectural_depth')['status'],'deviation')
 def test_missing_category_is_safe(self):
  result=self.run_case(np.full((200,320),255,dtype=np.uint8),np.full((200,320),np.nan));json.dumps(result,allow_nan=False)
  self.assertIsNone(result['zones'][0]['visibleBounds'])
 def test_layout_is_normalized_and_prioritized(self):
  for z in layout['zones']:
   self.assertIn(z['priority'],[1,2]);self.assertTrue(all(0<=v<=1 for point in z['polygon'] for v in point));self.assertTrue(z['confidence'])
if __name__=='__main__':unittest.main()
