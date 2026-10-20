"""Final Blender-only delivery, with native editable source and measured offline render stats."""
import bpy,sys,math,time,json,hashlib
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts/blender'))
from miner_environment_tools import Environment
previous=bpy.context.window.scene;s=bpy.data.scenes['MINER_CITADEL_ENVIRONMENT'];bpy.context.window.scene=s;e=Environment(s)
try:
    hero=s.collection.children['01 — Citadel / independent gate source copy']
    # The raised gate enters the thick existing overgate pocket, revealing the mine passage.
    for o in hero.objects:
        if o.type=='MESH' and o.name.startswith('Portcullis'):
            for v in o.data.vertices:v.co.z+=2.2
    # Weathering varies over geological space and runoff direction, not over random vertices.
    stoneMaterials=set()
    for o in hero.objects:
        if o.type=='MESH':
            for m in o.data.materials:
                if m and any(k in m.name.lower() for k in ['stone','masonry','graphite']):stoneMaterials.add(m)
    for mat in stoneMaterials:
        n=mat.node_tree.nodes;l=mat.node_tree.links;p=n.get('Principled BSDF')
        if not p or not p.inputs['Base Color'].is_linked:continue
        previousColor=p.inputs['Base Color'].links[0].from_socket
        coord=n.new('ShaderNodeTexCoord');mapping=n.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(2.5,1.7,.3);l.new(coord.outputs['Object'],mapping.inputs[0])
        noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=2.4;noise.inputs['Detail'].default_value=4;noise.inputs['Roughness'].default_value=.75;l.new(mapping.outputs[0],noise.inputs['Vector'])
        ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.2;ramp.color_ramp.elements[0].color=(.34,.29,.25,1);ramp.color_ramp.elements[1].position=.77;ramp.color_ramp.elements[1].color=(1.1,1.1,1.05,1);l.new(noise.outputs['Fac'],ramp.inputs[0])
        mix=n.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;l.new(previousColor,mix.inputs[1]);l.new(ramp.outputs[0],mix.inputs[2]);l.new(mix.outputs[0],p.inputs['Base Color'])
        grain=n.new('ShaderNodeTexNoise');grain.inputs['Scale'].default_value=19;grain.inputs['Detail'].default_value=3;l.new(coord.outputs['Object'],grain.inputs['Vector'])
        bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.52;bump.inputs['Distance'].default_value=.07
        if p.inputs['Normal'].is_linked:l.new(p.inputs['Normal'].links[0].from_socket,bump.inputs['Normal'])
        l.new(grain.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs[0],p.inputs['Normal'])
    # Actual timber support collars make depth legible in the lowered sightline through the gate.
    timber=bpy.data.materials['MineEnv/Dark ancient timber'];c=e.group('25 — Deep mine timber support collars')
    for y in range(12,91,7):
        for x in [-3.8,3.8]:e.box(c,'Mine timber wall shore',x,y,3.3,.3,.45,6.6,timber,.035)
        e.box(c,'Mine timber cross collar',0,y,6.7,7.9,.45,.35,timber,.035)
    for collection in ['09 — Composition lighting','17 — Lantern network and chains']:
        for o in s.collection.children[collection].objects:
            if o.type=='LIGHT' and o.location.y>8 and abs(o.location.x)<5 and o.data.type=='POINT':o.data.energy*=1.9
    for o in s.collection.children['21 — Distant atmospheric scattering'].objects:
        if o.type=='LIGHT' and o.name.startswith('Distant cavern blue atmospheric opening'):o.data.energy=8000
    # Two additional visible veins are copies of the same editable mineral cluster, seated into
    # the new shoulder rock instead of uniformly sprinkling crystals across the whole cave.
    minerals=s.collection.children['19 — Mineral veins'];sourceCenter=Vector((-25,0,19));originals=list(minerals.objects)
    for delta in [Vector((7,-2,-2)),Vector((43,-1,-1))]:
        for o in originals:
            if o.type=='MESH':center=sum((o.matrix_world@v.co for v in o.data.vertices),Vector())/len(o.data.vertices)
            elif o.type=='LIGHT':center=o.location
            else:continue
            if (center-sourceCenter).length<2.8:
                copy=o.copy();minerals.objects.link(copy);copy.location=o.location+delta
    crossing=s.collection.children['23 — Lower ravine industrial crossing']
    pivot=bpy.data.objects.new('Lower crossing diagonal composition',None);crossing.objects.link(pivot);pivot.location=(0,-25,-7)
    bpy.context.view_layer.update()
    for o in list(crossing.objects):
        if o==pivot:continue
        matrix=o.matrix_world.copy();o.parent=pivot;o.matrix_parent_inverse=pivot.matrix_world.inverted();o.matrix_basis=matrix
    pivot.rotation_euler.z=math.radians(-7)
    s['production_stage']='Blender environment design / high resolution composition delivery'
    s['export_status']='Not exported. Native environment review precedes any Three.js conversion.'
    s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.samples=64;s.cycles.seed=71;s.cycles.use_denoising=True
    s.render.resolution_x=1536;s.render.resolution_y=960;s.render.resolution_percentage=100
    s.render.image_settings.file_format='PNG';s.render.filepath=str(ROOT/'artifacts/miner-citadel/miner-citadel-final.png')
    e.save('miner-citadel.blend')
    started=time.perf_counter();bpy.ops.render.render(write_still=True);elapsed=time.perf_counter()-started
    # Save after rendering too: camera, resolution, filepath and sample count reopen coherently.
    e.save('miner-citadel.blend')
    meshes=[o for o in s.objects if o.type=='MESH' and not o.hide_render]
    stats={'blender':bpy.app.version_string,'renderer':'Cycles CPU','renderSeconds':elapsed,'samples':s.cycles.samples,'resolution':[1536,960],'denoising':True,'camera':{'location':list(s.camera.location),'rotationEuler':list(s.camera.rotation_euler),'lensMm':s.camera.data.lens,'sensorWidthMm':s.camera.data.sensor_width,'focusPoint':[0,-2,7],'apertureFstop':s.camera.data.dof.aperture_fstop},'sceneObjects':len(s.objects),'visibleMeshObjects':len(meshes),'meshVerticesBeforeModifiers':sum(len(o.data.vertices) for o in meshes),'meshPolygonsBeforeModifiers':sum(len(o.data.polygons) for o in meshes),'lights':sum(o.type=='LIGHT' for o in s.objects),'collections':[c.name for c in s.collection.children],'originalGateSourceSha256':hashlib.sha256((ROOT/'assets/environments/miner-gate/miner-gate.blend').read_bytes()).hexdigest(),'nativeSource':'assets/environments/miner-citadel/miner-citadel.blend','render':'artifacts/miner-citadel/miner-citadel-final.png','browserScreenshot':False,'threeExport':False,'runtimePerformance':'Not measured; this delivery is a Blender environment design render.'}
    (ROOT/'artifacts/miner-citadel/render-stats.json').write_text(json.dumps(stats,indent=2))
    RESULT=stats
finally:bpy.context.window.scene=previous
