"""Blender-only modelling helpers for the authored citadel scene; no runtime generator."""
import bpy, math, bmesh
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/environments/miner-citadel';ART=ROOT/'artifacts/miner-citadel'

class Environment:
    def __init__(self,scene):self.scene=scene
    def group(self,name):
        old=self.scene.collection.children.get(name)
        if old:return old
        c=bpy.data.collections.new(name);self.scene.collection.children.link(c);return c
    def material(self,name,color,rough=.85,metal=0):
        name='MineEnv/'+name;m=bpy.data.materials.get(name)
        if m:return m
        m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
        return m
    def rock_material(self,name,color):
        m=self.material(name,color);n=m.node_tree.nodes;l=m.node_tree.links;p=n['Principled BSDF']
        if n.get('Geological variation'):return m
        coord=n.new('ShaderNodeTexCoord');noise=n.new('ShaderNodeTexNoise');noise.name='Geological variation';noise.inputs['Scale'].default_value=.63;noise.inputs['Detail'].default_value=4;noise.inputs['Roughness'].default_value=.72;l.new(coord.outputs['Object'],noise.inputs['Vector'])
        ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.18;ramp.color_ramp.elements[0].color=(*(c*.5 for c in color),1);ramp.color_ramp.elements[1].position=.83;ramp.color_ramp.elements[1].color=(*(c*1.45 for c in color),1);l.new(noise.outputs['Fac'],ramp.inputs[0]);l.new(ramp.outputs[0],p.inputs['Base Color'])
        fine=n.new('ShaderNodeTexNoise');fine.inputs['Scale'].default_value=11;fine.inputs['Detail'].default_value=3;l.new(coord.outputs['Object'],fine.inputs['Vector']);bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.32;bump.inputs['Distance'].default_value=.13;l.new(fine.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs[0],p.inputs['Normal'])
        return m
    def emission(self,name,color,strength):
        m=self.material(name,color);p=m.node_tree.nodes['Principled BSDF'];p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=strength;return m
    def mesh(self,collection,name,verts,faces,mat,bevel=0):
        d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update();o=bpy.data.objects.new(name,d);collection.objects.link(o);d.materials.append(mat)
        if bevel:mod=o.modifiers.new('Fractured edge light catch','BEVEL');mod.width=bevel;mod.segments=1
        return o
    def box(self,c,name,x,y,z,w,d,h,mat,bevel=.04):
        v=[(x+a*w/2,y+b*d/2,z+f*h/2) for a,b,f in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
        return self.mesh(c,name,v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat,bevel)
    def profile(self,c,name,outline,y,depth,mat,bevel=.05):
        n=len(outline);v=[(x,yy,z) for yy in [y-depth/2,y+depth/2] for x,z in outline];f=[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        return self.mesh(c,name,v,f,mat,bevel)
    def rock(self,c,name,outline,layers,mat):
        # Geological bands share an explicit plan footprint, making ledges and fracture planes.
        n=len(outline);cx=sum(x for x,y in outline)/n;cy=sum(y for x,y in outline)/n
        v=[(cx+(x-cx)*s+dx,cy+(y-cy)*s+dy,z) for z,s,dx,dy in layers for x,y in outline]
        f=[tuple(reversed(range(n))),tuple(range((len(layers)-1)*n,len(layers)*n))]
        for j in range(len(layers)-1):
            for i in range(n):a=j*n+i;b=j*n+(i+1)%n;f.append((a,b,b+n,a+n))
        return self.mesh(c,name,v,f,mat,.08)
    def beam(self,c,name,a,b,w,d,mat):
        mid=(Vector(a)+Vector(b))*.5;length=(Vector(b)-Vector(a)).length;o=self.box(c,name,0,0,0,w,d,length,mat,.035);o.location=mid;o.rotation_euler=(Vector(b)-Vector(a)).to_track_quat('Z','Y').to_euler();return o
    def arch(self,c,name,cx,y,spring,r,thickness,depth,mat,segments=11):
        for i in range(segments):
            a=i*math.pi/segments+.005;b=(i+1)*math.pi/segments-.005
            p=[(cx+rr*math.cos(t),spring+rr*math.sin(t)) for rr,t in [(r,a),(r+thickness,a),(r+thickness,b),(r,b)]]
            self.profile(c,name,p,y,depth,mat,.04)
    def light(self,c,name,loc,power,color,size=1,kind='POINT',target=None):
        d=bpy.data.lights.new(name,kind);d.energy=power;d.color=color
        if kind=='AREA':d.shape='DISK';d.size=size
        else:d.shadow_soft_size=size
        o=bpy.data.objects.new(name,d);c.objects.link(o);o.location=loc
        if target:o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
        return o
    def save(self,name):
        OUT.mkdir(parents=True,exist_ok=True);bpy.data.libraries.write(str(OUT/name),{self.scene},fake_user=True)
    def render(self,name,samples=24,width=1200):
        s=self.scene;s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.samples=samples;s.cycles.use_denoising=True
        s.render.resolution_x=width;s.render.resolution_y=round(width/1.6);s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG';s.render.filepath=str(ART/name)
        bpy.ops.render.render(write_still=True)
