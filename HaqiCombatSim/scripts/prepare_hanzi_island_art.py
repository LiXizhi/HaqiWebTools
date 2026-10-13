"""Pack Hanzi island image_gen outputs with alpha, crop and source provenance."""
import argparse, hashlib, io, json
from pathlib import Path
from PIL import Image
from prepare_environment_art import prepare, ROOT

def read(path):
    return json.loads((ROOT/path).read_text(encoding='utf8'))

def write(path, data):
    (ROOT/path).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')

def retain_cdn(row, old):
    if row['sha256']==old.get('sha256'):
        row['cdn']=old.get('cdn','')
    row['source']['prompt']='docs/hanzi-island-art.md'
    return row

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for arg in ['island','buildings','npcs']:
        parser.add_argument('--'+arg,type=Path,required=True)
    args=parser.parse_args()
    atlas=read('data/adventure/world-map-art.json')
    island=retain_cdn(prepare(args.island,['hanzi'],1,640,'world-atlas-hanzi'),atlas['resources'].get('hanzi',{}))
    atlas['resources']['hanzi']=island
    row=next(r for r in atlas['islands'] if r['id']=='hanzi')
    row.update(resource='hanzi',rect=island['frames']['hanzi']['rect'],w=340,h=340)
    write('data/adventure/world-map-art.json',atlas)
    buildings=read('data/adventure/building-art.json')
    buildings['atlases']['hanzi']=retain_cdn(prepare(args.buildings,['pavilion','cottage','tower','harbor','workshop','goldTree'],3,320,'buildings-hanzi',[[10,25,520,490],[540,55,1060,493],[1115,0,1478,505],[30,510,500,1000],[515,525,1062,994],[1090,500,1536,1008]]),buildings['atlases'].get('hanzi',{}))
    write('data/adventure/building-art.json',buildings)
    art=read('data/adventure/npc-art.json');pack=read('data/adventure/island-packs/hanzi.json')
    source=Image.open(args.npcs).convert('RGBA');assert source.getchannel('A').getextrema()[0]==0
    outputs=[island,buildings['atlases']['hanzi']]
    for i,npc in enumerate(pack['npcs']):
        x=round(i%2*source.width/2);y=round(i//2*source.height/2)
        right=round((i%2+1)*source.width/2);bottom=round((i//2+1)*source.height/2)
        part=source.crop((x,y,right,bottom));box=part.getchannel('A').point(lambda a:255 if a>12 else 0).getbbox();assert box
        part=part.crop(box);part.thumbnail((232,240),Image.Resampling.LANCZOS)
        canvas=Image.new('RGBA',(256,256));canvas.alpha_composite(part,((256-part.width)//2,248-part.height))
        for quality in [None,95,90,85,80]:
            buffer=io.BytesIO();canvas.save(buffer,'WEBP',lossless=quality is None,quality=quality or 100,method=6)
            raw=buffer.getvalue()
            if len(raw)<48000:break
        assert len(raw)<48000
        sha=hashlib.sha256(raw).hexdigest();local=f'assets/adventure/npcs/hanzi-{npc["id"]}-{sha[:12]}.webp'
        (ROOT/local).write_bytes(raw)
        entry={'local':local,'cdn':'','sha256':sha,'size':len(raw),'width':256,'height':256,'encoding':'lossless' if quality is None else f'quality-{quality}',
               'source':{'generator':'image_gen','sha256':hashlib.sha256(args.npcs.read_bytes()).hexdigest(),'width':source.width,'height':source.height,'sourceRect':[x+box[0],y+box[1],box[2]-box[0],box[3]-box[1]]}}
        key=f'npc:hanzi-{npc["id"]}';retain_cdn(entry,art['entries'].get(key,{}));art['entries'][key]=entry
        npc['portrait']={'id':key,'crop':[(256-part.width)//2,248-part.height,part.width,part.height]}
        outputs.append(entry)
    write('data/adventure/npc-art.json',art);write('data/adventure/island-packs/hanzi.json',pack)
    write('data/adventure/hanzi/island-art.json',{'version':1,'assets':outputs,'prompt':'docs/hanzi-island-art.md'})
    print(json.dumps([{k:r[k] for k in ['local','size','width','height']} for r in outputs],ensure_ascii=False,indent=2))

if __name__=='__main__':main()
