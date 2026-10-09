"""Repack reviewed head frames without redrawing, recentering or rescaling.

Writes lossless WebP references and metadata. Upload the printed files with the
existing CDN uploader, then record its verified URLs in photo-head.json.
Re-running preserves an existing URL only if its asset hash is unchanged.
"""
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ORDER = [0, 8, 4, 12]  # front, back, left, right


def prepare():
    manifest = json.loads((ROOT / 'data/adventure/hero-art.json').read_text(encoding='utf-8'))
    config_path = ROOT / 'data/adventure/photo-head.json'
    config = json.loads(config_path.read_text(encoding='utf-8'))
    references = config.setdefault('references', {})
    for gender in ['boy', 'girl']:
        source = manifest['heads']['elf-' + gender]
        path = ROOT / source['local']
        assert hashlib.sha256(path.read_bytes()).hexdigest() == source['sha256']
        image = Image.open(path).convert('RGBA')
        assert image.size == (source['width'], source['height'])
        cell = source['width'] // 4
        atlas = Image.new('RGBA', (cell * 2, cell * 2))
        frames = []
        for i, index in enumerate(ORDER):
            frame = source['frames'][index]
            x, y, w, h = frame['crop']
            assert w == h == cell
            dx, dy = i % 2 * cell, i // 2 * cell
            atlas.paste(image.crop((x, y, x+w, y+h)), (dx, dy))
            frames.append({**frame, 'crop': [dx, dy, cell, cell]})
        local = f'assets/hero-preview/head-reference-4-{gender}.webp'
        output = ROOT / local
        atlas.save(output, 'WEBP', lossless=True, exact=True, method=6)
        data = output.read_bytes()
        assert len(data) <= 200000
        digest = hashlib.sha256(data).hexdigest()
        previous = references.get(gender, {})
        references[gender] = dict(
            directionCount=4, gender=source['gender'], local=local,
            width=atlas.width, height=atlas.height, bytes=len(data), sha256=digest,
            frames=frames,
            source=dict(id='elf-'+gender, local=source['local'], cdn=source['cdn'],
                        sha256=source['sha256'], frameIndices=ORDER),
        )
        if previous.get('sha256') == digest and previous.get('cdn'):
            references[gender]['cdn'] = previous['cdn']
        print(f'{local} {len(data)} bytes sha256={digest}')
    config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


if __name__ == '__main__':
    prepare()
