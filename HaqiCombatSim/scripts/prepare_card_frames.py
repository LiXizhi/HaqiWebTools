#!/usr/bin/env python3
"""Prepare five approved generation outputs as budgeted WebP; input maps school to PNG."""
import hashlib,io,json,sys
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]
sources=json.loads(Path(sys.argv[1]).read_text());entries={}
for school,source in sources.items():
 image=Image.open(source).convert('RGBA');image.thumbnail((604,920),Image.Resampling.LANCZOS)
 stream=io.BytesIO();image.save(stream,format='WEBP',lossless=True,method=4,exact=True)
 if len(stream.getvalue())>200000:
  stream=io.BytesIO();image.save(stream,format='WEBP',quality=90,method=6,exact=True)
 data=stream.getvalue();assert len(data)<=200000;Image.open(io.BytesIO(data)).load()
 sha=hashlib.sha256(data).hexdigest();local='assets/adventure/card-frames/'+school+'-'+sha+'.webp';file=root/local;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(data)
 entries[school]={'local':local,'cdn':None,'sha256':sha,'size':len(data),'width':image.width,'height':image.height,'source':'AI-generated blank frame from original Haqi card reference; no baked text, badges or skill illustration'}
(root/'data/adventure/card-frames.json').write_text(json.dumps({'version':1,'entries':entries},ensure_ascii=False,indent=2)+'\n')
print({k:r['size'] for k,r in entries.items()})
