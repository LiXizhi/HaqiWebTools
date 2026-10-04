"""Pack inspected streetscape cells, preserving alpha and hash provenance.

python scripts/prepare_city_street_art.py source.png
CDN URLs are intentionally absent until a successful upload is verified.
"""
import hashlib, io, json, sys
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]
source=Path(sys.argv[1]); im=Image.open(source).convert('RGBA')
names=['shophouse','corner-shop','apartment','nantou-gate','banyan','palm','flowers','shelter','food-stall','fruit-stall','bench','bicycles','car','minibus','lingnan-house','cafe']
# Inspected generation has three 325px rows followed by a shorter vehicle row.
cuts=[0,326/1200,650/1200,920/1200,1]
entries={}
for i,name in enumerate(names):
    x=i%4;y=i//4
    cell=im.crop((round(x*im.width/4)+6,round(cuts[y]*im.height)+6,round((x+1)*im.width/4)-6,round(cuts[y+1]*im.height)-6))
    box=cell.getchannel('A').getbbox();assert box,name
    cell=cell.crop(box);cell.thumbnail((512,512),Image.Resampling.LANCZOS)
    for options in [{'lossless':True}]+[{'quality':q} for q in [94,90,86,82]]:
        buf=io.BytesIO();cell.save(buf,'WEBP',method=6,**options);data=buf.getvalue()
        if len(data)<=200000:break
    assert len(data)<=200000
    sha=hashlib.sha256(data).hexdigest();local=f'assets/adventure/earth/streets/{name}-{sha[:12]}.webp'
    dest=root/local;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
    entries[name]={'id':'city-street:'+name+':'+sha[:12],'local':local,'width':cell.width,'height':cell.height,'bytes':len(data),'sha256':sha,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'source':'Offline imagegen original Shenzhen-inspired sprite; not surveyed architecture','encoding':options,'anchor':[0.5,1]}
out=root/'data/adventure/earth/street-art.json'
previous=json.loads(out.read_text(encoding='utf8')) if out.exists() else {}
for key,entry in entries.items():
    old=previous.get('entries',{}).get(key,{})
    if old.get('sha256')==entry['sha256'] and old.get('cdn'):entry['cdn']=old['cdn']
out.write_text(json.dumps({**previous,'version':1,'entries':{**previous.get('entries',{}),**entries}},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'manifest':str(out),'files':len(entries),'bytes':sum(x['bytes'] for x in entries.values())}))
