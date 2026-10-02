"""Pack inspected transit sprites; retain original source, alpha and provenance."""
from pathlib import Path
import hashlib,io,json,sys
from PIL import Image
root=Path(__file__).resolve().parents[1];source=Path(sys.argv[1]);im=Image.open(source).convert('RGBA')
# Fractions use inspected sprite boundaries, not assumed equal source columns.
boxes=[(0,0,.25,.55),(.25,0,.534,.55),(.534,0,.78,.55),(.78,0,1,.55),(0,.55,.286,1),(.286,.55,.601,1),(.601,.55,.78,1),(.78,.55,1,1)]
packed=Image.new('RGBA',(1024,512))
for i,box in enumerate(boxes):
 sprite=im.crop(tuple(round(v*(im.width if n%2==0 else im.height)) for n,v in enumerate(box)));sprite=sprite.crop(sprite.getchannel('A').getbbox());sprite.thumbnail((230,230),Image.Resampling.LANCZOS)
 packed.alpha_composite(sprite,((i%4)*256+(256-sprite.width)//2,(i//4)*256+240-sprite.height))
for edge,opts in [(1024,{'lossless':True})]+[(s,{'quality':q}) for s in [1024,896,768,640] for q in [88,80]]:
 output=packed.resize((edge,edge//2),Image.Resampling.LANCZOS);buffer=io.BytesIO();output.save(buffer,'WEBP',method=6,**opts);data=buffer.getvalue()
 if len(data)<=200000:break
else:raise ValueError('Art exceeds WebP budget')
sha=hashlib.sha256(data).hexdigest();name=f'earth-transport-{sha[:12]}.webp';(root/'assets/adventure/earth'/name).write_bytes(data)
path=root/'data/adventure/earth/city-art.json';manifest=json.loads(path.read_text(encoding='utf8'));cell=edge//4
manifest['transport']={'local':f'assets/adventure/earth/{name}','cdn':f'https://cdn.keepwork.com/keepwork/haqi/adventure/earth/{name}','width':edge,'height':edge//2,'bytes':len(data),'sha256':sha,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'source':'Original AI-generated offline rail stations, commuter and high-speed trains; fictional transit scenery.','encoding':opts,'frames':[[i%4*cell,i//4*cell,cell,cell] for i in range(8)]}
path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(name,len(data),flush=True)
