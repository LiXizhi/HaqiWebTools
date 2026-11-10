"""Verify only URLs returned by the uploader, then activate the CDN manifest."""
import concurrent.futures, hashlib, json, re, sys, urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[1]
path=root/'data/adventure/battle-scenery.json'
manifest=json.loads(path.read_text(encoding='utf-8'))
urls=set(re.findall(r'https://cdn\.keepwork\.com/[^\s]+\.webp',Path(sys.argv[1]).read_text(encoding='utf-8-sig')))
by_name={url.rsplit('/',1)[-1]:url for url in urls}
def verify(item):
    id,row=item
    url=by_name[Path(row['local']).name]
    request=urllib.request.Request(url,headers={'Origin':'http://127.0.0.1:8766'})
    with urllib.request.urlopen(request,timeout=40) as response:
        raw=response.read()
        assert response.status==200
        assert response.headers.get('Access-Control-Allow-Origin')=='*',id+' CORS'
        assert hashlib.sha256(raw).hexdigest()==row['sha256'],id+' hash'
        assert len(raw)==row['size'],id+' size'
    return id,url
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    results=list(pool.map(verify,manifest['assets'].items()))
for id,url in results:
    manifest['assets'][id]['cdn']=url
    print(id+': HTTP 200, CORS and SHA-256 verified')
manifest['status']='cdn-verified'
manifest['assets']['disk-c']['promptDetail']+=' Final edit: remove the central arrow/polygon; preserve outer carved rings and moss; leave the center quiet so the runtime turn pointer remains distinct.'
path.write_bytes((json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
