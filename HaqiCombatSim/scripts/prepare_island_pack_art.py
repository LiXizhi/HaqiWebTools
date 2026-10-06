"""Pack AI-generated expansion atlas and buildings; preserve alpha and provenance."""
import argparse,json
from pathlib import Path
from PIL import Image
from prepare_environment_art import prepare,ROOT

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--atlas',type=Path);p.add_argument('--buildings',type=Path);args=p.parse_args()
    ids=['tide','float','sail'];manifest_path=ROOT/'data/adventure/world-map-art.json'
    atlas=json.loads(manifest_path.read_text(encoding='utf8'))
    if args.atlas:
        row=prepare(args.atlas,ids,3,384,'world-atlas-continuation')
        row['source']['prompt']='docs/island-expansion.md#美术提示词'
        previous=atlas['resources'].get('continuation',{})
        if previous.get('sha256')==row['sha256']:row['cdn']=previous.get('cdn','')
        atlas['resources']['continuation']=row
        positions=[(900,50),(930,-440),(470,-810)]
        for i,zone in enumerate(ids):
            pack=json.loads((ROOT/f'data/adventure/island-packs/{zone}.json').read_text(encoding='utf8'))
            existing=next((r for r in atlas['islands'] if r['id']==zone),None)
            r={'id':zone,'name':pack['island']['name'],'resource':'continuation','rect':row['frames'][zone]['rect'],'x':positions[i][0],'y':positions[i][1],'w':340,'h':340,'minLevel':pack['island']['recommendedLevel']}
            if existing:existing.update(r)
            else:atlas['islands'].append(r)
        manifest_path.write_text(json.dumps(atlas,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    if args.buildings:
        target=ROOT/'data/adventure/building-art.json';manifest=json.loads(target.read_text(encoding='utf8'))
        im=Image.open(args.buildings);w,h=im.size
        for i,zone in enumerate(ids):
            rects=[(round(j*w/3),round(i*h/3),round((j+1)*w/3),round((i+1)*h/3)) for j in range(3)]
            names=['tower','village','harbor'] if i==0 else ['tower','village','garden']
            row=prepare(args.buildings,names,3,320,'buildings-'+zone,rects)
            row['source']['prompt']='docs/island-expansion.md#美术提示词'
            old=manifest['atlases'].get(zone,{})
            if old.get('sha256')==row['sha256']:row['cdn']=old.get('cdn','')
            # Reuse the island's actual pier frame; no extra generated boat asset.
            manifest['atlases'][zone]=row
        # Harbor is authored only on the tide sheet; other maps explicitly use it.
        target.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print('岛屿扩展WebP已准备；CDN地址在实际上传成功后填写。')
