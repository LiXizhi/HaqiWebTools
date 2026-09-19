"""Prepare original icons omitted by the level-50 shop export (no invented artwork)."""
import concurrent.futures,hashlib,io,json,urllib.request
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];path=ROOT/'data/adventure/chapter.json'
c=json.loads(path.read_text(encoding='utf8'));shop=json.loads((ROOT/'data/adventure/shop-icons.json').read_text(encoding='utf8'))
sources={line.rsplit(',',2)[0][:-2].lower():line for line in (ROOT.parents[1]/'assets_manifest.txt').read_text().splitlines()}
items=[item for id,item in c['strengtheningCatalog'].items() if not c['items'].get(id,{}).get('art') and id not in shop['items']]
cache=ROOT/'.asset-cache/strengthening-icons';cache.mkdir(parents=True,exist_ok=True)
sha=lambda raw:hashlib.sha256(raw).hexdigest()
def read(item):
    line=sources[item['icon'].lower()];_,md5,size=line.rsplit(',',2);file=cache/md5
    if file.exists():raw=file.read_bytes()
    else:
        with urllib.request.urlopen('https://cdn.keepwork.com/update61/assetdownload/update/'+line,timeout=60) as response:raw=response.read()
        file.write_bytes(raw)
    assert len(raw)==int(size) and hashlib.md5(raw).hexdigest()==md5
    im=Image.open(io.BytesIO(raw)).convert('RGBA');im.thumbnail((64,64),Image.Resampling.LANCZOS)
    return item,im,line,sha(raw)
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:prepared=list(pool.map(read,items))
out=ROOT/'assets/adventure/upgrade-ui';out.mkdir(parents=True,exist_ok=True);entries={}
for start in range(0,len(prepared),32):
    sheet=Image.new('RGBA',(512,256));id=f'strengthening-icons-{start//32}'
    for cell,(item,im,line,source_hash) in enumerate(prepared[start:start+32]):
        x=(cell%8)*64;y=(cell//8)*64;sheet.paste(im,(x+(64-im.width)//2,y+(64-im.height)//2))
        item['art']={'id':id,'crop':[x,y,64,64]};item['artSource']={'entry':line,'sha256':source_hash}
    buf=io.BytesIO();sheet.save(buf,format='WEBP',lossless=True,exact=True,method=6);raw=buf.getvalue();assert len(raw)<=200000
    name=f'{id}-{sha(raw)[:12]}.webp';(out/name).write_bytes(raw)
    entries[id]={'local':f'assets/adventure/upgrade-ui/{name}','cdn':None,'size':len(raw),'sha256':sha(raw),'width':512,'height':256}
c['strengtheningIcons']=entries;path.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Prepared',len(prepared),'original equipment icons in',len(entries),'sheets')
