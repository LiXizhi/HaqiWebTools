"""Pack five image_gen RGBA sheets with the existing bounded WebP pipeline."""
import argparse
import json
from pathlib import Path
from prepare_environment_art import prepare, ROOT
from PIL import Image

ZONES = ['town', 'fire', 'ice', 'desert', 'dark']
# Generated subjects are isolated, but not aligned to mathematically exact cells.
# Place cuts in the visually inspected empty gutters, before repacking a strict 2x2 grid.
GUTTERS = {'town': (660, 615), 'fire': (660, 615), 'ice': (650, 620), 'desert': (650, 600), 'dark': (640, 620)}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for zone in ZONES:
        parser.add_argument('--'+zone, type=Path, required=True)
    args = parser.parse_args()
    target = ROOT/'data/adventure/building-art.json'
    old = json.loads(target.read_text(encoding='utf-8')) if target.exists() else {}
    manifest = {'schemaVersion': 1, 'grid': {'cols': 2, 'rows': 2}, 'atlases': {}}
    for zone in ZONES:
        source = getattr(args, zone)
        width, height = Image.open(source).size
        gx, gy = GUTTERS[zone]
        x, y = round(gx*width/1254), round(gy*height/1254)
        rects = [(0,0,x,y), (x,0,width,y), (0,y,x,height), (x,y,width,height)]
        row = prepare(source, ['harbor', 'boat', 'village', 'tower'], 2, 384, 'buildings-'+zone, rects)
        row['source']['prompt'] = 'data/adventure/building-art-plan.json#'+zone
        row['source']['reference'] = 'data/adventure/world-map-art.json'
        previous = old.get('atlases', {}).get(zone, {})
        if previous.get('sha256') == row['sha256']:
            row['cdn'] = previous.get('cdn', '')
        for index, frame in enumerate(row['frames'].values()):
            frame['cell'] = index
        manifest['atlases'][zone] = row
    target.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({zone: {'local': row['local'], 'size': row['size']} for zone, row in manifest['atlases'].items()}))
