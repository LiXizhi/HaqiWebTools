"""Register generated male-left/right, female-left/right six-frame rows.

Only crops, uniform resampling and translation; no invented or mirrored poses.
The input is a transparent 6x4 image. Existing front/back and idle art is retained.
"""
import argparse, hashlib, io, json, statistics
from pathlib import Path
from PIL import Image
from merge_hero_idle import ROOT

def neck_top(cell):
    w, h = cell.size
    for y in range(int(h*.05), int(h*.45)):
        xs = [x for x in range(int(w*.35), int(w*.65))
              if (lambda r,g,b,a: a>200 and r>140 and r>g*1.12 and g>b*1.13)(*cell.getpixel((x,y)))]
        if len(xs) >= 8:
            return (statistics.mean(xs), y)
    raise ValueError('Missing exposed neck in generated side frame')

def prepare(source):
    generated = Image.open(source).convert('RGBA')
    assert generated.width % 6 == 0 and generated.height % 4 == 0
    assert generated.getchannel('A').getextrema()[0] == 0
    cw, ch = generated.width//6, generated.height//4
    cells = [generated.crop((i%6*cw, i//6*ch, (i%6+1)*cw, (i//6+1)*ch)) for i in range(24)]
    necks = [neck_top(cell) for cell in cells]
    bounds = [cell.getchannel('A').point(lambda a:255 if a>20 else 0).getbbox() for cell in cells]
    path = ROOT/'data/hero-preview.json'
    manifest = json.loads(path.read_text(encoding='utf-8'))
    archive = ROOT/'art-references/hero-side-walk-source.webp'
    generated.save(archive, 'WEBP', lossless=True, exact=True, method=6)
    for gi, gender in enumerate(('male', 'female')):
        walk = manifest['bodies'][gender+'-walk']['walk']
        atlas = Image.open(ROOT/walk['local']).convert('RGBA')
        indices = range(gi*12, gi*12+12)
        target_top = walk['frames'][6]['neck'][1]-5
        scale = (150-target_top)/statistics.median(bounds[i][3]-necks[i][1] for i in indices)
        silhouettes = []
        for n, i in enumerate(indices):
            frame = walk['frames'][6+n]
            x,y,w,h = frame['crop']
            resized = cells[i].resize((round(cw*scale),round(ch*scale)),Image.Resampling.LANCZOS)
            tile = Image.new('RGBA',(w,h))
            tile.alpha_composite(resized,(round(frame['neck'][0]-necks[i][0]*scale),round(target_top-necks[i][1]*scale)))
            bound = tile.getchannel('A').point(lambda a:255 if a>20 else 0).getbbox()
            assert bound and bound[0]>1 and bound[2]<w-1 and bound[3]<h-1,(gender,n,bound)
            atlas.paste(tile,(x,y))
            frame['bounds'] = list(bound)
            silhouettes.append(tile.getchannel('A').crop((0,125,w,h)).point(lambda a:255 if a>40 else 0))
        # Unlike whole-image hashes, this checks leg silhouettes, not cape texture noise.
        for offset in (0,6):
            assert len({s.tobytes() for s in silhouettes[offset:offset+6]}) == 6
        for options in ({'lossless':True},*({'quality':q} for q in (98,95,90,85))):
            stream=io.BytesIO();atlas.save(stream,'WEBP',method=6,exact=True,**options)
            raw=stream.getvalue()
            if len(raw)<=200000:break
        assert len(raw)<=200000
        (ROOT/walk['local']).write_bytes(raw)
        walk.update(bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest(),encoding=options)
        walk.pop('cdn',None)
        walk['source']['sideWalk']={'local':archive.relative_to(ROOT).as_posix(),
            'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),
            'inputSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
            'rows':[gi*2,gi*2+1],'layout':[6,4],'scale':scale,
            'promptRef':'art-references/hero-body-generation.json'}
        body=manifest['bodies'][gender+'-walk']
        if body.get('selfContained'):
            for key in ('bytes','sha256','encoding'):body[key]=walk[key]
            body.pop('cdn',None)
        print(gender,len(raw),'scale',scale,'bounds',[f['bounds'] for f in walk['frames'][6:18]])
    text=json.dumps(manifest,ensure_ascii=False,indent=2)+'\n'
    path.write_text(text,encoding='utf-8');(ROOT/'data/adventure/hero-art.json').write_text(text,encoding='utf-8')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,required=True)
    prepare(parser.parse_args().source)
