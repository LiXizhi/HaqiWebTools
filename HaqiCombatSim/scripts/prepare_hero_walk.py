"""Pack generated six-frame, four-direction headless walk cycles.

Only crops/translates/resizes generated sprites; never synthesizes poses. Preserve
alpha and use one scale for the entire cycle, with neck anchors for layered heads.
"""
import argparse, hashlib, io, json
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
def sha(raw): return hashlib.sha256(raw).hexdigest()

def pack(path, gender):
    raw=path.read_bytes(); image=Image.open(io.BytesIO(raw)).convert('RGBA')
    assert image.width%6==0 and image.height%4==0
    assert image.getchannel('A').getextrema()[0]==0, 'Transparent input required'
    cw,ch=image.width//6,image.height//4
    atlas=Image.new('RGBA',(768,640)); frames=[]; hashes=[]
    scale=(67 if gender=='male' else 80)/(ch*.78)
    neck_y=88 if gender=='male' else 79
    head_height=88 if gender=='male' else 80
    for i in range(24):
        cell=image.crop((i%6*cw,i//6*ch,(i%6+1)*cw,(i//6+1)*ch))
        # Locate the exposed neck, excluding the staff on either side.
        neck=None
        for y in range(int(ch*.08),int(ch*.4)):
            xs=[x for x in range(int(cw*.35),int(cw*.65))
                if (lambda r,g,b,a:a>200 and r>120 and r>g*1.1 and g>b*1.1)(*cell.getpixel((x,y)))]
            if len(xs)>=5: neck=(sum(xs)/len(xs),y); break
        assert neck, (gender,i,'neck missing')
        # Equal scale, neck registration and reserved headroom prevent crop jitter.
        resized=cell.resize((round(cw*scale),round(ch*scale)),Image.Resampling.LANCZOS)
        ox=round(64-neck[0]*scale); oy=round(neck_y-5-neck[1]*scale)
        tile=Image.new('RGBA',(128,160));tile.alpha_composite(resized,(ox,oy))
        bounds=tile.getchannel('A').point(lambda v:255 if v>20 else 0).getbbox()
        assert bounds and bounds[0]>1 and bounds[2]<127 and bounds[3]<159,(gender,i,bounds)
        atlas.alpha_composite(tile,(i%6*128,i//6*160))
        frames.append({'crop':[i%6*128,i//6*160,128,160],
            'neck':[64,neck_y],'headHeight':head_height,'bounds':list(bounds),
            'bodyOffsetY':-5 if i<6 else 0})
        hashes.append(sha(tile.tobytes()))
    for direction in range(4): assert len(set(hashes[direction*6:direction*6+6]))==6
    for options in ({'lossless':True},*({'quality':q} for q in (95,90,85,80))):
        stream=io.BytesIO();atlas.save(stream,format='WEBP',method=6,exact=True,**options)
        output=stream.getvalue()
        if len(output)<=200000:break
    assert len(output)<=200000
    local=f'assets/hero-preview/{gender}-walk-cycle.webp';(ROOT/local).write_bytes(output)
    return {'local':local,'width':768,'height':640,'bytes':len(output),'sha256':sha(output),
        'framesPerDirection':6,'fps':10,'directions':['down','left','right','up'],
        'frames':frames,'source':{'method':'generated-walk-cycle','sha256':sha(raw),
        'reference':f'assets/hero-preview/{gender}-walk.webp','referenceSha256':sha((ROOT/f'assets/hero-preview/{gender}-walk.webp').read_bytes()),
        'layout':[6,4],'scale':scale},'encoding':options}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--male',type=Path,required=True);parser.add_argument('--female',type=Path,required=True);args=parser.parse_args()
    path=ROOT/'data/hero-preview.json';manifest=json.loads(path.read_text(encoding='utf-8'))
    for gender in ('male','female'):
        art=pack(getattr(args,gender),gender);previous=manifest['bodies'][gender+'-walk'].get('walk',{})
        if previous.get('sha256')==art['sha256'] and previous.get('cdn'):art['cdn']=previous['cdn']
        manifest['bodies'][gender+'-walk']['walk']=art
        print(gender,art['bytes'],art['encoding'])
    text=json.dumps(manifest,ensure_ascii=False,indent=2)+'\n'
    path.write_text(text,encoding='utf-8');(ROOT/'data/adventure/hero-art.json').write_text(text,encoding='utf-8')
