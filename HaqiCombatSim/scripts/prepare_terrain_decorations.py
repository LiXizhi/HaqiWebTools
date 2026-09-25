"""Pack three image_gen 4x4 alpha sheets into bounded runtime WebP atlases."""
import argparse
import json
from pathlib import Path
from prepare_environment_art import prepare, ROOT

NAMES = {
    'meadow': ['grass', 'wildGrass', 'clover', 'fern', 'daisies', 'buttercups', 'blueFlowers', 'pinkFlowers',
               'moss', 'amberLeaves', 'greenLeaves', 'redMushrooms', 'paleMushrooms', 'lowShrub', 'mixedMeadow', 'grassStone'],
    'stones': ['sandPebbles', 'greyPebbles', 'mossRocks', 'sandstone', 'branch', 'log', 'leafPile', 'roots',
               'volcanicGravel', 'lavaSlab', 'snowRocks', 'iceCrystals', 'sandRipples', 'dryGrass', 'pinecones', 'lichenStone'],
    'shore': ['reeds', 'cattails', 'bankGrass', 'lilyPads', 'shells', 'starfish', 'wetPebbles', 'driftwood',
              'algae', 'bankStone', 'waterLily', 'rushes', 'beachRocks', 'shellFragments', 'coastalGrass', 'coral'],
}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for key in NAMES:
        parser.add_argument('--'+key, type=Path, required=True)
    args = parser.parse_args()
    dest = ROOT/'data/adventure/terrain-decoration-art.json'
    old = json.loads(dest.read_text(encoding='utf-8')) if dest.exists() else {}
    result = {'schemaVersion': 1, 'grid': {'cols': 4, 'rows': 4}, 'atlases': {}}
    for key, names in NAMES.items():
        row = prepare(getattr(args, key), names, 4, 192, 'terrain-'+key)
        row['source']['description'] = 'image_gen 原生透明 4×4 格图；左上光照、俯视三分之四视角、低矮地表装饰'
        row['source']['cells'] = names
        for i, name in enumerate(names):
            row['frames'][name]['cell'] = i
        previous = old.get('atlases', {}).get(key, {})
        if previous.get('sha256') == row['sha256']:
            row['cdn'] = previous.get('cdn', '')
        result['atlases'][key] = row
    dest.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({key: {k: row[k] for k in ['local', 'width', 'height', 'size', 'encoding']} for key, row in result['atlases'].items()}, indent=2))
