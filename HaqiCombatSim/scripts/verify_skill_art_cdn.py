#!/usr/bin/env python3
"""Verify uploaded skill atlases before recording permanent CDN URLs."""
import hashlib,io,json,urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
p=ROOT/'data/adventure/skill-art.json';manifest=json.loads(p.read_text(encoding='utf-8'))
def verify(item):
 sid,row=item;url='https://cdn.keepwork.com/keepwork/haqi-adventure/skill-atlases/skill-atlases/'+Path(row['local']).name
 request=urllib.request.Request(url,headers={'Origin':'http://127.0.0.1:8791'})
 with urllib.request.urlopen(request,timeout=45) as response:
  data=response.read();assert response.status==200
  assert response.headers.get('Access-Control-Allow-Origin') in ('*','http://127.0.0.1:8791')
 assert len(data)==row['size']<=100000
 assert hashlib.sha256(data).hexdigest()==row['sha256']
 image=Image.open(io.BytesIO(data));image.load();assert image.mode=='RGBA';assert list(image.size)==[row['width'],row['height']]
 assert image.getchannel('A').getextrema()[0]==0
 w=image.width//row['columns'];h=image.height//row['rows']
 indices=set()
 for base in manifest['bases'].values():
  if base['atlas']==sid:indices.add(base['cell'])
  if base.get('effectAtlas')==sid:indices.update(base['effectFrames'])
 for index in indices:
  tile=image.crop((index%row['columns']*w,index//row['columns']*h,(index%row['columns']+1)*w,(index//row['columns']+1)*h))
  bounds=tile.getchannel('A').getbbox();assert bounds and bounds[0]>0 and bounds[1]>0 and bounds[2]<w and bounds[3]<h,(sid,index,bounds)
 row['cdn']=url
 return sid,{'size':len(data),'width':image.width,'height':image.height,'usedCells':len(indices),'http':200,'cors':True,'sha256':True,'alphaAndGutters':True}
with ThreadPoolExecutor(max_workers=4) as pool: report=dict(pool.map(verify,manifest['sheets'].items()))
p.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(ROOT/'docs/skill-art-audit.json').write_text(json.dumps({'baseCount':len(manifest['bases']),'sheetCount':len(report),'totalBytes':sum(r['size'] for r in report.values()),'sheets':report},indent=2)+'\n',encoding='utf-8')
print('Verified',len(report),'sheets;',len(manifest['bases']),'bases;',sum(r['size'] for r in report.values()),'bytes')
