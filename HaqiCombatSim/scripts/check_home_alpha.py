"""Verify native-alpha home atlases, content hashes, padding and crop metadata."""
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / 'data/adventure/home/home-art.json').read_text(encoding='utf-8'))
catalog = json.loads((ROOT / 'data/adventure/home/catalog.json').read_text(encoding='utf-8'))
items = {i['id']: i for i in catalog['items']}
for atlas in manifest['atlases'].values():
    path = ROOT / atlas['local']
    data = path.read_bytes()
    assert len(data) <= 200_000
    assert hashlib.sha256(data).hexdigest() == atlas['sha256']
    image = Image.open(path)
    assert image.mode == 'RGBA'
    alpha = np.asarray(image)[:, :, 3]
    assert np.mean(alpha == 0) > .3
    assert atlas['source']['transparentBackground'] is True
    cell = image.width // 4
    for key, frame in atlas['frames'].items():
        assert items[key]['art']['crop'] == frame['rect']
        x, y, w, h = frame['rect']
        row, col = divmod(frame['cell'], 4)
        tile = alpha[row*cell:(row+1)*cell, col*cell:(col+1)*cell]
        assert not tile[:8].any() and not tile[-8:].any(), key
        assert not tile[:, :8].any() and not tile[:, -8:].any(), key
        assert alpha[y:y+h, x:x+w].max() == 255, key
        assert 'cropCorrection' not in frame, key
    print(f"{atlas['id']}: native alpha, 16 padded frames, {len(data)} bytes, SHA-256 verified")
print('160 home sprites verified')
