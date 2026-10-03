"""Pack the generated four-direction boat/dock sheet, preserving alpha and provenance."""
import argparse
import json
from pathlib import Path
from prepare_environment_art import prepare, ROOT

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
args = parser.parse_args()
names = ['boatDown', 'boatLeft', 'boatRight', 'boatUp', 'dockDown', 'dockLeft', 'dockRight', 'dockUp']
row = prepare(args.source, names, 4, 192, 'earth-boats')
row['source']['description'] = 'image_gen原生透明4列2行：上排四向无人木船，下排四向木码头；俯视手绘RPG风格。'
row['source']['prompt'] = 'Four columns by two rows, transparent atlas. Top: same small open wooden rowboat, cream rim, turquoise hull, brass details, empty central seat; bow down, left, right, up. Bottom: narrow weathered wooden docks, posts and rope, projecting down, left, right, up. Elevated RPG camera, hand-painted, isolated sprites, no people, land, water, shadows or text.'
dest = ROOT/'data/adventure/earth/boat-art.json'
if dest.exists():
    old = json.loads(dest.read_text(encoding='utf-8'))
    if old.get('sha256') == row['sha256']:
        row['cdn'] = old.get('cdn', '')
dest.write_text(json.dumps({'schemaVersion': 1, **row}, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps({k: row[k] for k in ['local', 'size', 'encoding', 'width', 'height']}))
