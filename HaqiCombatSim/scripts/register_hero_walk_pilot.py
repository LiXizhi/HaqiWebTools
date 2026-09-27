"""Pack the approved six-frame male9 sample into immutable side-walk crops."""
import hashlib, io, json, statistics
from pathlib import Path
from PIL import Image, ImageOps
from prepare_hero_side_walk import neck_top

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / 'art-references/walk-reference/male9-reference-pilot.webp'
manifest_path = ROOT / 'art-references/hero-body-variants.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
row = manifest['variants']['male9']
base = json.loads((ROOT / 'data/hero-preview.json').read_text(encoding='utf-8'))['bodies']['male-walk']
path = ROOT / row['local']
original = Image.open(path).convert('RGBA')
atlas = original.copy()
generated = Image.open(source).convert('RGBA')
cw = generated.width // 6
assert cw * 6 == generated.width
cells = [generated.crop((i*cw, 0, (i+1)*cw, generated.height)) for i in range(6)]
necks = [neck_top(cell) for cell in cells]
bounds = [cell.getchannel('A').point(lambda a: 255 if a > 20 else 0).getbbox() for cell in cells]
scale = 68 / statistics.median(b[3]-n[1] for b,n in zip(bounds,necks))
registrations = []
for direction in (1, 2):
    for i, cell in enumerate(cells):
        frame = base['walk']['frames'][direction*6+i]
        x,y,w,h = frame['crop']
        nx,ny = necks[i]
        if direction == 1:
            cell = ImageOps.mirror(cell)
            nx = cw-1-nx
        resized = cell.resize((round(cw*scale), round(generated.height*scale)), Image.Resampling.LANCZOS)
        tile = Image.new('RGBA', (w,h))
        tile.alpha_composite(resized, (round(frame['neck'][0]-nx*scale), round(82-ny*scale)))
        bound = tile.getchannel('A').point(lambda a: 255 if a > 20 else 0).getbbox()
        assert bound and bound[0]>0 and bound[2]<w and bound[3]<h, bound
        atlas.paste(tile, (x,y))
        registrations.append({'direction': direction, 'frame': i, 'bounds': bound, 'mirrored': direction == 1})
# Front, back and all idle cells are byte-identical before encoding.
for r in range(4):
    for c in range(7):
        if r in (1,2) and c < 6: continue
        box=(c*192,r*192,(c+1)*192,(r+1)*192)
        assert atlas.crop(box).tobytes() == original.crop(box).tobytes()
for options in ({'lossless': True}, {'quality': 98}, {'quality': 95}, {'quality': 90}):
    stream=io.BytesIO(); atlas.save(stream,'WEBP',method=6,exact=True,**options)
    raw=stream.getvalue()
    if len(raw)<=200000: break
assert len(raw)<=200000
path.write_bytes(raw)
row.update(bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest(),encoding=options)
row.pop('cdn',None)
row['source']['sideWalk']={'local':source.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'layout':[6,1],'leftMethod':'horizontal mirror of approved right walk','scale':scale,'promptRef':'art-references/walk-reference/character-prompts.json'}
row['validation'].update(unchangedGeometry=True,neckPixelsExact=False,sideWalkRegistration=registrations)
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('male9:',len(raw),'bytes;',options,'; unchanged crop/neck JSON; scale',scale)
