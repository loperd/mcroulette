"""Geometry-only refinement, using the existing Model/GLB/Blockbench pipeline.

No texture or material authoring in this module. Units are 1/16 block.
"""
import math
import numpy as np


def rectangle(a0,b0,a1,b1,chamfer=.08):
    c=min(chamfer,(a1-a0)*.2,(b1-b0)*.2)
    return [(a0+c,b0),(a1-c,b0),(a1,b0+c),(a1,b1-c),
            (a1-c,b1),(a0+c,b1),(a0,b1-c),(a0,b0+c)]


def ring(model,name,outer,inner,lo,hi,material,group='Body',axis='y',bevel=.04):
    """Closed annular mesh: real hole, joined mitres and bevelled lips."""
    def ccw(points):
        p=np.array(points,float)
        area=sum(p[i,0]*p[(i+1)%len(p),1]-p[i,1]*p[(i+1)%len(p),0]for i in range(len(p)))
        return p if area>0 else p[::-1]
    outer,inner=ccw(outer),ccw(inner);n=len(outer);assert len(inner)==n
    def offset(p,d):
        result=[]
        for i,b in enumerate(p):
            e1=b-p[i-1];e1/=np.linalg.norm(e1);e2=p[(i+1)%n]-b;e2/=np.linalg.norm(e2)
            n1=np.array([-e1[1],e1[0]]);n2=np.array([-e2[1],e2[0]])
            result.append(b+(n1+n2)*d/(1+np.dot(n1,n2)))
        return np.array(result)
    levels=[(lo,bevel),(lo+bevel,0),(hi-bevel,0),(hi,bevel)]
    vertices=[]
    for height,d in levels:
        for boundary in [offset(outer,d),offset(inner,-d)]:
            for a,b in boundary:
                vertices.append([a,height,-b]if axis=='y'else([a,b,height]if axis=='z'else[height,a,b]))
    faces=[]
    for r in range(3):
        k=r*2*n;l=(r+1)*2*n
        for i in range(n):
            j=(i+1)%n
            faces.extend([[k+i,k+j,l+j,l+i],[k+n+j,k+n+i,l+n+i,l+n+j]])
    for i in range(n):
        j=(i+1)%n;last=6*n
        faces.extend([[j,i,n+i,n+j],[last+i,last+j,last+n+j,last+n+i]])
    model.mesh(name,vertices,faces,material,group)


def gem(model,name,rings,material='crystal',group='Body',vertical=True,front_ridge=False):
    """Eight-sided stone with a front ridge, not one broad front rectangle.

    rings contain (axis coordinate, width radius, depth radius, center depth).
    Triangulated planar facets avoid non-planar Blockbench faces.
    """
    vertices=[]
    for h,w,d,c in rings:
        for i in range(8):
            a=i*math.tau/8;u,v=math.cos(a),math.sin(a)
            if front_ridge:u,v=[(1,0),(.70,.75),(0,1),(-.70,.75),(-1,0),(-.76,-.35),(0,-1),(.76,-.35)][i]
            vertices.append([u*w,h,c+v*d]if vertical else[u*w,c+v*d,h])
    faces=[list(range(7,-1,-1))]
    for r in range(len(rings)-1):
        for i in range(8):
            j=(i+1)%8;a=r*8+i;b=r*8+j;c=(r+1)*8+j;d=(r+1)*8+i
            faces.extend([[a,b,c],[a,c,d]])
    faces.append(list(range((len(rings)-1)*8,len(rings)*8)))
    center=np.array(vertices).mean(axis=0)
    # Vertical/horizontal embeddings have different handedness.
    for face in faces:
        p=np.array([vertices[i]for i in face]);normal=np.cross(p,np.roll(p,-1,axis=0)).sum(axis=0)
        if normal@(p.mean(axis=0)-center)<0:face.reverse()
    model.mesh(name,vertices,faces,material,group)


def build(api):
    m=api.Model();b=m.box
    # Keep body size, floor and hinge contract. Replace applied panel skins by
    # solid walls with apertures, inset infill and continuous mechanical frames.
    b('Body.Floor',[-6.85,.30,-6.85],[6.85,1.05,6.85],'shell',bevel=.10)
    b('Body.InnerFloor',[-6.18,1.03,-6.18],[6.18,1.15,6.18],'interior',bevel=.025)
    for s in [-1,1]:
        lo,hi=sorted([s*6.85,s*6.18]);panel_lo,panel_hi=sorted([s*6.55,s*6.18])
        ring(m,f'Body.WallZ{s}',rectangle(-6.85,1.05,6.85,10.35),rectangle(-5.25,2.10,5.25,8.65,.18),lo,hi,'shell',axis='z',bevel=.025)
        m.prism(f'Body.InsetPanelZ{s}',rectangle(-5.28,2.07,5.28,8.68,.18),panel_lo,panel_hi,'panel',axis='z',bevel=.035)
        ring(m,f'Body.PanelFrameZ{s}',rectangle(-5.45,1.85,5.45,8.90,.20),rectangle(-4.95,2.35,4.95,8.40,.18),*sorted([s*7.12,s*6.80]),'edge',axis='z',bevel=.045)
        ring(m,f'Body.WallX{s}',rectangle(1.05,-6.85,10.35,6.85),rectangle(2.10,-5.25,8.65,5.25,.18),lo,hi,'shell',axis='x',bevel=.025)
        m.prism(f'Body.InsetPanelX{s}',rectangle(2.07,-5.28,8.68,5.28,.18),panel_lo,panel_hi,'panel',axis='x',bevel=.035)
        ring(m,f'Body.PanelFrameX{s}',rectangle(1.85,-5.45,8.90,5.45,.20),rectangle(2.35,-4.95,8.40,4.95,.18),*sorted([s*7.12,s*6.80]),'edge',axis='x',bevel=.045)
        # Paired stone inserts leave a real slot down to the panel substrate.
        for index,(z0,z1)in enumerate([(-3.95,-.18),(.18,3.95)]):
            m.prism(f'Body.SideInsertX{s}.{index}',rectangle(2.85,z0,7.95,z1,.48),*sorted([s*6.79,s*6.52]),'shell',axis='x',bevel=.045)
        b(f'Body.SideSlotX{s}',[min(s*6.53,s*6.63),3.45,-.09],[max(s*6.53,s*6.63),7.35,.09],'crystal',bevel=.015)
    # One continuous rim and lower plinth, not intersecting strips at the mitres.
    for name,y0,y1,material in [('Plinth',1.10,1.60,'edge'),('Rim',9.80,10.35,'edge')]:
        ring(m,'Body.'+name,rectangle(-7.13,-7.13,7.13,7.13,.22),rectangle(-6.12,-6.12,6.12,6.12,.16),y0,y1,material,bevel=.06)
    # The front's quiet inset fields provide scale and support the reliquary.
    for s in [-1,1]:
        x0,x1=sorted([s*1.65,s*4.65])
        m.prism(f'Body.FrontInsert{s}',rectangle(x0,2.8,x1,8.05,.38),-6.76,-6.52,'shell',axis='z',bevel=.045)
    # Re-proportion existing corner armor; close lid-cap roofs rather than add
    # unrelated ornaments. Each roof bears directly on the stone slab.
    for sx in [-1,1]:
        for sz in [-1,1]:
            x,z=sx*6.4,sz*6.4;tag=f'{sx}.{sz}'
            b('Body.CornerSpine.'+tag,[x-.72,1.35,z-.72],[x+.72,9.0,z+.72],'edge',bevel=.13)
            wrap=[(-1.20,.02),(.02,.02),(.02,-1.20),(1.33,-1.20),(1.33,1.33),(-1.20,1.33)]
            poly=[(x+sx*a,-(z+sz*c))for a,c in wrap]
            for name,y0,y1,group in [('Foot',0,1.65,'Body'),('Shoulder',8.75,10.30,'Body'),('Cap',12.70,14.37,'LidAssembly')]:
                m.prism(group+'.Corner'+name+'.'+tag,poly,y0,y1,'metal',group,bevel=.12)
            # Top cap closes the open L and contacts the lid (y=14.35).
            roof=[(x+sx*a,-(z+sz*c))for a,c in rectangle(-1.20,-1.20,1.33,1.33,.12)]
            m.prism('Lid.CornerRoof.'+tag,roof,14.32,14.85,'metal','LidAssembly',bevel=.07)
            for y,group in [(.80,'Body'),(13.72,'LidAssembly')]:
                b(f'{group}.StudSeatZ.{tag}',[x-.40,y-.38,sz*7.73-.04],[x+.40,y+.38,sz*7.73+.04],'edge',group,bevel=.025)
                b(f'{group}.StudSeatX.{tag}',[sx*7.73-.04,y-.38,z-.40],[sx*7.73+.04,y+.38,z+.40],'edge',group,bevel=.025)
                b(f'{group}.StudZ.{tag}',[x-.15,y-.21,sz*7.775-.015],[x+.15,y+.21,sz*7.775+.015],'accent',group,bevel=.01)
                b(f'{group}.StudX.{tag}',[sx*7.775-.015,y-.21,z-.15],[sx*7.775+.015,y+.21,z+.15],'accent',group,bevel=.01)
            # Only one short spine inlay, actually let into the structural post.
            b('Body.SpineInlayZ.'+tag,[x-.12,3.5,sz*7.12-.035],[x+.12,7.0,sz*7.12+.035],'crystal',bevel=.012)
            b('Body.SpineInlayX.'+tag,[sx*7.12-.035,3.5,z-.12],[sx*7.12+.035,7.0,z+.12],'crystal',bevel=.012)
    # A physically seated mounting plate spans the inset and the shell header.
    ring(m,'Body.ReliquaryMount',rectangle(-1.65,2.20,1.65,9.85,.32),rectangle(-1.10,2.72,1.10,9.32,.12),-7.20,-6.48,'edge',axis='z',bevel=.055)
    b('Body.ReliquaryRecess',[-1.15,2.70,-6.56],[1.15,9.45,-6.50],'interior',bevel=.015)
    ring(m,'Body.ReliquaryFrame',rectangle(-1.28,2.55,1.28,9.50,.16),rectangle(-.94,3.0,.94,9.05,.10),-7.58,-7.16,'metal',axis='z',bevel=.05)
    for s in [-1,1]:
        x0,x1=sorted([s*1.16,s*1.95])
        m.prism(f'Body.ReliquaryWing{s}',rectangle(x0,4.45,x1,7.8,.20),-7.25,-6.50,'metal',axis='z',bevel=.06)
    gem(m,'Body.HeartCrystal',[(3.0,.035,.025,-7.10),(4.12,.93,.57,-7.10),(7.62,1.0,.60,-7.10),(9.0,.035,.025,-7.10)],front_ridge=True)
    # Two pairs of discrete claws transfer the stone's load into the frame.
    for y in [4.12,7.62]:
        for s in [-1,1]:
            x0,x1=sorted([s*.78,s*1.22])
            m.prism(f'Body.CrystalClaw.{s}.{y}',rectangle(x0,y-.21,x1,y+.21,.055),-7.60,-7.12,'metal',axis='z',bevel=.035)
    b('Body.LockReceiver',[-.63,9.55,-7.30],[.63,10.50,-6.79],'edge',bevel=.075)
    # Thinner lid with a genuine top field, lip and joined frame/socket.
    b('Lid.Slab',[-6.90,10.55,-6.90],[6.90,14.35,6.90],'shell','LidAssembly',bevel=.17)
    b('Lid.Underside',[-6.1,10.47,-6.1],[6.1,10.59,6.1],'interior','LidAssembly',bevel=.025)
    ring(m,'Lid.LowerLip',rectangle(-7.08,-7.08,7.08,7.08,.20),rectangle(-6.15,-6.15,6.15,6.15,.18),10.62,11.10,'edge','LidAssembly',bevel=.06)
    # Top frame sits in the slab; no .02-unit levitation or disconnected bars.
    ring(m,'Lid.TopFrame',rectangle(-5.35,-5.35,5.35,5.35,.22),rectangle(-4.85,-4.85,4.85,4.85,.22),14.31,14.58,'metal','LidAssembly',bevel=.055)
    m.prism('Lid.TopField',rectangle(-4.90,-4.90,4.90,4.90,.22),14.31,14.39,'panel','LidAssembly',bevel=.02)
    outer=[(0,-2.70),(2.70,0),(0,2.70),(-2.70,0)]
    inner=[(0,-1.86),(1.86,0),(0,1.86),(-1.86,0)]
    m.prism('Lid.SocketBed',outer,14.35,14.50,'edge','LidAssembly',bevel=.04)
    # Diamond exterior, octagonal opening matched to the octagonal girdle.
    outside=[];inside=[]
    for i in range(8):
        a=i*math.tau/8;c,s=math.cos(a),math.sin(a)
        outside.append((2.70*c/(abs(c)+abs(s)),2.70*s/(abs(c)+abs(s))))
        inside.append((1.49*c,1.49*s))
    ring(m,'Lid.DiamondSocket',outside,inside,14.47,14.91,'metal','LidAssembly',bevel=.04)
    # Eight-sided pavilion inside the socket and crown/table above its lip.
    top=15.39+.34*math.sqrt(3)/2
    gem(m,'Lid.CrownCrystal',[(14.49,.82,.82,0),(14.92,1.55,1.55,0),(top,.64,.64,0)],group='LidAssembly')
    b('Lid.ClaspMount',[-.79,10.64,-7.12],[.79,12.18,-6.77],'edge','LidAssembly',bevel=.065)
    ring(m,'Lid.ClaspFrame',rectangle(-.65,10.55,.65,11.98,.11),rectangle(-.28,10.88,.28,11.56,.07),-7.50,-7.07,'metal','LidAssembly',axis='z',bevel=.04)
    # Real bearings: fixed cheeks support the pin at its ends; the moving hollow
    # barrel has radial clearance. The leaf now reaches that barrel.
    for s in [-1,1]:
        x=s*3.5
        b(f'Body.HingeBase{s}',[x-.78,9.32,6.72],[x+.78,10.20,7.78],'edge',bevel=.07)
        cheek=rectangle(9.8,7.42,10.76,7.86,.15)
        for end in [-1,1]:
            m.prism(f'Body.HingeCheek{s}.{end}',cheek,x+end*.56-.085,x+end*.56+.085,'metal',axis='x',bevel=.025)
        pin=[(10.55+.10*math.cos(i*math.tau/12),7.65+.10*math.sin(i*math.tau/12))for i in range(12)]
        m.prism(f'Body.HingePin{s}',pin,x-.70,x+.70,'edge',axis='x',bevel=.018)
        outside=[(10.55+.23*math.cos(i*math.tau/12),7.65+.23*math.sin(i*math.tau/12))for i in range(12)]
        inside=[(10.55+.15*math.cos(i*math.tau/12),7.65+.15*math.sin(i*math.tau/12))for i in range(12)]
        ring(m,f'Lid.HingeBarrel{s}',outside,inside,x-.35,x+.35,'metal','LidAssembly',axis='x',bevel=.012)
        leaf=[(10.55,6.86),(11.68,6.86),(11.68,7.07),(10.75,7.67),(10.55,7.50)]
        m.prism(f'Lid.HingeLeaf{s}',leaf,x-.30,x+.30,'metal','LidAssembly',axis='x',bevel=.035)
    return m
