#!/usr/bin/env python3
"""Accept uploader-returned URLs only after byte and CORS verification."""
import argparse,concurrent.futures,hashlib,json,re,urllib.request
from pathlib import Path
APP=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('log',type=Path);args=p.parse_args()
file=APP/'data/adventure/boss-art.json';art=json.loads(file.read_text())
urls={u.rsplit('/',1)[-1]:u for u in re.findall(r'https://cdn\.keepwork\.com/[^\s]+\.webp',args.log.read_text())}
def verify(entry):
    url=urls[Path(entry['local']).name]
    with urllib.request.urlopen(url,timeout=60) as response:
        raw=response.read();cors=response.headers.get('Access-Control-Allow-Origin')
    if cors!='*' or len(raw)!=entry['size'] or hashlib.sha256(raw).hexdigest()!=entry['sha256']:
        raise ValueError('CDN image failed verification: '+Path(entry['local']).name)
    return url
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:verified=list(pool.map(verify,art['entries'].values()))
for entry,url in zip(art['entries'].values(),verified):entry['cdn']=url
file.write_text(json.dumps(art,ensure_ascii=False,indent=2)+'\n')
print('Verified CDN SHA-256, bytes and CORS for',len(verified),'boss images')
