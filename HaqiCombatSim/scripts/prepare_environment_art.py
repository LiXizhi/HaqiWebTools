"""Pack generated alpha atlases; preserve transparency and record every crop/hash."""
import argparse, hashlib, io, json
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]

def prepare(path, names, columns, target_cell, kind=None, source_rects=None):
    image = Image.open(path).convert('RGBA')
    assert image.getchannel('A').getextrema()[0] == 0, 'Real alpha required'
    rows = (len(names)+columns-1)//columns
    parts = []
    for i, name in enumerate(names):
        x, y = round(i%columns*image.width/columns), round(i//columns*image.height/rows)
        right, bottom = round((i%columns+1)*image.width/columns), round((i//columns+1)*image.height/rows)
        if source_rects:
            x, y, right, bottom = source_rects[i]
        cell = image.crop((x,y,right,bottom))
        box = cell.getchannel('A').point(lambda a: 255 if a>12 else 0).getbbox()
        assert box, name
        parts.append((name,cell.crop(box),[x+box[0],y+box[1],box[2]-box[0],box[3]-box[1]]))
    for size in [target_cell,round(target_cell*.85),round(target_cell*.7)]:
        atlas = Image.new('RGBA',(size*columns,size*rows))
        frames = {}
        for i,(name,part,source) in enumerate(parts):
            part = part.copy();part.thumbnail((size-16,size-16),Image.Resampling.LANCZOS)
            x=i%columns*size+(size-part.width)//2;y=i//columns*size+size-8-part.height
            atlas.alpha_composite(part,(x,y))
            frames[name]={'rect':[x,y,part.width,part.height],'sourceRect':source}
        for quality in [None,94,90,86,82]:
            stream=io.BytesIO();atlas.save(stream,'WEBP',lossless=quality is None,quality=quality or 100,method=4)
            data=stream.getvalue()
            if len(data)<=200000:
                digest=hashlib.sha256(data).hexdigest()
                kind=kind or ('snow-trees' if columns==2 else 'weather')
                local=f'assets/adventure/environment/{kind}-{digest[:12]}.webp'
                target=ROOT/local;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
                return {'local':local,'cdn':'','width':atlas.width,'height':atlas.height,'size':len(data),'sha256':digest,
                    'source':{'generator':'image_gen','sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'width':image.width,'height':image.height},
                    'encoding':{'lossless':quality is None,'quality':quality},'frames':frames}
    raise ValueError('Atlas exceeds 200,000 bytes')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('trees',type=Path);p.add_argument('weather',type=Path);args=p.parse_args()
    output={'schemaVersion':1,'atlases':{'trees':prepare(args.trees,['spruce','pine','fir','oldPine'],2,384),
        'weather':prepare(args.weather,['snow','sand','embers','mist','ash','motes'],3,192)}}
    dest=ROOT/'data/adventure/environment-art.json'
    if dest.exists():
        old=json.loads(dest.read_text(encoding='utf-8'))
        for key,atlas in output['atlases'].items():
            if old['atlases'].get(key,{}).get('sha256')==atlas['sha256']:atlas['cdn']=old['atlases'][key]['cdn']
    dest.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:{'local':v['local'],'size':v['size']} for k,v in output['atlases'].items()}))
