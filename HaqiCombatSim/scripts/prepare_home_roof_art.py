"""Pack visually verified complete native-alpha roof props; no color keying."""
import sys,json,hashlib,io
from pathlib import Path
from PIL import Image
source=Path(sys.argv[1]);im=Image.open(source).convert('RGBA');assert im.size==(1881,836)
rows=[]
for name,rect in zip(['brick-chimney','stone-chimney','roof-windmill'],[(70,200,520,805),(665,25,1075,813),(1280,20,1865,812)]):
 sprite=im.crop(rect);box=sprite.getchannel('A').getbbox();sprite=sprite.crop(box);sprite.thumbnail((192,240),Image.Resampling.LANCZOS)
 data=io.BytesIO();sprite.save(data,format='WEBP',lossless=True);raw=data.getvalue();assert len(raw)<200000
 sha=hashlib.sha256(raw).hexdigest();path=Path(f'assets/adventure/home/{name}-{sha[:12]}.webp');path.write_bytes(raw)
 rows.append(dict(id=name,local=str(path),width=sprite.width,height=sprite.height,crop=[0,0,sprite.width,sprite.height],bytes=len(raw),sha256=sha,sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),sourceRect=rect,source='Native transparent image_gen roof props; complete visually verified silhouettes; 2026-10-20'))
Path('data/adventure/home/roof-art.json').write_text(json.dumps({'version':1,'assets':rows},ensure_ascii=False,indent=2)+'\n')
print('\n'.join(r['local'] for r in rows))
