"""Migrate legacy bodies to self-contained atlases without changing mount poses."""
import copy, hashlib, io, json, math
from PIL import Image
from merge_hero_idle import ROOT

def source_bounds(body, frame):
    x,y,w,h=frame['crop']
    source=Image.open(ROOT/body['source']['local']).convert('RGBA')
    tile=source.transform((math.ceil(w),math.ceil(h)),Image.Transform.EXTENT,(x,y,x+w,y+h),Image.Resampling.BILINEAR)
    l,t,r,b=tile.getchannel('A').point(lambda a:255 if a>20 else 0).getbbox()
    return [x+l,y+t,r-l,b-t]

def migrate(manifest):
    bodies=manifest['bodies']
    for body in bodies.values():
        if body.get('selfContained'):continue
        for frame in body['frames']:frame['layoutBounds']=source_bounds(body,frame)
        if body.get('walk'):
            walk=body['walk'];frames=[]
            for original,idle in zip(body['frames'],walk['idleFrames']):
                idle=copy.deepcopy(idle)
                dx,dy=idle['crop'][0]-original['crop'][0],idle['crop'][1]-original['crop'][1]
                bounds=original['layoutBounds']
                idle['renderCrop']=[bounds[0]+dx,bounds[1]+dy,*bounds[2:]]
                idle['layoutBounds']=idle['renderCrop']
                frames.append(idle)
            body['frames']=frames;walk['idleFrames']=frames
            for key in ('local','cdn','width','height','bytes','sha256','encoding'):body[key]=walk[key]
            body.pop('trimOriginal',None);body.pop('excludedNonCharacterRegions',None)
        body['selfContained']=True
        body['provenance']=body.pop('source')
    merge_riders(bodies,'female-rider','female-standing','female-rider')
    merge_riders(bodies,'rider','standing','male-rider')

def merge_riders(bodies, rider_key, standing_key, atlas_id):
    rider,standing=bodies[rider_key],bodies[standing_key]
    if rider.get('rows')==2 and rider.get('columns')==4:return
    atlas=Image.new('RGBA',(1536,768))
    for row,body in enumerate((rider,standing)):
        image=Image.open(ROOT/body['local']).convert('RGBA')
        for i,frame in enumerate(body['frames']):
            x,y,w,h=frame['crop'];ox,oy=i*384,row*384;dx,dy=ox-x,oy-y
            atlas.paste(image.crop((x,y,x+w,y+h)),(ox,oy))
            frame['crop']=[ox,oy,w,h]
            bounds=frame['layoutBounds'];frame['layoutBounds']=[bounds[0]+dx,bounds[1]+dy,*bounds[2:]]
            if frame.get('mask'):frame['mask']=[[px+dx,py+dy] for px,py in frame['mask']]
            if frame.get('neckBridge'):
                px,py=frame['neckBridge']['center'];frame['neckBridge']['center']=[px+dx,py+dy]
    for options in ({'lossless':True},*({'quality':q} for q in (98,95,90,85,80))):
        stream=io.BytesIO();atlas.save(stream,'WEBP',method=6,exact=True,**options);raw=stream.getvalue()
        if len(raw)<=200000:break
    assert len(raw)<=200000
    local=f'assets/hero-preview/{atlas_id}.webp'
    (ROOT/local).write_bytes(raw)
    for body in (rider,standing):
        body.update(local=local,width=1536,height=768,columns=4,rows=2,
                    bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest(),encoding=options,atlas=atlas_id)
        body.pop('cdn',None)
    print(atlas_id,len(raw),options)

if __name__=='__main__':
    path=ROOT/'data/hero-preview.json';manifest=json.loads(path.read_text(encoding='utf-8'))
    migrate(manifest);manifest['version']=3
    text=json.dumps(manifest,ensure_ascii=False,indent=2)+'\n'
    path.write_text(text,encoding='utf-8');(ROOT/'data/adventure/hero-art.json').write_text(text,encoding='utf-8')
