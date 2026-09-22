"""Append the generated dungeon icon to the original UI atlas; keep it below 100 KB.

Usage: python scripts/prepare_dungeon_icon.py generated.png
The base atlas stays untouched so repeated runs do not recompress previous output.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PROMPT = 'Use case: stylized-concept. Create a single game UI dungeon entrance icon, square transparent PNG, no text. A friendly fantasy ancient stone arch gateway in warm weathered golden sandstone, teal emerald magical glow within its dark entrance, a short three-step staircase, two little gold-trimmed turrets and a green jewel above the arch. Hand-painted polished storybook MMORPG item icon, warm gold highlights and deep olive shadows, chunky readable silhouette, simple enough to read at 64px. Centered isolated object filling 86% of canvas, straight-on slightly isometric view. No circular border or button frame, no landscape background, no lettering, no watermark. Genuine transparent alpha outside the gateway. Matches an ornate gold and green fantasy game HUD.'


def prepare(source):
    manifest_path = ROOT / 'data/adventure/ui-art.json'
    manifest = json.loads(manifest_path.read_text())
    base_path = 'assets/adventure/ui/storybook-d835b3634eee.webp'
    base = Image.open(ROOT / base_path).convert('RGBA')
    original = Image.open(source).convert('RGBA')
    assert original.getchannel('A').getextrema()[0] == 0, 'Requires real alpha'
    bounds = original.getchannel('A').getbbox()
    icon = original.crop(bounds)
    icon.thumbnail((112, 112), Image.Resampling.LANCZOS)
    atlas = Image.new('RGBA', (512, 640))
    atlas.alpha_composite(base)
    x, y = (128 - icon.width) // 2, 512 + (128 - icon.height) // 2
    atlas.alpha_composite(icon, (x, y))
    for quality in (None, 92, 88, 84, 80, 76):
        stream = io.BytesIO()
        atlas.save(stream, 'WEBP', lossless=quality is None, quality=quality or 100, method=6)
        data = stream.getvalue()
        if len(data) < 100000:
            break
    else:
        raise ValueError('UI atlas exceeds 100 KB')
    digest = hashlib.sha256(data).hexdigest()
    local = f'assets/adventure/ui/storybook-{digest[:12]}.webp'
    (ROOT / local).write_bytes(data)
    # Small archival icon; runtime consumes only the shared atlas.
    icon_path = ROOT / 'assets/adventure/ui/dungeon-icon.webp'
    icon.save(icon_path, 'WEBP', lossless=True, method=6)
    manifest.update(local=local, cdn=manifest.get('cdn', '') if manifest['sha256'] == digest else '',
                    width=512, height=640, columns=4, rows=5, size=len(data), sha256=digest,
                    encoding={'lossless': quality is None, 'quality': quality})
    manifest['frames']['dungeon'] = {'rect': [x, y, icon.width, icon.height], 'cell': [0, 4],
        'sourceRect': [bounds[0], bounds[1], bounds[2]-bounds[0], bounds[3]-bounds[1]]}
    manifest['additions'] = {'dungeon': {'generator': 'image_gen', 'date': '2026-09-22',
        'prompt': PROMPT, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'width': original.width, 'height': original.height, 'baseAtlas': base_path,
        'local': str(icon_path.relative_to(ROOT)), 'size': icon_path.stat().st_size,
        'webpSha256': hashlib.sha256(icon_path.read_bytes()).hexdigest()}}
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'local': local, 'size': len(data), 'iconSize': icon_path.stat().st_size,
                      'quality': quality}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    prepare(parser.parse_args().source)
