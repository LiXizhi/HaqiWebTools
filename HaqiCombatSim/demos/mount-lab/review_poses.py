"""Batch pose contact sheets using the runtime's resolvePose, without a browser."""
import argparse,json,subprocess
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
HERE=Path(__file__).resolve().parent

def main():
 p=argparse.ArgumentParser();p.add_argument('--id',action='append',required=True);p.add_argument('--out',default='native-cache/poses.png');p.add_argument('--gender',choices=['male','female'],default='male');args=p.parse_args()
 code="""import fs from 'node:fs';import {resolvePose} from './mount_core.js';const c=JSON.parse(fs.readFileSync('catalog.json'));const ids=JSON.parse(process.argv[1]);console.log(JSON.stringify(c.mounts.filter(m=>ids.includes(m.id)).map(m=>({name:m.name,id:m.id,poses:['down','left','right','up'].map(d=>resolvePose(m,d,{size:360,gender:process.argv[2]}))}))));"""
 rows=json.loads(subprocess.check_output(['node','--input-type=module','-e',code,json.dumps(args.id),args.gender],cwd=HERE))
 assets=json.loads((HERE/'assets.json').read_text(encoding='utf-8'));images={}
 sheet=Image.new('RGBA',(1440,len(rows)*510),'#e6ebde');font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',18)
 for row,m in enumerate(rows):
  ImageDraw.Draw(sheet).text((8,row*510+5),m['name']+' / '+('男主角' if args.gender=='male' else '女主角'),font=font,fill='#263d30')
  for col,pose in enumerate(m['poses']):
   tile=Image.new('RGBA',(360,480),'#e6ebde');ox,oy=180,450
   def layer(item):
    key=item['art']
    if key not in images:images[key]=Image.open(HERE/assets[key]['local']).convert('RGBA')
    im=images[key];w,h=im.width//2,im.height//2;i=item['cell'];crop=im.crop((i%2*w,i//2*h,(i%2+1)*w,(i//2+1)*h)).resize((round(item['w']),round(item['h'])),Image.Resampling.LANCZOS)
    out=Image.new('RGBA',tile.size);out.alpha_composite(crop,(round(ox+item['x']),round(oy+item['y'])));return out
   mount=layer(pose['mount']);tile.alpha_composite(mount);tile.alpha_composite(layer(pose['rider']))
   mask=Image.new('L',tile.size);draw=ImageDraw.Draw(mask);item=pose['mount']
   for poly in pose['foreground']:draw.polygon([(ox+item['x']+u*item['w'],oy+item['y']+v*item['h']) for u,v in poly],fill=255)
   foreground=Image.new('RGBA',tile.size);foreground.paste(mount,(0,0),mask);tile.alpha_composite(foreground)
   sheet.alpha_composite(tile,(col*360,row*510+30))
 out=HERE/args.out;out.parent.mkdir(parents=True,exist_ok=True);sheet.convert('RGB').save(out);print(out)
if __name__=='__main__':main()
