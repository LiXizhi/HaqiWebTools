"""Pack reference-based reconstructions; never label them native renders."""
import hashlib,io,json,sys
from pathlib import Path
from PIL import Image
HERE=Path(__file__).resolve().parent
FILES={
 'original-16108':'exec-18b37a01-ffe4-44c0-9681-1950a54ee06f.png',
 'original-16109':'exec-92853474-646d-4c10-a749-6f377f64ab29.png',
 'original-16141':'exec-794f51ba-c431-4d60-98e6-b53ea4b3bff8.png',
 'original-16142':'exec-acc76050-a12c-4e26-852b-f6bd356628ef.png',
 'original-16143':'exec-f3480aa4-47be-4977-819e-aa3a220a0c24.png',
 'original-16144':'exec-292ccccf-742d-4bb6-b2a6-651d2888502c.png',
 'original-10001':'exec-29af6a39-e081-4d3c-a667-27e3d9555160.png',
}

def main():
    gen=Path(sys.argv[1]);path=HERE/'native-assets.json';assets=json.loads(path.read_text(encoding='utf-8'))
    for key,name in FILES.items():
        source=gen/name;original=Image.open(source).convert('RGBA');im=original.resize((768,768),Image.Resampling.LANCZOS)
        assert original.getchannel('A').getextrema()==(0,255)
        for opts in ({'lossless':True},*({'quality':q} for q in (94,90,85,80,75,70))):
            b=io.BytesIO();im.save(b,format='WEBP',method=4,exact=True,**opts);raw=b.getvalue()
            if len(raw)<=200000:break
        assert len(raw)<=200000
        sha=hashlib.sha256(raw).hexdigest();local=f'assets/{key}-{sha[:12]}.webp';(HERE/local).write_bytes(raw)
        reference=HERE/'native-cache'/f'ref-{key}.png'
        bounds=[]
        for i in range(4):
            tile=im.crop((i%2*384,i//2*384,(i%2+1)*384,(i//2+1)*384));bounds.append([v/384 for v in tile.getbbox()])
        assets[key]=dict(local=local,cdn=None,width=768,height=768,columns=2,rows=2,bytes=len(raw),sha256=sha,
            source={'method':'original-icon-reference-imagegen','file':name,'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
                    'referenceSha256':hashlib.sha256(reference.read_bytes()).hexdigest()},frameBounds=bounds,cellOrder=[0,1,2,3])
        print(key,len(raw))
    path.write_text(json.dumps(assets,ensure_ascii=False,indent=2),encoding='utf-8')

if __name__=='__main__':main()
