#!/usr/bin/env python3
"""Pack generated skill sheets with clear cell gutters and a 100KB/file budget."""
import argparse,hashlib,io,json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]

def read(path): return json.loads(path.read_text(encoding='utf-8-sig'))

def prepare(job, sources, previous=None, prompts=None):
    if not (sources/(job['id']+'.json')).exists() and previous:
        sid=job['id'];row=previous['sheets'][sid]
        if [row['columns'],row['rows']]!=[job['columns'],job['rows']]:
            raise ValueError('Layout changed; generate a new source: '+sid)
        for i,cell in enumerate(job['cells']):
            old=previous['bases'][cell['base']]
            if job.get('hero'):
                assert old.get('effectAtlas')==sid, 'Changed hero mapping: '+sid
            else:
                assert old['atlas']==sid and old['cell']==i and old['name']==cell['name'] and old['source']==cell['original'], 'Changed cell; regenerate '+sid
        data=(ROOT/row['local']).read_bytes()
        assert len(data)==row['size']<=100000 and hashlib.sha256(data).hexdigest()==row['sha256']
        return job,row,prompts[sid]
    record=read(sources/(job['id']+'.json'))
    source=Path(record['source']); source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
    cached=sources/('packed-'+job['id']+'.json')
    if cached.exists():
        row=read(cached); target=ROOT/row['local']
        if row['sourceSha256']==source_hash and [row['columns'],row['rows']]==[job['columns'],job['rows']] and target.exists() and hashlib.sha256(target.read_bytes()).hexdigest()==row['sha256']:
            return job,row,record['prompt']
    original=Image.open(source).convert('RGBA')
    if original.width!=original.height or original.getchannel('A').getextrema()[0]!=0:
        raise ValueError('Expected square RGBA transparency: '+job['id'])
    cols=job['columns']; rows=job['rows']
    # Repack whole equal cells (same pivot across hero poses), with explicit clear gutters.
    # No per-pose tight trimming, so actor scale and baseline do not wobble.
    for cell_size in (192,176,160,144,128,112,96):
        image=Image.new('RGBA',(cols*cell_size,rows*cell_size))
        pad=max(4,round(cell_size*.08)); inner=cell_size-2*pad
        for i in range(cols*rows):
            x=i%cols; y=i//cols
            tile=original.crop((round(x*original.width/cols),round(y*original.height/rows),round((x+1)*original.width/cols),round((y+1)*original.height/rows)))
            tile=tile.resize((inner,inner),Image.Resampling.LANCZOS)
            # Remove nearly invisible compression noise, retaining meaningful soft alpha.
            tile.putalpha(tile.getchannel('A').point(lambda a:0 if a<8 else a))
            image.paste(tile,(x*cell_size+pad,y*cell_size+pad))
        for opts in ({'lossless':True},*({'quality':q} for q in (90,85,80,75))):
            stream=io.BytesIO(); image.save(stream,format='WEBP',method=4,exact=True,**opts); data=stream.getvalue()
            if len(data)<=100000:break
        else:continue
        break
    else:raise ValueError('Cannot meet 100KB budget: '+job['id'])
    decoded=Image.open(io.BytesIO(data));decoded.load()
    assert decoded.size==image.size and decoded.getchannel('A').getextrema()[0]==0
    sha=hashlib.sha256(data).hexdigest();local=f"assets/adventure/skill-atlases/{job['id']}-{sha}.webp"
    target=ROOT/local;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
    row={'local':local,'cdn':None,'sha256':sha,'size':len(data),'width':image.width,'height':image.height,'columns':cols,'rows':rows,'padding':pad,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest()}
    cached.write_text(json.dumps(row),encoding='utf-8')
    return job,row,record['prompt']

def main():
    parser=argparse.ArgumentParser();parser.add_argument('sources',type=Path);parser.add_argument('--available',action='store_true');parser.add_argument('--reuse-existing',action='store_true');args=parser.parse_args()
    plan=read(ROOT/'data/adventure/skill-art-plan.json');sheets={};bases={};prompts={}
    previous=read(ROOT/'data/adventure/skill-art.json') if args.reuse_existing else None
    prior_prompts=read(ROOT/'docs/skill-art-prompts.json')['prompts'] if args.reuse_existing else None
    jobs=[j for j in plan['sheets'] if not args.available or (args.sources/(j['id']+'.json')).exists()]
    with ThreadPoolExecutor(max_workers=4) as pool:
        for job,row,prompt in pool.map(lambda j:prepare(j,args.sources,previous,prior_prompts),jobs):
            sid=job['id'];sheets[sid]=row;prompts[sid]=prompt
            if job.get('hero'):
                bases[job['cells'][0]['base']].update({'effectAtlas':sid,'effectFrames':list(range(9)),'heroCardFrame':2})
            else:
                for i,cell in enumerate(job['cells']):
                    bases[cell['base']]={'atlas':sid,'cell':i,'name':cell['name'],'school':cell['school'],'source':cell['original']}
            print(sid,row['size'],row['width'],flush=True)
    if args.available and len(jobs)!=len(plan['sheets']):
        print('Prepared available sheets; final manifest waits for all generation outputs.');return
    manifest={'version':1,'maxBytes':100000,'sheets':sheets,'bases':bases}
    (ROOT/'data/adventure/skill-art.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (ROOT/'docs/skill-art-prompts.json').write_text(json.dumps({'tool':'imagegen built-in','prompts':prompts},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
if __name__=='__main__':main()
