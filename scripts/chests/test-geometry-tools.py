"""Regression checks for actual hierarchy and support detection, not part labels."""
import importlib.util
from pathlib import Path
import unittest

import numpy as np

HERE=Path(__file__).resolve().parent
def module(name,file):
    spec=importlib.util.spec_from_file_location(name,HERE/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
review=module('relic_review','review-relic.py');support=module('relic_support','check-relic-construction.py')


def box(low,high):
    lo=np.array(low);hi=np.array(high)
    vertices=np.array([[hi[a]if i&(1<<a)else lo[a]for a in range(3)]for i in range(8)])
    faces=[[0,2,3],[0,3,1],[4,5,7],[4,7,6],[0,1,5],[0,5,4],
           [2,6,7],[2,7,3],[0,4,6],[0,6,2],[1,3,7],[1,7,5]]
    return vertices[np.array(faces)]


class GeometryTools(unittest.TestCase):
    def test_every_moving_part_is_found_from_hierarchy_even_if_name_says_body(self):
        g={'scene':0,'scenes':[{'nodes':[0,1]}],
           'nodes':[{'name':'Body','children':[2]},{'name':'LidAssembly','children':[3]},
                    {'name':'BodyMesh','mesh':0},{'name':'LidMesh','mesh':1}],
           'meshes':[{'primitives':[{'extras':{'parts':[{'name':'Lid.fake-stationary'}]}}]},
                     {'primitives':[{'extras':{'parts':[{'name':'LidAssembly.CornerCap'},{'name':'Body.fake-moving'}]}}]}]}
        self.assertEqual(review.part_assemblies(g),{'Lid.fake-stationary':'Body','LidAssembly.CornerCap':'LidAssembly','Body.fake-moving':'LidAssembly'})

    def test_support_does_not_bridge_a_small_visible_gap(self):
        a=box([0,0,0],[1,1,1]);b=box([1.01,0,0],[2,1,1])
        self.assertFalse(support.connected(a,b,.0004))

    def test_coplanar_contact_is_supported(self):
        self.assertTrue(support.connected(box([0,0,0],[1,1,1]),box([1,0,0],[2,1,1]),.0004))

    def test_interlocked_and_embedded_parts_are_supported(self):
        a=box([0,0,0],[1,1,1])
        self.assertTrue(support.connected(a,box([.7,.2,.2],[1.5,.8,.8]),.0004))
        self.assertTrue(support.connected(a,box([.2,.2,.2],[.8,.8,.8]),.0004))


if __name__=='__main__':unittest.main()
