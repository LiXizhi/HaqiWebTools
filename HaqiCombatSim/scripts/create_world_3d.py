"""Blender MCP authoring for the isolated Haqi island technology lab.
Deterministic mesh construction, Z up / south (-Y) faces the initial camera.
Run in Blender: exec(compile(open(path).read(), path, 'exec'), {'__file__': path}).
"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
scene=bpy.data.scenes.new('Haqi Island · World Lab')
bpy.context.window.scene=scene
palette={'grass':'6aab39','grassLight':'78b540','grassDark':'5d9c38','sand':'f2d495','cliff':'c3a276','rock':'8d9284','rockLight':'bec1a8','snow':'edeaca','trunk':'796044','leaf':'398447','leafLight':'65a747','pine':'256d4d','wall':'f3e4bd','wallShade':'d9c795','gold':'d7ac51','roof':'187ab5','roofLight':'289bcc','roofDark':'155582','window':'35586c','wood':'9c6b39','woodLight':'c0965a','tile':'d36c39','tileLight':'e99349','water':'38cfdb','foam':'cbfaf2','sail':'fff3d0','flower':'f4bc5e','soil':'92724b','crop':'d7bb42','ocean':'168fb7'}
materials={}; created=[]
def mat(key):
    if key not in materials:
        h=palette[key];rgb=[int(h[i:i+2],16)/255 for i in (0,2,4)]
        rgb=[c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in rgb]
        m=bpy.data.materials.new('Island_'+key);m.use_nodes=True
        bsdf=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
        bsdf.inputs['Base Color'].default_value=(*rgb,1);bsdf.inputs['Roughness'].default_value=.85;m.diffuse_color=(*rgb,1)
        materials[key]=m
    return materials[key]
def mesh(name,v,f,key,layer='architecture'):
    me=bpy.data.meshes.new(name);me.from_pydata(v,[],f);me.update()
    o=bpy.data.objects.new(name,me);scene.collection.objects.link(o);me.materials.append(mat(key));o['slot']=key;o['layer']=layer;created.append(o);return o
def box(name,p,size,key,layer='architecture',angle=0):
    x,y,z=p;dx,dy,dz=[s/2 for s in size];ca=math.cos(angle);sa=math.sin(angle)
    v=[(x+a*ca-b*sa,y+a*sa+b*ca,z+c) for a,b,c in [(-dx,-dy,-dz),(dx,-dy,-dz),(dx,dy,-dz),(-dx,dy,-dz),(-dx,-dy,dz),(dx,-dy,dz),(dx,dy,dz),(-dx,dy,dz)]]
    return mesh(name,v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],key,layer)
def cylinder(name,p,r,h,key,n=12,top=None,layer='architecture',phase=0):
    x,y,z=p;top=r if top is None else top
    v=[(x+rr*math.cos(i*math.tau/n+phase),y+rr*math.sin(i*math.tau/n+phase),z+zz) for rr,zz in [(r,0),(top,h)] for i in range(n)]
    f=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    f.extend((i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n));return mesh(name,v,f,key,layer)
def ellipsoid(name,p,r,key,layer='nature',n=8):
    x,y,z=p;rx,ry,rz=r
    v=[(x,y,z+rz),(x,y,z-rz)]
    for j in range(1,4):
        a=math.pi*j/4
        for i in range(n):
            b=math.tau*(i+(j%2)*.5)/n;v.append((x+rx*math.sin(a)*math.cos(b),y+ry*math.sin(a)*math.sin(b),z+rz*math.cos(a)))
    f=[]
    for i in range(n):
        f.extend([(0,2+i,2+(i+1)%n),(1,2+2*n+(i+1)%n,2+2*n+i)])
    for j in range(2):
        for i in range(n):
            a=2+j*n+i;b=2+j*n+(i+1)%n;f.append((a,a+n,b+n,b))
    return mesh(name,v,f,key,layer)
def noise(i):return (math.sin(i*127.1+311.7)*43758.5453)%1
def coast(a):return 1+.052*math.sin(a*5+.8)+.03*math.cos(a*9)+.018*math.sin(a*15)
def height(x,y):
    return .83+1.28*math.exp(-((x+2.3)/2.5)**2-((y-1.65)/2.3)**2)+.21*math.sin(x*.8)*math.cos(y*.7)
def ribbon(name,points,width,key,layer='paths'):
    v=[]
    for i,p in enumerate(points):
        q=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)]);q.z=0;q.normalize();side=Vector((-q.y,q.x,0))*width/2
        v.extend([tuple(Vector(p)+side),tuple(Vector(p)-side)])
    return mesh(name,v,[(2*i,2*i+1,2*i+3,2*i+2) for i in range(len(points)-1)],key,layer)
def path(name,xy,width=.29,key='sand',layer='paths'):
    pts=[]
    for a,b in zip(xy,xy[1:]):
        for j in range(12):
            t=j/12;x=a[0]*(1-t)+b[0]*t;y=a[1]*(1-t)+b[1]*t;pts.append((x,y,height(x,y)+(.076 if key=='water' else .05)))
    x,y=xy[-1];pts.append((x,y,height(x,y)+(.076 if key=='water' else .05)));return ribbon(name,pts,width,key,layer)

# Radial terrain, a sandy littoral shelf, and exposed stratified coastal cliffs.
N=96;R=18
v=[(0,0,height(0,0))]
for j in range(1,R+1):
    r=j/R*.93
    for i in range(N):
        a=i*math.tau/N;c=coast(a);x=8.1*r*c*math.cos(a);y=6.15*r*c*math.sin(a)
        v.append((x,y,height(x,y)))
f=[(0,1+i,1+(i+1)%N) for i in range(N)]
for j in range(R-1):
    for i in range(N):
        a=1+j*N+i;b=1+j*N+(i+1)%N
        f.extend([(a,a+N,b),(b,a+N,b+N)])
terrain=mesh('island_meadow',v,f,'grass','terrain')
for key in ['grassLight','grassDark']:terrain.data.materials.append(mat(key))
for p in terrain.data.polygons:
    shade=math.sin(p.center.x*1.2)+math.cos(p.center.y*.8)
    p.material_index=1 if shade>1.1 else 2 if shade<-1.2 else 0
for low,high,key in [((1.03,-.12),(1.005,.16),'sand'),((1.005,.16),(.97,.38),'sand'),((.97,.38),(.93,None),'cliff')]:
    v=[]
    for r,z in [low,high]:
        for i in range(N):
            a=i*math.tau/N;c=coast(a);x=8.1*r*c*math.cos(a);y=6.15*r*c*math.sin(a);v.append((x,y,height(x,y) if z is None else z))
    mesh('coastal_shelf',v,[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)],key,'terrain')
for i in range(66):
    a=i*math.tau/66;c=coast(a);x=7.76*c*math.cos(a);y=5.89*c*math.sin(a)
    ellipsoid('coast_stone',(x,y,.33),(.23+.16*noise(i),.23,.42+.15*noise(i+9)),'rockLight' if i%3 else 'cliff','terrain',6)

# Mountain backdrop behind the castle: faceted peaks and pale exposed faces.
for i,(x,y,r,h) in enumerate([(-4.4,3.5,1.15,3.7),(-3.2,4.2,1.25,4.5),(-2.1,4.5,.9,3.4),(-5.0,2.5,.8,2.5),(-1.1,3.5,.65,2.4)]):
    z=height(x,y)-.2;cylinder('mountain',(x,y,z),r,h,'rock',7,top=.05,layer='terrain',phase=i*.8)
    cylinder('mountain_light',(x-.12,y-.04,z+h*.36),r*.6,h*.64,'rockLight',5,top=.008,layer='terrain',phase=i)
    cylinder('summit',(x-.12,y-.04,z+h*.83),r*.17,h*.17+.02,'snow',5,top=.002,layer='terrain',phase=i)

# Raised castle court; readable silhouette of white walls, round turrets and blue roofs.
cx=-2.25;cy=1.2;cz=2.15
cylinder('castle_outcrop',(cx,cy,1.15),2.05,1,'cliff',16,top=1.87,layer='terrain')
cylinder('castle_lawn',(cx,cy,cz),1.9,.10,'grassLight',32,layer='terrain')
cylinder('courtyard',(cx,cy,cz+.105),1.62,.045,'sand',32)
def tower(x,y,z,r,h,roof=True):
    cylinder('ivory_tower',(x,y,z),r,h,'wall',16)
    for zz in (.12,h*.48,h-.10):cylinder('tower_belt',(x,y,z+zz),r+.035,.075,'wallShade',16)
    for a in [0,math.pi/2,math.pi,math.pi*1.5]:
        xx=x+math.sin(a)*(r+.008);yy=y-math.cos(a)*(r+.008)
        box('tower_window',(xx,yy,z+h*.64),(.09,.016,.21),'window',angle=a)
        box('window_header',(xx,yy,z+h*.64+.12),(.12,.025,.035),'gold',angle=a)
    if roof:
        cylinder('blue_eave',(x,y,z+h),r+.12,.10,'roofDark',16)
        cylinder('blue_spire',(x,y,z+h+.10),r+.14,r*2.05,'roof',16,top=.018)
        for i in range(3):
            t=(i+1)/4;cylinder('roof_band',(x,y,z+h+.10+r*2.05*t),(r+.14)*(1-t)+.015,.035,'roofLight',16)
        cylinder('finial',(x,y,z+h+.1+r*2.05),.027,.22,'gold',8,top=.012)
    else:
        for i in range(8):
            a=i*math.tau/8;box('merlon',(x+r*.85*math.cos(a),y+r*.85*math.sin(a),z+h+.10),(.12,.12,.20),'wall')
box('great_hall',(cx,cy+.15,cz+1.12),(1.75,1.55,2.2),'wall')
box('hall_cornice',(cx,cy+.15,cz+2.19),(1.85,1.65,.16),'wallShade')
tower(cx,cy+.20,cz+1.5,.57,1.70)
for x,y,r,h in [(-1.13,-.64,.32,1.7),(1.13,-.64,.32,1.7),(-1.13,.80,.30,2.1),(1.13,.80,.30,2.1),(-.68,.05,.23,2.5),(.66,.13,.23,2.65)]:tower(cx+x,cy+y,cz,r,h)
for x in [-.65,0,.65]:
    for zz in [.8,1.42,1.97]:box('hall_window',(cx+x,cy-.635,cz+zz),(.17,.025,.26),'window')
for y in [-.88,.92]:
    box('rampart',(cx,cy+y,cz+.49),(2.7,.19,.98),'wall')
    for i in range(13):box('rampart_tooth',(cx-1.2+i*.2,cy+y,cz+1.05),(.12,.23,.17),'wall')
for x in [-1.4,1.4]:
    box('side_wall',(cx+x,cy,cz+.42),(.18,1.8,.84),'wall')
    for i in range(9):box('wall_tooth',(cx+x,cy-.8+i*.2,cz+.94),(.22,.12,.17),'wall')
box('gate_shadow',(cx,cy-.987,cz+.35),(.40,.025,.69),'window')
box('gate_door',(cx,cy-1.009,cz+.27),(.32,.03,.51),'wood')
for i in range(11):box('castle_stairs',(cx,cy-1.16-i*.095,cz-.035-i*.055),(.64,.14,.12),'wallShade')

# Eastern ochre plateau and its waterfall.
px=3.0;py=2.55;pz=3.0
cylinder('mesa',(px,py,.7),1.55,2.3,'cliff',11,top=1.40,layer='terrain',phase=.15)
cylinder('mesa_lawn',(px,py,pz),1.43,.075,'grassLight',11,layer='terrain',phase=.15)
for i in range(12):
    a=i*math.tau/12;cylinder('mesa_column',(px+1.3*math.cos(a),py+1.3*math.sin(a),.8),.19,1.9+.2*noise(i),'sand',5,top=.15,layer='terrain')
path('upper_stream',[(3.1,2.7),(3.4,2),(3.4,.7),(2.8,-.1)],.28,'water','river')
for x,y,top,bottom,w in [(3.30,1.20,3.09,1.10,.43),(-.45,.55,2.23,1.04,.30)]:
    mesh('fall_sheet',[(x-w/2,y,top),(x+w/2,y,top),(x+w*.65,y-.3,bottom),(x-w*.65,y-.3,bottom)],[(0,1,2,3)],'water','waterfall')
    for i in range(5):
        xx=x-w*.40+i*w*.2;ribbon('fall_highlight',[(xx,y-.012,top),(xx+.015,y-.12,(top+bottom)*.5),(xx,y-.31,bottom)],.022,'foam','waterfall')
    ellipsoid('fall_pool',(x,y-.35,bottom),(.48,.32,.035),'water','river',16)
river=[(2.8,-.1),(2.1,-.8),(1.2,-1.4),(.6,-2.4),(-.6,-3.1),(-1.1,-4),(-2,-4.9),(-2.2,-5.8)]
path('river_bank',river,.67,'sand','river');path('river_water',river,.45,'water','river')
path('castle_stream',[(-.45,.25),(.2,-.3),(1.2,-1.4)],.22,'water','river')
mesh('river_mouth_fall',[(-2.43,-5.75,height(-2.2,-5.75)+.076),(-1.98,-5.75,height(-2.2,-5.75)+.076),(-1.98,-6.25,.04),(-2.43,-6.25,.04)],[(0,1,2,3)],'water','waterfall')

# Meandering paths, crossroads, the village and small cereal fields.
roads=[([(-2.25,-.1),(-2,-1.2),(-1,-1.8),(1,-1.9),(3,-1.5),(5,-1.1),(6.9,-1.8)],.36),
    ([(-2,-1.2),(-3.7,-1.5),(-4.9,-2.6),(-4.5,-4),(-2.5,-4.6),(0,-4.4),(2.1,-3.5),(4,-2.8),(5,-1.1),(5.8,.7)],.30),
    ([(3,-1.5),(3.6,-.4),(4.8,.1),(5.8,.7)],.28)]
for i,(p,w) in enumerate(roads):path('island_road_'+str(i),p,w)
for x,y in [(.92,-1.95),(-1.4,-4.30)]:
    z=height(x,y)+.16
    for j in range(10):box('bridge_plank',(x-.44+j*.1,y,z),(.085,.42,.07),'woodLight')
    for s in [-1,1]:
        box('bridge_rail',(x,y+s*.22,z+.20),(1.0,.028,.035),'wood')
        for xx in [-.43,.43]:cylinder('bridge_post',(x+xx,y+s*.22,z-.08),.027,.36,'wood',6)
def house(x,y,s=1,angle=0,roof='tile'):
    z=height(x,y);w=.60*s;d=.47*s;h=.52*s
    box('village_house',(x,y,z+h/2),(w,d,h),'wall',angle=angle)
    # Roof ridge runs along Y; all points are rotated around the house origin.
    local=[(-w*.61,-d*.65,h),(w*.61,-d*.65,h),(w*.61,d*.65,h),(-w*.61,d*.65,h),(0,-d*.65,h+.40*s),(0,d*.65,h+.40*s)]
    ca=math.cos(angle);sa=math.sin(angle);vv=[(x+a*ca-b*sa,y+a*sa+b*ca,z+c) for a,b,c in local]
    mesh('gable_roof',vv,[(0,1,4),(3,5,2),(0,4,5,3),(1,2,5,4)],roof)
    for a in [-.17,.17]:
        xx=x+a*s*ca+d*.51*sa;yy=y+a*s*sa-d*.51*ca
        box('cottage_window',(xx,yy,z+h*.62),(.105*s,.023,.13*s),'window',angle=angle)
    box('house_door',(x+d*.52*sa,y-d*.52*ca,z+.13*s),(.115*s,.026,.26*s),'wood',angle=angle)
    box('chimney',(x+w*.3,y,z+h+.3*s),(.10*s,.1*s,.38*s),'wallShade')
    return z
for i,(x,y,s) in enumerate([(2.6,-2.7,1),(3.6,-2.5,.86),(4.55,-2.0,1.1),(2.9,-.65,.75),(4.1,-.6,.85),(5.5,-.25,.8),(1.7,-3.65,.8),(3.2,-3.7,.95),(4.5,-3.35,.75),(5.6,-2.75,.72),(-3.4,-4.1,.77),(-4.0,-3.6,.72)]):house(x,y,s,(noise(i)-.5)*.6,'tileLight' if i%3==0 else 'tile')
# Small village square and fountain.
sx=3.75;sy=-1.55;sz=height(sx,sy)
cylinder('square',(sx,sy,sz+.015),.60,.045,'sand',24)
cylinder('fountain_basin',(sx,sy,sz+.06),.25,.12,'wallShade',16)
cylinder('fountain_water',(sx,sy,sz+.19),.21,.015,'water',16,layer='river')
cylinder('fountain_column',(sx,sy,sz+.19),.052,.28,'wall',8)
for i in range(3):
    x=-4.45+i*.46;y=-2.85;z=height(x,y)+.04
    box('field_bed',(x,y,z),(.37,.85,.05),'soil','nature')
    for j in range(7):box('grain_row',(x,y-.35+j*.115,z+.08),(.30,.032,.13),'crop','nature')

# Pagoda pavilion on the west meadow.
gx=-5.3;gy=-.55;gz=height(gx,gy)
cylinder('gazebo_steps',(gx,gy,gz),.65,.10,'wallShade',8)
for i in range(6):
    a=i*math.tau/6;cylinder('pavilion_column',(gx+.43*math.cos(a),gy+.43*math.sin(a),gz+.10),.037,.66,'wall',8)
cylinder('pavilion_roof',(gx,gy,gz+.78),.66,.39,'gold',6,top=.08)
cylinder('pavilion_tip',(gx,gy,gz+1.16),.06,.25,'roof',6,top=0)

# Timber harbour, plank decks and two moored sailboats.
for a,b in [((6.65,-1.5),(9.4,-1.5)),((8.6,-1.5),(8.6,-3.8)),((7.5,-1.5),(7.5,-3.1))]:
    distance=math.hypot(b[0]-a[0],b[1]-a[1]);steps=int(distance/.15)
    angle=math.atan2(b[1]-a[1],b[0]-a[0])
    for j in range(steps+1):
        t=j/steps;x=a[0]*(1-t)+b[0]*t;y=a[1]*(1-t)+b[1]*t
        box('dock_plank',(x,y,.39),(.135,.45,.07),'woodLight','harbor',angle)
        if j%5==0:
            for side in [-1,1]:cylinder('dock_pile',(x-side*.19*math.sin(angle),y+side*.19*math.cos(angle),-.18),.047,.80,'wood',7,layer='harbor')
def boat(x,y,angle,name):
    ca=math.cos(angle);sa=math.sin(angle)
    def tr(p):a,b,c=p;return(x+a*ca-b*sa,y+a*sa+b*ca,c)
    v=[tr(p) for p in [(-.22,-.52,.19),(.22,-.52,.19),(.27,.3,.19),(0,.67,.23),(-.27,.3,.19),(-.1,-.40,-.08),(.1,-.4,-.08),(0,.48,-.08)]]
    mesh(name+'_hull',v,[(0,1,2,3,4),(0,5,6,1),(1,6,7,3,2),(4,3,7,5,0)],'wood',name)
    cylinder(name+'_mast',(x,y,.18),.022,1.05,'wood',7,layer=name)
    mesh(name+'_sail',[tr(p) for p in [(0,0,1.2),(0,0,.4),(.56,.05,.4)]],[(0,1,2)],'sail',name)
boat(8.03,-2.60,.16,'boat_a');boat(9.15,-3.45,-.25,'boat_b')

# East and south lighthouses, distant rock skerries.
def lighthouse(x,y,z):
    cylinder('lighthouse_base',(x,y,z),.24,.16,'wallShade',12)
    cylinder('lighthouse',(x,y,z+.15),.16,1.05,'wall',12,top=.12)
    cylinder('lantern_balcony',(x,y,z+1.20),.21,.07,'gold',12)
    cylinder('lantern_glass',(x,y,z+1.27),.13,.19,'window',8)
    cylinder('lantern_roof',(x,y,z+1.46),.21,.21,'tile',12,top=.015)
    cylinder('lighthouse_finial',(x,y,z+1.67),.02,.12,'gold',6)
lighthouse(6.45,1.30,height(6.45,1.3));lighthouse(5.0,-4.05,height(5,-4.05))
for i,(x,y,r) in enumerate([(-9,3,1),(-9.8,5,.7),(8.2,7.5,1.2),(-4,-7,.48),(2,9,.6)]):
    cylinder('skerry',(x,y,-.15),r,.8+r*.7,'rock',7,top=r*.35,layer='terrain')
    cylinder('skerry_grass',(x,y,.64+r*.7),r*.38,.06,'grassDark',7,layer='terrain')

# Trees are individually editable in Blender, then batched by material for the browser.
tree_positions=[]
for i in range(190):
    a=i*2.399963;r=.34+.56*noise(i+15);x=8*r*math.cos(a);y=6*r*math.sin(a)
    if ((x+2.3)/2.4)**2+((y-1.3)/2.0)**2<1:continue
    if ((x-3)/2.0)**2+((y-2.55)/1.65)**2<1:continue
    if x>1.3 and y<.3:continue
    if -5.8<x<-3.0 and -3.5<y<.2:continue
    if -.7<x<2.9 and -4.8<y<.1:continue
    tree_positions.append((x,y,height(x,y),.64+.44*noise(i*2)))
tree_positions.extend([(2.4,2.4,3.09,.72),(3.6,2.9,3.09,.83),(2.7,3.35,3.09,.64)])
for i,(x,y,z,s) in enumerate(tree_positions):
    cylinder('tree_trunk',(x,y,z),.043*s,.50*s,'trunk',6,layer='nature')
    if i%4==0:
        for j in range(3):cylinder('pine_crown',(x,y,z+(.30+j*.22)*s),(.34-j*.065)*s,.54*s,'pine',7,top=0,layer='nature',phase=i)
    else:
        ellipsoid('tree_crown',(x,y,z+.65*s),(.34*s,.31*s,.44*s),'leaf' if i%3 else 'leafLight')
        ellipsoid('tree_crown_side',(x+.18*s,y-.05*s,z+.49*s),(.22*s,.23*s,.26*s),'leafLight' if i%3 else 'leaf')
# Shrubs and gold flower patches give the meadow some scale.
for i in range(65):
    a=i*2.39;r=.45+.39*noise(i+210);x=7.8*r*math.cos(a);y=5.8*r*math.sin(a)
    if x>1 and y<1:continue
    ellipsoid('shrub',(x,y,height(x,y)+.1),(.17,.14,.17),'leafLight')
    if i%3==0:ellipsoid('flowers',(x+.13,y,height(x,y)+.14),(.12,.09,.07),'flower')

# Flags are isolated as one browser batch for subtle wind deformation.
for x,y,z in [(cx,cy+.2,cz+4.60),(cx-1.13,cy+.8,cz+2.98)]:
    cylinder('flagpole',(x,y,z-.10),.018,.47,'gold',6)
    mesh('castle_flag',[(x,y,z+.35),(x+.37,y,z+.27),(x,y,z+.15)],[(0,1,2)],'gold','flags')

# Blender viewport ocean; H5 replaces this surface with the animated ocean shader.
mesh('ocean_surface',[(-80,-80,-.06),(80,-80,-.06),(80,80,-.06),(-80,80,-.06)],[(0,1,2,3)],'ocean','ocean')
# One compact vertex/index batch per material + semantic layer, preserving authored geometry.
batches={};triangles=0
for o in created:
    me=o.data;me.calc_loop_triangles()
    for tri in me.loop_triangles:
        key=me.materials[me.polygons[tri.polygon_index].material_index].name.split('Island_')[-1].split('.')[0]
        batch=batches.setdefault((o['layer'],key),{'layer':o['layer'],'material':key,'positions':[],'indices':[]})
        start=len(batch['positions'])//3
        for index in tri.vertices:batch['positions'].extend(round(float(c),4) for c in me.vertices[index].co)
        batch['indices'].extend([start,start+1,start+2]);triangles+=1
out={'version':1,'generator':'Blender '+bpy.app.version_string,'palette':palette,'batches':list(batches.values()),'sourceObjects':len(created),'triangles':triangles,'trees':len(tree_positions),'landmarks':[{'id':'castle','name':'蓝顶城堡','position':[cx,cy,cz+1.5]},{'id':'falls','name':'翡翠瀑布','position':[3.3,1.2,2.1]},{'id':'village','name':'暖阳村庄','position':[3.75,-1.55,1.2]},{'id':'harbor','name':'风帆港湾','position':[8,-2,.5]}]}
folder=ROOT/'experiments/world-lab';folder.mkdir(parents=True,exist_ok=True)
(folder/'island.json').write_text(json.dumps(out,separators=(',',':'),ensure_ascii=False),encoding='utf8')
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        sp=area.spaces.active;sp.region_3d.view_location=(0,0,1.5);sp.region_3d.view_distance=28
        sp.region_3d.view_rotation=Vector((12,-20,18)).to_track_quat('Z','Y');sp.shading.color_type='MATERIAL';sp.overlay.show_overlays=False
archive=ROOT/'assets/world-lab';archive.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(archive/'haqi-island.blend'),copy=True)
print(json.dumps({'objects':len(created),'trees':len(tree_positions),'batches':len(batches),'triangles':triangles,'json_bytes':(folder/'island.json').stat().st_size}))
