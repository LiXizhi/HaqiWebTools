"""Export the three kids rations and lossless source icons; never synthesize art."""
import base64, hashlib, io, json, sys, urllib.request, zipfile, zlib
from pathlib import Path
from PIL import Image
from lib.lua_data import LuaData

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parents[1]
raw = base64.b64decode((SOURCE/'Database/globalstore.db.mem').read_bytes())
key = b'Copyright@ParaEngine, LiXizhi\0'
rows = LuaData(bytes(v ^ key[i % len(key)] for i,v in enumerate(raw)).decode()).value()
items = {}
for row in rows:
    if row[0] not in [17172,17185,17211]: continue
    t = row[18]
    items[str(row[0])] = dict(id=row[0],name=t[0],description=t[1],sourceIcon=row[3],kind=t[23],subtype=t[24],slot=t[22],stats={str(t[i]):t[i+1] for i in range(2,22,2) if t[i]},source='Database/globalstore.db.mem',sourceRecord=row)
chapter_path = ROOT/'data/adventure/chapter.json'
chapter = json.loads(chapter_path.read_text(encoding='utf8'))
chapter['petFoods'] = items
chapter_path.write_text(json.dumps(chapter,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
manifest_path = ROOT/'data/adventure/shop-icons.json'
manifest = json.loads(manifest_path.read_text(encoding='utf8'))
sources = {}
for line in (SOURCE/'assets_manifest.txt').read_text().splitlines():
    path, md5, size = line.rsplit(',',2)
    if size.isdigit() and (path[:-2].lower() not in sources or path.endswith('.p')):
        sources[path[:-2].lower()] = dict(entry=line,md5=md5,size=int(size),path=path)
atlas = Image.new('RGBA',(384,96))
for index,item in enumerate(items.values()):
    source = item['sourceIcon'].lower(); row = sources[source]
    with urllib.request.urlopen('https://cdn.keepwork.com/update61/assetdownload/update/'+row['entry'],timeout=60) as response: raw=response.read()
    assert len(raw)==row['size'] and hashlib.md5(raw).hexdigest()==row['md5']
    row['sourceSha256']=hashlib.sha256(raw).hexdigest()
    if row['path'].endswith('.z'):
        if raw.startswith(b'PK'):
            with zipfile.ZipFile(io.BytesIO(raw)) as archive: raw=archive.read(archive.namelist()[0])
        else: raw=zlib.decompress(raw)
    image=Image.open(io.BytesIO(raw)).convert('RGBA'); image.thumbnail((88,88),Image.Resampling.LANCZOS)
    atlas.alpha_composite(image,(index*96+(96-image.width)//2,(96-image.height)//2))
    manifest['sources'][source]=row
    manifest['items'][str(item['id'])]=dict(id='pet-food-icons',crop=[index*96,0,96,96])
buffer=io.BytesIO();atlas.save(buffer,format='WEBP',lossless=True,exact=True,method=6)
raw=buffer.getvalue();assert len(raw)<=200000
sha=hashlib.sha256(raw).hexdigest();local='assets/adventure/shop-icons/'+sha+'.webp'
(ROOT/local).write_bytes(raw)
old=manifest['entries'].get('pet-food-icons',{})
manifest['entries']['pet-food-icons']=dict(local=local,cdn=old.get('cdn') if old.get('sha256')==sha else None,sha256=sha,size=len(raw),width=384,height=96)
manifest['items']['990001']=manifest['items']['17172']
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(local, len(raw))
