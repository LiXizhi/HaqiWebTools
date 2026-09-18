"""Pack the generated storybook UI into one alpha WebP, strictly below 100 KB.

Usage: python scripts/prepare_ui_art.py source.png
The original generated PNG stays outside the runtime tree. All crops and
nine-slice insets are recorded in ui-art.json; no runtime coordinates guessed.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
NAMES = ['paper', 'wood', 'jade', 'cream', 'book', 'cards', 'bag', 'pet',
         'shop', 'map', 'cloud', 'settings', 'gourd', 'close', 'arrow', 'coin']


def prepare(source):
    image = Image.open(source).convert('RGBA')
    assert image.width == image.height
    assert image.getchannel('A').getextrema()[0] == 0, 'Requires real alpha'
    original_cell = image.width / 4
    crops = []
    for index, name in enumerate(NAMES):
        x, y = round(index % 4 * original_cell), round(index // 4 * original_cell)
        part = image.crop((x, y, round((index % 4 + 1) * original_cell), round((index // 4 + 1) * original_cell)))
        bounds = part.getchannel('A').point(lambda v: 255 if v > 32 else 0).getbbox()
        assert bounds, name
        crops.append((part.crop(bounds), [x + bounds[0], y + bounds[1], bounds[2] - bounds[0], bounds[3] - bounds[1]]))
    # Prefer lossless first, then the highest quality within the explicit budget.
    selected = None
    for cell in (192, 160, 128):
        atlas = Image.new('RGBA', (cell * 4, cell * 4))
        frames = {}
        for index, (part, source_rect) in enumerate(crops):
            inset = 8
            if index < 4:
                part = part.resize((cell - 2 * inset, cell - 2 * inset), Image.Resampling.LANCZOS)
            else:
                part = part.copy()
                part.thumbnail((cell - 2 * inset, cell - 2 * inset), Image.Resampling.LANCZOS)
            x = index % 4 * cell + (cell - part.width) // 2
            y = index // 4 * cell + (cell - part.height) // 2
            atlas.alpha_composite(part, (x, y))
            frames[NAMES[index]] = {'rect': [x, y, part.width, part.height], 'cell': [index % 4, index // 4], 'sourceRect': source_rect}
            if index < 4:
                frames[NAMES[index]]['slice'] = [round(part.width * .23)] * 4
        for quality in (None, 92, 88, 84, 80, 76, 72):
            stream = io.BytesIO()
            atlas.save(stream, 'WEBP', lossless=quality is None, quality=quality or 1, method=0 if quality is None else 4)
            print(f'{atlas.width}px quality={quality}: {len(stream.getvalue())} bytes', flush=True)
            if len(stream.getvalue()) < 100000:
                selected = (atlas, frames, quality, stream.getvalue())
                break
        if selected:
            break
    assert selected, 'Unable to meet 100,000-byte budget'
    atlas, frames, quality, data = selected
    digest = hashlib.sha256(data).hexdigest()
    local = f'assets/adventure/ui/storybook-{digest[:12]}.webp'
    target = ROOT / local
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    manifest = {'schemaVersion': 1, 'style': '经典魔法绘本', 'local': local, 'cdn': '',
                'width': atlas.width, 'height': atlas.height, 'size': len(data),
                'sha256': digest, 'source': {'generator': 'image_gen', 'date': '2026-09-19',
                'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                'width': image.width, 'height': image.height},
                'encoding': {'lossless': quality is None, 'quality': quality}, 'frames': frames}
    manifest_path = ROOT / 'data/adventure/ui-art.json'
    if manifest_path.exists():
        previous = json.loads(manifest_path.read_text(encoding='utf-8'))
        if previous.get('sha256') == digest:
            manifest['cdn'] = previous.get('cdn', '')
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'local': local, 'size': len(data), 'dimensions': atlas.size, 'quality': quality}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    prepare(parser.parse_args().source)
