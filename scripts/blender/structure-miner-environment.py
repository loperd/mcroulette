"""Geological meso forms and mining infrastructure, after two composition renders."""
import bpy,sys,math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts/blender'))
from miner_environment_tools import Environment
previous=bpy.context.window.scene;s=bpy.data.scenes['MINER_CITADEL_ENVIRONMENT'];bpy.context.window.scene=s;e=Environment(s)
try:
    rock=bpy.data.materials['MineEnv/Fractured graphite'];warm=bpy.data.materials['MineEnv/Iron-bearing schist'];masonry=bpy.data.materials['MineEnv/Ancient cut stone'];deep=bpy.data.materials['MineEnv/Blue distant slate']
    wood=e.rock_material('Dark ancient timber',(.16,.075,.025));metal=e.material('Oxidised rail steel',(.18,.2,.23),.46,.72)
    relief=e.group('11 — Bedded rock fracture relief')
    # Subdivide long exposed geological planes into parallel fractured beds. These surfaces
    # derive from the existing stratified masses; they do not move the macro landforms.
    sources=[o for name in ['02 — Geological macro masses','10 — Geological terraces and joint planes'] for o in s.collection.children[name].objects if o.type=='MESH' and not o.name.startswith('Ravine central')]
    for o in sources:
        if 'vault' in o.name or 'roof' in o.name:continue
        for face in o.data.polygons:
            normal=face.normal.copy()
            if abs(normal.z)>.65:continue
            v=[o.matrix_world@o.data.vertices[i].co for i in face.vertices]
            if len(v)!=4:continue
            a,b,c,d=v
            if (b-a).length<3 or (d-a).length<3:continue
            center=sum(v,Vector())/4
            toward=Vector((0,-64,9))-center
            if normal.dot(toward)<0:continue
            cols=max(1,int((b-a).length/3.4));rows=max(1,int((d-a).length/2.4))
            for row in range(rows):
                for col in range(cols):
                    u0=col/cols+.012;u1=(col+1)/cols-.012;v0=row/rows+.018;v1=(row+1)/rows-.018
                    def p(u,v):return a*(1-u)*(1-v)+b*u*(1-v)+c*u*v+d*(1-u)*v
                    corners=[p(u0,v0),p(u1,v0),p(u1,v1),p(u0,v1)]
                    depth=.18+.2*((row+col*2)%4)
                    # A clipped upper corner and offset bedding lip imply split strata.
                    front=[q+normal*depth for q in corners]
                    front[2]=front[2]*.85+front[1]*.15
                    verts=[tuple(q) for q in corners+front]
                    e.mesh(relief,'Split bedrock plate',verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],rock if (row+col)%4 else warm,.09)
    central=s.collection.children['10 — Geological terraces and joint planes'].objects.get('Ravine central bedrock')
    if central:central.hide_render=True
    for i,(x,y,z,w,d,h) in enumerate([(-7,-17,-12,5,10,15),(-2,-20,-13,4,10,13),(3,-17,-12,5,11,15),(7,-16,-13,4,8,13),(-4,-25,-16,5,7,8)]):
        outline=[(x-w/2,y-d/2),(x+w*.3,y-d*.55),(x+w/2,y+d*.2),(x+w*.2,y+d/2),(x-w/2,y+d*.35)]
        e.rock(relief,'Fissured ravine face',outline,[(z-h/2,1,0,0),(z+h/2-1,1,0,0),(z+h/2,.82,0,1)],rock)
    # Viaduct spandrels tie the visible arches into the deck instead of leaving a gap.
    bridge=s.collection.children['04 — Stone railway viaduct']
    for cx in [-26.25,-18.75,-11.25,-3.75,3.75,11.25,18.75,26.25]:
        arc=[(cx+3.8*math.cos(a),-6+3.8*math.sin(a)) for a in [math.pi-j*math.pi/14 for j in range(15)]]
        e.profile(bridge,'Viaduct spandrel infill',arc+[(cx+3.8,-.9),(cx-3.8,-.9)],-9,7,masonry,.06)
    for x in range(-32,34,2):
        e.box(bridge,'Dressed bridge fascia stone',x,-12.57,-.5,1.94,.34,.92,masonry,.055)
        if x%8==0:e.box(bridge,'Bridge parapet pedestal',x,-12.7,.55,.75,.8,1.5,masonry)
    galleries=e.group('12 — Multilevel timber mining galleries')
    # Physical decks have cross joists, bearing posts and triangular braces, terminating on rock.
    def gallery(name,x,y,length,z,width=3.5):
        for j in range(int(length/.55)):
            yy=y+j*.55;e.box(galleries,name+' plank',x,yy,z,width,.5,.18,wood,.025)
        for yy in [y+j*4 for j in range(int(length/4)+1)]:
            e.box(galleries,name+' bearing cross beam',x,yy,z-.3,width+.6,.45,.5,wood)
            for side in [-1,1]:
                xx=x+side*(width/2-.25)
                e.box(galleries,name+' bedrock post',xx,yy,z-2,.45,.5,4,wood)
                e.beam(galleries,name+' diagonal brace',(xx,yy,z-2),(xx-side*1.5,yy,z-.2),.25,.3,wood)
                e.box(galleries,name+' guardrail post',xx,yy,z+.8,.2,.2,1.7,wood)
                e.box(galleries,name+' rail',xx,yy+1.9,z+1.4,.16,4.2,.17,wood)
    gallery('Left lower ore gallery',-21,-15,20,5.2,4.4)
    gallery('Left high service gallery',-22,2,24,14.6,4.4)
    gallery('Right working gallery',21,-13,23,9.2,4.4)
    gallery('Right upper mine gallery',23,14,29,21.2,5)
    gallery('Distant right transit gallery',24,43,21,15,4)
    # Transverse timber bridge has its supports on the existing left and citadel terraces.
    for i in range(19):e.box(galleries,'Left transverse bridge plank',-21+i*.45,-1,5.2,.41,3,.18,wood,.025)
    for y in [-2.3,.3]:
        e.box(galleries,'Left bridge longitudinal stringer',-17,y,4.9,9.4,.4,.5,wood)
        for x in [-21,-17,-13]:e.box(galleries,'Left bridge guard post',x,y,6,.18,.18,1.7,wood)
        e.box(galleries,'Left bridge handrail',-17,y,6.7,9.5,.15,.15,wood)
    # A continuous supported stair links working levels, rather than a floating ladder texture.
    for side,x,y,z,steps in [(-1,-20,-12,.4,13),(-1,-22,1,5.5,20),(1,20,-10,.5,20)]:
        for j in range(steps):e.box(galleries,'Stone founded timber stair',x,y+j*.6,z+j*.43,2.6,.7,.25,wood,.03)
        end=(x,y+(steps-1)*.6,z+(steps-1)*.43)
        for dx in [-1.15,1.15]:
            e.beam(galleries,'Stair stringer',(x+dx,y,z-.2),(end[0]+dx,end[1],end[2]-.2),.2,.35,wood)
            e.beam(galleries,'Stair handrail',(x+dx,y,z+1.2),(end[0]+dx,end[1],end[2]+1.2),.12,.15,wood)
    # Railway follows the viaduct, with a turnout into the actual gate and tunnel.
    rails=e.group('13 — Railway and turnout')
    for x in [i*.85-35 for i in range(83)]:e.box(rails,'Bridge rail sleeper',x,-9.6,.18,.28,3.6,.2,wood,.02)
    for y in [-10.85,-8.35]:e.box(rails,'Bridge running rail',0,y,.35,70,.13,.17,metal,.025)
    for y in range(-9,93):
        e.box(rails,'Tunnel rail sleeper',0,y,.15,3.4,.24,.18,wood,.02)
    for x in [-1.2,1.2]:e.box(rails,'Tunnel running rail',x,40,.31,.13,103,.17,metal,.025)
    # Side drift portals have real arches and dark chambers embedded in the rock.
    sideDrifts=e.group('14 — Auxiliary mine adits')
    for side,x,y,z in [(-1,-22,13,14.7),(1,24,24,21.3)]:
        dark=e.material('Unlit adit interior',(.018,.026,.04),1)
        for dx in [-1.7,1.7]:e.box(sideDrifts,'Side adit timber jamb',x+dx,y,z+1.7,.4,1,3.4,wood)
        e.box(sideDrifts,'Side adit lintel',x,y,z+3.5,4.2,1,.45,wood)
        e.box(sideDrifts,'Side drift dark recess',x,y+1.5,z+1.5,3,.1,3,dark)
    # Reduce over-bright broad fill; let the rock planes reveal themselves through local contrast.
    for o in s.collection.children['09 — Composition lighting'].objects:
        if o.name.startswith('Cold overhead'):o.data.energy=7500
        elif o.name.startswith('Warm bounced'):o.data.energy=3000
        elif o.name.startswith('Soft front'):o.data.energy=2600
        elif o.name.startswith('Cold reflected'):o.data.energy=550
    s['production_stage']='03 geological bedding and structural mining context'
    e.save('03-structural-environment.blend');e.render('03-structural-environment.png',32,1200)
    RESULT={'blend':'assets/environments/miner-citadel/03-structural-environment.blend','render':'artifacts/miner-citadel/03-structural-environment.png'}
finally:bpy.context.window.scene=previous
