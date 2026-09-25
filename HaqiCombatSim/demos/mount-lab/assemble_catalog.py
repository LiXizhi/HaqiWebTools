"""Assemble native sprite metadata into editable 2D mount configuration."""
import argparse, json
from pathlib import Path
HERE=Path(__file__).resolve().parent

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--id',action='append',help='Rebuild only these mounts, preserving other calibrations')
    args=parser.parse_args()
    read=lambda name:json.loads((HERE/name).read_text(encoding='utf-8'))
    source=read('original-catalog.json');native=read('native-assets.json');assets=read('assets.json');catalog=read('catalog.json')
    existing={m['id']:m for m in catalog['mounts']}
    overrides=read('pose-overrides.json') if (HERE/'pose-overrides.json').exists() else {}
    concepts=[m for m in catalog['mounts'] if not m.get('source')]
    mounts=[]
    for job in source['jobs']:
        if job['id'] not in native:continue
        if args.id and job['id'] not in args.id and job['id'] in existing:
            mounts.append(existing[job['id']]);continue
        asset=native[job['id']];assets[job['id']]=asset
        directions={};kind=job['kind']
        for i,d in enumerate(['down','left','right','up']):
            cell=asset.get('cellOrder',[0,2,1,3])[i]
            left,top,right,bottom=asset['frameBounds'][cell]
            w=right-left;h=bottom-top
            seat=[(left+right)/2,top+h*.40]
            scale=min(.60,max(.25,max(w,h)*.63))
            art='rider';anchor=[.49,.65];fg=[]
            if kind=='platform':seat[1]=top+h*.40;art='standing';anchor=[.5,.96];scale=max(.36,w*.65)
            elif kind=='wings':seat[1]=top+h*.52;art='standing';anchor=[.5,.44];scale=max(.45,max(w,h)*.75)
            elif kind=='vehicle':seat[1]=top+h*.34;scale=max(.25,w*.43)
            elif kind=='broom':seat[1]=top+h*.55;scale=max(.38,w*.55)
            elif i==0:seat[1]=top+h*.30
            if i==0 and kind=='animal':fg=[[[left+w*.2,top+h*.30],[right-w*.2,top+h*.30],[right-w*.2,bottom],[left+w*.2,bottom]]]
            if kind=='vehicle':fg=[[[left,top+h*.5],[right,top+h*.5],[right,bottom],[left,bottom]]]
            if kind=='wings' and i==3:fg=[[[0,0],[1,0],[1,1],[0,1]]]
            directions[d]=dict(cell=cell,riderCell=i,riderArt=art,seat=seat,anchor=anchor,scale=scale,foreground=fg,
                characters={'male':{'anchor':anchor},'female':{'anchor':[.5,.65] if art=='rider' else anchor}})
            directions[d].update(overrides.get(job['id'],{}).get('directions',{}).get(d,{}))
        aliases=[item['name'] for item in source['items'] if item['id'] in job['items']]
        name=next((n for n in aliases if not any(s in n for s in ['假日','荣誉','暂时作废','7天','变身药丸'])),job['name']).replace('变身药丸','')
        mounts.append(dict(id=job['id'],name=name,description=kind,ground=max(b[3] for b in asset['frameBounds']),
            lift=18 if kind in ['wings','platform','broom'] else 0,bob=1.5,
            source={'version':job['sourceVersion'],'model':job['model'],'items':job['items'],'markers':job['markers'],'aliases':aliases,'method':asset['source']['method']},directions=directions))
    for mount in mounts:
        if existing.get(mount['id'],{}).get('layoutBounds'):
            mount['layoutBounds']=existing[mount['id']]['layoutBounds']
    catalog['mounts']=mounts+concepts
    catalog['coverage']={'sourceItems':len(source['items']),'expectedAppearances':len(source['jobs']),'readyAppearances':len(mounts),
        'missing':[j['id'] for j in source['jobs'] if j['id'] not in native],'scope':source['scope']}
    (HERE/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf-8')
    (HERE/'assets.json').write_text(json.dumps(assets,ensure_ascii=False,indent=2),encoding='utf-8')
    print(catalog['coverage'])

if __name__=='__main__':main()
