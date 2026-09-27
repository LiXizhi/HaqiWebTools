"""Register a neutral AI reference to existing per-cell neck/ground geometry."""
import argparse, hashlib, io, json
from pathlib import Path
from PIL import Image
from prepare_hero_side_walk import neck_top
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,required=True)
parser.add_argument('--gender',choices=('male','female'),default='male')
parser.add_argument('--motion-reference',type=Path)
args=parser.parse_args()
base=json.loads((ROOT/'data/hero-preview.json').read_text(encoding='utf-8'))['bodies'][args.gender+'-walk']
original=Image.open(ROOT/base['local']).convert('RGBA');source=Image.open(args.source).convert('RGBA')
assert source.getchannel('A').getextrema()[0]==0
result=Image.new('RGBA',original.size);records=[]
for r in range(4):
    for c in range(7):
        cell=source.crop((round(c*source.width/7),round(r*source.height/4),round((c+1)*source.width/7),round((r+1)*source.height/4)))
        nx,ny=neck_top(cell)
        bounds=cell.getchannel('A').point(lambda a:255 if a>20 else 0).getbbox()
        frame=base['frames'][r] if c==6 else base['walk']['frames'][r*6+c]
        x,y,w,h=map(round,frame['crop']);old=original.crop((x,y,x+w,y+h))
        ob=old.getchannel('A').point(lambda a:255 if a>20 else 0).getbbox()
        target_top=ob[1];scale=(ob[3]-target_top)/(bounds[3]-ny)
        resized=cell.resize((round(cell.width*scale),round(cell.height*scale)),Image.Resampling.LANCZOS)
        tile=Image.new('RGBA',(w,h));tile.alpha_composite(resized,(round(frame['neck'][0]-nx*scale),round(target_top-ny*scale)))
        # Restore the original exposed neck inside a tight anchor neighborhood.
        for yy in range(max(0,round(frame['neck'][1])-12),min(h,round(frame['neck'][1])+2)):
            for xx in range(max(0,round(frame['neck'][0])-6),min(w,round(frame['neck'][0])+6)):
                rr,g,b,a=old.getpixel((xx,yy))
                if a>100 and rr>120 and rr>g*1.1 and g>b*1.1:tile.putpixel((xx,yy),(rr,g,b,a))
        bound=tile.getchannel('A').point(lambda a:255 if a>20 else 0).getbbox()
        assert bound and bound[0]>0 and bound[2]<w and bound[3]<h,(r,c,bound)
        result.paste(tile,(x,y));records.append({'row':r,'column':c,'crop':frame['crop'],'neck':frame['neck'],'bounds':bound,'scale':scale})
out=ROOT/f'assets/hero-preview/{args.gender}-walk-ref.webp'
stream=io.BytesIO();result.save(stream,'WEBP',lossless=True,exact=True,method=6);raw=stream.getvalue()
assert len(raw)<=200000;out.write_bytes(raw)
metadata={'version':1,'status':'draft-motion-not-approved','local':out.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'geometryBase':base['local'],'geometryBaseSha256':hashlib.sha256((ROOT/base['local']).read_bytes()).hexdigest(),'generatedSourceSha256':hashlib.sha256(args.source.read_bytes()).hexdigest(),'generationReference':base['local'],'registration':records,'note':'Neutral reference aligned to original neck/ground. Walking details still require refinement in this reference only.'}
if args.motion_reference:
    metadata['motionReference']={'local':args.motion_reference.resolve().relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(args.motion_reference.read_bytes()).hexdigest()}
(ROOT/f'art-references/walk-reference/{args.gender}-walk-ref.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(out,len(raw),'bytes; 28 registered frames; motion draft')

