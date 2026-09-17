"""Download original public sheets, check CORS, archive original hashes and WebP budgets."""
import concurrent.futures,hashlib,io,json,urllib.request
from pathlib import Path
from PIL import Image
p=Path('data/adventure/pets.json'); data=json.loads(p.read_text(encoding='utf8'))
def prepare(row):
 art=row['art']; target=Path(art['local']); target.parent.mkdir(parents=True,exist_ok=True)
 with urllib.request.urlopen(art['cdn'],timeout=90) as r:
  source=r.read();cors=r.headers.get('Access-Control-Allow-Origin','')
 if not cors:raise ValueError('Missing CORS '+row['id'])
 image=Image.open(io.BytesIO(source)); image.load()
 if len(source)>200000:raise ValueError('Oversize original '+row['id']+' '+str(len(source)))
 if image.format!='WEBP':raise ValueError('Not WebP '+row['id'])
 target.write_bytes(source)
 art.update(width=image.width,height=image.height,bytes=len(source),sha256=hashlib.sha256(source).hexdigest(),sourceSha256=hashlib.sha256(source).hexdigest(),cors=cors)
 return row['id']
errors=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
 futures={pool.submit(prepare,row):row['id'] for row in data['pets'].values()}
 for i,f in enumerate(concurrent.futures.as_completed(futures)):
  try:f.result()
  except Exception as e:errors.append(str(e))
  if (i+1)%50==0:print(i+1,'checked',flush=True)
p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps(errors,ensure_ascii=False));raise SystemExit(bool(errors))
