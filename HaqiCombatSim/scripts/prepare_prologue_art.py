"""Convert generated prologue key art to runtime WebP (<200,000 bytes) and update data/prologue/art.json.

Usage:
    python scripts/prepare_prologue_art.py <source_dir> [--check]

<source_dir> holds the generated images (PNG/JPEG/WebP). Each file is matched to a manifest id by its
filename prefix (for example word_tree_123.jpg -> word-tree). Existing CDN URLs in the manifest are kept;
new or changed images clear the CDN URL until they are uploaded again.
"""
from collections import deque
import hashlib
import io
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / 'data' / 'prologue' / 'art.json'
OUT_DIR = ROOT / 'assets' / 'prologue'
LIMIT = 200_000
MAX_WIDTH = 1600
IDS = [
    'word-tree', 'dark-lord-steals', 'blank-signposts', 'masters-assemble', 'camp-night-battle-bg',
    'light-shatters', 'blank-cards', 'spark-in-hand', 'dawn-signpost', 'two-worlds-pullback', 'title',
    'dark-lord-boss',
]
SPRITE_IDS = {'dark-lord-boss'}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def remove_white_bg(image: Image.Image) -> Image.Image:
    """Flood-fill remove uniform white background from corners and crop/pad to square RGBA."""
    rgba = image.convert('RGBA')
    w, h = rgba.size
    px = rgba.load()
    visited = bytearray(w * h)
    q = deque()
    for x in range(w):
        q.append((x, 0))
        q.append((x, h - 1))
    for y in range(h):
        q.append((0, y))
        q.append((w - 1, y))

    def is_bg(r: int, g: int, b: int) -> bool:
        return r >= 232 and g >= 232 and b >= 232 and max(r, g, b) - min(r, g, b) <= 22

    while q:
        x, y = q.popleft()
        idx = y * w + x
        if visited[idx]:
            continue
        visited[idx] = 1
        r, g, b, a = px[x, y]
        if not is_bg(r, g, b):
            continue
        px[x, y] = (0, 0, 0, 0)
        if x > 0:
            q.append((x - 1, y))
        if x + 1 < w:
            q.append((x + 1, y))
        if y > 0:
            q.append((x, y - 1))
        if y + 1 < h:
            q.append((x, y + 1))

    # Feather 1px border next to transparent pixels to avoid white halo
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if any(px[nx, ny][3] == 0 for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1))):
                lum = (r + g + b) // 3
                if lum > 200:
                    alpha = max(0, min(255, (250 - lum) * 4))
                    px[x, y] = (r // 2, g // 2, b // 2, alpha)

    bbox = rgba.getbbox()
    if bbox:
        cropped = rgba.crop(bbox)
        cw, ch = cropped.size
        side = int(max(cw, ch) * 1.06)
        canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        canvas.paste(cropped, ((side - cw) // 2, (side - ch) // 2))
        rgba = canvas
    return rgba.resize((256, 256), Image.LANCZOS)


def encode_sprite(image: Image.Image) -> tuple[bytes, Image.Image]:
    frame = remove_white_bg(image)
    buf = io.BytesIO()
    frame.save(buf, 'WEBP', lossless=True, method=6)
    if buf.tell() < 48_000:
        return buf.getvalue(), frame
    for quality in (92, 86, 80, 74):
        buf = io.BytesIO()
        frame.save(buf, 'WEBP', quality=quality, method=6)
        if buf.tell() < 48_000:
            return buf.getvalue(), frame
    raise SystemExit('sprite cannot fit under 48KB')


def encode(image: Image.Image) -> tuple[bytes, Image.Image]:
    """Lossless first, then high-quality lossy, then proportional downscale until under LIMIT."""
    width = min(MAX_WIDTH, image.width)
    while width >= 640:
        frame = image if width == image.width else image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)
        buf = io.BytesIO()
        frame.save(buf, 'WEBP', lossless=True, method=6)
        if buf.tell() < LIMIT:
            return buf.getvalue(), frame
        for quality in (90, 86, 82, 78, 74, 70, 66):
            buf = io.BytesIO()
            frame.save(buf, 'WEBP', quality=quality, method=6)
            if buf.tell() < LIMIT:
                return buf.getvalue(), frame
        width = int(width * 0.85)
    raise SystemExit('cannot fit under limit')


def source_for(folder: Path, art_id: str):
    stem = art_id.replace('-', '_')
    matches = sorted(
        (p for p in folder.iterdir() if p.suffix.lower() in ('.png', '.jpg', '.jpeg', '.webp')
         and (p.stem == art_id or p.stem == stem or p.stem.startswith(stem + '_'))),
        key=lambda p: (p.stat().st_mtime, p.name),
    )
    return matches[-1] if matches else None


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    check = '--check' in sys.argv
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8')) if MANIFEST.exists() else {'version': 1, 'entries': {}}
    if check:
        bad = []
        for art_id in IDS:
            e = manifest['entries'].get(art_id)
            path = ROOT / e['local'] if e else None
            if not e or not path.exists():
                bad.append(f'{art_id}: missing'); continue
            data = path.read_bytes()
            if len(data) >= LIMIT or sha256(data) != e['sha256'] or len(data) != e['size']:
                bad.append(f'{art_id}: size/hash mismatch')
        print('\n'.join(bad) or 'ok')
        sys.exit(1 if bad else 0)
    if not args:
        raise SystemExit(__doc__)
    folder = Path(args[0])
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for art_id in IDS:
        src = source_for(folder, art_id)
        if not src:
            print('skip (no source):', art_id); continue
        raw = src.read_bytes()
        raw_img = Image.open(io.BytesIO(raw))
        if art_id in SPRITE_IDS:
            data, frame = encode_sprite(raw_img)
        else:
            data, frame = encode(raw_img.convert('RGB'))
        digest = sha256(data)
        name = f'{art_id}-{digest[:12]}.webp'
        old = manifest['entries'].get(art_id)
        if old and old.get('sha256') != digest:
            stale = ROOT / old['local']
            if stale.exists() and stale.name != name:
                stale.unlink()
        (OUT_DIR / name).write_bytes(data)
        manifest['entries'][art_id] = {
            'local': f'assets/prologue/{name}',
            'cdn': old['cdn'] if old and old.get('sha256') == digest else '',
            'width': frame.width, 'height': frame.height, 'size': len(data), 'sha256': digest,
            'sourceSha256': sha256(raw), 'sourceSize': [raw_img.width, raw_img.height],
            'source': 'Generated 2026-10-18 with the agent built-in image tool for the prologue (new creation, not original game art).',
        }
        print(f'{art_id}: {frame.width}x{frame.height} {len(data)} bytes')
    manifest['byteLimitExclusive'] = LIMIT
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
