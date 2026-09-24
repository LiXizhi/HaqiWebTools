"""Render original models to four-direction atlases in an isolated native mini-scene.
No world objects, player appearance or game saves are modified.
"""
import argparse, hashlib, io, json, math, time, urllib.request
from pathlib import Path
from PIL import Image

HERE=Path(__file__).resolve().parent
CONTROL='HaqiMountAtlasPreview'
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))

def npl(code):
    request=urllib.request.Request('http://127.0.0.1:8099/ajax/paracraft_cli',
        data=json.dumps({'action':'run_npl_code','params':{'code':code}}).encode(),headers={'Content-Type':'application/json'})
    reply=json.load(opener.open(request,timeout=45))
    if not reply.get('ok') or not reply.get('result',{}).get('ok'):raise RuntimeError(str(reply))
    return reply['result'].get('result')

def render(job,out):
    key=job['id'];model=json.dumps(job['model'])
    npl(f'''
NPL.load("(gl)script/ide/Canvas3D.lua");
local c=CommonCtrl.GetControl("{CONTROL}");
if(not c) then c=CommonCtrl.Canvas3D:new{{name="{CONTROL}",alignment="_lt",left=-1400,top=0,width=512,height=512,autoRotateSpeed=0,IsActiveRendering=true,miniscenegraphname="{CONTROL}Scene",RenderTargetSize=512,DefaultRotY=0,DefaultLiftupAngle=0.35}};c:Show(true);end
c:Show(true);c:EnableActiveRendering(true);
local o=ObjEditor.CreateObjectByParams({{AssetFile={model},IsCharacter=true,PhysicsRadius=1,x=0,y=0,z=0,facing=0,IsPersistent=false,EnablePhysics=false}});
if(not o or not o:IsValid()) then error("Invalid original model");end
o:SetName("mount-original");o:SetField("progress",1);c:ShowModel(o,false);c:SetBackGroundColor("255 255 255 0");
local camera=ParaScene.GetMiniSceneGraph(c.resourceName):GetAttributeObjectCamera();
camera:SetField("FarPlane",100000);camera:SetField("NearPlane",0.01);camera:SetField("FieldOfView",0.5236);
return true;
''')
    for _ in range(100):
        if npl(f'local c=CommonCtrl.GetControl("{CONTROL}");return ParaScene.GetMiniSceneGraph(c.resourceName):GetObject(c.obj_name):GetPrimaryAsset():IsLoaded();'):break
        time.sleep(.3)
    else:raise RuntimeError('Model download timed out')
    bb=npl(f'local c=CommonCtrl.GetControl("{CONTROL}");local s=ParaScene.GetMiniSceneGraph(c.resourceName);local o=s:GetObject(c.obj_name);o:SetFacing(0);return o:GetPrimaryAsset():GetBoundingBox({{min_x=-1,max_x=1,min_y=0,max_y=2,min_z=-1,max_z=1}});')
    size=max(bb['max_x']-bb['min_x'],bb['max_y']-bb['min_y'],bb['max_z']-bb['min_z'],.2)
    center=[(bb['max_'+axis]+bb['min_'+axis])/2 for axis in 'xyz']
    distance=size*2.6
    npl(f'local c=CommonCtrl.GetControl("{CONTROL}");local s=ParaScene.GetMiniSceneGraph(c.resourceName);s:CameraSetLookAtPos({center[0]},{center[1]},{center[2]});return true;')
    # Verified against Smilodon front face; every model gets four independent views.
    angles=[-math.pi/2,0,math.pi,math.pi/2]
    frames=[]
    for attempt in range(10):
        frames=[]
        for i,angle in enumerate(angles):
            path=(out/f'{key}-{i}.png').resolve().as_posix()
            npl(f'local c=CommonCtrl.GetControl("{CONTROL}");c:CameraSetEyePosByAngle({angle},0.35,{distance});local s=ParaScene.GetMiniSceneGraph(c.resourceName);s:EnableActiveRendering(false);s:Draw(0);return true;')
            time.sleep(.45 if attempt else 1)
            npl(f'local c=CommonCtrl.GetControl("{CONTROL}");local s=ParaScene.GetMiniSceneGraph(c.resourceName);s:EnableActiveRendering(false);s:Draw(0.1);c:SaveToFile({json.dumps(path)},512);return true;')
            image=Image.open(path).convert('RGBA');box=image.getbbox()
            if not box:
                for retry in range(6):
                    time.sleep(.5)
                    npl(f'local c=CommonCtrl.GetControl("{CONTROL}");local s=ParaScene.GetMiniSceneGraph(c.resourceName);s:Draw(0);c:SaveToFile({json.dumps(path)},512);return true;')
                    image=Image.open(path).convert('RGBA');box=image.getbbox()
                    if box:break
                if not box:raise RuntimeError('Empty rendering')
            frames.append(image)
        boxes=[im.getbbox() for im in frames]
        if all(min(b[:2])>8 and max(b[2:])<504 for b in boxes):break
        distance*=1.25
    else:raise RuntimeError('Clipped rendering')
    atlas=Image.new('RGBA',(768,768))
    for i,im in enumerate(frames):atlas.paste(im.resize((384,384),Image.Resampling.LANCZOS),(i%2*384,i//2*384))
    for opts in ({'lossless':True},*({'quality':q} for q in (94,90,85,80,70))):
        stream=io.BytesIO();atlas.save(stream,format='WEBP',method=4,exact=True,**opts);raw=stream.getvalue()
        if len(raw)<=200000:break
    assert len(raw)<=200000
    sha=hashlib.sha256(raw).hexdigest();local=f'assets/{key}-{sha[:12]}.webp';(HERE/local).write_bytes(raw)
    return dict(local=local,cdn=None,width=768,height=768,columns=2,rows=2,bytes=len(raw),sha256=sha,
        source={'method':'original-model-mini-scene','model':job['model'],'originalAsset':job['originalAsset']},
        camera={'angles':angles,'elevation':.35,'distance':distance,'lookAt':center,'bounds':bb},
        frameBounds=[[v/512 for v in b] for b in boxes])

def main():
    p=argparse.ArgumentParser();p.add_argument('--id');p.add_argument('--retry',action='store_true');args=p.parse_args()
    out=HERE/'native-cache';out.mkdir(exist_ok=True)
    jobs=json.loads((HERE/'original-catalog.json').read_text(encoding='utf-8'))['jobs']
    path=HERE/'native-assets.json';assets=json.loads(path.read_text()) if path.exists() else {}
    failures={}
    for job in jobs:
        if args.id and job['id']!=args.id:continue
        if job['id'] in assets:continue
        try:
            assets[job['id']]=render(job,out)
            path.write_text(json.dumps(assets,ensure_ascii=False,indent=2),encoding='utf-8')
            print('OK',job['id'],job['name'],assets[job['id']]['bytes'],flush=True)
        except Exception as e:
            failures[job['id']]=str(e);print('FAILED',job['id'],str(e)[:200],flush=True)
        (HERE/'native-failures.json').write_text(json.dumps(failures,ensure_ascii=False,indent=2),encoding='utf-8')
    npl(f'local c=CommonCtrl.GetControl("{CONTROL}");if(c)then c:EnableActiveRendering(false);c:Show(false);end;return true;')

if __name__=='__main__':main()
