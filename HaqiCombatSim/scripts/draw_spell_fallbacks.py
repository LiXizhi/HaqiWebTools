#!/usr/bin/env python3
"""Draw six unavailable rune cards from geometric UI primitives; explicitly adapted."""
import hashlib,io,json,math
from pathlib import Path
from PIL import Image,ImageDraw
APP=Path(__file__).resolve().parents[1];file=APP/'data/kids/spell-art.json';data=json.loads(file.read_text())
colors={'Fire':(246,106,51),'Ice':(87,208,246),'Storm':(234,201,57),'Life':(137,218,111),'Death':(189,121,227)}
for key,row in data['bases'].items():
 if not row.get('missingSource') or row.get('local'):continue
 color=colors[key.split('_')[0]];image=Image.new('RGB',(302,460),(15,29,44));d=ImageDraw.Draw(image)
 for y in range(460):
  glow=max(0,1-abs(y-210)/250);d.line((0,y,302,y),fill=tuple(int(c*(.12+.18*glow)) for c in color))
 for inset,width in [(5,4),(13,1),(22,1)]:d.rounded_rectangle((inset,inset,301-inset,459-inset),radius=15,outline=color,width=width)
 d.rounded_rectangle((32,94,270,276),radius=18,outline=color,width=3)
 for radius in [49,62,74]:d.ellipse((151-radius,185-radius,151+radius,185+radius),outline=color,width=2)
 for i in range(12):
  a=i*math.pi/6;x=151+math.cos(a)*85;y=185+math.sin(a)*85
  d.polygon([(x,y-5),(x+4,y),(x,y+5),(x-4,y)],fill=color)
 if 'MiniAura' in key:
  d.ellipse((114,148,188,222),outline=(255,247,208),width=4)
  for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)]:d.line((151+dx*20,185+dy*20,151+dx*48,185+dy*48),fill=(255,247,208),width=4)
  d.ellipse((144,178,158,192),fill=(255,247,208))
 else:
  for offset in [-35,0,35]:
   x=151+offset;d.ellipse((x-18,155,x+18,196),fill=color);d.rectangle((x-12,184,x+12,211),fill=color)
   for eye in [-7,7]:d.ellipse((x+eye-4,173,x+eye+4,181),fill=(15,20,40))
   d.polygon([(x,185),(x-4,192),(x+4,192)],fill=(15,20,40))
 for y,w in [(320,180),(337,140),(354,160)]:d.line((151-w/2,y,151+w/2,y),fill=tuple(c//2 for c in color),width=2)
 stream=io.BytesIO();image.save(stream,format='WEBP',lossless=True,method=4);encoded=stream.getvalue();sha=hashlib.sha256(encoded).hexdigest();local='assets/adventure/spells/'+sha+'.webp';(APP/local).write_bytes(encoded)
 row.update(local=local,cdn=None,sha256=sha,size=len(encoded),width=302,height=460,adaptation='Geometric rune card: original icon absent from assets_manifest.txt; name overlaid by browser')
file.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print('Six missing-source rune cards have explicit geometric artwork')
