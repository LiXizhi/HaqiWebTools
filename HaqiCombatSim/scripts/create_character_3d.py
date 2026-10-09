"""Run in Blender via MCP. Creates an isolated scene and exports a small native mesh JSON.
Coordinates: Z up, front -Y. No external assets or generation service required.
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector, Quaternion

ROOT = Path(__file__).resolve().parents[1]
scene = bpy.data.scenes.new('Haqi Character Lab · Reference Study')
bpy.context.window.scene = scene
materials = {}
objects = {}
palette = {'skin':'f6c5a2','hair':'553326','hairLight':'714a35','hairDark':'3d281f','coat':'203d56','gold':'b78b48','cream':'f1ddb0','leather':'68452b','eye':'301f1b','iris':'88532e','white':'fff6e5','gem':'20bce9','gemLight':'b7f4ff','cape':'273e50','blush':'e7ac94'}
def material(key):
    if key not in materials:
        h=palette[key]; rgb=[int(h[i:i+2],16)/255 for i in (0,2,4)]
        m=bpy.data.materials.new('Haqi_'+key); m.use_nodes=True
        p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
        # Blender shader inputs are scene-linear; JSON palette remains sRGB.
        linear=[c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in rgb]
        p.inputs['Base Color'].default_value=(*linear,1)
        p.inputs['Roughness'].default_value=.68
        m.diffuse_color=(*linear,1); materials[key]=m
    return materials[key]
def group(name,loc=(0,0,0),parent=None):
    o=bpy.data.objects.new(name,None); scene.collection.objects.link(o); o.location=loc; o.parent=parent; o['lab_name']=name; objects[name]=o; return o
root=group('root'); body=group('body',parent=root); head=group('head',(0,0,1.91),body)
def mesh(name,verts,faces,key,parent,loc=(0,0,0),smooth=True):
    me=bpy.data.meshes.new(name); me.from_pydata(verts,[],faces); me.update()
    # Weld UV seam/pole duplicates so exported normals stay smooth under browser lights.
    bm=bmesh.new();bm.from_mesh(me);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001);bm.to_mesh(me);bm.free();me.update()
    o=bpy.data.objects.new(name,me); scene.collection.objects.link(o); o.parent=parent; o.location=loc
    me.materials.append(material(key)); o['slot']=key; o['lab_name']=name; objects[name]=o
    for p in me.polygons:p.use_smooth=smooth
    return o
def ell(name,loc,scale,key,parent,seg=24,rings=14):
    v=[]; f=[]
    for j in range(rings+1):
        t=math.pi*j/rings
        for i in range(seg):
            a=2*math.pi*i/seg; v.append((scale[0]*math.sin(t)*math.cos(a),scale[1]*math.sin(t)*math.sin(a),scale[2]*math.cos(t)))
    for j in range(rings):
        for i in range(seg):
            a=j*seg+i; b=j*seg+(i+1)%seg; f.append((a,a+seg,b+seg,b))
    return mesh(name,v,f,key,parent,loc)
def rings_mesh(name,levels,key,parent,seg=32):
    v=[];f=[]
    for z,rx,ry,cy in levels:
        for i in range(seg):
            a=i*2*math.pi/seg;v.append((rx*math.cos(a),cy+ry*math.sin(a),z))
    for j in range(len(levels)-1):
        for i in range(seg):
            a=j*seg+i;b=j*seg+(i+1)%seg;f.append((a,b,b+seg,a+seg))
    f.extend([tuple(reversed(range(seg))),tuple(range((len(levels)-1)*seg,len(levels)*seg))])
    return mesh(name,v,f,key,parent)
def strand(name,points,width,key,parent):
    v=[];f=[]; steps=9; sides=8
    p0,p1,p2=map(Vector,points)
    for j in range(steps+1):
        t=j/steps; c=(1-t)**2*p0+2*t*(1-t)*p1+t*t*p2
        tangent=((p1-p0)*(1-t)+(p2-p1)*t).normalized()
        axis=tangent.cross(Vector((0,1,0))).normalized(); other=tangent.cross(axis).normalized()
        w=width*(math.sin(math.pi*(.15+.85*t))**.7) if j<steps else .002
        for i in range(sides):
            a=i*math.tau/sides;v.append(tuple(c+axis*(math.cos(a)*w)+other*(math.sin(a)*w*.52)))
    for j in range(steps):
        for i in range(sides):
            a=j*sides+i;b=j*sides+(i+1)%sides;f.append((a,b,b+sides,a+sides))
    return mesh(name,v,f,key,parent)

def piping(name,points,radius,key,parent):
    """Small continuous seams, eyelids and stitched details."""
    v=[];f=[]
    points=list(map(Vector,points)); sides=8
    for j,p in enumerate(points):
        tangent=(points[min(j+1,len(points)-1)]-points[max(0,j-1)]).normalized()
        normal=tangent.cross(Vector((0,1,0)))
        if normal.length<.01:normal=tangent.cross(Vector((1,0,0)))
        normal.normalize();other=tangent.cross(normal)
        for i in range(sides):
            a=i*math.tau/sides;v.append(tuple(p+radius*(normal*math.cos(a)+other*math.sin(a))))
    for j in range(len(points)-1):
        for i in range(sides):
            a=j*sides+i;b=j*sides+(i+1)%sides;f.append((a,b,b+sides,a+sides))
    return mesh(name,v,f,key,parent)

def lock(name,points,width,depth=.045,key='hair',normal=(0,-1,0)):
    """A swept, tapered hair blade with a shallow ridge, not a round tube."""
    p0,p1,p2=map(Vector,points);v=[];f=[];steps=14;sides=10
    for j in range(steps+1):
        t=j/steps;c=(1-t)**2*p0+2*t*(1-t)*p1+t*t*p2
        tangent=((p1-p0)*(1-t)+(p2-p1)*t).normalized()
        across=tangent.cross(Vector(normal)).normalized();out=across.cross(tangent).normalized()
        taper=max(.002,(1-t)**.88*(.8+.35*math.sin(math.pi*t)))
        for i in range(sides):
            a=i*math.tau/sides
            v.append(tuple(c+across*(math.cos(a)*width*taper)+out*(math.sin(a)*depth*taper)))
    for j in range(steps):
        for i in range(sides):
            a=j*sides+i;b=j*sides+(i+1)%sides;f.append((a,a+sides,b+sides,b))
    f.append(tuple(reversed(range(sides))))
    return mesh(name,v,f,key,hair)

# Rounded cheeks, a narrower chin and a flatter forehead than the first sphere.
face=ell('face',(0,0,0),(.585,.425,.49),'skin',head,48,32)
for v in face.data.vertices:
    z=v.co.z
    if z<-.10:v.co.x*=1-.18*((-z-.10)/.39)
    if v.co.y<0:v.co.y*=1.03
face.data.update()
def face_y(x,z):
    taper=1-.18*max(0,(-z-.10)/.39)
    return -.43775*math.sqrt(max(.015,1-(x/(.585*taper))**2-(z/.49)**2))
for s in (-1,1):
    ell('ear'+str(s),(s*.559,.005,-.105),(.087,.079,.13),'skin',head)
    ell('ear_inner'+str(s),(s*.586,-.058,-.104),(.037,.020,.071),'blush',head)
    ex=s*.225;ez=-.073;ey=face_y(ex,ez)-.009
    eye=group('eye'+str(s),(ex,ey,ez),head)
    # Eye whites follow the cheek surface and taper to almond corners.
    v=[(0,-.013,0)];f=[]
    for i in range(48):
        a=i*math.tau/48;x=.104*math.cos(a);z=(.087 if math.sin(a)>0 else .069)*math.sin(a)
        y=face_y(ex+x,ez+z)-ey-.009
        v.append((x,y,z))
    for i in range(48):f.append((0,i+1,(i+1)%48+1))
    mesh('eye_white'+str(s),v,f,'white',eye)
    # Iris surface also wraps around the head so it does not sit in front like a button.
    for name,rx,rz,offset,key in [('iris',.060,.076,.018,'iris'),('pupil',.034,.056,.024,'eye')]:
        v=[(0,face_y(ex,ez)-ey-offset,-.004)];f=[]
        for i in range(32):
            a=i*math.tau/32;x=rx*math.cos(a);z=rz*math.sin(a)-.004
            v.append((x,face_y(ex+x,ez+z)-ey-offset,z))
        for i in range(32):f.append((0,i+1,(i+1)%32+1))
        mesh(name+str(s),v,f,key,eye)
    ell('eye_glint'+str(s),(-.020,face_y(ex-.020,ez+.027)-ey-.034,.027),(.018,.008,.021),'white',eye,12,8)
    ell('eye_glint_small'+str(s),(.020,face_y(ex+.020,ez-.04)-ey-.030,-.04),(.008,.006,.010),'cream',eye,10,6)
    points=[]
    for i in range(17):
        a=math.pi*i/16;x=.105*math.cos(a);z=.088*math.sin(a)
        points.append((x,face_y(ex+x,ez+z)-ey-.015,z))
    piping('upper_lid'+str(s),points,.010,'eye',eye)
    brow=[]
    for i in range(9):
        x=s*(.125+i*.023);z=.115+.025*math.sin(i/8*math.pi)
        brow.append((x,face_y(x,z)-.008,z))
    piping('brow'+str(s),brow,.010,'hair',head)
    ell('cheek'+str(s),(s*.335,face_y(s*.335,-.19)-.002,-.19),(.052,.006,.018),'blush',head,20,10)
ell('nose',(0,-.424,-.168),(.025,.027,.036),'skin',head)
piping('smile',[(-.042,-.363,-.283),(-.018,-.369,-.291),(.008,-.369,-.291),(.036,-.360,-.282)],.006,'leather',head)

hair=group('hair',parent=head)
# Full scalp with a high forehead hairline and lower nape, unlike the old flat cap.
v=[];f=[];seg=64;rows=18
for j in range(rows+1):
    t=j/rows
    for i in range(seg):
        a=i*math.tau/seg;front=max(0,-math.sin(a));bottom=1.99-.73*front
        p=.012+t*bottom
        v.append((.603*math.sin(p)*math.cos(a),.456*math.sin(p)*math.sin(a)+.035,.545*math.cos(p)+.055))
for j in range(rows):
    for i in range(seg):
        a=j*seg+i;b=j*seg+(i+1)%seg;f.append((a,a+seg,b+seg,b))
mesh('hair_scalp',v,f,'hair',hair)
# Multiple little outward flicks form the irregular silhouette of the reference.
for s in (-1,1):
    silhouette=[((.30,.07,.48),(.54,.02,.55),(.63,.00,.61),.15),
        ((.43,-.02,.34),(.67,-.06,.38),(.76,-.03,.44),.14),
        ((.49,-.06,.18),(.67,-.13,.19),(.79,-.10,.22),.13),
        ((.50,-.06,.035),(.66,-.13,.02),(.75,-.09,-.035),.12),
        ((.49,.005,-.10),(.62,-.04,-.13),(.65,-.01,-.23),.11),
        ((.46,.07,-.19),(.55,.03,-.26),(.57,.06,-.33),.085)]
    for i,(p0,p1,p2,w) in enumerate(silhouette):
        # Small asymmetry is deliberate: the supplied hairstyle is not mirrored.
        pts=[(s*x,y,z) for x,y,z in (p0,p1,p2)]
        # Shift each tip separately: the silhouette is a tousled sweep, not a starburst.
        tip=pts[2];variation=math.sin(i*2.1+s*.8)
        pts[2]=(tip[0]*(.92+.055*variation),tip[1]-.055,tip[2]+.065*variation)
        mid=pts[1];pts[1]=(mid[0]*.96,mid[1]-.03,mid[2]-.045)
        lock('temple_flick_%s_%s'%(s,i),pts,w*.83,.028,'hair')
# Swept diagonal bangs leave the eye line readable.
bangs=[((-.27,-.27,.44),(-.49,-.40,.32),(-.56,-.33,.12),.115),
    ((-.09,-.36,.49),(-.30,-.48,.25),(-.49,-.37,.005),.14),
    ((.06,-.38,.49),(-.03,-.48,.22),(-.30,-.44,.005),.135),
    ((.22,-.34,.47),(.20,-.48,.27),(-.02,-.47,.070),.12),
    ((.33,-.25,.43),(.43,-.42,.25),(.27,-.44,.025),.13),
    ((.46,-.12,.33),(.56,-.30,.10),(.46,-.28,-.14),.095),
    ((-.39,-.26,.29),(-.59,-.31,.14),(-.64,-.27,-.005),.082),
    ((-.43,-.23,.17),(-.60,-.29,.03),(-.54,-.25,-.18),.071)]
for i,(p0,p1,p2,w) in enumerate(bangs):lock('bang_%02d'%i,[p0,p1,p2],w,.04,'hair')
# Short crown blades radiate from an off-centre whorl; no rounded topknot.
crown=[((.25,.00,.48),(.12,-.09,.68),(-.19,-.02,.70),.12),
    ((.22,.04,.48),(.18,.02,.73),(-.015,.07,.79),.10),
    ((.27,.08,.43),(.41,.00,.66),(.24,.01,.71),.105),
    ((.18,-.15,.50),(-.07,-.27,.60),(-.39,-.20,.53),.12),
    ((.07,-.23,.51),(-.20,-.34,.49),(-.46,-.24,.39),.12),
    ((.26,-.12,.49),(.45,-.23,.44),(.54,-.14,.37),.115),
    ((-.07,-.10,.49),(-.30,-.19,.58),(-.56,-.10,.49),.085),
    ((-.20,-.10,.41),(-.43,-.17,.44),(-.62,-.09,.35),.088),
    ((.28,.02,.46),(.49,-.04,.54),(.60,.01,.50),.079)]
for i,(p0,p1,p2,w) in enumerate(crown):lock('crown_%02d'%i,[p0,p1,p2],w,.035,'hairLight' if i in (0,3) else 'hair')
# Back and side layers wrap around the skull down to the nape.
for row in range(3):
    for i in range(13):
        a=-.10+i*(math.pi+.20)/12
        x=math.cos(a);y=math.sin(a);z=.38-row*.21
        pts=[(x*(.39+row*.065),y*.35+.04,z+.12),(x*.60,y*.48+.04,z),(x*(.62-row*.015),y*.47+.06,z-.18)]
        lock('back_%s_%s'%(row,i),pts,.115,.025,'hair',normal=(x,y,.25))
# Fine warm streaks on selected frontal blades, as sculpted lines not broad stripes.
for i,(p0,p1,p2,w) in enumerate(bangs):
    p0,p1,p2=map(Vector,(p0,p1,p2));pts=[]
    for j in range(9):
        t=.18+j*.064;p=(1-t)**2*p0+2*t*(1-t)*p1+t*t*p2;p.y-=.034*(1-t);pts.append(tuple(p))
    piping('hair_streak_%s'%i,pts,.0045,'hairLight',hair)

# Cream shirt, navy open jacket, flared split tails and narrow gold piping.
ell('neck',(0,0,1.45),(.12,.12,.13),'skin',body)
rings_mesh('shirt',[(.79,.23,.155,0),(1.05,.215,.16,0),(1.28,.265,.16,0),(1.43,.125,.105,0)],'cream',body)
ell('neck_scarf',(0,-.085,1.397),(.146,.065,.056),'cream',body)
# Curved side/back shell connects the tailored front panels around the torso.
v=[];f=[];cols=28
for z,rx,ry in [(.81,.355,.195),(.95,.25,.184),(1.10,.255,.182),(1.29,.285,.177),(1.38,.17,.125)]:
    for i in range(cols+1):
        a=-.40+i*(math.pi+.80)/cols;v.append((rx*math.cos(a),ry*math.sin(a),z))
for j in range(4):
    for i in range(cols):
        a=j*(cols+1)+i;f.append((a,a+1,a+cols+2,a+cols+1))
mesh('jacket_back_sides',v,f,'coat',body)
piping('jacket_back_hem',v[:cols+1],.012,'gold',body)
for s in (-1,1):
    outline=[(s*.10,-.127,1.43),(s*.27,-.115,1.34),(s*.32,-.12,1.12),(s*.385,-.16,.83),(s*.255,-.23,.77),(s*.085,-.20,.89),(s*.07,-.184,1.13)]
    panel=outline+[(x,y+.028,z) for x,y,z in outline];count=len(outline)
    faces=[tuple(range(count)),tuple(reversed(range(count,count*2)))]
    faces.extend((i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count))
    mesh('jacket_front'+str(s),panel,faces,'coat',body,smooth=False)
    piping('jacket_gold_edge'+str(s),[tuple(Vector(p)+Vector((0,-.008,0))) for p in outline+[outline[0]]],.014,'gold',body)
    piping('jacket_stitch'+str(s),[(s*.265,-.15,1.28),(s*.265,-.18,1.10),(s*.33,-.205,.88)],.006,'cream',body)
    # Cream folded lapels remain compact, rather than the old long gold leaves.
    mesh('collar'+str(s),[(s*.08,-.14,1.43),(s*.18,-.158,1.36),(s*.092,-.19,1.26),(s*.042,-.17,1.38)],[(0,1,2,3)],'cream',body)
    piping('collar_edge'+str(s),[(s*.18,-.165,1.36),(s*.092,-.198,1.26)],.009,'gold',body)
rings_mesh('belt',[(.94,.235,.180,0),(1.005,.235,.181,0)],'leather',body)
mesh('buckle',[(-.051,-.192,.947),(.051,-.192,.947),(.051,-.192,1.006),(-.051,-.192,1.006)],[(0,1,2,3)],'gold',body)
mesh('buckle_inset',[(-.031,-.199,.960),(.031,-.199,.960),(.031,-.199,.993),(-.031,-.199,.993)],[(0,1,2,3)],'leather',body)
for z in (1.10,1.20,1.29):ell('shirt_button'+str(z),(0,-.173,z),(.011,.011,.012),'gold',body,10,6)
for s in (-1,1):
    leg=group('leg'+str(s),(s*.13,0,.81),root)
    ell('trousers'+str(s),(0,0,-.175),(.101,.115,.235),'leather',leg)
    shin=group('shin'+str(s),(0,0,-.33),leg)
    rings_mesh('boot_shaft'+str(s),[(-.335,.102,.118,-.006),(-.19,.095,.109,0),(-.02,.104,.12,0)],'leather',shin,24)
    ell('toe'+str(s),(0,-.065,-.39),(.11,.166,.087),'leather',shin)
    ell('boot_sole'+str(s),(0,-.068,-.437),(.111,.163,.035),'hairDark',shin)
    rings_mesh('boot_cuff'+str(s),[(-.05,.109,.127,0),(.005,.114,.13,0)],'gold',shin,24)
    piping('boot_seam'+str(s),[(0,-.126,-.055),(0,-.114,-.22),(0,-.147,-.35)],.007,'gold',shin)
    arm=group('arm'+str(s),(s*.295,0,1.32),body)
    ell('sleeve'+str(s),(s*.058,0,-.135),(.109,.119,.197),'coat',arm)
    # Flat tailored shoulder panels replace the spherical epaulettes.
    mesh('shoulder_panel'+str(s),[(s*-.025,-.112,.025),(s*.105,-.106,.012),(s*.143,-.08,-.102),(s*.02,-.12,-.10)],[(0,1,2,3)],'coat',arm)
    piping('shoulder_seam'+str(s),[(s*-.025,-.118,.025),(s*.105,-.112,.012),(s*.143,-.086,-.102)],.010,'gold',arm)
    fore=group('forearm'+str(s),(s*.095,0,-.26),arm)
    ell('cuff_sleeve'+str(s),(0,-.01,-.083),(.085,.09,.121),'coat',fore)
    rings_mesh('wrist_trim'+str(s),[(-.181,.091,.096,-.012),(-.127,.089,.094,-.012)],'gold',fore,24)
    ell('hand'+str(s),(0,-.032,-.231),(.071,.065,.079),'skin',fore)
    ell('thumb'+str(s),(-s*.051,-.064,-.204),(.027,.034,.047),'skin',fore,16,10)
    if s==-1:
        gem=group('crystal',(s*.048,-.117,-.09),arm)
        outline=[(0,-.023,.153),(.084,-.023,.017),(0,-.023,-.119),(-.084,-.023,.017)]
        mesh('crystal_mount',outline,[(0,1,2,3)],'hairDark',gem)
        piping('crystal_rim',outline+[outline[0]],.009,'gold',gem)
        mesh('crystal_gem',[(0,-.036,.12),(.057,-.036,.016),(0,-.036,-.084),(-.057,-.036,.016),(0,-.097,.022)],[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],'gem',gem,smooth=False)
        mesh('crystal_shine',[(0,-.039,.107),(-.037,-.041,.028),(0,-.100,.025)],[(0,1,2)],'gemLight',gem,smooth=False)
cape=group('cape',(0,.13,1.38),body)
v=[];f=[]
for j in range(9):
    t=j/8
    for i in range(17):
        u=i/16*2-1;v.append((u*(.22+.20*t),.02+.16*t+.026*math.cos(u*math.pi*3)*t,-.57*t+.07*u*u*t))
for j in range(8):
    for i in range(16):
        a=j*17+i;f.append((a,a+1,a+18,a+17))
mesh('cape_cloth',v,f,'cape',cape)
piping('cape_hem',v[-17:],.012,'gold',cape)

# Match the reference's short legs while keeping soles on the display surface.
body.location.z=-.155
for s in (-1,1):
    objects['leg'+str(s)].location.z=.655
    objects['leg'+str(s)].scale.z=.80
# Slightly broader face/hair; head-size UI multiplies this authored rest scale.
head.scale=(1.055,1.02,1.055)

# Export rest hierarchy before authoring Blender preview keyframes.
out={'version':2,'generator':'Blender '+bpy.app.version_string,'palette':palette,'nodes':[]}
for o in scene.objects:
    n={'name':o['lab_name'],'parent':o.parent['lab_name'] if o.parent else None,'position':list(o.location),'rotation':list(o.rotation_euler),'scale':list(o.scale)}
    if o.type=='MESH':
        o.data.calc_loop_triangles();n.update(slot=o['slot'],positions=[round(c,5) for v in o.data.vertices for c in v.co],indices=[i for t in o.data.loop_triangles for i in t.vertices],flat=not any(p.use_smooth for p in o.data.polygons))
    out['nodes'].append(n)
folder=ROOT/'experiments/character-lab';folder.mkdir(parents=True,exist_ok=True)
(folder/'hero.json').write_text(json.dumps(out,separators=(',',':')),encoding='utf8')
scene.render.fps=30;scene.frame_start=1;scene.frame_end=120
scene.timeline_markers.new('Idle',frame=1);scene.timeline_markers.new('Walk',frame=61)
for frame in range(1,122):
    t=(frame-1)/30; walking=frame>=61; a=math.sin(t*math.tau*1.3)
    root.location.z=.018*math.sin(t*2) if not walking else .025*(1-math.cos(t*math.tau*2.6))
    root.keyframe_insert('location',frame=frame)
    for s in (-1,1):
        for name,factor in [('leg',.48),('arm',-.38)]:
            o=objects[name+str(s)];o.rotation_euler.x=s*a*factor if walking else .035*math.sin(t*2+s);o.keyframe_insert('rotation_euler',frame=frame)
scene.frame_set(1)
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_location=(0,0,1.35)
        area.spaces.active.region_3d.view_distance=4.5
        from mathutils import Euler
        area.spaces.active.region_3d.view_rotation=Euler((math.radians(78),0,math.radians(-12))).to_quaternion()
        area.spaces.active.shading.color_type='MATERIAL'
        area.spaces.active.overlay.show_overlays=False
archive=ROOT/'assets/character-lab';archive.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(archive/'hero.blend'),copy=True)
print('Exported',len(out['nodes']),'nodes;',sum(len(n.get('indices',[]))//3 for n in out['nodes']),'triangles')
