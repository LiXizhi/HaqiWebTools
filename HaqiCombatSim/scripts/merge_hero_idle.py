"""Pack existing body pixels into six walking columns plus one idle column.

No generated poses or rescaling: fractional source crops and neck anchors retain
their original geometry. Old idle WebPs remain archival packing inputs only.
"""
import copy, hashlib, io, json, math, statistics
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]

def merge(body):
    walk = body['walk']
    if walk.get('packingVersion') == 2:
        return
    motion = Image.open(ROOT / walk['local']).convert('RGBA')
    idle = Image.open(ROOT / body['local']).convert('RGBA')
    width = height = 192
    atlas = Image.new('RGBA', (width * 7, height * 4))
    walk['source'].setdefault('packedWalkSha256', walk['sha256'])
    walk['source']['idleSha256'] = body['sha256']
    for i, frame in enumerate(walk['frames']):
        x, y, w, h = frame['crop']
        ox, oy = i % 6 * width + (width-w)//2, i // 6 * height
        atlas.paste(motion.crop((x, y, x+w, y+h)), (ox, oy))
        frame['crop'] = [ox, oy, w, h]
    walk['idleFrames'] = []
    for i, original in enumerate(body['frames']):
        frame = copy.deepcopy(original)
        x, y, w, h = frame['crop']
        left, top = math.floor(x), math.floor(y)
        tile = idle.crop((left, top, math.ceil(x+w), math.ceil(y+h)))
        bounds = tile.getchannel('A').point(lambda a: 255 if a > 20 else 0).getbbox()
        baseline = round(statistics.median(f['bounds'][3] for f in walk['frames'][i*6:i*6+6]))
        dy = baseline - bounds[3]
        ox, oy = 6 * width + (width-tile.width)//2, i * height + dy
        assert dy >= 0 and dy+tile.height <= height, ('idle outside cell', i, dy)
        atlas.paste(tile, (ox, oy))
        frame['crop'] = [ox + x-left, oy + y-top, w, h]
        frame['baseline'] = baseline
        walk['idleFrames'].append(frame)
    for options in ({'lossless': True}, *({'quality': q} for q in (98, 95, 90, 85))):
        stream = io.BytesIO()
        atlas.save(stream, format='WEBP', method=6, exact=True, **options)
        raw = stream.getvalue()
        if len(raw) <= 200000:
            break
    assert len(raw) <= 200000
    (ROOT / walk['local']).write_bytes(raw)
    walk.update(width=atlas.width, height=atlas.height, bytes=len(raw),
                sha256=hashlib.sha256(raw).hexdigest(), encoding=options,
                columns=7, rows=4, cellWidth=width, cellHeight=height, packingVersion=2)
    walk.pop('cdn', None)
    print(walk['local'], len(raw), options)

if __name__ == '__main__':
    path = ROOT / 'data/hero-preview.json'
    manifest = json.loads(path.read_text(encoding='utf-8'))
    for gender in ('male', 'female'):
        merge(manifest['bodies'][gender+'-walk'])
    text = json.dumps(manifest, ensure_ascii=False, indent=2)+'\n'
    path.write_text(text, encoding='utf-8')
    (ROOT / 'data/adventure/hero-art.json').write_text(text, encoding='utf-8')
