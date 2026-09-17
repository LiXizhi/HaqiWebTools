#!/usr/bin/env python3
"""Prepare same-size, lossless WebP assets. Pillow is a development-only dependency."""
import argparse, hashlib, io, json, urllib.request, zipfile, zlib
from pathlib import Path
from PIL import Image, __version__ as pillow_version

ROOT = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser()
p.add_argument('--verify', action='store_true')
p.add_argument('--prune-png', action='store_true', help='Remove only PNG inputs successfully converted and verified')
args = p.parse_args()
manifest = json.loads((ROOT/'data/adventure/assets.json').read_text())
output = ROOT/'data/adventure/media.json'
previous = json.loads(output.read_text()) if output.exists() else {'entries': {}}
entries = {}
def digest(data): return hashlib.sha256(data).hexdigest()
def decode(data):
    image = Image.open(io.BytesIO(data)); image.load(); return image
for key, source in {**manifest, **{name: {'local': f'assets/adventure/{name}.png', 'optional': False} for name in ['sprites','creatures']}}.items():
    old = previous['entries'].get(key)
    source_file = ROOT/source['local']
    source_unchanged = not source_file.exists() or (old and digest(source_file.read_bytes()) == old.get('sourceSha256'))
    if old and source_unchanged and old.get('sourceEntry') == source.get('entry'):
        target = ROOT/old['local']
        if target.exists() and digest(target.read_bytes()) == old['sha256']:
            if old['local'].endswith('.webp'):
                image = decode(target.read_bytes())
                assert list(image.size) == [old['width'], old['height']]
            entries[key] = old
            continue
    if args.verify: raise SystemExit(f'Missing or changed prepared asset: {key}')
    source_file = ROOT/source['local']
    if source_file.exists(): raw = source_file.read_bytes()
    elif source.get('url'):
        with urllib.request.urlopen(source['url'], timeout=40) as response: raw = response.read()
        assert len(raw) == source['size'] and hashlib.md5(raw).hexdigest() == source['md5'], key
        if source['path'].endswith('.z'):
            if raw.startswith(b'PK'):
                with zipfile.ZipFile(io.BytesIO(raw)) as archive: raw = archive.read(archive.namelist()[0])
            else: raw = zlib.decompress(raw)
    else: raise SystemExit(f'Provide original atlas at {source_file}, or restore its prepared WebP from Git.')
    source_hash = digest(raw)
    if source_file.suffix == '.ogg':
        assert raw.startswith(b'OggS')
        local = source['local']; encoded = raw; extra = {}
    else:
        image = decode(raw).convert('RGBA')
        stream = io.BytesIO(); image.save(stream, format='WEBP', lossless=True, method=6, exact=True)
        encoded = stream.getvalue(); decoded = decode(encoded).convert('RGBA')
        assert decoded.size == image.size and decoded.tobytes() == image.tobytes(), key
        local = f'assets/adventure/webp/{source_file.stem}.webp'
        extra = {'width': image.width, 'height': image.height, 'encoder': f'Pillow {pillow_version}; lossless WebP; exact alpha'}
    target = ROOT/local; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(encoded)
    entries[key] = {'local': local, 'sha256': digest(encoded), 'size': len(encoded), 'cdn': None,
                    'optional': source.get('optional', False), 'sourceEntry': source.get('entry'),
                    'sourceSha256': source_hash, 'sourceBytes': len(raw), **extra}
    if old and old['sha256'] == entries[key]['sha256']: entries[key]['cdn'] = old.get('cdn')
if not args.verify:
    output.write_text(json.dumps({'schemaVersion': 1, 'entries': entries}, ensure_ascii=False, indent=2)+'\n')
if args.prune_png:
    for key, row in entries.items():
        source = ROOT/(manifest[key]['local'] if key in manifest else f'assets/adventure/{key}.png')
        if source.suffix == '.png' and source.exists():
            assert digest(source.read_bytes()) == row['sourceSha256'], key
            source.unlink()
print(f'{len(entries)} assets verified; original {sum(e["sourceBytes"] for e in entries.values()):,} bytes → prepared {sum(e["size"] for e in entries.values()):,} bytes.')
