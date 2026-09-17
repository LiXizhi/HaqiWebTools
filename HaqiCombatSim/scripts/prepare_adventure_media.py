#!/usr/bin/env python3
"""Prepare WebP assets within a strict 200,000-byte budget. Pillow is a development-only dependency."""
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
MAX_WEBP_BYTES = 200_000
def encode_webp(image):
    image = image.convert('RGBA')
    stream = io.BytesIO(); image.save(stream, format='WEBP', lossless=True, method=4, exact=True)
    if len(stream.getvalue()) <= MAX_WEBP_BYTES:
        return stream.getvalue(), image, f'Pillow {pillow_version}; lossless WebP; exact alpha'
    original = image
    # Preserve readable color detail rather than forcing extremely low quality.
    # Alpha remains lossless at each chosen resolution. Always resample the original.
    factor = 1.0
    while min(image.size) >= 128:
        for quality in [85, 75]:
            stream = io.BytesIO(); image.save(stream, format='WEBP', quality=quality, method=4, exact=True)
            if len(stream.getvalue()) <= MAX_WEBP_BYTES:
                return stream.getvalue(), image, f'Pillow {pillow_version}; WebP quality {quality}; alpha preserved; max {MAX_WEBP_BYTES} bytes'
        factor *= .8
        image = original.resize((max(1, round(original.width*factor)), max(1, round(original.height*factor))), Image.Resampling.LANCZOS)
    raise SystemExit('Image cannot fit WebP size budget without excessive downscaling')
for key, source in {**manifest, **{name: {'local': f'assets/adventure/{name}.png', 'optional': False} for name in ['sprites','creatures','summons']}}.items():
    old = previous['entries'].get(key)
    source_file = ROOT/source['local']
    source_unchanged = not source_file.exists() or (old and digest(source_file.read_bytes()) == old.get('sourceSha256'))
    if old and source_unchanged and old.get('sourceEntry') == source.get('entry'):
        target = ROOT/old['local']
        if target.exists() and digest(target.read_bytes()) == old['sha256']:
            if old['local'].endswith('.webp'):
                image = decode(target.read_bytes())
                assert list(image.size) == [old['width'], old['height']]
                if target.stat().st_size > MAX_WEBP_BYTES:
                    if args.verify: raise SystemExit(f'WebP exceeds 200KB: {key}')
                    encoded, image, encoder = encode_webp(image)
                    decode(encoded)
                    target.write_bytes(encoded)
                    old = {**old, 'width': image.width, 'height': image.height, 'size': len(encoded),
                           'sha256': digest(encoded), 'cdn': None, 'encoder': encoder}
                    print(f'{key}: {len(encoded):,} bytes, {image.width}x{image.height}', flush=True)
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
        encoded, image, encoder = encode_webp(decode(raw))
        decoded = decode(encoded)
        assert decoded.size == image.size
        local = f'assets/adventure/webp/{source_file.stem}.webp'
        extra = {'width': image.width, 'height': image.height, 'encoder': encoder}
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
