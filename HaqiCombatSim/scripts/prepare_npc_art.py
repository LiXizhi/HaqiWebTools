"""Original NPC PNGs / native offscreen models -> individual 256x256, <48,000 byte WebPs.

Native rendering uses the documented Paracraft run_npl_code API, never the world scene.
Run the project's paracraft-cli-530 launcher before preparing missing model portraits.
Upload assets/adventure/npcs with the existing CDN uploader; use --verify-upload-log
to record only returned URLs whose bytes and CORS have actually been checked.
"""
import argparse, concurrent.futures, hashlib, io, json, math, re, time, urllib.request, xml.etree.ElementTree as ET, zipfile, zlib
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

APP=Path(__file__).resolve().parents[1]
ROOT=APP.parents[1]
CACHE=APP/'.asset-cache/npc-originals'
OUT=APP/'data/adventure/npc-art.json'
LIMIT=48000
SIZE=256
RENDER_SIZE=512
digest=lambda raw:hashlib.sha256(raw).hexdigest()
p=argparse.ArgumentParser()
p.add_argument('--verify-upload-log',type=Path)
p.add_argument('--check',action='store_true')
p.add_argument('--preview',help='Prepare only a named NPC without replacing the runtime manifest')
args=p.parse_args()

def check(manifest):
    for entry in manifest['entries'].values():
        raw=(APP/entry['local']).read_bytes()
        assert 0<len(raw)<LIMIT and len(raw)==entry['size']
        assert digest(raw)==entry['sha256']
        im=Image.open(io.BytesIO(raw));assert im.format=='WEBP' and im.mode=='RGBA' and im.getbbox()
        assert im.getchannel('A').getextrema()[0]==0
        assert im.size==(SIZE,SIZE)
    print('Verified',len(manifest['entries']),'WebPs; maximum',max((e['size'] for e in manifest['entries'].values()),default=0),'bytes',flush=True)

if args.verify_upload_log or args.check:
    manifest=json.loads(OUT.read_text(encoding='utf8'));check(manifest)
    if args.verify_upload_log:
        import re
        urls=re.findall(r'https://cdn\.keepwork\.com/[^\s]+\.webp',args.verify_upload_log.read_text(encoding='utf8'))
        by_name={url.rsplit('/',1)[-1]:url for url in urls}
        def verify(entry):
            url=by_name[Path(entry['local']).name]
            with urllib.request.urlopen(url,timeout=60) as response:
                assert response.headers.get('Access-Control-Allow-Origin')=='*'
                assert digest(response.read())==entry['sha256']
            return url
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            verified=list(pool.map(verify,manifest['entries'].values()))
        for entry,url in zip(manifest['entries'].values(),verified):entry['cdn']=url
        OUT.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        print('Verified CDN bytes and CORS:',len(verified),flush=True)
    raise SystemExit()

CACHE.mkdir(parents=True,exist_ok=True)
sources={}
for line in (ROOT/'assets_manifest.txt').read_text(encoding='utf8').splitlines():
    path,md5,size=line.rsplit(',',2)
    if not size.isdigit():continue
    if path[:-2].lower() not in sources or path.endswith('.p'):
        sources[path[:-2].lower()]=dict(entry=line,md5=md5,size=int(size),path=path)
catalog=json.loads((APP/'data/adventure/npc-catalog.json').read_text(encoding='utf8'))
manifest=dict(version=2,byteLimit=LIMIT,minResolution=SIZE,entries={},instances={},sources={},hidden=[],renderFailures=[])
jobs={}
for npc in catalog['npcs']:
    if args.preview and npc['name']!=args.preview:continue
    node=ET.fromstring(npc['sourceXml']);char=node.find('assetfile_char');prop=node.find('assetfile_model')
    model=npc['model'];is_char=bool(model and '/dummy/' not in model.lower())
    ccs=char.get('ccsinfo','') if char is not None and is_char else ''
    # Champion appearance comes from the live ranking; retain its original plinth.
    if npc['id']==30424 and not ccs:is_char=False
    if not is_char:model=prop.get('filename','') if prop is not None and prop.get('skiprender_mesh')!='true' else ''
    if not model:
        manifest['instances'][npc['instanceId']]={'visible':False,'reason':'original-invisible-trigger'}
        manifest['hidden'].append({'instanceId':npc['instanceId'],'name':npc['name']});continue
    spec=dict(model=model,ccs=ccs,isCharacter=is_char)
    key=digest(json.dumps(spec,sort_keys=True).encode())[:20]
    job=jobs.setdefault(key,dict(key=key,**spec,npcs=[]));job['npcs'].append(npc)

def original_image(path):
    row=dict(sources[path]);file=CACHE/row['md5']
    if file.exists():raw=file.read_bytes()
    else:
        raw=urllib.request.urlopen('https://cdn.keepwork.com/update61/assetdownload/update/'+row['entry'],timeout=60).read();file.write_bytes(raw)
    assert len(raw)==row['size'] and hashlib.md5(raw).hexdigest()==row['md5']
    row['sha256']=digest(raw)
    if row['path'].endswith('.z'):
        if raw.startswith(b'PK'):
            with zipfile.ZipFile(io.BytesIO(raw)) as archive:raw=archive.read(archive.namelist()[0])
        else:raw=zlib.decompress(raw)
    return Image.open(io.BytesIO(raw)).convert('RGBA'),row

def npl(code):
    request=urllib.request.Request('http://127.0.0.1:8099/ajax/paracraft_cli',data=json.dumps({'action':'run_npl_code','params':{'code':code}}).encode(),headers={'Content-Type':'application/json'})
    reply=json.load(urllib.request.urlopen(request,timeout=40))
    if not reply.get('ok') or not reply['result'].get('ok'):raise RuntimeError(str(reply))
    return reply['result'].get('result')

def render(job):
    path=CACHE/(job['key']+'-hd512-v2-native.png')
    legacy=CACHE/(job['key']+'-hd512-native.png')
    if not path.exists() and legacy.exists() and job['isCharacter']:
        previous=Image.open(legacy).convert('RGBA');b=previous.getbbox()
        if b and min(b[:2])>4 and max(b[2:])<RENDER_SIZE-4 and max(b[2]-b[0],b[3]-b[1])>=SIZE:
            path.write_bytes(legacy.read_bytes())
    if path.exists():
        image=Image.open(path).convert('RGBA')
        if not image.getbbox():raise RuntimeError('Empty native render: '+job['model'])
        return image
    # Lua strings are JSON literals here: model/CCS data contain no Lua source.
    model=json.dumps(job['model']);character=str(job['isCharacter']).lower()
    # NPC.lua L464-470 uses a structured appearance, not Pet's serialized CCS string.
    appearance=''
    if job['ccs']:
        facial=re.search(r"facial_info\s*=\s*['\"]([^'\"]*)",job['ccs'])
        cartoon=re.search(r"cartoonface_info\s*=\s*['\"]([^'\"]*)",job['ccs'])
        equips=re.findall(r'\[(\d+)\]\s*=\s*(\d+)',job['ccs'])
        if cartoon:appearance+=f'Map3DSystem.UI.CCS.DB.ApplyCartoonfaceInfoString(obj,{json.dumps(cartoon[1])});'
        if facial:appearance+=f'Map3DSystem.UI.CCS.Predefined.ApplyFacialInfoString(obj,{json.dumps(facial[1])});'
        appearance+='for i=0,45 do obj:ToCharacter():SetCharacterSlot(i,0);end;'
        appearance+=''.join(f'obj:ToCharacter():SetCharacterSlot({slot},{item});' for slot,item in equips)
    npl(f'''
NPL.load("(gl)script/ide/Canvas3D.lua");
local ctl=CommonCtrl.GetControl("HaqiNpcHDPreview");
if(not ctl) then
 ctl=CommonCtrl.Canvas3D:new{{name="HaqiNpcHDPreview",alignment="_lt",left=-1200,top=0,width=512,height=512,autoRotateSpeed=0,IsActiveRendering=true,miniscenegraphname="HaqiNpcHDPreviewScene",RenderTargetSize=512,DefaultRotY=-1.57,DefaultLiftupAngle=0.1}};
 ctl:Show(true);
end
ctl.DefaultRotY=-1.57;ctl.DefaultLiftupAngle=0.1;
local obj=ObjEditor.CreateObjectByParams({{AssetFile={model},IsCharacter={character},PhysicsRadius=100,x=0,y=0,z=0,facing=0,IsPersistent=false,EnablePhysics=false}});
if(not obj or not obj:IsValid()) then error("NPC model is invalid");end
obj:SetField("progress",1);

{appearance}
ctl:ShowModel(obj,false);ctl:SetBackGroundColor("255 255 255 0");
local camera=ParaScene.GetMiniSceneGraph(ctl.resourceName):GetAttributeObjectCamera();
camera:SetField("FarPlane",100000);camera:SetField("NearPlane",0.01);camera:SetField("FieldOfView",0.5236);
return true;
''')
    for attempt in range(30):
        time.sleep(.3)
        loaded=npl('local c=CommonCtrl.GetControl("HaqiNpcHDPreview");local s=ParaScene.GetMiniSceneGraph(c.resourceName);return s:GetObject(c.obj_name):GetPrimaryAsset():IsLoaded();')
        if loaded:break
    else:raise RuntimeError('Model load timeout: '+job['model'])
    # Set our own complete-object camera after the asynchronous Canvas3D camera callback.
    npl('''local c=CommonCtrl.GetControl("HaqiNpcHDPreview");local s=ParaScene.GetMiniSceneGraph(c.resourceName);local o=s:GetObject(c.obj_name);local bb=o:GetPrimaryAsset():GetBoundingBox({});local size=math.max(bb.max_x-bb.min_x,bb.max_y-bb.min_y,bb.max_z-bb.min_z,0.2);s:CameraSetLookAtPos((bb.min_x+bb.max_x)/2,(bb.min_y+bb.max_y)/2,(bb.min_z+bb.max_z)/2);c:CameraSetEyePosByAngle(-1.57,0.1,size*2.8);return true;''')
    time.sleep(5.0 if job['ccs'] else 2.0)
    relative=path.relative_to(ROOT).as_posix()
    npl(f'local c=CommonCtrl.GetControl("HaqiNpcHDPreview");c:SaveToFile({json.dumps(relative)},{RENDER_SIZE});return true;')
    image=Image.open(path).convert('RGBA')
    # Alpha touching the frame indicates clipped geometry/equipment; pull back and retry.
    for attempt in range(4):
        b=image.getbbox()
        if not b or (min(b[:2])>3 and max(b[2:])<RENDER_SIZE-3):break
        npl('local c=CommonCtrl.GetControl("HaqiNpcHDPreview");local s=ParaScene.GetMiniSceneGraph(c.resourceName);local a,b,d=s:CameraGetEyePosByAngle();c:CameraSetEyePosByAngle(a,b,d*1.35);return true;')
        time.sleep(.4)
        npl(f'local c=CommonCtrl.GetControl("HaqiNpcHDPreview");c:SaveToFile({json.dumps(relative)},{RENDER_SIZE});return true;')
        image=Image.open(path).convert('RGBA')
    if not image.getbbox():raise RuntimeError('Empty native render: '+job['model'])
    return image

folder=APP/'assets/adventure/npcs';folder.mkdir(parents=True,exist_ok=True)
for index,job in enumerate(jobs.values()):
    model=job['model'].lower();base=Path(model).stem
    portrait=f'texture/aries/penote/npcs/{base}_32bits.png'
    original=portrait if portrait in sources and not job['ccs'] else model+'.png'
    source=dict(model=job['model'],ccs=job['ccs'],isCharacter=job['isCharacter'])
    try:
        if original in sources and not job['ccs']:
            image,row=original_image(original)
            if not image.getbbox():raise ValueError('Empty original thumbnail')
            bbox=image.getbbox()
            if min(image.size)<SIZE or max(bbox[2]-bbox[0],bbox[3]-bbox[1])<SIZE-8:raise ValueError('Original thumbnail is too small; render model at 512px')
            source['sourceSize']=list(image.size)
            source.update(method='original-image',image=original,original=row)
        else:raise ValueError('No original thumbnail')
    except Exception:
        try:
            image=render(job);source.update(method='native-model-render',renderSize=RENDER_SIZE,renderSha256=digest((CACHE/(job['key']+'-hd512-v2-native.png')).read_bytes()))
        except Exception as error:
            manifest['renderFailures'].append({'key':job['key'],'model':model,'error':str(error),'instances':[n['instanceId'] for n in job['npcs']]})
            if 'Empty native render' in str(error):
                for n in job['npcs']:
                    manifest['instances'][n['instanceId']]={'visible':False,'reason':'offscreen-render-empty'}
                    manifest['hidden'].append({'instanceId':n['instanceId'],'name':n['name'],'model':model})
            print('FAILED',index,model,str(error)[:100],flush=True);continue
    for path in [model,*[str(v).lower() for v in job['ccs'].split(';') if '/' in str(v)]]:
        if path in sources:source.setdefault('modelSources',[]).append(sources[path])
    image=image.crop(image.getbbox());image.thumbnail((SIZE-8,SIZE-8),Image.Resampling.LANCZOS)
    # One image per appearance, with a transparent margin and no atlas dependency.
    image_with_border=Image.new('RGBA',(SIZE,SIZE));image_with_border.alpha_composite(image,((SIZE-image.width)//2,(SIZE-image.height)//2));image=image_with_border
    raw=None;encoding=None
    for quality in [None,95,90,85,80,75,70]:
        buffer=io.BytesIO();image.save(buffer,format='WEBP',lossless=quality is None,quality=quality or 100,method=4,exact=True)
        if len(buffer.getvalue())<LIMIT:raw=buffer.getvalue();encoding='lossless' if quality is None else f'quality-{quality}';break
    if raw is None:raise RuntimeError('NPC exceeds size limit: '+job['key'])
    sha=digest(raw);local=f'assets/adventure/npcs/{sha}.webp';(APP/local).write_bytes(raw)
    art_id='npc:'+job['key'];manifest['entries'][art_id]=dict(local=local,cdn=None,sha256=sha,size=len(raw),width=image.width,height=image.height,encoding=encoding)
    manifest['sources'][art_id]=source
    for n in job['npcs']:manifest['instances'][n['instanceId']]={'visible':True,'portrait':{'id':art_id}}
    if index%15==0:print('Prepared',index+1,'/',len(jobs),flush=True)
if len(manifest['instances'])!=sum(len(job['npcs']) for job in jobs.values())+sum(row.get('reason')=='original-invisible-trigger' for row in manifest['instances'].values()):
    raise RuntimeError('NPC render failures left missing bindings; runtime manifest was not replaced')
output=CACHE/'preview.json' if args.preview else OUT
output.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
check(manifest)
print('Mapped',len(manifest['instances']),'instances; invisible triggers',len(manifest['hidden']),'render failures',len(manifest['renderFailures']),flush=True)

# Contact sheets are QA artifacts only and never enter runtime or dist.
font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',12)
rows=list(manifest['entries'].items())
for page in range(math.ceil(len(rows)/48)):
    sheet=Image.new('RGB',(8*140,6*180),'#e8dfc9');draw=ImageDraw.Draw(sheet)
    for i,(key,entry) in enumerate(rows[page*48:(page+1)*48]):
        im=Image.open(APP/entry['local']).convert('RGBA');im.thumbnail((124,145))
        x=i%8*140;y=i//8*180;sheet.paste(im,(x+(140-im.width)//2,y+5),im)
        job=jobs[key[4:]];label=job['npcs'][0]['name'] or str(job['npcs'][0]['id'])
        draw.text((x+5,y+150),label[:10],font=font,fill='black');draw.text((x+5,y+164),str(entry['size'])+' B',font=font,fill='black')
    sheet.save(CACHE/f'contact-{page+1}.png')
