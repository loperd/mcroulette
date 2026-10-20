"""Ancient industrial character, motivated damage and cinematic lighting of the Blender environment."""
import bpy,sys,math,bmesh,random
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts/blender'))
from miner_environment_tools import Environment
previous=bpy.context.window.scene;s=bpy.data.scenes['MINER_CITADEL_ENVIRONMENT'];bpy.context.window.scene=s;e=Environment(s)
try:
    rock=bpy.data.materials['MineEnv/Fractured graphite'];warm=bpy.data.materials['MineEnv/Iron-bearing schist'];wood=bpy.data.materials['MineEnv/Dark ancient timber'];metal=bpy.data.materials['MineEnv/Oxidised rail steel']
    ruin=e.group('15 — Pressure fractures and buried citadel')
    hero=s.collection.children['01 — Citadel / independent gate source copy']
    chipped=0;removedCaps=0
    for o in list(hero.objects):
        if o.type!='MESH':continue
        v=o.data.vertices
        if not len(v):continue
        center=sum((q.co for q in v),Vector())/len(v)
        if o.name.startswith(('Crown cap slab','Crenellation cap')):
            # Thin regular capping made the gate look like a restored castle: remove selected
            # exposed caps where the cliff has sheared the upper stonework.
            if center.x< -5 or center.x>10:o.hide_render=True;removedCaps+=1
        if o.name.startswith(('Broken tower crown','Uneven upper crenellation')) and (center.x < -5 or 1<center.x<4 or center.x>10):
            bm=bmesh.new();bm.from_mesh(o.data)
            xs=[q.co.x for q in bm.verts];ys=[q.co.y for q in bm.verts];zs=[q.co.z for q in bm.verts]
            sign=-1 if center.x<0 else 1
            co=Vector((min(xs) if sign<0 else max(xs),min(ys),max(zs)-.5))
            result=bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.0001,plane_co=co,plane_no=Vector((sign*.55,-.4,1)),clear_outer=True,clear_inner=False)
            cut=[g for g in result['geom_cut'] if isinstance(g,bmesh.types.BMEdge)]
            if cut:bmesh.ops.holes_fill(bm,edges=cut,sides=0)
            bm.to_mesh(o.data);bm.free();o.data.update();chipped+=1
        if o.name.startswith('Tower face ashlar') and -13<center.x<-7 and 12<center.z<17:
            # A coherent shear zone, not random offsets over the whole facade.
            for q in v:q.co.y-=.06*(center.z-11);q.co.x-=.028*(center.z-11)
    def fissure(name,points,width=.03):
        d=bpy.data.curves.new(name,'CURVE');d.dimensions='3D';d.bevel_depth=width;d.bevel_resolution=0
        p=d.splines.new('POLY');p.points.add(len(points)-1)
        for dst,co in zip(p.points,points):dst.co=(*co,1)
        o=bpy.data.objects.new(name,d);ruin.objects.link(o);d.materials.append(e.material('Deep fracture shadow',(.007,.011,.018),1))
    fissure('Left settlement fault',[(-12.4,-4.37,15),(-11.7,-4.4,14.4),(-11.8,-4.4,13.5),(-10.9,-4.4,12.9),(-10.7,-4.4,11.4)],.045)
    fissure('Right crown runoff fracture',[(11.2,-4.37,16.1),(11.0,-4.37,15.1),(11.7,-4.38,14.3),(11.4,-4.38,12.9)],.034)
    fissure('Portal abutment stress',[(5.8,-4.7,8.9),(6.3,-4.7,8.1),(6.15,-4.7,7.3)],.035)
    # Slumped rock partially overtops the worked stone, visually burying the citadel into geology.
    for name,outline,layers in [
      ('Left roof overburden',[(-19,0),(-13,-1),(-11,4),(-14,11),(-21,10)],[(10,1,0,0),(18,1,0,0),(22,.68,-1,0)]),
      ('Right roof overburden',[(13,1),(20,-2),(24,7),(20,15),(13,11)],[(9,1,0,0),(19,1,0,0),(25,.67,1,0)]),
    ]:e.rock(ruin,name,outline,layers,rock)
    # Irregular talus follows those failure zones and rests on the masonry threshold.
    for i,(x,y,z,w,d,h) in enumerate([(-13.2,-5.1,.6,1.2,1.4,1.1),(-12,-5.5,.35,.9,1.2,.7),(-14.4,-4.7,.5,1.4,1.1,.9),(13.4,-4.9,.6,1.1,1.4,1.2),(14.5,-4.4,.3,.8,1,.6)]):
        e.rock(ruin,'Fallen dressed stone fragment',[(x-w/2,y-d/2),(x+w/2,y-d*.3),(x+w*.3,y+d/2),(x-w/2,y+d*.25)],[(z-h/2,1,0,0),(z+h/2,.65,.08,0)],warm)
    industrial=e.group('16 — Citadel hoist and timber reinforcement')
    for x in [-4.8,-2.4,0,2.4,4.8]:
        e.box(industrial,'Heavy mine hoist upright',x,-3.98,14.2,.32,.45,4.6,wood)
        for z in [12.3,14.3,16.2]:e.box(industrial,'Iron fastening plate',x,-4.26,z,.46,.1,.42,metal,.025)
    for z in [12.2,14.3,16.4]:e.box(industrial,'Heavy hoist cross member',0,-4.1,z,10.5,.5,.42,wood)
    for side in [-1,1]:e.beam(industrial,'Hoist diagonal tension brace',(side*.2,-4.25,12.5),(side*4.6,-4.25,16.1),.25,.25,wood)
    # Lantern fixtures: every wall fixture has a bracket; every bridge lamp has a post.
    lamps=e.group('17 — Lantern network and chains');amber=e.emission('Lantern warm panes',(1,.31,.035),5)
    def lantern(x,y,z,scale=1,power=130):
        e.box(lamps,'Forged lantern foot',x,y,z-.38*scale,.65*scale,.58*scale,.12*scale,metal,.025)
        e.box(lamps,'Amber lamp glazing',x,y,z,.42*scale,.37*scale,.62*scale,amber,.03)
        for dx in [-.26,.26]:
            for dy in [-.23,.23]:e.box(lamps,'Lantern corner stile',x+dx*scale,y+dy*scale,z,.055*scale,.055*scale,.8*scale,metal,.012)
        e.profile(lamps,'Lantern pitched iron hood',[(x-.43*scale,z+.43*scale),(x,z+.72*scale),(x+.43*scale,z+.43*scale)],y,.7*scale,metal,.02)
        e.light(lamps,'Amber lantern light',(x,y-.35*scale,z),power,(1,.36,.085),.45*scale)
    for x in [-24,-15,-7,7,15,24]:
        e.box(lamps,'Viaduct lamp timber post',x,-12.8,.95,.42,.5,1.9,wood)
        lantern(x,-12.8,2.15,1.15,220)
    for x,y,z in [(-21,-11,7.7),(-21,-3,7.7),(-22,6,17.1),(-22,18,17.1),(21,-9,11.7),(21,0,11.7),(23,18,23.7),(23,30,23.7),(24,50,17.4)]:
        e.box(lamps,'Gallery lantern bearing post',x,y,z-1.3,.22,.22,2.5,wood)
        lantern(x,y,z,.9,170)
    for y in range(13,88,12):lantern((-1 if y%24<12 else 1)*3.8,y,5.6,.7,60)
    # Foreground lamp rests on the cliff's small wooden landing, framing the lower right.
    foreground=e.group('18 — Foreground working platforms')
    for i in range(9):e.box(foreground,'Near timber platform plank',9.1,-39+i*.45,-1.5,5.6,.4,.18,wood,.025)
    for x in [6.8,11.4]:
        for y in [-39,-35.5]:e.box(foreground,'Near platform rock anchored post',x,y,-2.8,.42,.42,3.6,wood)
    lantern(10.5,-37.1,.55,1.45,200)
    for x,y,z in [(-17,-24,18),(17,-11,18)]:
        # Suspension chains begin at the cavern vault and terminate at the lantern handle.
        length=10 if x<0 else 8
        for j in range(int(length/.22)):
            d=bpy.data.curves.new('Suspended iron chain link','CURVE');d.dimensions='3D';d.bevel_depth=.035;d.bevel_resolution=0;sp=d.splines.new('POLY');sp.points.add(7)
            for k,p in enumerate(sp.points):
                a=k*math.pi/4;turn=(j%2)*math.pi/2;p.co=(x+.11*math.cos(a)*math.cos(turn),y+.11*math.cos(a)*math.sin(turn),z+length-j*.22+.15*math.sin(a),1)
            sp.use_cyclic_u=True;o=bpy.data.objects.new('Lantern suspension chain',d);lamps.objects.link(o);d.materials.append(metal)
        lantern(x,y,z,1.35,240)
    # Crystalline minerals grow out of a stone matrix rather than floating as isolated blue blocks.
    crystals=e.group('19 — Mineral veins');cyan=e.emission('Cyan mineral emission',(.005,.42,.68),2.5);blue=e.emission('Blue mineral facets',(.008,.14,.32),1.1)
    clusters=[(-24,-18,6.5),(-25,0,19),(-19,17,28),(24,-17,6),(25,-3,18),(23,9,26),(29,28,35),(17,54,24)]
    for cluster,(x,y,z) in enumerate(clusters):
        e.rock(crystals,'Mineral bearing host rock',[(x-1.4,y-.8),(x+1.3,y-1),(x+1.5,y+.8),(x-1,y+1)],[(z-.6,1,0,0),(z+.3,.8,0,0)],rock)
        for j,(dx,dy,h,r) in enumerate([(-.75,-.2,.8,.18),(-.3,-.4,1.4,.23),(.3,-.1,1.1,.24),(.8,.1,.65,.2),(.1,.4,.9,.18)]):
            verts=[]
            for zz,rr in [(z,r),(z+h*.72,r),(z+h,.0)]:
                for k in range(5):a=k*math.pi*2/5;verts.append((x+dx+rr*math.cos(a),y+dy+rr*math.sin(a),zz))
            faces=[tuple(reversed(range(5)))]+[(k,(k+1)%5,(k+1)%5+5,k+5) for k in range(5)]+[(k+5,(k+1)%5+5,10+k) for k in range(5)]
            e.mesh(crystals,'Angular cyan crystal prism',verts,faces,cyan if j%2 else blue)
        e.light(crystals,'Mineral blue bounce',(x,y-.5,z+1),240 if cluster<6 else 450,(.025,.54,1),1.8)
    # A continuous falling ribbon and lower spill integrate water into the right-hand rock terraces.
    water=e.group('20 — Tiered subterranean waterfall');watermat=e.material('Cold falling water',(.07,.2,.3),.19)
    p=watermat.node_tree.nodes['Principled BSDF'];p.inputs['Transmission Weight'].default_value=.23;p.inputs['IOR'].default_value=1.333
    foam=e.emission('Soft water highlights',(.19,.38,.48),.4)
    for x,y,top,bottom in [(24.5,1,27,14),(23.2,-7.8,14,3.8)]:
        verts=[];n=24
        for j in range(n+1):
            z=top+(bottom-top)*j/n
            for i in range(7):xx=x+(i/6-.5)*1.8;verts.append((xx,y+.08*math.sin(j*.8+i),z))
        faces=[(j*7+i,j*7+i+1,(j+1)*7+i+1,(j+1)*7+i) for j in range(n) for i in range(6)]
        e.mesh(water,'Waterfall translucent ribbon',verts,faces,watermat)
        for i in range(8):
            xx=x-.8+i*.21;e.beam(water,'Waterfall glancing highlight',(xx,y-.04,top),(xx+.06,y-.04,bottom),.018,.025,foam)
    # Lava has emissive fissures, cooled crust and texture variation instead of white flat slabs.
    molten=bpy.data.materials['MineEnv/Molten lava'];n=molten.node_tree.nodes;l=molten.node_tree.links;p=n['Principled BSDF']
    coord=n.new('ShaderNodeTexCoord');noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=1.4;noise.inputs['Detail'].default_value=4;noise.inputs['Roughness'].default_value=.72;l.new(coord.outputs['Object'],noise.inputs['Vector'])
    ramp=n.new('ShaderNodeValToRGB');r=ramp.color_ramp;r.elements.remove(r.elements[1]);r.elements[0].position=.27;r.elements[0].color=(.025,.001,.0001,1)
    for pos,color in [(.40,(.22,.006,.0002,1)),(.53,(1,.11,.001,1)),(.67,(1,.48,.025,1)),(.79,(1,.8,.16,1))]:a=r.elements.new(pos);a.color=color
    l.new(noise.outputs['Fac'],ramp.inputs[0]);l.new(ramp.outputs[0],p.inputs['Base Color']);l.new(ramp.outputs[0],p.inputs['Emission Color']);p.inputs['Emission Strength'].default_value=2.2
    # Physical curtains connect the separate lava elevations.
    lava=s.collection.children['06 — Lava ravine primary flow']
    for x,y,w,zt,zb in [(-22,-17,7,-2,-3.8),(-18,-26,6,-3.8,-6.1)]:
        e.mesh(lava,'Descending molten cascade',[(x-w/2,y,zt),(x+w/2,y,zt),(x+w/2,y,zb),(x-w/2,y,zb)],[(0,1,2,3)],molten)
    # Depth comes from scattering behind the hero; the foreground has no uniform blue veil.
    atmosphere=e.group('21 — Distant atmospheric scattering')
    fog=bpy.data.materials.new('MineEnv/Cold distant haze');fog.use_nodes=True;nodes=fog.node_tree.nodes;nodes.clear();out=nodes.new('ShaderNodeOutputMaterial');vol=nodes.new('ShaderNodeVolumePrincipled');vol.inputs['Density'].default_value=.008;vol.inputs['Color'].default_value=(.23,.36,.55,1);vol.inputs['Anisotropy'].default_value=.2;fog.node_tree.links.new(vol.outputs['Volume'],out.inputs['Volume'])
    e.box(atmosphere,'Distant haze volume',0,69,23,100,120,70,fog,0)
    # Low foreground wisps stay to the sides and below the bridge, leaving the portal readable.
    mist=fog.copy();mist.name='MineEnv/Ravine low mist';mist.node_tree.nodes.get('Principled Volume').inputs['Density'].default_value=.014
    e.box(atmosphere,'Low lava vapour',-19,-18,-1,15,25,4,mist,0)
    e.box(atmosphere,'Low waterfall spray',24,-5,5,12,22,7,mist,0)
    # Reference camera: lower bridge axis and slightly wider working context than catalog view.
    s.camera.location=(0,-68,10);s.camera.rotation_euler=(Vector((0,3,1.5))-s.camera.location).to_track_quat('-Z','Y').to_euler();s.camera.data.lens=37.5
    s['production_stage']='04 ancient citadel art pass / first full environment lighting';s['preserved_gate_source_sha256']='82fb4e5a9c03e434ad01a73b0b43eab662840c4a923563df7b93c24e549f3400'
    s['motivated_damage']='Left crown settlement, right runoff fracture, slumped shoulders, locally chipped capstones'
    e.save('04-art-directed-environment.blend');e.render('04-art-directed-environment.png',40,1200)
    RESULT={'chippedCrownMeshes':chipped,'removedPolishedCaps':removedCaps,'blend':'assets/environments/miner-citadel/04-art-directed-environment.blend','render':'artifacts/miner-citadel/04-art-directed-environment.png'}
finally:bpy.context.window.scene=previous
