"""Pack original transparent school symbols, without HP-slot medallion backgrounds."""
import argparse
import hashlib
import json
import io
from pathlib import Path
from PIL import Image

APP = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--textures', type=Path, required=True)
parser.add_argument('--generated', type=Path, help='Transparent 3x2 high-resolution redraw')
args = parser.parse_args()
schools = ['fire', 'ice', 'storm', 'life', 'death', 'balance']
entries = (APP.parents[1] / 'assets_manifest.txt').read_text().splitlines()
atlas = Image.new('RGBA', (192, 32))
frames = {}
for index, school in enumerate(schools):
    folder = 'Team' if school == 'balance' else 'Common/ThemeKid/character'
    source = f'Texture/Aries/{folder}/{school}_32bits.png'
    raw = (args.textures / source).read_bytes()
    entry = next(line for line in entries if line.startswith(source.lower() + '.p,'))
    _, md5, size = entry.rsplit(',', 2)
    assert hashlib.md5(raw).hexdigest() == md5 and len(raw) == int(size)
    icon = Image.open(args.textures / source).convert('RGBA')
    source_size = list(icon.size)
    if school == 'balance':
        # The shared original symbol is 16px; fit it to the same 32px UI cell.
        assert icon.size == (16, 16)
        icon = icon.resize((32, 32), Image.Resampling.LANCZOS)
    else:
        assert icon.size == (32, 32)
    atlas.alpha_composite(icon, (index * 32, 0))
    frames[school] = {'rect': [index * 32, 0, 32, 32], 'source': source,
                     'sourceEntry': entry, 'sourceSize': source_size,
                     'sourceSha256': hashlib.sha256(raw).hexdigest()}
generation = None
if args.generated:
    source_raw = args.generated.read_bytes()
    generated = Image.open(args.generated).convert('RGBA')
    assert generated.width % 3 == 0 and generated.height % 2 == 0
    assert generated.getchannel('A').getextrema()[0] == 0
    cell_w, cell_h = generated.width // 3, generated.height // 2
    atlas = Image.new('RGBA', (768, 128))
    for index, school in enumerate(schools):
        x, y = index % 3 * cell_w, index // 3 * cell_h
        icon = generated.crop((x, y, x + cell_w, y + cell_h))
        icon.thumbnail((128, 128), Image.Resampling.LANCZOS)
        atlas.alpha_composite(icon, (index * 128 + (128-icon.width)//2, (128-icon.height)//2))
        frames[school]['rect'] = [index * 128, 0, 128, 128]
    generation = {'method': 'imagegen-reference-redraw', 'sourceSha256': hashlib.sha256(source_raw).hexdigest(),
                  'sourceSize': list(generated.size), 'layout': [3, 2],
                  'note': 'AI redraw based on the recorded original symbols; not original game pixels'}
directory = APP / 'assets/adventure/ui'
directory.mkdir(parents=True, exist_ok=True)
temporary = directory / 'school-icons.webp'
atlas.save(temporary, 'WEBP', lossless=True, method=6, exact=True)
raw = temporary.read_bytes()
encoding = 'lossless'
if len(raw) >= 32000:
    for quality in [95, 90, 85, 80, 75, 70]:
        stream = io.BytesIO()
        atlas.save(stream, 'WEBP', quality=quality, method=6, exact=True)
        raw = stream.getvalue()
        if len(raw) < 32000:
            encoding = f'quality-{quality}'
            temporary.write_bytes(raw)
            break
assert len(raw) < 32000
digest = hashlib.sha256(raw).hexdigest()
local = f'assets/adventure/ui/school-icons-{digest[:12]}.webp'
temporary.replace(APP / local)
manifest_path = APP / 'data/adventure/school-icons.json'
previous = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
manifest = {'version': 1, 'local': local, 'cdn': previous.get('cdn') if previous.get('sha256') == digest else None,
            'sha256': digest, 'size': len(raw), 'width': atlas.width, 'height': atlas.height,
            'encoding': encoding, 'frames': frames, 'generation': generation}
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(local, len(raw), 'bytes')
