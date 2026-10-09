"""Pack the shared image_gen entrance sheet, preserving alpha and CDN provenance."""
import argparse
import json
from pathlib import Path
from PIL import Image
from prepare_environment_art import prepare, ROOT

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    args = parser.parse_args()
    target = ROOT / 'data/adventure/entrance-art.json'
    previous = json.loads(target.read_text(encoding='utf-8'))['atlases']['shared'] if target.exists() else {}
    w, h = Image.open(args.source).size
    # Inspected source gutter: upper towers end before 45% of image height.
    x, y = w // 2, round(h * .45)
    row = prepare(args.source, ['elite', 'towerBasic', 'towerIntermediate', 'towerAdvanced'], 2, 256,
                  'dungeon-entrances', [(0, 0, x, y), (x, 0, w, y), (0, y, x, h), (x, y, w, h)])
    row['source']['prompt'] = previous.get('source', {}).get('prompt', '')
    for i, frame in enumerate(row['frames'].values()):
        frame['cell'] = i
    if row['sha256'] == previous.get('sha256'):
        row['cdn'] = previous.get('cdn', '')
    target.write_text(json.dumps({'schemaVersion': 1, 'atlases': {'shared': row}}, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(row['local'], row['size'])
