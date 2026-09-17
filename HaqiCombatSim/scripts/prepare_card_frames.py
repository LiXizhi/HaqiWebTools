#!/usr/bin/env python3
"""Prepare card backgrounds from a school-to-image JSON map before CDN upload."""
import hashlib
import io
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
# Decimal KB; the requirement is strictly less than 24KB.
MAX_BYTES = 24_000


def compress(image):
    image = image.convert('RGBA')
    image.thumbnail((604, 920), Image.Resampling.LANCZOS)
    original = image
    while True:
        # Preserve alpha; prefer lossless, then high quality, then a smaller image.
        for options in ({'lossless': True}, *({'quality': q} for q in (90, 85, 80, 75))):
            stream = io.BytesIO()
            image.save(stream, format='WEBP', method=4, exact=True, **options)
            data = stream.getvalue()
            if len(data) < MAX_BYTES:
                with Image.open(io.BytesIO(data)) as decoded:
                    decoded.load()
                    if decoded.size != image.size:
                        raise ValueError('WebP dimensions changed during encoding')
                return data, image.size
        if min(image.size) <= 1:
            raise ValueError('Cannot compress card background below 24KB')
        width = max(1, int(image.width * 0.9))
        height = max(1, round(original.height * width / original.width))
        image = original.resize((width, height), Image.Resampling.LANCZOS)


def main():
    sources = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8-sig'))
    entries = {}
    for school, source in sources.items():
        with Image.open(source) as image:
            data, (width, height) = compress(image)
        sha = hashlib.sha256(data).hexdigest()
        local = f'assets/adventure/card-frames/{school}-{sha}.webp'
        file = ROOT / local
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(data)
        entries[school] = {
            'local': local, 'cdn': None, 'sha256': sha, 'size': len(data),
            'width': width, 'height': height,
            'source': 'AI-generated blank frame from original Haqi card reference; no baked text, badges or skill illustration',
            'sourceSha256': hashlib.sha256(Path(source).read_bytes()).hexdigest(),
        }
    (ROOT / 'data/adventure/card-frames.json').write_text(
        json.dumps({'version': 1, 'entries': entries}, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8',
    )
    print({k: {'bytes': r['size'], 'size': [r['width'], r['height']]} for k, r in entries.items()})


if __name__ == '__main__':
    main()
