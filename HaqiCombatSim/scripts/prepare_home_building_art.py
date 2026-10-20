"""Pack verified material rectangles from native transparent imagegen output. No keying."""
import sys, json, hashlib
from pathlib import Path
from PIL import Image
source=Path(sys.argv[1]); im=Image.open(source).convert('RGBA')
# Visually verified full panel boundaries, not blind equal-grid cuts.
rects=[(28,80,350,402),(376,82,696,400),(729,82,1044,400),(1077,82,1396,400),(1426,80,1745,402),
       (30,479,350,793),(377,479,695,793),(730,479,1043,793),(1078,479,1395,793),(1426,479,1745,793)]
assert im.width==1774 and im.getchannel('A').getextrema()[0]==0
out=Path('assets/adventure/home');out.mkdir(parents=True,exist_ok=True)
rows=[]
for n,rect in enumerate(rects):
 panel=im.crop(rect).resize((160,160),Image.Resampling.LANCZOS)
 import io
 data=io.BytesIO();panel.save(data,format='WEBP',lossless=True)
 if len(data.getvalue())>200000:data=io.BytesIO();panel.save(data,format='WEBP',quality=92)
 raw=data.getvalue();assert len(raw)<=200000
 sha=hashlib.sha256(raw).hexdigest();name=f'building-{n}-{sha[:12]}.webp';(out/name).write_bytes(raw)
 rows.append(dict(local=str(out/name),sha256=sha,bytes=len(raw),width=160,height=160,crop=[0,0,160,160],sourceRect=list(rect),sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),source='Built-in image_gen native transparent material atlas; verified individual panel boundaries'))
Path('data/adventure/home/building-art.json').write_text(json.dumps(dict(version=1,materials=rows),ensure_ascii=False,indent=2)+'\n')
print(json.dumps([r['local'] for r in rows]))
