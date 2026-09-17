#!/usr/bin/env python3
"""Export one original card face per base; decode data literals, never execute Lua."""
import base64,hashlib,io,json,re,urllib.request,zipfile,zlib
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image
from lib.lua_data import LuaData
APP=Path(__file__).resolve().parents[1];ROOT=APP.parents[1]
effects=json.loads((APP/'data/adventure/spell-effects.json').read_text())
raw=base64.b64decode((ROOT/'Database/globalstore.db.mem').read_bytes());key=b'Copyright@ParaEngine, LiXizhi\0'
p=LuaData(bytes(b^key[i%len(key)] for i,b in enumerate(raw)).decode());rows=p.value();p.skip()
assert p.pos==len(p.text)
items={}
for r in rows:items.setdefault(r[12].partition('_')[2],{'icon':r[3],'itemId':r[0],'name':r[18][0]})
manifest={}
for line in (ROOT/'assets_manifest.txt').read_text().splitlines():
 path,md5,size=line.rsplit(',',2);manifest.setdefault(path[:-2].lower(),[]).append({'path':path,'md5':md5,'size':int(size),'entry':line})
output=APP/'data/kids/spell-art.json';old=json.loads(output.read_text()) if output.exists() else {'bases':{}}
def prepare(base):
 keys=[k for k,v in effects['cards'].items() if v['base']==base]
 keys.sort(key=lambda k:(effects['cards'][k]['variant']['rank']!='normal',effects['cards'][k]['variant']['lowLevel']))
 source=next((items[k] for k in keys if items.get(k,{}).get('icon')),None)
 if not source:return base,{'system':True,'reason':'Source control event; no inventory card face'}
 parts=source['icon'].split(';');path=parts[0].strip().replace('\\','/').lower();choices=manifest.get(path,[])
 if not choices:return base,old['bases'].get(base) or {'missingSource':path,'itemId':source['itemId'],'name':source['name']}
 row=next((r for r in choices if r['path'].endswith('.p')),choices[0]);previous=old['bases'].get(base)
 if previous and previous.get('sourceEntry')==row['entry']:
  file=APP/previous['local']
  if file.exists() and hashlib.sha256(file.read_bytes()).hexdigest()==previous['sha256']:return base,previous
 url='https://cdn.keepwork.com/update61/assetdownload/update/'+row['entry']
 for attempt in range(3):
  try:
   with urllib.request.urlopen(url,timeout=45) as r:data=r.read()
   break
  except Exception:
   if attempt==2:raise
 assert len(data)==row['size'] and hashlib.md5(data).hexdigest()==row['md5'],path
 if row['path'].endswith('.z'):
  if data.startswith(b'PK'):
   with zipfile.ZipFile(io.BytesIO(data)) as archive:data=archive.read(archive.namelist()[0])
  else:data=zlib.decompress(data)
 image=Image.open(io.BytesIO(data)).convert('RGBA');image.load()
 if len(parts)>1:
  x,y,w,h=map(int,re.findall(r'\d+',parts[1]));image=image.crop((x,y,x+w,y+h))
 stream=io.BytesIO();image.save(stream,format='WEBP',lossless=True,method=4,exact=True)
 if len(stream.getvalue())>200000:
  stream=io.BytesIO();image.save(stream,format='WEBP',quality=85,method=4,exact=True)
 encoded=stream.getvalue();assert len(encoded)<=200000
 Image.open(io.BytesIO(encoded)).load();sha=hashlib.sha256(encoded).hexdigest();local='assets/adventure/spells/'+sha+'.webp'
 file=APP/local;file.parent.mkdir(exist_ok=True,parents=True);file.write_bytes(encoded)
 return base,{'local':local,'cdn':None,'sha256':sha,'size':len(encoded),'width':image.width,'height':image.height,'sourceEntry':row['entry'],'sourceIcon':source['icon'],'itemId':source['itemId'],'name':source['name']}
with ThreadPoolExecutor(max_workers=6) as pool:bases=dict(pool.map(prepare,effects['bases']))
output.write_text(json.dumps({'version':1,'bases':bases},ensure_ascii=False,indent=2)+'\n')
print('Original card faces:',sum(bool(r.get('local')) for r in bases.values()),'system events:',sum(bool(r.get('system')) for r in bases.values()))
