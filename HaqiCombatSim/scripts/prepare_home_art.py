"""Prepare 10 4x4 WebP atlases (160 items total) for the Home system catalog.

Usage:
    python scripts/prepare_home_art.py --plan
    python scripts/prepare_home_art.py --pack .cache/home-art/sources
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / 'data' / 'adventure' / 'home' / 'catalog.json'
PLAN_PATH = ROOT / 'data' / 'adventure' / 'home' / 'home-art-plan.json'
MANIFEST_PATH = ROOT / 'data' / 'adventure' / 'home' / 'home-art.json'
OUT_DIR = ROOT / 'assets' / 'adventure' / 'home'
MAX_BYTES = 200_000


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def build_plan():
    catalog = json.loads(CATALOG_PATH.read_text(encoding='utf-8'))
    items = catalog['items']
    assert len(items) == 160, f'Expected 160 items, got {len(items)}'
    atlases = []
    for idx in range(10):
        chunk = items[idx * 16:(idx + 1) * 16]
        atlas_id = f'home-atlas-{idx + 1:02d}'
        cells = []
        for cell_idx, item in enumerate(chunk):
            r, c = divmod(cell_idx, 4)
            cells.append({
                'cell': cell_idx,
                'row': r + 1,
                'col': c + 1,
                'id': item['id'],
                'en': item['en'],
                'zh': item['zh'],
                'category': item['category'],
                'layer': item['layer'],
                'shape': item.get('art', {}).get('shape', 'box'),
            })
        atlases.append({
            'atlasId': atlas_id,
            'grid': {'cols': 4, 'rows': 4},
            'cells': cells,
        })
    PLAN_PATH.write_text(json.dumps({'version': 1, 'atlases': atlases}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for a in atlases:
        desc = '; '.join(f"R{c['row']}C{c['col']}: {c['en']} ({c['zh']})" for c in a['cells'])
        print(f"{a['atlasId']}: {desc}")


def transparent_objects(image):
    """Assign whole alpha components to row-major cells; never cut at grid lines.

    Input must be native-alpha ImageGen PNG. White-keying is deliberately forbidden.
    Disconnected parts (e.g. stepping stones) share the same logical cell.
    """
    import numpy as np
    from scipy import ndimage
    if image.mode != 'RGBA':
        raise ValueError('Native RGBA source required; JPEG/white-key sources are rejected')
    pixels = np.asarray(image)
    alpha = pixels[:, :, 3]
    if np.mean(alpha == 0) < .15 or alpha.max() < 200:
        raise ValueError('Source lacks genuine transparent background or opaque subjects')
    labels, count = ndimage.label(alpha > 8)
    boxes = ndimage.find_objects(labels)
    areas = np.bincount(labels.ravel())
    assignment = np.zeros(count + 1, dtype=np.uint8)
    major = [0] * 16
    for i, box in enumerate(boxes, 1):
        ys, xs = box
        x = (xs.start + xs.stop) / 2
        y = (ys.start + ys.stop) / 2
        col = min(3, int(x * 4 / image.width))
        row = min(3, int(y * 4 / image.height))
        cell = row * 4 + col
        assignment[i] = cell + 1
        if areas[i] >= 200:
            major[cell] += 1
            if xs.start == 0 or ys.start == 0 or xs.stop == image.width or ys.stop == image.height:
                raise ValueError(f'Object {cell} touches source edge; regenerate with more margin')
    if not all(major):
        raise ValueError(f'Missing/merged objects in source: {major}')
    groups = assignment[labels]
    result = []
    for cell in range(16):
        mask = groups == cell + 1
        ys, xs = np.nonzero(mask)
        box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
        x0, y0, x1, y1 = box
        rgba = pixels[y0:y1, x0:x1].copy()
        rgba[~mask[y0:y1, x0:x1]] = 0
        result.append((Image.fromarray(rgba), box))
    return result


def encode_atlas(atlas_img: Image.Image) -> tuple[bytes, dict]:
    for cell_size in (192, 176, 160, 144):
        target_w = cell_size * 4
        scaled = atlas_img if atlas_img.width == target_w else atlas_img.resize((target_w, target_w), Image.Resampling.LANCZOS)
        for options in [{'lossless': True}] + [{'lossless': False, 'quality': q} for q in (92, 88, 84, 80, 76, 72)]:
            buf = io.BytesIO()
            save_kwargs = {'method': 6}
            if options['lossless']:
                save_kwargs['lossless'] = True
            else:
                save_kwargs['quality'] = options['quality']
            scaled.save(buf, 'WEBP', **save_kwargs)
            data = buf.getvalue()
            if len(data) <= MAX_BYTES:
                return data, options, scaled.width
    raise ValueError('Atlas cannot fit under 200,000 bytes')


def pack_all(source_dir: Path):
    plan = json.loads(PLAN_PATH.read_text(encoding='utf-8'))
    catalog = json.loads(CATALOG_PATH.read_text(encoding='utf-8'))
    old_manifest = json.loads(MANIFEST_PATH.read_text(encoding='utf-8')) if MANIFEST_PATH.exists() else {'atlases': {}}
    item_by_id = {item['id']: item for item in catalog['items']}

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    atlases_out = {}

    for group in plan['atlases']:
        atlas_id = group['atlasId']
        src_path = None
        for ext in ('.png', '.webp', '.jpg', '.jpeg'):
            candidate = source_dir / f'{atlas_id}{ext}'
            if candidate.exists():
                src_path = candidate
                break
        if not src_path:
            raise FileNotFoundError(f'Missing source image for {atlas_id} in {source_dir}')

        raw_bytes = src_path.read_bytes()
        src_sha = sha256_bytes(raw_bytes)
        src_img = Image.open(src_path)
        objects = transparent_objects(src_img)
        sw, sh = src_img.size

        base_cell = 192
        master_atlas = Image.new('RGBA', (base_cell * 4, base_cell * 4), (0, 0, 0, 0))
        cell_meta = []

        for cell_info in group['cells']:
            idx = cell_info['cell']
            r, c = divmod(idx, 4)
            cropped, (x0, y0, x1, y1) = objects[idx]
            alpha_box = (0, 0, cropped.width, cropped.height)
            pad = 12
            max_side = base_cell - pad * 2
            cropped.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
            dx = c * base_cell + (base_cell - cropped.width) // 2
            dy = r * base_cell + (base_cell - cropped.height) // 2
            master_atlas.alpha_composite(cropped, (dx, dy))
            cell_meta.append({
                'info': cell_info,
                'master_rect': [dx, dy, cropped.width, cropped.height],
                'source_crop': [x0, y0, x1 - x0, y1 - y0],
                'alpha_box': list(alpha_box),
            })

        webp_bytes, encoding, final_width = encode_atlas(master_atlas)
        scale = final_width / (base_cell * 4)
        webp_sha = sha256_bytes(webp_bytes)
        filename = f'{atlas_id}-{webp_sha[:12]}.webp'
        local_rel = f'assets/adventure/home/{filename}'
        (ROOT / local_rel).write_bytes(webp_bytes)

        prev_atlas = old_manifest.get('atlases', {}).get(atlas_id, {})
        cdn_url = prev_atlas.get('cdn', '') if prev_atlas.get('sha256') == webp_sha else f'https://cdn.keepwork.com/keepwork/cdn/haqi/home/{filename}'

        frames = {}
        for cm in cell_meta:
            info = cm['info']
            mx, my, mw, mh = cm['master_rect']
            rx = max(0, round(mx * scale))
            ry = max(0, round(my * scale))
            rw = max(1, round(mw * scale))
            rh = max(1, round(mh * scale))
            # Reviewed crop corrections belong to these exact encoded pixels only.
            previous_frame = prev_atlas.get('frames', {}).get(info['id'], {})
            correction = previous_frame.get('cropCorrection') if prev_atlas.get('sha256') == webp_sha else None
            if correction:
                rx, ry, rw, rh = previous_frame['rect']
            frames[info['id']] = {
                'cell': info['cell'],
                'rect': [rx, ry, rw, rh],
                'sourceRect': cm['source_crop'],
                'sourceAlphaBounds': cm['alpha_box'],
            }
            if correction:
                frames[info['id']]['cropCorrection'] = correction
            item = item_by_id[info['id']]
            old_shape = item.get('art', {}).get('shape', info['shape'])
            item['art'] = {
                'kind': 'sprite',
                'shape': old_shape,
                'id': f"home-art:{atlas_id}:{info['id']}:{webp_sha[:12]}",
                'atlas': atlas_id,
                'local': local_rel,
                'cdn': cdn_url,
                'width': rw,
                'height': rh,
                'atlasWidth': final_width,
                'atlasHeight': final_width,
                'bytes': len(webp_bytes),
                'sha256': webp_sha,
                'sourceSha256': src_sha,
                'source': 'Built-in image_gen native transparent RGBA; alpha-component packed 4x4 atlas',
                'encoding': encoding,
                'crop': [rx, ry, rw, rh],
                'anchor': [0.5, 1],
            }

        atlases_out[atlas_id] = {
            'id': atlas_id,
            'local': local_rel,
            'cdn': cdn_url,
            'width': final_width,
            'height': final_width,
            'bytes': len(webp_bytes),
            'sha256': webp_sha,
            'source': {
                'generator': 'image_gen',
                'transparentBackground': True,
                'alphaProcessing': 'preserved; whole connected components assigned to logical cells',
                'sha256': src_sha,
                'width': sw,
                'height': sh,
                'description': 'Cozy 3/4 top-down game furniture & prop 4x4 sprite atlas',
            },
            'encoding': encoding,
            'frames': frames,
        }
        print(f'Packed {atlas_id}: {local_rel} ({len(webp_bytes)} bytes, {final_width}x{final_width})')

    MANIFEST_PATH.write_text(json.dumps({
        'schemaVersion': 1,
        'grid': {'cols': 4, 'rows': 4},
        'atlases': atlases_out,
    }, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    CATALOG_PATH.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Updated {MANIFEST_PATH} and {CATALOG_PATH} (160/160 items now use WebP atlases).')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--plan', action='store_true')
    parser.add_argument('--pack', type=Path)
    args = parser.parse_args()
    if args.plan:
        build_plan()
    elif args.pack:
        pack_all(args.pack)
    else:
        parser.print_help()

