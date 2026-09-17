#!/usr/bin/env python3
"""Package an imagegen 3x3 RGBA sheet as a budgeted runtime WebP atlas."""
import hashlib
import io
import json
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BASES = [
    'Ice_Absorb_LevelX', 'Ice_SingleAttack_Level3', 'Ice_SingleAttack_Level6',
    'Fire_SingleAttack_Level1', 'Fire_SingleAttack_Level3', 'Storm_SingleAttack_Level4',
    'Life_SingleHeal_Level0', 'Life_SingleAttack_Level2', 'Death_SingleAttackWithLifeTap_Level2',
]


def main():
    source = Path(sys.argv[1])
    original = Image.open(source).convert('RGBA')
    if original.width != original.height or original.getchannel('A').getextrema()[0] != 0:
        raise ValueError('Expected a square atlas with transparent background')
    # Equal cells remain exact integers after resampling; no frame coordinates drift.
    for edge in (960, 864, 768, 672, 576):
        image = original.resize((edge, edge), Image.Resampling.LANCZOS)
        for options in ({'lossless': True}, *({'quality': q} for q in (90, 85, 80, 75))):
            output = io.BytesIO()
            image.save(output, format='WEBP', method=4, exact=True, **options)
            data = output.getvalue()
            if len(data) <= 200_000:
                break
        else:
            continue
        break
    else:
        raise ValueError('Atlas exceeds 200KB')
    decoded = Image.open(io.BytesIO(data)); decoded.load()
    assert decoded.size == (edge, edge) and decoded.getchannel('A').getextrema()[0] == 0
    sha = hashlib.sha256(data).hexdigest()
    local = f'assets/adventure/card-atlas/skills-{sha}.webp'
    target = ROOT / local
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    art = json.loads((ROOT / 'data/kids/spell-art.json').read_text(encoding='utf-8'))['bases']
    cells = []
    cell = edge // 3
    for index, base in enumerate(BASES):
        reference = art[base]
        cells.append({
            'id': base, 'name': reference['name'], 'school': base.split('_')[0].lower(),
            'rect': [index % 3 * cell, index // 3 * cell, cell, cell],
            'original': reference,
        })
    manifest = {
        'version': 1, 'columns': 3, 'rows': 3,
        'image': {'local': local, 'cdn': None, 'width': edge, 'height': edge,
                  'size': len(data), 'sha256': sha,
                  'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                  'source': 'imagegen redraw from nine original Haqi card subjects; equal 3x3 transparent sprite atlas'},
        'cells': cells,
    }
    (ROOT / 'data/adventure/card-atlas.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'local': local, 'size': len(data), 'edge': edge}))


if __name__ == '__main__':
    main()
