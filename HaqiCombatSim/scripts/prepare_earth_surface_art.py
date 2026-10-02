"""Pack generated Earth atlases; retain alpha, normalize sprite cells, enforce WebP budget."""
import argparse, hashlib, io, json
from pathlib import Path
from PIL import Image
parser=argparse.ArgumentParser();parser.add_argument('terrain');parser.add_argument('decorations');args=parser.parse_args()
root=Path(__file__).resolve().parents[1];out=root/'assets/adventure/earth';out.mkdir(exist_ok=True)
previous=root/'data/adventure/earth/surface-art.json'
manifest={**(json.loads(previous.read_text(encoding='utf8')) if previous.exists() else {}),'version':1,'source':'AI-generated offline for Haqi Earth; rendering reference: HelloWorld WorldConfig.js and TerrainTileManager.js; not surveyed imagery.','grid':{'columns':4,'rows':4}}
for kind in ['terrain','decorations']:
 source=Path(getattr(args,kind));im=Image.open(source).convert('RGBA')
 if kind=='decorations':
  # The generated sheet has taller trees in row one. Repack inspected row bounds,
  # rather than clipping them with an assumed uniform source grid.
  bands=[0,380,674,948,1254];packed=Image.new('RGBA',(1024,1024))
  for row in range(4):
   for col in range(4):
    sprite=im.crop((round(col*im.width/4),round(bands[row]*im.height/1254),round((col+1)*im.width/4),round(bands[row+1]*im.height/1254)))
    box=sprite.getchannel('A').getbbox();sprite=sprite.crop(box);sprite.thumbnail((220,218),Image.Resampling.LANCZOS)
    packed.alpha_composite(sprite,(col*256+(256-sprite.width)//2,row*256+225-sprite.height))
  im=packed
 chosen=None
 for edge in [1024,896,768,640]:
  current=im.resize((edge,edge),Image.Resampling.LANCZOS)
  for options in [{'lossless':True},{'quality':88},{'quality':82}]:
   buffer=io.BytesIO();current.save(buffer,'WEBP',method=6,**options);data=buffer.getvalue()
   if len(data)<=200000:chosen=(current,data,options);break
  if chosen:break
 if not chosen:raise ValueError('Atlas exceeds budget')
 current,data,options=chosen;digest=hashlib.sha256(data).hexdigest();name=f'earth-{kind}-{digest[:12]}.webp';(out/name).write_bytes(data)
 manifest[kind]={'local':f'assets/adventure/earth/{name}','cdn':f'https://cdn.keepwork.com/keepwork/haqi/adventure/earth/{name}','width':current.width,'height':current.height,'bytes':len(data),'sha256':digest,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'encoding':options,'frames':[[c*current.width//4,r*current.height//4,current.width//4,current.height//4] for r in range(4) for c in range(4)]}
 print(kind,name,len(data),current.size,options)
(root/'data/adventure/earth/surface-art.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
