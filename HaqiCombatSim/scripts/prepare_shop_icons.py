"""Archive original shop icons as lossless WebP atlases, with source provenance.

Resolves the exported expansion gear. Upload the generated
assets/adventure/shop-icons directory, then run --verify-cdn to record verified URLs.
"""
import concurrent.futures, hashlib, io, json, re, subprocess, sys, urllib.request, zipfile, zlib
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/adventure/shop-icons.json'
PREFIX = 'https://cdn.keepwork.com/keepwork/haqi-adventure/shop-icons/shop-icons/'
digest = lambda b: hashlib.sha256(b).hexdigest()
if '--verify-cdn' in sys.argv:
    manifest = json.loads(OUT.read_text(encoding='utf8'))
    for row in manifest['entries'].values():
        url = PREFIX + Path(row['local']).name
        with urllib.request.urlopen(url, timeout=60) as response:
            assert response.headers.get('Access-Control-Allow-Origin') == '*'
            assert digest(response.read()) == row['sha256']
        row['cdn'] = url
    OUT.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    print('CDN hashes and CORS verified:', len(manifest['entries']))
    sys.exit()

gear = json.loads(subprocess.check_output(['node','--input-type=module','-e',"""
import fs from 'node:fs';
import {installExpansion} from './js/adventure_expansion_core.js';
const files=['adventure/chapter','adventure/combat','adventure/pets','adventure/shop-candidates','kids/cards','kids/charms','kids/card_names'];
const {content}=installExpansion(...files.map(n=>JSON.parse(fs.readFileSync('data/'+n+'.json'))));
console.log(JSON.stringify(content.shop.filter(x=>x.kind==='gear').map(x=>content.items[x.itemId])));
"""],cwd=ROOT).decode('utf8'))
existing = json.loads(OUT.read_text(encoding='utf8')) if '--npc' in sys.argv else None
if existing:
    catalog = json.loads((ROOT/'data/adventure/npc-catalog.json').read_text(encoding='utf8'))
    gear = [catalog['items'][str(item_id)] for item_id in sorted({row['itemId'] for row in catalog['shops']})
            if str(item_id) in catalog['items'] and str(item_id) not in existing['items']]
sources = {}
for line in (ROOT.parents[1]/'assets_manifest.txt').read_text().splitlines():
    path, md5, size = line.rsplit(',', 2)
    if not size.isdigit(): continue
    key = path[:-2].lower()
    if key not in sources or path.endswith('.p'):
        sources[key] = dict(entry=line, md5=md5, size=int(size), path=path)
cache = ROOT/'.asset-cache/shop-originals'
cache.mkdir(parents=True, exist_ok=True)
def prepare(source):
    row = sources[source]
    file = cache/row['md5']
    if file.exists(): raw = file.read_bytes()
    else:
        with urllib.request.urlopen('https://cdn.keepwork.com/update61/assetdownload/update/'+row['entry'], timeout=60) as response: raw = response.read()
        file.write_bytes(raw)
    assert len(raw) == row['size'] and hashlib.md5(raw).hexdigest() == row['md5']
    row['sourceSha256'] = digest(raw)
    if row['path'].endswith('.z'):
        if raw.startswith(b'PK'):
            with zipfile.ZipFile(io.BytesIO(raw)) as archive: raw = archive.read(archive.namelist()[0])
        else: raw = zlib.decompress(raw)
    image = Image.open(io.BytesIO(raw)).convert('RGBA')
    return source, image
def icon_source(item): return (item.get('sourceIcon') or item.get('icon')).split(';')[0].strip().replace('\\','/').lower()
fallbacks = {}
if existing:
    missing = [item['id'] for item in gear if icon_source(item) not in sources]
    print('NPC icons without original source:', missing, flush=True)
    gear = [item for item in gear if icon_source(item) in sources]
for item in gear:
    if icon_source(item) not in sources:
        replacement = next(row for row in gear if row['slot']==item['slot'] and icon_source(row) in sources)
        fallbacks[str(item['id'])] = dict(missingSource=icon_source(item),replacementItemId=replacement['id'],source=icon_source(replacement))
        item['sourceIcon'] = replacement.get('sourceIcon') or replacement.get('icon')
keys = sorted({icon_source(item) for item in gear})
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
    images = dict(pool.map(prepare, keys))
print('Original images verified:', len(images), flush=True)
manifest = {'version':1, 'entries':{}, 'items':{}, 'fallbacks':fallbacks, 'sources':{k:sources[k] for k in keys}}
if existing:
    manifest = existing
    manifest['sources'].update({key:sources[key] for key in keys})
atlas_start = len(manifest['entries'])
folder = ROOT/'assets/adventure/shop-icons'
folder.mkdir(parents=True, exist_ok=True)
for offset in range(0, len(gear), 16):
    batch = gear[offset:offset+16]
    atlas = Image.new('RGBA', (384,384))
    refs = {}
    for index, item in enumerate(batch):
        image = images[icon_source(item)].copy()
        parts = (item.get('sourceIcon') or item.get('icon')).split(';')
        if len(parts)>1:
            x,y,w,h = map(int,re.findall(r'\d+',parts[1])); image = image.crop((x,y,x+w,y+h))
        box = image.getbbox()
        if box: image = image.crop(box)
        image.thumbnail((88,88),Image.Resampling.LANCZOS)
        x,y = index%4*96,index//4*96
        atlas.alpha_composite(image,(x+(96-image.width)//2,y+(96-image.height)//2))
        refs[str(item['id'])] = [x,y,96,96]
    buffer = io.BytesIO(); atlas.save(buffer,format='WEBP',lossless=True,exact=True,method=6)
    raw = buffer.getvalue(); assert len(raw)<=200000
    sha = digest(raw); local = 'assets/adventure/shop-icons/'+sha+'.webp'
    (ROOT/local).write_bytes(raw)
    key = 'shop-icons:'+str(atlas_start+offset//16)
    manifest['entries'][key] = dict(local=local,cdn=None,sha256=sha,size=len(raw),width=384,height=384)
    for item,crop in refs.items(): manifest['items'][item] = dict(id=key,crop=crop)
OUT.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Atlases prepared:',len(manifest['entries']),flush=True)
