"""Pack inspected offline city sheets into alpha-preserving, budgeted WebP atlases."""
import hashlib, io, json, sys
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]
manifest={'version':1,'source':'Original AI-generated offline city and street scenery; fictional buildings, not surveyed streets.','grid':{'columns':4,'rows':4}}
for kind,source,bands in [('buildings',sys.argv[1],[0,345,635,922,1254]),('street',sys.argv[2],[0,320,610,930,1254])]:
 source=Path(source);im=Image.open(source).convert('RGBA');packed=Image.new('RGBA',(1024,1024))
 for r in range(4):
  for c in range(4):
   sprite=im.crop((round(c*im.width/4),round(bands[r]*im.height/1254),round((c+1)*im.width/4),round(bands[r+1]*im.height/1254)))
   sprite=sprite.crop(sprite.getchannel('A').getbbox());sprite.thumbnail((230,230),Image.Resampling.LANCZOS)
   packed.alpha_composite(sprite,(c*256+(256-sprite.width)//2,r*256+240-sprite.height))
 chosen=None
 for edge,options in [(1024,{'lossless':True})]+[(s,{'quality':q}) for s in [896,768,640] for q in [88,80]]:
  current=packed.resize((edge,edge),Image.Resampling.LANCZOS);buffer=io.BytesIO();current.save(buffer,'WEBP',method=6,**options);data=buffer.getvalue()
  if len(data)<=200000:chosen=(current,data,options);break
 if not chosen:raise ValueError('WebP exceeds budget')
 current,data,options=chosen;digest=hashlib.sha256(data).hexdigest();name=f'earth-{kind}-{digest[:12]}.webp';(root/'assets/adventure/earth'/name).write_bytes(data)
 manifest[kind]={'local':f'assets/adventure/earth/{name}','cdn':f'https://cdn.keepwork.com/keepwork/haqi/adventure/earth/{name}','width':current.width,'height':current.height,'bytes':len(data),'sha256':digest,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'encoding':options,'frames':[[c*current.width//4,r*current.height//4,current.width//4,current.height//4] for r in range(4) for c in range(4)]}
 print(kind,name,len(data),flush=True)
(root/'data/adventure/earth/city-art.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
