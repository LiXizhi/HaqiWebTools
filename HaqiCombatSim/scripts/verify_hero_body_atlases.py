"""Pixel-level checks reusable for batches of generated body atlases."""
import argparse, hashlib, json, statistics
from pathlib import Path
from PIL import Image
from merge_hero_idle import ROOT

def verify(path):
    manifest=json.loads(path.read_text(encoding='utf-8'));report=[]
    for key,body in manifest['bodies'].items():
        walk=body.get('walk')
        if not walk:continue
        raw=(ROOT/walk['local']).read_bytes();image=Image.open(ROOT/walk['local']).convert('RGBA')
        assert len(raw)<=200000 and hashlib.sha256(raw).hexdigest()==walk['sha256'],key
        assert image.size==(walk['width'],walk['height']),key
        assert image.getchannel('A').getextrema()[0]==0,key
        rows=[]
        for direction in range(4):
            feet=[];spans=[]
            for frame in walk['frames'][direction*6:direction*6+6]:
                x,y,w,h=frame['crop']
                alpha=image.crop((x,y,x+w,y+h)).getchannel('A').point(lambda a:255 if a>40 else 0)
                bound=alpha.getbbox();assert bound,(key,direction)
                feet.append(bound[3])
                leg=alpha.crop((0,round(frame['neck'][1]+(bound[3]-frame['neck'][1])*.6),w,h)).getbbox()
                spans.append(leg[2]-leg[0])
            idle=walk['idleFrames'][direction];x,y,w,h=idle['crop']
            # Compare atlas-space foot baselines, including fractional idle crop offsets.
            alpha=image.crop((int(x),int(y),round(x+w),round(y+h))).getchannel('A').point(lambda a:255 if a>40 else 0)
            foot=int(y)-direction*walk['cellHeight']+alpha.getbbox()[3]
            assert abs(foot-statistics.median(feet))<=2,(key,direction,foot,feet)
            if direction in (1,2):assert max(spans)-min(spans)>=5,(key,direction,'Side legs do not change enough',spans)
            rows.append({'direction':direction,'walkingFeet':feet,'idleFoot':foot,'legWidths':spans})
        report.append({'body':key,'bytes':len(raw),'rows':rows})
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--manifest',type=Path,default=ROOT/'data/hero-preview.json')
    verify(parser.parse_args().manifest)
