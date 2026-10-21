"""Pack verified complete native-alpha building sprites, preserving alpha and atlas provenance."""
from pathlib import Path
from PIL import Image
import hashlib,json,io,sys
source=Path(sys.argv[1]);im=Image.open(source).convert('RGBA')
# Connected alpha components >16 were inspected against the original, ordered by intended rows.
rects=[(45,34,289,266),(376,34,621,266),(707,34,953,266),(1038,34,1283,266),(34,320,305,529),(365,320,630,529),(718,312,942,540),(1011,345,1305,518),(43,591,296,842),(377,587,622,840),(730,577,885,849),(959,661,1302,791),(36,869,297,1145),(368,973,631,1125),(693,939,964,1125),(1008,887,1303,1145)]
assert im.size==(1328,1184) and im.getchannel('A').getextrema()[0]==0
atlas=Image.new('RGBA',(640,640));frames=[]
for n,(x,y,r,b) in enumerate(rects):
 rect=(max(0,x-3),max(0,y-3),min(im.width,r+3),min(im.height,b+3));sprite=im.crop(rect);sprite.thumbnail((148,148),Image.Resampling.LANCZOS)
 dx=(n%4)*160+(160-sprite.width)//2;dy=(n//4)*160+(160-sprite.height)//2;atlas.alpha_composite(sprite,(dx,dy))
 frames.append({'index':n,'sourceRect':list(rect),'crop':[dx,dy,sprite.width,sprite.height]})
raw=io.BytesIO();atlas.save(raw,format='WEBP',lossless=True,method=6)
if len(raw.getvalue())>200000:
 for q in [94,90,86,82]:
  raw=io.BytesIO();atlas.save(raw,format='WEBP',quality=q,method=6)
  if len(raw.getvalue())<=200000:break
assert len(raw.getvalue())<=200000
sha=hashlib.sha256(raw.getvalue()).hexdigest();name=f'building-expansion-{sha[:12]}.webp';out=Path('assets/adventure/home')/name;out.write_bytes(raw.getvalue())
manifest={'version':1,'tool':'image_gen native transparent_background=true','sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'local':str(out).replace('\\','/'),'sha256':sha,'bytes':len(raw.getvalue()),'width':640,'height':640,'frames':frames,'prompt':'Original Minecraft-like chunky voxel construction kit, orthographic frontal slightly elevated view; 4x4 separate complete native-transparent sprites: brick/sandstone/moss/slate floors, brick/sandstone walls, glass window, iron railing, oak/stone stairs, sandstone pillar, oak beam, stone arch, half slab, battlement, copper roof. No text, no shadows, no background matte.'}
Path('data/adventure/home/building-expansion-art.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
# Alpha-preserving composites for light/dark/actual grass-color review.
review=Image.new('RGB',(1920,640))
for n,color in enumerate(['#fff8e6','#192d24','#8fb967']):
 bg=Image.new('RGBA',atlas.size,color);bg.alpha_composite(Image.open(out).convert('RGBA'));review.paste(bg.convert('RGB'),(640*n,0))
Path('.cache/home-expansion').mkdir(parents=True,exist_ok=True);review.save('.cache/home-expansion/alpha-review.png')
print(str(out),len(raw.getvalue()),sha)
