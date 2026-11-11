"""Prepare native-alpha imagegen outputs; no colour keying or repainting."""
import hashlib, io, json, sys
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
rows = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
dest = root / 'assets/adventure/battle-scenery'
dest.mkdir(parents=True, exist_ok=True)
manifest = {'version': 1, 'generator': 'OpenAI built-in image_gen', 'status': 'local-preview-unpublished', 'assets': {}}
for row in rows:
    raw = Path(row['source']).read_bytes()
    image = Image.open(io.BytesIO(raw)).convert('RGBA' if row['alpha'] else 'RGB')
    if row['alpha']:
        hist = image.getchannel('A').histogram()
        assert hist[0] > image.width * image.height * .01, 'Missing true alpha: ' + row['id']
    image.thumbnail((1536, 1024), Image.Resampling.LANCZOS)
    buf = io.BytesIO(); image.save(buf, 'WEBP', lossless=True, method=6)
    quality = 'lossless'
    if len(buf.getvalue()) > 200000:
        for q in [90, 85, 80, 75, 70, 65]:
            buf = io.BytesIO(); image.save(buf, 'WEBP', quality=q, method=6)
            if len(buf.getvalue()) <= 200000:
                quality=q; break
    data = buf.getvalue()
    assert len(data) <= 200000, row['id'] + ' exceeds budget'
    out = dest / (row['id']+'.webp'); out.write_bytes(data)
    check=Image.open(out)
    assert not row['alpha'] or check.mode=='RGBA'
    manifest['assets'][row['id']]={'local':out.relative_to(root).as_posix(),'cdn':None,'width':image.width,'height':image.height,'size':len(data),'sha256':hashlib.sha256(data).hexdigest(),'sourceSha256':hashlib.sha256(raw).hexdigest(),'sourceFile':Path(row['source']).name,'alpha':row['alpha'],'quality':quality,'promptDetail':row['prompt']}
    print(row['id'], image.size, len(data), 'alpha='+str(row['alpha']))
(root/'data/adventure/battle-scenery.json').write_bytes((json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode())
