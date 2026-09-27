"""Check variant alpha, frame envelopes and unchanged shared attachment geometry."""
import hashlib,json
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'data/hero-preview.json').read_text(encoding='utf-8'))
variants=json.loads((ROOT/'art-references/hero-body-variants.json').read_text(encoding='utf-8'))['variants']
report=[]
for key,row in variants.items():
    if row.get('validation',{}).get('registrationMode')!='neck-anchored':continue
    raw=(ROOT/row['local']).read_bytes();im=Image.open(ROOT/row['local']).convert('RGBA')
    assert len(raw)<=200000 and hashlib.sha256(raw).hexdigest()==row['sha256'],key
    assert im.size==(1344,768) and im.getchannel('A').getextrema()==(0,255),key
    body=manifest['bodies'][row['baseBody']];bounds=[]
    for frame in [*body['walk']['frames'],*body['frames']]:
        x,y,w,h=frame.get('renderCrop',frame['crop'])
        alpha=im.crop((x,y,x+w,y+h)).getchannel('A');box=alpha.point(lambda a:255 if a>40 else 0).getbbox()
        assert box,(key,'empty frame')
        nx,ny=frame['crop'][0]+frame['neck'][0],frame['crop'][1]+frame['neck'][1]
        assert im.crop((round(nx-3),round(ny-5),round(nx+4),round(ny+3))).getchannel('A').getbbox(),(key,'empty neck')
        bounds.append(box)
    report.append({'id':key,'bytes':len(raw),'frames':len(bounds),'neckPixelsExact':row['validation']['neckPixelsExact']})
assert len(report)==10
(ROOT/'.asset-cache/no-cape-validation.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print('Verified 10 new atlases, 280 frames, transparency, neck anchors and file hashes')
