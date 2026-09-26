"""Upload missing hero WebPs using the existing Keepwork uploader.
Record CDN URLs only after successful uploader output and byte/CORS verification.
No HTML, game release, credentials or Git mirror writes.
"""
import argparse,hashlib,json,os,subprocess,sys,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--uploader',type=Path);parser.add_argument('--verify',action='store_true');args=parser.parse_args()
path=ROOT/'data/hero-preview.json';manifest=json.loads(path.read_text(encoding='utf-8'));rows=[*manifest['bodies'].values(),*manifest['heads'].values()]
rows.extend(body['walk'] for body in manifest['bodies'].values() if body.get('walk'))
if not args.verify:
 if not args.uploader or not args.uploader.is_file():raise ValueError('Pass the existing qiniu_upload_local_files.py path')
 pending=[row for row in rows if not row.get('cdn')]
 digest=hashlib.sha256(''.join(row['sha256'] for row in pending).encode()).hexdigest()[:12]
 prefix='keepwork/haqi/hero-preview/20260926/'+digest+'/'
 env=dict(os.environ,PYTHONIOENCODING='utf-8')
 result=subprocess.run([sys.executable,str(args.uploader),'--prefix',prefix,*[str(ROOT/row['local']) for row in pending]],capture_output=True,text=True,encoding='utf-8',env=env) if pending else subprocess.CompletedProcess([],0,stdout='')
 # Do not echo general uploader diagnostics/config; only confirmed resource URLs.
 if result.returncode:raise RuntimeError('Existing CDN uploader failed; no manifest URLs were changed')
 for row in pending:
  url='https://cdn.keepwork.com/'+prefix+Path(row['local']).name
  if url not in result.stdout:raise RuntimeError('Uploader did not confirm '+Path(row['local']).name)
  row['cdn']=url
checks=[]
for row in rows:
 request=urllib.request.Request(row['cdn'],headers={'Origin':'http://127.0.0.1:8792'})
 with urllib.request.urlopen(request,timeout=45) as response:
  data=response.read();cors=response.headers.get('Access-Control-Allow-Origin')
 assert hashlib.sha256(data).hexdigest()==row['sha256'],row['local']
 assert cors in ('*','http://127.0.0.1:8792'),(row['local'],cors)
 checks.append({'local':row['local'],'cdn':row['cdn'],'bytes':len(data),'sha256':row['sha256'],'cors':cors})
 print(row['cdn'])
if not args.verify:
 text=json.dumps(manifest,ensure_ascii=False,indent=2)+'\n';path.write_text(text,encoding='utf-8')
 (ROOT/'data/adventure/hero-art.json').write_text(text,encoding='utf-8')
report=ROOT/'.asset-cache/hero-preview-cdn-verification.json';report.parent.mkdir(exist_ok=True);report.write_text(json.dumps(checks,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Verified',len(checks),'CDN objects: SHA-256 and CORS')
