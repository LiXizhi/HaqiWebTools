"""Pack the original kids HP-slot school emblems; no redraw or upscaling."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image

APP = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--textures', type=Path, required=True)
args = parser.parse_args()
schools = ['fire', 'ice', 'storm', 'life', 'death', 'balance']
entries = (APP.parents[1] / 'assets_manifest.txt').read_text().splitlines()
atlas = Image.new('RGBA', (192, 32))
frames = {}
for index, school in enumerate(schools):
    source = f'Texture/Aries/Combat/HPSlots/{school}_32bits.png'
    raw = (args.textures / source).read_bytes()
    entry = next(line for line in entries if line.startswith(source.lower() + '.p,'))
    _, md5, size = entry.rsplit(',', 2)
    assert hashlib.md5(raw).hexdigest() == md5 and len(raw) == int(size)
    icon = Image.open(args.textures / source).convert('RGBA')
    assert icon.size == (32, 32)
    atlas.alpha_composite(icon, (index * 32, 0))
    frames[school] = {'rect': [index * 32, 0, 32, 32], 'source': source,
                     'sourceEntry': entry, 'sourceSha256': hashlib.sha256(raw).hexdigest()}
directory = APP / 'assets/adventure/ui'
directory.mkdir(parents=True, exist_ok=True)
temporary = directory / 'school-icons.webp'
atlas.save(temporary, 'WEBP', lossless=True, method=6, exact=True)
raw = temporary.read_bytes()
assert len(raw) < 16000
digest = hashlib.sha256(raw).hexdigest()
local = f'assets/adventure/ui/school-icons-{digest[:12]}.webp'
temporary.replace(APP / local)
manifest_path = APP / 'data/adventure/school-icons.json'
previous = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
manifest = {'version': 1, 'local': local, 'cdn': previous.get('cdn') if previous.get('sha256') == digest else None,
            'sha256': digest, 'size': len(raw), 'width': 192, 'height': 32,
            'encoding': 'lossless', 'frames': frames}
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(local, len(raw), 'bytes')
