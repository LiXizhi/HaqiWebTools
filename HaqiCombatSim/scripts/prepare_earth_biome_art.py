"""Normalize the 4x2 Earth biome sprite sheet; preserve alpha and enforce 200KB.

CDN is recorded separately only after a successful upload and byte verification.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('source')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
source = Path(args.source)
image = Image.open(source).convert('RGBA')
names = ['snowSpruce', 'snowFir', 'snowBush', 'snowMound', 'wheat', 'cactus', 'willow', 'mangrove']
packed = Image.new('RGBA', (1024, 512))
bounds = []
for index, name in enumerate(names):
    col, row = index % 4, index // 4
    rect = [round(col * image.width / 4), round(row * image.height / 2),
            round((col + 1) * image.width / 4), round((row + 1) * image.height / 2)]
    sprite = image.crop(rect)
    box = sprite.getchannel('A').getbbox()
    if box is None:
        raise ValueError(f'Empty sprite: {name}')
    sprite = sprite.crop(box)
    sprite.thumbnail((220, 218), Image.Resampling.LANCZOS)
    packed.alpha_composite(sprite, (col * 256 + (256 - sprite.width) // 2, row * 256 + 225 - sprite.height))
    bounds.append({'name': name, 'sourceCell': rect, 'sourceAlphaBounds': list(box)})

chosen = None
for width in [1024, 896, 768, 640]:
    resized = packed.resize((width, width // 2), Image.Resampling.LANCZOS)
    for options in [{'lossless': True}, {'quality': 90}, {'quality': 86}, {'quality': 82}]:
        output = io.BytesIO()
        resized.save(output, 'WEBP', method=6, **options)
        data = output.getvalue()
        if len(data) <= 200000:
            chosen = resized, data, options
            break
    if chosen:
        break
if not chosen:
    raise ValueError('Biome atlas exceeds WebP budget')
resized, data, options = chosen
digest = hashlib.sha256(data).hexdigest()
name = f'earth-biomes-{digest[:12]}.webp'
local = f'assets/adventure/earth/{name}'
(root / local).write_bytes(data)
cell = resized.width // 4
manifest_path = root / 'data/adventure/earth/surface-art.json'
manifest = json.loads(manifest_path.read_text(encoding='utf8'))
manifest['biomeDecorations'] = {
    'local': local, 'width': resized.width, 'height': resized.height, 'bytes': len(data),
    'sha256': digest, 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'source': 'Built-in imagegen; original fantasy Earth biome details; existing decoration atlas used as style reference only.',
    'promptFile': 'assets/adventure/earth/source/earth-biomes-spec.json',
    'encoding': options, 'frameOffset': 16, 'grid': {'columns': 4, 'rows': 2},
    'frameNames': names, 'sourceBounds': bounds,
    'frames': [[i % 4 * cell, i // 4 * cell, cell, cell] for i in range(8)]
}
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print(json.dumps({'local': local, 'bytes': len(data), 'size': resized.size, 'sha256': digest, 'encoding': options}))
