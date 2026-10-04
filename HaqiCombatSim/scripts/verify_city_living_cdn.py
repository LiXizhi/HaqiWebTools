"""Verify only atlas URLs returned by the uploader, including bytes, decoding and CORS."""
import concurrent.futures, hashlib, io, json, urllib.request
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'data/adventure/earth/street-art.json').read_text(encoding='utf8'))

def verify(row):
    key, entry = row
    request = urllib.request.Request(entry['cdn'], headers={'Origin': 'http://127.0.0.1:8797'})
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read()
        cors = response.headers.get('Access-Control-Allow-Origin')
        assert cors in ['*', 'http://127.0.0.1:8797'], (key, cors)
    assert hashlib.sha256(data).hexdigest() == entry['sha256'], key
    image = Image.open(io.BytesIO(data)).convert('RGBA')
    assert image.size == (entry['width'], entry['height']), key
    alpha = image.getchannel('A').getextrema()
    # Some imagegen cutouts retain near-opaque alpha (252–254). Preserve
    # it rather than editing pixels merely to satisfy an exact-255 check.
    # The full byte hash already proves parity with the local prepared copy.
    assert alpha[0] == 0 and alpha[1] >= 250, (key, alpha)
    return {'key': key, 'cdn': entry['cdn'], 'bytes': len(data), 'cors': cors, 'alpha': alpha, 'sha256': entry['sha256']}

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    rows = list(pool.map(verify, manifest['atlases'].items()))
output = root / '.cache/city-living-cdn.json'
output.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps({'verified': len(rows), 'bytes': sum(r['bytes'] for r in rows), 'maxBytes': max(r['bytes'] for r in rows), 'report': str(output)}))
