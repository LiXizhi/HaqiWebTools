#!/usr/bin/env python3
"""Render boss source models through a running native Paracraft CLI, off-world."""
import argparse
import json
import time
import urllib.request
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
CONTROL = 'HaqiBossArtPreview'


def npl(code):
    request = urllib.request.Request('http://127.0.0.1:8099/ajax/paracraft_cli',
        data=json.dumps({'action': 'run_npl_code', 'params': {'code': code}}).encode(),
        headers={'Content-Type': 'application/json'})
    reply = json.load(urllib.request.urlopen(request, timeout=40))
    if not reply.get('ok') or not reply.get('result', {}).get('ok'):
        raise RuntimeError(str(reply))
    return reply['result'].get('result')


def render(job, folder):
    from PIL import Image
    path = (folder / (job['id'] + '.png')).resolve()
    npl(f'''
NPL.load("(gl)script/ide/Canvas3D.lua");
local ctl=CommonCtrl.GetControl("{CONTROL}");
if(not ctl) then
 ctl=CommonCtrl.Canvas3D:new{{name="{CONTROL}",alignment="_lt",left=-1200,top=0,width=512,height=512,autoRotateSpeed=0,IsActiveRendering=true,miniscenegraphname="{CONTROL}Scene",RenderTargetSize=512,DefaultRotY=-1.57,DefaultLiftupAngle=0.1}};
 ctl:Show(true);
end
ctl:Show(true);ctl:EnableActiveRendering(true);
local obj=ObjEditor.CreateObjectByParams({{AssetFile={json.dumps(job['model'])},IsCharacter=true,PhysicsRadius=100,x=0,y=0,z=0,facing=0,IsPersistent=false,EnablePhysics=false}});
if(not obj or not obj:IsValid()) then error("Boss model is invalid");end
obj:SetField("progress",1);
ctl:ShowModel(obj,false);ctl:SetBackGroundColor("255 255 255 0");
local camera=ParaScene.GetMiniSceneGraph(ctl.resourceName):GetAttributeObjectCamera();
camera:SetField("FarPlane",100000);camera:SetField("NearPlane",0.01);camera:SetField("FieldOfView",0.5236);
return true;
''')
    for _ in range(100):
        time.sleep(.3)
        if npl(f'local c=CommonCtrl.GetControl("{CONTROL}");return ParaScene.GetMiniSceneGraph(c.resourceName):GetObject(c.obj_name):GetPrimaryAsset():IsLoaded();'):
            break
    else:
        raise RuntimeError('Model load timeout: ' + job['model'])
    npl(f'''local c=CommonCtrl.GetControl("{CONTROL}");local s=ParaScene.GetMiniSceneGraph(c.resourceName);local o=s:GetObject(c.obj_name);local bb=o:GetPrimaryAsset():GetBoundingBox({{}});local size=math.max(bb.max_x-bb.min_x,bb.max_y-bb.min_y,bb.max_z-bb.min_z,0.2);s:CameraSetLookAtPos((bb.min_x+bb.max_x)/2,(bb.min_y+bb.max_y)/2,(bb.min_z+bb.max_z)/2);c:CameraSetEyePosByAngle(-1.57,0.1,size*2.8);return true;''')
    time.sleep(3)
    for attempt in range(6):
        npl(f'local c=CommonCtrl.GetControl("{CONTROL}");c:SaveToFile({json.dumps(str(path))},512);return true;')
        image = Image.open(path).convert('RGBA')
        box = image.getbbox()
        if not box:
            raise RuntimeError('Empty native rendering: ' + job['model'])
        if min(box[:2]) > 3 and max(box[2:]) < 509:
            if max(box[2]-box[0], box[3]-box[1]) < 248:
                npl(f'local c=CommonCtrl.GetControl("{CONTROL}");local s=ParaScene.GetMiniSceneGraph(c.resourceName);local a,b,d=s:CameraGetEyePosByAngle();c:CameraSetEyePosByAngle(a,b,d*.8);return true;')
            else:
                return path
        else:
            npl(f'local c=CommonCtrl.GetControl("{CONTROL}");local s=ParaScene.GetMiniSceneGraph(c.resourceName);local a,b,d=s:CameraGetEyePosByAngle();c:CameraSetEyePosByAngle(a,b,d*1.2);return true;')
        time.sleep(.4)
    raise RuntimeError('Unable to frame complete boss model: ' + job['id'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--id', help='Render just one boss job ID')
    parser.add_argument('--out', type=Path, default=APP / '.asset-cache/boss-art/native')
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    jobs = json.loads((APP / 'data/adventure/boss-art-plan.json').read_text())['jobs']
    if args.id:
        jobs = [j for j in jobs if j['id'] == args.id]
        if not jobs:
            parser.error('Unknown boss job ID')
    try:
        for job in jobs:
            output = render(job, args.out)
            print(job['id'], job['name'], output, flush=True)
    finally:
        npl(f'local c=CommonCtrl.GetControl("{CONTROL}");if(c) then c:EnableActiveRendering(false);c:Show(false);end;return true;')
