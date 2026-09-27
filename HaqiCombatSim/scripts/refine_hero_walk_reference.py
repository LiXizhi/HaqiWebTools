"""Register approved side motion and symmetric front/back phases into reference only."""
import argparse, hashlib, io, json, statistics
from collections import deque
from pathlib import Path
from PIL import Image, ImageOps
def neck_top(cell):
    for y in range(cell.height//2):
        xs=[x for x in range(cell.width) if (lambda r,g,b,a:a>200 and r>140 and r>g*1.12 and g>b*1.13)(*cell.getpixel((x,y)))]
        if len(xs)>=8:return statistics.mean(xs),y
    raise ValueError('Missing exposed neck')
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--side',type=Path,required=True);parser.add_argument('--front-back',type=Path,required=True)
args=parser.parse_args()
side=Image.open(args.side).convert('RGBA');fb=Image.open(args.front_back).convert('RGBA')
assert side.getchannel('A').getextrema()[0]==0
# White background removal is limited to boundary-connected near-white pixels.
p=fb.load();w,h=fb.size;seen=set();queue=deque()
for x in range(w):queue.extend(((x,0),(x,h-1)))
for y in range(h):queue.extend(((0,y),(w-1,y)))
while queue:
    x,y=queue.popleft()
    if (x,y) in seen:continue
    seen.add((x,y))
    if min(p[x,y][:3])<235:continue
    p[x,y]=(0,0,0,0)
    for xx,yy in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
        if 0<=xx<w and 0<=yy<h and (xx,yy) not in seen:queue.append((xx,yy))
archive=ROOT/'art-references/walk-reference'
for name,im in [('male-ref-side-source.webp',side),('male-ref-front-back-source.webp',fb)]:im.save(archive/name,lossless=True,method=4)
base=json.loads((ROOT/'data/hero-preview.json').read_text(encoding='utf-8'))['bodies']['male-walk']
base_image=Image.open(ROOT/base['local']).convert('RGBA')
out=ROOT/'assets/hero-preview/male-walk-ref.webp';result=Image.open(out).convert('RGBA');records=[]
for direction in range(4):
    if direction in (1,2):
        cells=[side.crop((i*side.width//6,0,(i+1)*side.width//6,side.height)) for i in range(6)]
        if direction==1:cells=[ImageOps.mirror(c) for c in cells]
        provenance={'source':'male-ref-side-source.webp','mirror':direction==1}
    else:
        row=0 if direction==0 else 1
        source_cells=[fb.crop((i*w//3,row*h//2,(i+1)*w//3,(row+1)*h//2)) for i in range(3)]
        a,passing,b=source_cells
        # The neutral character is symmetric. Swap limb identity for the second half.
        cells=[a,passing,ImageOps.mirror(b),ImageOps.mirror(a),ImageOps.mirror(passing),b]
        provenance={'source':'male-ref-front-back-source.webp','row':row,'order':[[0,False],[1,False],[2,True],[0,True],[1,True],[2,False]]}
    necks=[neck_top(c) for c in cells]
    bounds=[c.getchannel('A').point(lambda a:255 if a>20 else 0).getbbox() for c in cells]
    scale=68/statistics.median(b[3]-n[1] for b,n in zip(bounds,necks))
    for i,(cell,(nx,ny)) in enumerate(zip(cells,necks)):
        frame=base['walk']['frames'][direction*6+i];x,y,cw,ch=map(round,frame['crop'])
        resized=cell.resize((round(cell.width*scale),round(cell.height*scale)),Image.Resampling.LANCZOS)
        tile=Image.new('RGBA',(cw,ch));tile.alpha_composite(resized,(round(frame['neck'][0]-nx*scale),round(82-ny*scale)))
        old=base_image.crop((x,y,x+cw,y+ch))
        for yy in range(round(frame['neck'][1])-12,round(frame['neck'][1])+2):
            for xx in range(round(frame['neck'][0])-6,round(frame['neck'][0])+6):
                r,g,b,a=old.getpixel((xx,yy))
                if a>100 and r>120 and r>g*1.1 and g>b*1.1:tile.putpixel((xx,yy),(r,g,b,a))
        bound=tile.getchannel('A').point(lambda a:255 if a>20 else 0).getbbox()
        assert bound and bound[0]>0 and bound[2]<cw and bound[3]<ch,(direction,i,bound)
        result.paste(tile,(x,y));records.append({'direction':direction,'frame':i,'bounds':bound,'scale':scale,**provenance})
stream=io.BytesIO();result.save(stream,'WEBP',lossless=True,exact=True,method=6);raw=stream.getvalue()
assert len(raw)<=200000;out.write_bytes(raw)
mp=archive/'male-walk-ref.json';meta=json.loads(mp.read_text(encoding='utf-8'))
meta.update(version=2,status='motion-refined-awaiting-review',sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw),motionRegistration=records)
meta['note']='Side follows accepted male9 six poses in neutral clothing. Left mirrored from right. Front/back symmetric half-cycle assembly. Neck/crop geometry unchanged. Awaiting visual review.'
meta['motionSources']=[{'local':str((archive/n).relative_to(ROOT)).replace('\\','/'),'sha256':hashlib.sha256((archive/n).read_bytes()).hexdigest()} for n in ['male-ref-side-source.webp','male-ref-front-back-source.webp']]
mp.write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Reference v2:',len(raw),'bytes; 24 walk frames; original neck/crop coordinates unchanged')
