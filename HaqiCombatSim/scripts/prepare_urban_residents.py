"""Pack independently generated urban heads and bodies; keep runtime geometry.

Generated artwork supplies skin and garment pixels. No base skin or old costume
alpha is restored. A separate manifest lets art review happen before registration.
"""
import argparse
import hashlib
import io
import json
import shutil
from pathlib import Path
from PIL import Image, ImageDraw, ImageChops
from prepare_hero_preview import clean_head

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/hero-preview/urban'
META = ROOT / 'art-references/urban-residents/assets.json'

def read(path):
    return json.loads(path.read_text(encoding='utf-8'))

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def encode(image, path):
    for options in ({'lossless': True}, *({'quality': q} for q in (98, 95, 90, 85))):
        stream = io.BytesIO()
        image.save(stream, 'WEBP', method=6, exact=True, **options)
        raw = stream.getvalue()
        if len(raw) <= 200000:
            path.write_bytes(raw)
            return options
    raise ValueError(f'WebP exceeds 200000 bytes: {path.name}')

def head_atlas(image, spec, anchor_profiles):
    atlas = Image.new('RGBA', (576, 576))
    frames = []
    # Initial attachment points are explicitly provisional. Each head can be
    # recalibrated per direction after inspecting assembled animation frames.
    defaults = [[72, 127] for _ in range(16)]
    anchors = anchor_profiles.get(spec['id'], defaults)
    assert len(anchors) == 16
    for i in range(16):
        x, y = i % 4, i // 4
        cell = clean_head(image.crop((round(x*image.width/4), round(y*image.height/4),
                                     round((x+1)*image.width/4), round((y+1)*image.height/4))))
        bounds = cell.getchannel('A').point(lambda a: 255 if a > 20 else 0).getbbox()
        assert bounds, (spec['id'], i, 'empty head')
        cell = cell.crop(bounds)
        cell.thumbnail((132, 132), Image.Resampling.LANCZOS)
        atlas.alpha_composite(cell, (x*144+(144-cell.width)//2, y*144+136-cell.height))
        # Anatomical height ends at the calibrated jaw/neck, so a dangling braid
        # does not shrink the face relative to the reference head proportions.
        anatomical_height = cell.height + anchors[i][1] - defaults[i][1]
        frames.append({'crop': [x*144, y*144, 144, 144], 'neck': anchors[i], 'height': anatomical_height})
    return atlas, {'directionCount': 16, 'frames': frames, 'anchorProfile': 'art-references/urban-residents/anchors.json#'+spec['id']}

def body_atlas(image, spec, manifest):
    base = manifest['bodies'][spec['gender']+'-walk']
    reference = Image.open(ROOT/spec['reference']['local']).convert('RGBA')
    assert reference.size == (base['width'], base['height'])
    cw, ch = reference.width//7, reference.height//4
    atlas = Image.new('RGBA', reference.size)
    registrations = []
    for i in range(28):
        col, row = i % 7, i // 7
        x, y = col*cw, row*ch
        target = reference.crop((x, y, x+cw, y+ch))
        cell = image.crop((round(col*image.width/7), round(row*image.height/4),
                           round((col+1)*image.width/7), round((row+1)*image.height/4)))
        source_bounds = cell.getchannel('A').point(lambda a: 255 if a > 20 else 0).getbbox()
        target_bounds = target.getchannel('A').point(lambda a: 255 if a > 20 else 0).getbbox()
        assert source_bounds and target_bounds, (spec['id'], i, 'empty body')
        sl, st, sr, sb = source_bounds
        l, t, r, b = target_bounds
        scale = (b-t)/(sb-st)
        edited = cell.crop(source_bounds).resize((max(1, round((sr-sl)*scale)), b-t), Image.Resampling.LANCZOS)
        frame = base['frames'][row] if col == 6 else base['walk']['frames'][row*6+col]
        neck_x = frame['crop'][0]+frame['neck'][0]-x
        top = edited.getchannel('A').crop((0, 0, edited.width, max(2, round(edited.height*.07))))
        points = [(xx, top.getpixel((xx, yy))) for yy in range(top.height) for xx in range(top.width) if top.getpixel((xx, yy)) > 20]
        assert points, (spec['id'], i, 'no neck silhouette')
        center = sum(xx*a for xx, a in points)/sum(a for _, a in points)
        crop = frame.get('renderCrop', frame['crop'])
        left, right = crop[0]-x, crop[0]-x+crop[2]
        fit = min(1, (neck_x-left-1)/max(center, 1), (right-neck_x-1)/max(edited.width-center, 1))
        if fit < 1:
            edited = edited.resize((max(1, round(edited.width*fit)), edited.height), Image.Resampling.LANCZOS)
            center *= fit
        tile = Image.new('RGBA', (cw, ch))
        tile.alpha_composite(edited, (round(neck_x-center), t))
        mask = Image.new('L', (cw, ch))
        ImageDraw.Draw(mask).rectangle((crop[0]-x, crop[1]-y, crop[0]-x+crop[2]-1, crop[1]-y+crop[3]-1), fill=255)
        tile.putalpha(ImageChops.multiply(tile.getchannel('A'), mask))
        atlas.alpha_composite(tile, (x, y))
        registrations.append({'cell': i, 'sourceBounds': source_bounds, 'targetBounds': target_bounds,
                              'neckX': neck_x, 'footBaseline': b-1})
    return atlas, {'baseBody': spec['gender']+'-walk', 'registrationMode': 'neck-anchored-new-skin',
                   'registration': registrations}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--sources', type=Path, default=ROOT/'.asset-cache/urban-residents/sources.json')
    parser.add_argument('--register', action='store_true')
    args = parser.parse_args()
    batch = read(ROOT/'art-references/urban-residents/batch.json')
    manifest = read(ROOT/'data/hero-preview.json')
    metadata = read(META) if META.exists() else {'version': 1, 'heads': {}, 'bodyVariants': {}}
    anchors_path = ROOT/'art-references/urban-residents/anchors.json'
    anchors = read(anchors_path) if anchors_path.exists() else {}
    sources = read(args.sources)
    OUT.mkdir(parents=True, exist_ok=True)
    for spec in batch['requests']:
        if spec['id'] not in sources:
            continue
        source = Path(sources[spec['id']])
        bucket = 'heads' if spec['kind'] == 'head' else 'bodyVariants'
        runtime_id = spec['headId'] if bucket == 'heads' else spec['bodyId']
        previous = metadata[bucket].get(runtime_id, {})
        if bucket == 'heads' and runtime_id != spec['id']:
            metadata[bucket].pop(spec['id'], None)
        anchor_digest = hashlib.sha256(json.dumps(anchors.get(spec['id']), sort_keys=True).encode()).hexdigest() if bucket == 'heads' else None
        if (previous.get('source', {}).get('sha256') == sha(source)
                and (ROOT/spec['output']).is_file()
                and sha(ROOT/spec['output']) == previous.get('sha256')
                and previous.get('anchorDigest') == anchor_digest
                and previous.get('source', {}).get('referenceSha256') == spec['reference']['sha256']):
            continue
        image = Image.open(source).convert('RGBA')
        assert image.getchannel('A').getextrema()[0] == 0, spec['id']+' lacks actual alpha'
        atlas, geometry = head_atlas(image, spec, anchors) if spec['kind'] == 'head' else body_atlas(image, spec, manifest)
        local = spec['output']
        target = ROOT/local
        options = encode(atlas, target)
        archive = ROOT/'.asset-cache/urban-residents/generated'/source.name
        archive.parent.mkdir(parents=True, exist_ok=True)
        if not archive.exists():
            shutil.copyfile(source, archive)
        row = {
            'id': runtime_id, 'name': spec['name'], 'gender': spec['gender'], 'local': local,
            'width': atlas.width, 'height': atlas.height, 'bytes': target.stat().st_size, 'sha256': sha(target),
            'encoding': options, 'promptRef': 'art-references/urban-residents/batch.json#'+spec['id'],
            'source': {'method': 'built-in image_gen reference edit', 'sha256': sha(source),
                       'archive': archive.relative_to(ROOT).as_posix(), 'reference': spec['reference']['local'],
                       'referenceSha256': spec['reference']['sha256']},
            'recommendedHeadId': spec['headId'], 'recommendedBodyId': spec['bodyId'],
            'review': 'pending-visual-review', **geometry,
        }
        assert sha(ROOT/spec['reference']['local']) == row['source']['referenceSha256'], 'Reference changed after planning'
        if previous.get('sha256') == row['sha256'] and previous.get('cdn'):
            row['cdn'] = previous['cdn']
        metadata[bucket][runtime_id] = row
        if bucket == 'heads':
            anchors.setdefault(spec['id'], [frame['neck'] for frame in row['frames']])
            row['anchorDigest'] = hashlib.sha256(json.dumps(anchors[spec['id']], sort_keys=True).encode()).hexdigest()
        print(spec['id'], row['bytes'])
    anchors_path.write_text(json.dumps(anchors, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    META.write_text(json.dumps(metadata, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    if args.register:
        assert len(metadata['heads']) == len(metadata['bodyVariants']) == 20
        for group in ('heads', 'bodyVariants'):
            for key, row in metadata[group].items():
                assert row.get('cdn', '').startswith('https://cdn.keepwork.com/'), (key, 'missing CDN')
                assert row['review'] == 'visual-reviewed', (key, 'pending review')
                manifest.setdefault(group, {})[key] = row
        for path in ('data/hero-preview.json', 'data/adventure/hero-art.json'):
            (ROOT/path).write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

if __name__ == '__main__':
    main()
