"""Pack an inspected NPC sheet into one transparent, budgeted city WebP.

Usage: python scripts/prepare_earth_npc_art.py source.png city.json --columns 4 --rows 2
Grid order matches city.npcs; conversion preserves alpha and aspect ratio.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
parser.add_argument('city', type=Path)
parser.add_argument('--columns', type=int, default=4)
parser.add_argument('--rows', type=int, default=2)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
city = json.loads(args.city.read_text(encoding='utf-8'))
source = Image.open(args.source).convert('RGBA')
assert source.getchannel('A').getextrema()[0] == 0, 'Source must have transparency'
assert args.columns > 0 and args.rows > 0
assert 0 < len(city['npcs']) <= args.columns * args.rows, 'NPC count must fit grid'
for edge in [256, 224, 192]:
    height = round(edge * 1.25)
    atlas = Image.new('RGBA', (edge * args.columns, height * args.rows))
    frames = []
    for i, npc in enumerate(city['npcs']):
        x, y = i % args.columns, i // args.columns
        cell = source.crop((round(x*source.width/args.columns), round(y*source.height/args.rows),
                            round((x+1)*source.width/args.columns), round((y+1)*source.height/args.rows)))
        box = cell.getchannel('A').getbbox()
        assert box, f'Empty NPC cell: {npc["id"]}'
        cell = cell.crop(box)
        cell.thumbnail((edge-20, height-20), Image.Resampling.LANCZOS)
        atlas.alpha_composite(cell, (x*edge+(edge-cell.width)//2, y*height+height-10-cell.height))
        frames.append([x*edge, y*height, edge, height])
    for options in [{'lossless': True}] + [{'quality': q} for q in [92, 88, 85, 80, 75]]:
        buffer = io.BytesIO()
        atlas.save(buffer, 'WEBP', method=6, **options)
        output = buffer.getvalue()
        if len(output) <= 200000:
            break
    if len(output) <= 200000:
        break
else:
    raise ValueError('NPC atlas exceeds 200000 bytes')
digest = hashlib.sha256(output).hexdigest()
name = f'{city["id"]}-npcs-{digest[:12]}.webp'
local = f'assets/adventure/earth/{name}'
(root/local).write_bytes(output)
city['art']['npcs'] = dict(id=f'earth-npcs:{city["id"]}:{digest[:12]}', local=local,
    width=atlas.width, height=atlas.height, bytes=len(output), sha256=digest,
    sourceSha256=hashlib.sha256(args.source.read_bytes()).hexdigest(), frames=frames,
    source='AI-generated offline fictional city residents; transparent shared atlas', encoding=options)
for i, npc in enumerate(city['npcs']):
    npc['portrait'] = dict(id=city['art']['npcs']['id'], crop=frames[i])
args.city.write_text(json.dumps(city, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps(dict(local=local, bytes=len(output), size=atlas.size, sha256=digest)))
