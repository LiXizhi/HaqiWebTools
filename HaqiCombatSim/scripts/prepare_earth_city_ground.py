"""Split one inspected city painting into four independently budgeted WebP resources."""
import argparse,hashlib,io,json
from pathlib import Path
from PIL import Image
parser=argparse.ArgumentParser();parser.add_argument('source');args=parser.parse_args()
root=Path(__file__).resolve().parents[1];source=Path(args.source);im=Image.open(source).convert('RGB');assert im.width==im.height and im.width%2==0
manifest_path=root/'data/adventure/earth/surface-art.json';manifest=json.loads(manifest_path.read_text(encoding='utf8'));tiles=[];edge=im.width//2
for y in range(2):
 for x in range(2):
  tile=im.crop((x*edge,y*edge,(x+1)*edge,(y+1)*edge));chosen=None
  for options in [{'lossless':True}]+[{'quality':q} for q in [92,88,85,80,75,70,65]]:
   buffer=io.BytesIO();tile.save(buffer,'WEBP',method=6,**options);data=buffer.getvalue()
   if len(data)<=200000:chosen=(data,options);break
  if not chosen:raise ValueError('City tile exceeds 200000 bytes')
  data,options=chosen;digest=hashlib.sha256(data).hexdigest();name=f'earth-city-detail-{x}-{y}-{digest[:12]}.webp';(root/'assets/adventure/earth'/name).write_bytes(data)
  tiles.append(dict(local=f'assets/adventure/earth/{name}',cdn=f'https://cdn.keepwork.com/keepwork/haqi/adventure/earth/{name}',width=edge,height=edge,x=x*edge,y=y*edge,bytes=len(data),sha256=digest,encoding=options));print(name,len(data))
manifest['cityGround']=dict(width=im.width,height=im.height,tiles=tiles,source='AI-generated independent continuous city painting, inspired by HelloWorld city02.png; fictional neighbourhoods',sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),referenceSource=manifest['cityGround'].get('source'),referenceSha256=manifest['cityGround'].get('sha256'))
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
