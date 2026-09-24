"""Pack imagegen RGBA atlases without changing their art or per-cell geometry."""
from pathlib import Path
from PIL import Image
import hashlib, io, json, sys

ROOT = Path(__file__).resolve().parent
SOURCES = {
    'dragon': 'exec-da90b313-970b-4ece-aa24-4ab016207b9a.png',
    'bird': 'exec-6519f574-fdc4-456e-8cc2-f82b70325fa0.png',
    'car': 'exec-44d45cf5-84f8-453c-9526-4568ef2693a0.png',
    'carpet': 'exec-d6ab6553-b89d-4ecd-8bc3-493022ab4796.png',
    'rider': 'exec-c6d62642-6776-4c3b-8ea0-553f2d5e95ed.png',
    'standing': 'exec-efa1c2ab-8b06-4f8a-a183-9bcaedd850e2.png',
}

def main():
    sources = Path(sys.argv[1])
    manifest = {}
    for key, filename in SOURCES.items():
        original = sources / filename
        image = Image.open(original).convert('RGBA')
        assert image.width == image.height and image.getchannel('A').getextrema() == (0, 255)
        image = image.resize((768, 768), Image.Resampling.LANCZOS)
        for options in ({'lossless': True}, *({'quality': q} for q in (94, 90, 85, 80))):
            stream = io.BytesIO()
            image.save(stream, format='WEBP', method=6, exact=True, **options)
            data = stream.getvalue()
            if len(data) <= 200000:
                break
        assert len(data) <= 200000
        digest = hashlib.sha256(data).hexdigest()
        local = f'assets/{key}-{digest[:12]}.webp'
        (ROOT / local).write_bytes(data)
        manifest[key] = {'local': local, 'cdn': None, 'width': 768, 'height': 768,
            'columns': 2, 'rows': 2, 'bytes': len(data), 'sha256': digest,
            'source': {'tool': 'imagegen', 'file': filename,
                       'sha256': hashlib.sha256(original.read_bytes()).hexdigest()},
            'encoding': options}
        print(key, len(data), local)
    (ROOT / 'assets.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')

if __name__ == '__main__':
    main()
