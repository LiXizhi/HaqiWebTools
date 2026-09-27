"""Pack one complete transparent 7x4 body sheet per gender, including idle.
No legacy idle texture or whole-character source is read.
"""
import argparse, hashlib, io, json, statistics
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
def sha(raw):return hashlib.sha256(raw).hexdigest()

def pack(path,gender):
    raw=path.read_bytes();image=Image.open(io.BytesIO(raw)).convert('RGBA')
    assert image.width%7==0 and image.height%4==0,'Expected 7 columns x 4 rows'
    assert image.getchannel('A').getextrema()[0]==0,'Transparent input required'
    cw,ch=image.width//7,image.height//4
    atlas=Image.new('RGBA',(896,640));frames=[];idle=[]
    neck_y=88 if gender=='male' else 79;head_height=88 if gender=='male' else 80
    cells=[];necks=[];heights=[]
    for i in range(28):
        cell=image.crop((i%7*cw,i//7*ch,(i%7+1)*cw,(i//7+1)*ch));neck=None
        for y in range(int(ch*.05),int(ch*.45)):
            xs=[x for x in range(int(cw*.35),int(cw*.65)) if
                (lambda r,g,b,a:a>200 and r>120 and r>g*1.1 and g>b*1.1)(*cell.getpixel((x,y)))]
            if len(xs)>=5:neck=(sum(xs)/len(xs),y);break
        assert neck,(gender,i,'neck missing')
        cells.append(cell);necks.append(neck)
        bound=cell.getchannel('A').point(lambda a:255 if a>20 else 0).getbbox()
        if i%7!=6:heights.append(bound[3]-neck[1])
    scale=(150-(neck_y-5))/statistics.median(heights)
    for i,(cell,neck) in enumerate(zip(cells,necks)):
        resized=cell.resize((round(cw*scale),round(ch*scale)),Image.Resampling.LANCZOS)
        tile=Image.new('RGBA',(128,160));tile.alpha_composite(resized,(round(64-neck[0]*scale),round(neck_y-5-neck[1]*scale)))
        bounds=tile.getchannel('A').point(lambda a:255 if a>20 else 0).getbbox()
        assert bounds and bounds[0]>1 and bounds[2]<127 and bounds[3]<159,(gender,i,bounds)
        atlas.paste(tile,(i%7*128,i//7*160))
        frame={'crop':[i%7*128,i//7*160,128,160],'neck':[64,neck_y],
               'headHeight':head_height,'bounds':list(bounds),'bodyOffsetY':-5 if i<6 else 0}
        (idle if i%7==6 else frames).append(frame)
    for options in ({'lossless':True},*({'quality':q} for q in (98,95,90,85,80))):
        stream=io.BytesIO();atlas.save(stream,'WEBP',method=6,exact=True,**options);output=stream.getvalue()
        if len(output)<=200000:break
    assert len(output)<=200000
    local=f'assets/hero-preview/{gender}-walk-cycle.webp';(ROOT/local).write_bytes(output)
    return {'local':local,'width':896,'height':640,'bytes':len(output),'sha256':sha(output),
        'framesPerDirection':6,'fps':10,'directions':['down','left','right','up'],
        'frames':frames,'idleFrames':idle,'columns':7,'rows':4,'cellWidth':128,'cellHeight':160,
        'source':{'method':'generated-complete-body-sheet','sha256':sha(raw),'layout':[7,4],'scale':scale},'encoding':options}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--male',type=Path);parser.add_argument('--female',type=Path);args=parser.parse_args()
    if not(args.male or args.female):parser.error('Supply --male and/or --female complete 7x4 source')
    path=ROOT/'data/hero-preview.json';manifest=json.loads(path.read_text(encoding='utf-8'))
    for gender in ('male','female'):
        source=getattr(args,gender)
        if not source:continue
        body=manifest['bodies'][gender+'-walk'];previous=body.get('walk',{});art=pack(source,gender)
        if previous.get('sha256')==art['sha256'] and previous.get('cdn'):art['cdn']=previous['cdn']
        for key in ('local','width','height','bytes','sha256','encoding'):body[key]=art[key]
        body.pop('cdn',None)
        if art.get('cdn'):body['cdn']=art['cdn']
        body.update(walk=art,frames=art['idleFrames'],selfContained=True)
        print(gender,art['bytes'],art['encoding'])
    text=json.dumps(manifest,ensure_ascii=False,indent=2)+'\n';path.write_text(text,encoding='utf-8')
    (ROOT/'data/adventure/hero-art.json').write_text(text,encoding='utf-8')
