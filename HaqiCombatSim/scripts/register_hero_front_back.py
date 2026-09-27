"""Pack selected front/back AI poses; preserve approved side rows and idle cells."""
import hashlib, io, json, statistics, argparse
from collections import deque
from pathlib import Path
from PIL import Image
from prepare_hero_side_walk import neck_top
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,required=True)
args=parser.parse_args()
im=Image.open(args.source).convert('RGBA')
# Remove only near-white background connected to the image boundary.
pixels=im.load();w,h=im.size;seen=set();queue=deque()
for x in range(w):queue.extend(((x,0),(x,h-1)))
for y in range(h):queue.extend(((0,y),(w-1,y)))
while queue:
    x,y=queue.popleft()
    if (x,y) in seen:continue
    seen.add((x,y))
    if min(pixels[x,y][:3])<235:continue
    pixels[x,y]=(0,0,0,0)
    for xx,yy in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
        if 0<=xx<w and 0<=yy<h and (xx,yy) not in seen:queue.append((xx,yy))
archive=ROOT/'art-references/walk-reference/male9-front-back-source.webp'
im.save(archive,lossless=True,method=4)
mp=ROOT/'art-references/hero-body-variants.json';manifest=json.loads(mp.read_text(encoding='utf-8'));row=manifest['variants']['male9']
base=json.loads((ROOT/'data/hero-preview.json').read_text(encoding='utf-8'))['bodies']['male-walk']
path=ROOT/row['local'];original=Image.open(path).convert('RGBA');atlas=original.copy()
# Contact poses are held across the neighboring contact sample; passing poses alternate.
order=[0,1,2,2,4,0]
registrations=[]
for sr,direction in enumerate((0,3)):
    cells=[im.crop((j*w//6,sr*h//2,(j+1)*w//6,(sr+1)*h//2)) for j in order]
    necks=[neck_top(c) for c in cells]
    bounds=[c.getchannel('A').point(lambda a:255 if a>20 else 0).getbbox() for c in cells]
    scale=68/statistics.median(b[3]-n[1] for b,n in zip(bounds,necks))
    for i,(c,n) in enumerate(zip(cells,necks)):
        f=base['walk']['frames'][direction*6+i];x,y,fw,fh=f['crop']
        c=c.resize((round(c.width*scale),round(c.height*scale)),Image.Resampling.LANCZOS)
        tile=Image.new('RGBA',(fw,fh));tile.alpha_composite(c,(round(f['neck'][0]-n[0]*scale),round(82-n[1]*scale)))
        b=tile.getchannel('A').point(lambda a:255 if a>20 else 0).getbbox()
        assert b and b[0]>0 and b[2]<fw and b[3]<fh,b
        atlas.paste(tile,(x,y));registrations.append({'direction':direction,'frame':i,'sourceColumn':order[i],'bounds':b})
for r in range(4):
    for c in range(7):
        if r in (0,3) and c<6:continue
        box=(c*192,r*192,(c+1)*192,(r+1)*192)
        assert atlas.crop(box).tobytes()==original.crop(box).tobytes()
for opts in ({'lossless':True},{'quality':98},{'quality':95},{'quality':90}):
    stream=io.BytesIO();atlas.save(stream,'WEBP',method=6,exact=True,**opts);raw=stream.getvalue()
    if len(raw)<=200000:break
assert len(raw)<=200000;path.write_bytes(raw)
row.update(bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest(),encoding=opts);row.pop('cdn',None)
row['source']['frontBackWalk']={'local':archive.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'columns':order,'method':'selected AI poses, boundary white removal, uniform scaling and neck alignment'}
row['validation']['frontBackRegistration']=registrations
mp.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('male9 front/back packed',len(raw),opts)
