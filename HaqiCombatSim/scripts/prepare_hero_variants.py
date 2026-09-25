"""Pack generated head turntables without changing any body or mount pixels.
--sources is a local JSON mapping head ID to generated PNG path.
Prompts are archived separately; all runtime assets are WebP.
"""
import argparse,json
from pathlib import Path
from PIL import Image
from prepare_hero_preview import ROOT,OUT,MANIFEST,read,sha,clean_head

p=argparse.ArgumentParser();p.add_argument('--sources',type=Path,required=True);a=p.parse_args()
sources=read(a.sources);specs=read(ROOT/'art-references/hero-head-variants.json')['variants'];manifest=read(MANIFEST)
for spec in specs:
 key=spec['id']
 if key not in sources:continue
 source=Path(sources[key]);im=Image.open(source).convert('RGBA');cw,ch=im.width//4,im.height//4
 assert im.getchannel('A').getextrema()[0]==0,'Generated image must have genuine transparency'
 atlas=Image.new('RGBA',(576,576));frames=[]
 for i in range(16):
  cell=clean_head(im.crop((i%4*cw,i//4*ch,(i%4+1)*cw,(i//4+1)*ch)))
  bounds=cell.getchannel('A').point(lambda v:255 if v>20 else 0).getbbox()
  assert bounds and (bounds[2]-bounds[0])>cw*.2 and (bounds[3]-bounds[1])>ch*.2,(key,i)
  cell=cell.crop(bounds);cell.thumbnail((132,132),Image.Resampling.LANCZOS)
  atlas.alpha_composite(cell,(i%4*144+(144-cell.width)//2,i//4*144+136-cell.height))
  frames.append({'crop':[i%4*144,i//4*144,144,144],'neck':[72,134],'height':cell.height})
 path=OUT/('head-'+key+'.webp');atlas.save(path,'WEBP',quality=90,method=6)
 assert path.stat().st_size<=200000,key
 row={'name':spec['name'],'gender':spec['gender'],'directionCount':16,'local':path.relative_to(ROOT).as_posix(),'width':576,'height':576,'bytes':path.stat().st_size,'sha256':sha(path),'sourceSha256':sha(source),'source':source.name,'promptRef':'art-references/hero-head-variants.json#'+key,'frames':frames}
 previous=manifest['heads'].get(key,{})
 if previous.get('sha256')==row['sha256'] and previous.get('cdn'):row['cdn']=previous['cdn']
 manifest['heads'][key]=row
 print(key,row['bytes'])
text=json.dumps(manifest,ensure_ascii=False,indent=2)+'\n';MANIFEST.write_text(text,encoding='utf-8');(ROOT/'data/adventure/hero-art.json').write_text(text,encoding='utf-8')
