"""Mirror the approved left row to the right around existing neck anchors."""
import hashlib, io, json
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'assets/hero-preview/female-walk-ref.webp'
before = path.read_bytes()
image = Image.open(io.BytesIO(before)).convert('RGBA')
original = image.copy()
base = json.loads((ROOT / 'data/hero-preview.json').read_text(encoding='utf-8'))['bodies']['female-walk']
cw, ch = image.width // 7, image.height // 4
records = []
for column in range(7):
    left = base['frames'][1] if column == 6 else base['walk']['frames'][6 + column]
    right = base['frames'][2] if column == 6 else base['walk']['frames'][12 + column]
    lx = left['crop'][0] + left['neck'][0] - column * cw
    rx = right['crop'][0] + right['neck'][0] - column * cw
    ly = left['crop'][1] + left['neck'][1] - ch
    ry = right['crop'][1] + right['neck'][1] - 2 * ch
    dx, dy = round(rx - (cw - 1 - lx)), round(ry - ly)
    source = original.crop((column*cw, ch, (column+1)*cw, 2*ch))
    mirrored = Image.new('RGBA', (cw, ch))
    mirrored.paste(ImageOps.mirror(source), (dx, dy))
    image.paste(mirrored, (column*cw, 2*ch))
    records.append({'column': column, 'offset': [dx, dy]})
for row in (0, 1, 3):
    box = (0, row*ch, image.width, (row+1)*ch)
    assert image.crop(box).tobytes() == original.crop(box).tobytes()
out = io.BytesIO()
image.save(out, 'WEBP', lossless=True, exact=True, method=6)
raw = out.getvalue()
assert len(raw) <= 200000
assert Image.open(io.BytesIO(raw)).convert('RGBA').tobytes() == image.tobytes()
path.write_bytes(raw)
meta_path = ROOT / 'art-references/walk-reference/female-walk-ref.json'
meta = json.loads(meta_path.read_text(encoding='utf-8'))
meta.update(sha256=hashlib.sha256(raw).hexdigest(), bytes=len(raw), status='left-approved-right-mirrored')
meta['rightMirror'] = {'sourceSha256': hashlib.sha256(before).hexdigest(), 'sourceRow': 1, 'targetRow': 2, 'registration': records}
meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
variants_path = ROOT / 'art-references/hero-body-variants.json'
variants = json.loads(variants_path.read_text(encoding='utf-8'))
variant = variants['variants']['female-ref']
variant.update({key: meta[key] for key in ('sha256', 'bytes')})
variant.pop('cdn', None)
variants_path.write_text(json.dumps(variants, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(f'Mirrored seven frames; other rows unchanged; lossless {len(raw)} bytes')
