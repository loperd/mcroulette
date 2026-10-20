"""Refine the rejected striped pass using authored image assets and conservative derived maps."""
import bpy,sys,math,json,time
import numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts/blender'))
from miner_pbr_surfaces import save_image
OUT=ROOT/'assets/environments/miner-citadel-polish';ART=ROOT/'artifacts/miner-citadel-polish'
previous=bpy.context.window.scene
if 'MINER_CITADEL_MATERIAL_POLISH' not in bpy.data.scenes:
    with bpy.data.libraries.load(str(OUT/'miner-citadel-polished.blend'),link=False) as (source,dest):dest.scenes=[source.scenes[0]]
    dest.scenes[0].name='MINER_CITADEL_MATERIAL_POLISH'
s=bpy.data.scenes['MINER_CITADEL_MATERIAL_POLISH'];bpy.context.window.scene=s
try:
    mapping={'slate':'raw-slate','iron-shale':'raw-slate','dressed-stone':'dressed-stone','timber':'timber','water':'water','lava':'lava'}
    summary=[]
    for family,asset in mapping.items():
        src=bpy.data.images.load(str(OUT/'textures'/(asset+'-albedo-source.png')),check_existing=False);src.scale(1024,1024)
        pixels=np.empty(len(src.pixels),dtype=np.float32);src.pixels.foreach_get(pixels);rgb=pixels.reshape((1024,1024,4))[:,:,:3].copy()
        target={'slate':.23,'iron-shale':.23,'dressed-stone':.255,'timber':.17,'water':.3}.get(family)
        if target:
            mean=(rgb[:,:,0]*.2126+rgb[:,:,1]*.7152+rgb[:,:,2]*.0722).mean();rgb=np.clip(rgb*(target/max(mean,.001)),0,1)
        if family=='iron-shale':rgb=np.clip(rgb*np.array([1.12,.94,.8]),0,1)
        luma=rgb[:,:,0]*.2126+rgb[:,:,1]*.7152+rgb[:,:,2]*.0722
        # Maps derived from albedo are deliberately low amplitude: they are NOT measured scans.
        ky=np.fft.fftfreq(1024)[:,None];kx=np.fft.fftfreq(1024)[None,:]
        broad=np.fft.ifft2(np.fft.fft2(luma)*np.exp(-2*math.pi**2*3**2*(kx*kx+ky*ky))).real
        height=(broad-broad.mean())*{'slate':.013,'iron-shale':.013,'dressed-stone':.007,'timber':.008,'water':.002,'lava':-.035}[family]
        period=3
        dx=(np.roll(height,-1,1)-np.roll(height,1,1))/(2*period/1024);dy=(np.roll(height,-1,0)-np.roll(height,1,0))/(2*period/1024)
        normal=np.stack([-dx,-dy,np.ones_like(height)],axis=2);normal/=np.linalg.norm(normal,axis=2)[:,:,None];normal=normal.reshape(512,2,512,2,3).mean(axis=(1,3));normal/=np.linalg.norm(normal,axis=2)[:,:,None]
        darkness=1-np.clip(luma/(luma.mean()+.08),0,1)
        rough=np.clip(.72+darkness*.22,.58,.96)
        if family=='water':rough=np.clip(.19+luma*.3,.18,.46)
        if family=='lava':rough=np.clip(.38+darkness*.5,.35,.92)
        orm=np.stack([np.ones_like(luma),rough,np.zeros_like(luma)],axis=2).reshape(512,2,512,2,3).mean(axis=(1,3))
        images={'color':save_image(family+'-v2-color',rgb,True),'normal':save_image(family+'-v2-normal',normal*.5+.5),'orm':save_image(family+'-v2-orm',orm)}
        m=bpy.data.materials['PBR/'+family];nodes=m.node_tree.nodes;links=m.node_tree.links;p=nodes.get('Principled BSDF')
        for n in list(nodes):
            if n!=p and n.type!='OUTPUT_MATERIAL':nodes.remove(n)
        def texture(key):n=nodes.new('ShaderNodeTexImage');n.image=images[key];n.extension='REPEAT';return n
        links.new(texture('color').outputs[0],p.inputs['Base Color'])
        sep=nodes.new('ShaderNodeSeparateColor');links.new(texture('orm').outputs[0],sep.inputs[0]);links.new(sep.outputs['Green'],p.inputs['Roughness']);links.new(sep.outputs['Blue'],p.inputs['Metallic'])
        normalNode=nodes.new('ShaderNodeNormalMap');normalNode.inputs['Strength'].default_value=.55;links.new(texture('normal').outputs[0],normalNode.inputs[1]);links.new(normalNode.outputs[0],p.inputs['Normal'])
        if family=='lava':links.new(texture('color').outputs[0],p.inputs['Emission Color']);p.inputs['Emission Strength'].default_value=2.7
        if family=='water':p.inputs['Emission Color'].default_value=(.035,.075,.1,1);p.inputs['Emission Strength'].default_value=.12
        summary.append({'family':family,'source':asset+'-albedo-source.png','colorMean':rgb.mean(axis=(0,1)).tolist(),'heightAmplitudeMeters':float(height.max()-height.min()),'mapType':'Conservative artist-derived maps; not scanned PBR'})
        bpy.data.images.remove(src)
    # Make the intended physical UV layer the render layer, including objects with old gate UVs.
    for o in s.objects:
        if o.type=='MESH':
            uv=o.data.uv_layers.get('Physical metres')
            if uv:uv.active_render=True;o.data.uv_layers.active=uv
        if o.type=='LIGHT':
            if o.name.startswith('Cold overhead cavern key'):o.data.energy=8500
            elif o.name.startswith('Soft front readability'):o.data.energy=3500
            elif o.name.startswith('Warm bounced lava key'):o.data.energy=3700
    # Modest offline glow; the browser version has an independent measured-cost gate.
    group=bpy.data.node_groups.new('Citadel material polish restrained glow','CompositorNodeTree');group.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor')
    layers=group.nodes.new('CompositorNodeRLayers');layers.scene=s
    glow=group.nodes.new('CompositorNodeGlare');glow.inputs['Type'].default_value='Fog Glow';glow.inputs['Threshold'].default_value=2.5;glow.inputs['Strength'].default_value=.12;glow.inputs['Size'].default_value=.18
    output=group.nodes.new('NodeGroupOutput');group.links.new(layers.outputs['Image'],glow.inputs['Image']);group.links.new(glow.outputs['Image'],output.inputs['Image']);s.compositing_node_group=group
    s.render.resolution_x=1536;s.render.resolution_y=960;s.cycles.samples=48;s.render.filepath=str(ART/'after-blender.png')
    bpy.data.libraries.write(str(OUT/'miner-citadel-polished.blend'),{s},fake_user=True)
    start=time.perf_counter();bpy.ops.render.render(write_still=True);seconds=time.perf_counter()-start
    bpy.data.libraries.write(str(OUT/'miner-citadel-polished.blend'),{s},fake_user=True)
    (ART/'offline-render-stats.json').write_text(json.dumps({'renderer':'Cycles CPU + restrained compositor glow','samples':48,'seconds':seconds,'resolution':[1536,960],'browserGpuMeasured':False,'cameraUnchanged':True,'maps':summary},indent=2))
    RESULT={'render':s.render.filepath,'seconds':seconds,'maps':len(summary),'bloom':'offline compositor only; runtime gated'}
finally:bpy.context.window.scene=previous
