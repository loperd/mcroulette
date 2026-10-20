"""Authored, periodic surface structures in physical metres. No random texture generator.
Shared height/masks drive albedo, OpenGL tangent normals, roughness and metalness.
"""
import bpy,math,json
import numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/environments/miner-citadel-polish/textures'
OUT.mkdir(parents=True,exist_ok=True)
N=1024
Y,X=np.mgrid[0:N,0:N]/N
TAU=math.tau

def cyclic_distance(a,b):return np.abs((a-b+.5)%1-.5)
def smooth(a,b,x):
    t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)
def save_image(name,data,color=False):
    h,w=data.shape[:2];im=bpy.data.images.new('Polish/'+name,width=w,height=h,alpha=True)
    if not color:im.colorspace_settings.name='Non-Color'
    if data.ndim==2:data=np.repeat(data[:,:,None],3,axis=2)
    rgba=np.concatenate([np.clip(data,0,1),np.ones((h,w,1))],axis=2).astype(np.float32)
    im.pixels.foreach_set(rgba.ravel());im.filepath_raw=str(OUT/(name+'.png'));im.file_format='PNG';im.save();im.pack();return im

def maps(family,period=3):
    # Continuous periodic grain is deliberately subordinate to the bedding, chisel cuts,
    # grain fibres, split joints and oxidation masks; it is never the macro surface design.
    grain=(np.sin(TAU*(137*X+71*Y))+.5*np.cos(TAU*(83*X-109*Y)))*.0006
    joint_a=.31+.085*np.sin(TAU*X)+.025*np.sin(TAU*5*X)
    joint_b=.63+.12*np.sin(TAU*Y)+.035*np.sin(TAU*4*Y)
    horizontal=np.exp(-(cyclic_distance(Y,joint_a)/.004)**2)
    vertical=np.exp(-(cyclic_distance(X,joint_b)/.003)**2)
    joint=np.maximum(horizontal,vertical)
    h=grain.copy();metal=np.zeros_like(X);emissive=None
    if family in ['slate','iron-shale']:
        bedding=Y*11+.09*np.sin(TAU*X)+.035*np.sin(TAU*3*X)
        split=np.exp(-(np.sin(math.pi*bedding)/.085)**2)
        lamina=np.tanh(np.sin(TAU*bedding)*3)
        h+=.013*lamina-.016*split-.018*joint
        deposit=smooth(.35,.8,.5+.3*np.sin(TAU*(2*X-Y))+.2*np.cos(TAU*(X+3*Y)))
        base=np.array([.14,.163,.2] if family=='slate' else [.19,.145,.105])
        rgb=base[None,None,:]*(.88+.11*lamina[:,:,None]+deposit[:,:,None]*.2)
        rgb*=1-joint[:,:,None]*.35
        rough=.68+.17*(1-deposit)+.12*split
    elif family=='dressed-stone':
        # Shallow directional tool cuts, worn islands and a few hairline fractures.
        cuts=np.maximum(0,np.cos(TAU*(X*39+.06*np.sin(TAU*Y))))**16
        worn=(.5+.5*np.sin(TAU*(X+Y)))*(.5+.5*np.cos(TAU*(2*X-Y)))
        h+=.0018*cuts+.007*worn-.009*joint
        rgb=np.array([.19,.19,.185])[None,None,:]*(.79+worn[:,:,None]*.34)
        rgb*=1-joint[:,:,None]*.32
        rough=.64+.22*(1-worn)+joint*.1
    elif family=='timber':
        knot=((np.sin(TAU*(X-.35))/.9)**2+(np.sin(TAU*(Y-.52))/.3)**2)
        fibres=TAU*(X*51+.7*np.sin(TAU*Y)*np.sin(TAU*X))
        knots=np.exp(-knot*5)
        grainfield=np.sin(fibres+knots*14)
        splits=np.maximum(0,np.sin(TAU*(X*13+.03*np.sin(TAU*Y))))**35
        h+=.0025*grainfield-.009*splits+.001*knots
        rgb=np.array([.22,.105,.035])[None,None,:]*(.83+grainfield[:,:,None]*.12-knots[:,:,None]*.22)
        rough=.68+.13*splits+.08*(1-grainfield)*.5
    elif family=='iron':
        oxide=smooth(.42,.7,.5+.22*np.sin(TAU*(2*X+Y))+.18*np.cos(TAU*(X-3*Y)))
        score=np.maximum(0,np.sin(TAU*(X*61+.02*np.sin(TAU*Y))))**24
        h+=.002*oxide-.0015*score
        rgb=np.array([.095,.11,.13])[None,None,:]*(1-oxide[:,:,None])+np.array([.22,.075,.023])[None,None,:]*oxide[:,:,None]
        rough=.35+.5*oxide+.08*score;metal=.92*(1-oxide)+.08*oxide
    elif family=='water':
        # Braided, widening foam sheets, not straight equally spaced emissive rods.
        warp=X+.12*np.sin(TAU*Y)+.04*np.sin(TAU*(3*Y+X))
        ribbon=np.sin(TAU*(warp*4+.2*np.cos(TAU*Y)))
        foam=smooth(.52,.95,ribbon)*(.3+.7*smooth(-.5,.8,np.sin(TAU*(Y*3-X))))
        h+=.003*np.sin(TAU*(warp*7+Y*2))+.0015*np.cos(TAU*(warp*13-Y))
        rgb=np.array([.06,.17,.22])[None,None,:]*(1-foam[:,:,None])+np.array([.55,.65,.66])[None,None,:]*foam[:,:,None]
        rough=.18+.35*foam
    elif family=='lava':
        # Islands of cooling crust are bounded by a connected hot fissure network.
        warp=X+.055*np.sin(TAU*Y);edge=np.minimum(np.abs(np.sin(TAU*(warp*3+Y))),np.abs(np.sin(TAU*(Y*4-.3*np.cos(TAU*X)))))
        hot=1-smooth(.025,.16,edge)
        crust=smooth(.35,.8,.5+.25*np.sin(TAU*(2*X-Y))+.18*np.cos(TAU*(X+3*Y)))
        h+=.05*crust-.025*hot
        rgb=np.array([.09,.009,.001])[None,None,:]*(1-hot[:,:,None])+np.array([1,.4,.015])[None,None,:]*hot[:,:,None]
        emissive=rgb.copy();rough=.5+.4*crust
    else:raise ValueError(family)
    # Derivatives are in metres, independent of map resolution and world UV tiling.
    dx=(np.roll(h,-1,axis=1)-np.roll(h,1,axis=1))/(2*period/N)
    dy=(np.roll(h,-1,axis=0)-np.roll(h,1,axis=0))/(2*period/N)
    normal=np.stack([-dx,-dy,np.ones_like(h)],axis=2);normal/=np.linalg.norm(normal,axis=2)[:,:,None]
    # Average linear data before downsampling, then renormalize tangent normals.
    normal=normal.reshape(N//2,2,N//2,2,3).mean(axis=(1,3));normal/=np.linalg.norm(normal,axis=2)[:,:,None]
    orm=np.stack([np.ones_like(X),np.clip(rough,0,1),metal],axis=2).reshape(N//2,2,N//2,2,3).mean(axis=(1,3))
    result={'color':save_image(family+'-color',rgb,True),'normal':save_image(family+'-normal',normal*.5+.5),'orm':save_image(family+'-orm',orm)}
    if emissive is not None:result['emissive']=save_image(family+'-emissive',emissive,True)
    return result

def material(family):
    images=maps(family);m=bpy.data.materials.new('PBR/'+family);m.use_nodes=True;n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF')
    def tex(key):t=n.new('ShaderNodeTexImage');t.image=images[key];t.extension='REPEAT';return t
    l.new(tex('color').outputs['Color'],p.inputs['Base Color'])
    sep=n.new('ShaderNodeSeparateColor');l.new(tex('orm').outputs['Color'],sep.inputs['Color']);l.new(sep.outputs['Green'],p.inputs['Roughness']);l.new(sep.outputs['Blue'],p.inputs['Metallic'])
    normal=n.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.8;l.new(tex('normal').outputs['Color'],normal.inputs['Color']);l.new(normal.outputs[0],p.inputs['Normal'])
    if family=='lava':l.new(tex('emissive').outputs['Color'],p.inputs['Emission Color']);p.inputs['Emission Strength'].default_value=3
    if family=='water':p.inputs['Roughness'].default_value=.25;p.inputs['Transmission Weight'].default_value=0;p.inputs['IOR'].default_value=1.333
    m['surfaceFamily']=family;m['uvPeriodMeters']=3
    return m
