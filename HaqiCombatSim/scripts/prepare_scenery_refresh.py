"""Package the generated scenery sheet, retaining the immutable legacy hero source."""
import hashlib
import io
import json
import shutil
import sys
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
path = root / 'data/adventure/media.json'
media = json.loads(path.read_text(encoding='utf-8'))
old = media['entries']['sprites']
legacy = dict(old.get('legacyCharacterSource', old))
legacy_path = 'assets/adventure/webp/sprites-legacy-characters.webp'
if legacy['local'] != legacy_path:
    shutil.copyfile(root / legacy['local'], root / legacy_path)
legacy['local'] = legacy_path
raw = Path(sys.argv[1]).read_bytes()
image = Image.open(io.BytesIO(raw)).convert('RGBA')
assert image.getextrema()[3][0] == 0, 'Transparent alpha is required'
image = image.resize((642, 642), Image.Resampling.LANCZOS)
for quality in [None, 95, 90, 85, 80, 75]:
    stream = io.BytesIO()
    image.save(stream, format='WEBP', lossless=quality is None, quality=quality or 100, method=6, exact=True)
    encoded = stream.getvalue()
    if len(encoded) <= 200000:
        break
assert len(encoded) <= 200000
sha = hashlib.sha256(encoded).hexdigest()
target = root / old['local']
target.write_bytes(encoded)
entry = {**old, 'sha256': sha, 'size': len(encoded), 'cdn': None,
         'sourceSha256': hashlib.sha256(raw).hexdigest(), 'sourceBytes': len(raw),
         'width': 642, 'height': 642, 'legacyCharacterSource': legacy,
         'encoder': f'Pillow WebP quality {quality}; alpha preserved; max 200000 bytes',
         'provenance': 'Built-in imagegen edit 2026-09-27: replace bottom eight characters with fern, flowers, tropical leaves, mushrooms, berries, lavender, reeds and golden shrub; preserve trees/buildings and transparent 4x4 layout.'}
media['entries']['sprites'] = entry
path.write_text(json.dumps(media, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
hero_path = root / 'data/adventure/hero-art.json'
hero = hero_path.read_text(encoding='utf-8').replace('assets/adventure/webp/sprites.webp', legacy_path)
hero_path.write_text(hero, encoding='utf-8')
preview_path = root / 'data/hero-preview.json'
preview_path.write_text(preview_path.read_text(encoding='utf-8').replace('assets/adventure/webp/sprites.webp', legacy_path), encoding='utf-8')
staging = root / '.asset-cache/scenery-refresh'
staging.mkdir(parents=True, exist_ok=True)
(staging / (sha+'.webp')).write_bytes(encoded)
print(json.dumps({'file': str(staging / (sha+'.webp')), 'sha256': sha, 'size': len(encoded)}))
