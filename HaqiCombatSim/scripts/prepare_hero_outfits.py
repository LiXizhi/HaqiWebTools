"""Register generated outfit atlases to the existing, immutable neck masks.

Designs come from image_gen; this step only resamples/registers atlas cells,
restores the protected source neck region and encodes lossless runtime WebP.
No head anchors, riding assets or existing body files are changed.
"""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageChops

ROOT = Path(__file__).resolve().parents[1]
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def read(path): return json.loads(path.read_text(encoding='utf-8'))

def neck_top(cell):
    # Restrict detection to the central exposed neck, above sleeves/hands.
    for y in range(95, 155):
        xs = [x for x in range(155, 218) if (lambda r,g,b,a:
            a > 220 and r > 150 and r > g*1.08 and g > b*1.08
            and g > 100)(*cell.getpixel((x,y)))]
        if len(xs) >= 7:
            return (round(sum(xs)/len(xs)), y)
    raise ValueError('Cannot locate exposed neck; inspect generated sheet')

def pack(spec, source, base):
    original = Image.open(ROOT/base['local']).convert('RGBA')
    generated = Image.open(source).convert('RGBA')
    assert generated.width == generated.height and generated.width % 2 == 0
    assert generated.getchannel('A').getextrema()[0] == 0
    cw,ch=generated.width//2,generated.height//2
    atlas = original.copy()
    registration = []
    for i, frame in enumerate(base['frames']):
        x,y,w,h = frame['crop']; box=(x,y,x+w,y+h)
        src = original.crop(box)
        cell = generated.crop((i%2*cw,i//2*ch,(i%2+1)*cw,(i//2+1)*ch)).resize((w,h),Image.Resampling.LANCZOS)
        expected = neck_top(src); actual = neck_top(cell)
        dx,dy = expected[0]-actual[0], expected[1]-actual[1]
        assert abs(dx) <= 28 and abs(dy) <= 28, (spec['id'],i,dx,dy)
        registered = Image.new('RGBA',(w,h));registered.alpha_composite(cell,(dx,dy))
        atlas.paste(registered,(x,y))
        registration.append({'cell':i,'translation':[dx,dy]})
    # Preserve the entire existing head-removal region INCLUDING original neck.
    protected=Image.new('L',original.size);draw=ImageDraw.Draw(protected)
    for frame in base['frames']:draw.polygon(frame['mask'],fill=255)
    atlas.paste(original,(0,0),protected)
    path=ROOT/'assets/hero-preview'/('outfit-'+spec['id']+'.webp')
    atlas.save(path,'WEBP',lossless=True,exact=True,method=6)
    assert path.stat().st_size <= 200000,(path.name,path.stat().st_size)
    decoded=Image.open(path).convert('RGBA')
    for channel in ImageChops.difference(original,decoded).split():
        assert ImageChops.multiply(channel,protected).getbbox() is None
    return {**spec,'local':path.relative_to(ROOT).as_posix(),'width':original.width,'height':original.height,
        'bytes':path.stat().st_size,'sha256':sha(path),'frames':base['frames'],
        'source':{'method':'image_gen-reference-edit','sha256':sha(source),
            'reference':base['local'],'referenceSha256':sha(ROOT/base['local']),
            'registration':registration,'protectedRegion':'original frame.mask pixels, lossless'},
        'promptRef':'art-references/hero-outfits.json#'+spec['id']}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--sources',type=Path,required=True)
    args=parser.parse_args();sources=read(args.sources)
    specs=read(ROOT/'art-references/hero-outfits.json')['outfits']
    bodies=read(ROOT/'data/hero-preview.json')['bodies']
    target=ROOT/'data/hero-outfits.json'
    manifest=read(target) if target.exists() else {'version':1,'outfits':{}}
    for spec in specs:
        if spec['id'] not in sources:continue
        key='female-standing' if spec['gender']=='female' else 'standing'
        row=pack(spec,Path(sources[spec['id']]),bodies[key]);row['baseBody']=key
        previous=manifest['outfits'].get(spec['id'],{})
        if row['sha256']==previous.get('sha256') and previous.get('cdn'):row['cdn']=previous['cdn']
        manifest['outfits'][spec['id']]=row
        print(spec['id'],row['bytes'],row['source']['registration'])
    target.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
