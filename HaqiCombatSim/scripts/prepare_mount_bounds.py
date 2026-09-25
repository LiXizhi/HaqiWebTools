"""Measure visible frame bounds without changing or uploading any art."""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
LAB = ROOT / 'demos/mount-lab'
assets = json.loads((LAB / 'assets.json').read_text(encoding='utf-8'))

def bounds(asset):
    image = Image.open(LAB / asset['local']).convert('RGBA')
    w, h = image.width // 2, image.height // 2
    result = []
    for i in range(4):
        alpha = image.crop((i % 2 * w, i // 2 * h, (i % 2 + 1) * w, (i // 2 + 1) * h)).getchannel('A')
        # Ignore nearly transparent resampling noise, matching visual content.
        box = alpha.point(lambda a: 255 if a > 16 else 0).getbbox()
        if box is None:
            raise ValueError(f"Empty frame {asset['local']} / {i}")
        result.append([box[0] / w, box[1] / h, box[2] / w, box[3] / h])
    return result

riders = {key: bounds(assets[key]) for key in ['standing', 'rider', 'female-standing', 'female-rider']}
for path in [LAB / 'catalog.json', ROOT / 'data/adventure/mount-catalog.json']:
    catalog = json.loads(path.read_text(encoding='utf-8'))
    for mount in catalog['mounts']:
        mount['layoutBounds'] = {'mount': bounds(assets[mount['id']]), 'riders': riders}
    path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2 if path.parent == LAB else None), encoding='utf-8')
print('Updated visible mount/rider bounds in lab and game catalogs')
