"""Register an AI reference edit to the existing 7x4 body's immutable geometry.

Only resampling/compositing: garment designs come from image_gen. Classic edits
retain base alpha; silhouette edits retain generated alpha and align neck anchors.
Restore exposed neck pixels; never change runtime crop JSON.
"""
import argparse, hashlib, io, json
from pathlib import Path
from PIL import Image, ImageDraw, ImageChops

ROOT=Path(__file__).resolve().parents[1]
def sha(raw):return hashlib.sha256(raw).hexdigest()

def prepare(source,variant_id,reference=None,prompt_ref=None):
    gender='female' if variant_id.startswith('female') else 'male'
    definitions=json.loads((ROOT/'art-references/body-variants/prompts.json').read_text(encoding='utf-8'))+json.loads((ROOT/'art-references/body-variants/no-cape-prompts.json').read_text(encoding='utf-8'))
    definition=next((row for row in definitions if row['id']==variant_id),{})
    base=json.loads((ROOT/'data/hero-preview.json').read_text(encoding='utf-8'))['bodies'][gender+'-walk']
    reference_path=reference or ROOT/base['local']
    original=Image.open(reference_path).convert('RGBA')
    assert original.size==(base['width'],base['height'])
    generated=Image.open(source).convert('RGBA')
    assert generated.getchannel('A').getextrema()[0]==0
    result=Image.new('RGBA',original.size);registration=[]
    cw,ch=original.width//7,original.height//4
    for i in range(28):
        x,y=i%7*cw,i//7*ch
        target=original.crop((x,y,x+cw,y+ch))
        cell=generated.crop((round(i%7*generated.width/7),round(i//7*generated.height/4),
                             round((i%7+1)*generated.width/7),round((i//7+1)*generated.height/4)))
        bounds=target.getchannel('A').point(lambda a:255 if a>20 else 0).getbbox()
        source_bounds=cell.getchannel('A').point(lambda a:255 if a>20 else 0).getbbox()
        assert bounds and source_bounds,(i,'empty cell')
        l,t,r,b=bounds
        tile=Image.new('RGBA',(cw,ch))
        if definition.get('registrationMode')=='neck-anchored':
            # Keep new alpha: restoring the old silhouette would restore its cape.
            sl,st,sr,sb=source_bounds
            scale=(b-t)/(sb-st)
            edited=cell.crop(source_bounds).resize((round((sr-sl)*scale),b-t),Image.Resampling.LANCZOS)
            frame=base['frames'][i//7] if i%7==6 else base['walk']['frames'][i//7*6+i%7]
            neck_x=frame['crop'][0]+frame['neck'][0]-x
            top=edited.getchannel('A').crop((0,0,edited.width,max(2,round(edited.height*.07))))
            points=[(xx,top.getpixel((xx,yy))) for yy in range(top.height) for xx in range(top.width) if top.getpixel((xx,yy))>20]
            center=sum(xx*a for xx,a in points)/sum(a for _,a in points)
            crop=frame.get('renderCrop',frame['crop'])
            left,right=crop[0]-x,crop[0]-x+crop[2]
            fit=min(1,(neck_x-left-1)/max(center,1),(right-neck_x-1)/max(edited.width-center,1))
            if fit<1:
                edited=edited.resize((max(1,round(edited.width*fit)),edited.height),Image.Resampling.LANCZOS);center*=fit
            tile.paste(edited,(round(neck_x-center),t))
            # Immutable runtime crop remains the clipping envelope, not the old cape.
            crop=frame.get('renderCrop',frame['crop']);mask=Image.new('L',(cw,ch))
            ImageDraw.Draw(mask).rectangle((crop[0]-x,crop[1]-y,crop[0]-x+crop[2]-1,crop[1]-y+crop[3]-1),fill=255)
            tile.putalpha(ImageChops.multiply(tile.getchannel('A'),mask))
        else:
            edited=cell.crop(source_bounds).resize((r-l,b-t),Image.Resampling.LANCZOS)
            tile.paste(edited,(l,t));tile.putalpha(target.getchannel('A'))
        result.paste(tile,(x,y))
        registration.append({'cell':i,'sourceBounds':source_bounds,'targetBounds':bounds})
    # Keep actual skin at all 28 existing neck anchors, including the idle column.
    protected=Image.new('L',original.size)
    for frame in [*base['walk']['frames'],*base['frames']]:
        cx,cy=frame['crop'][0]+frame['neck'][0],frame['crop'][1]+frame['neck'][1]
        for y in range(max(0,round(cy-16)),min(original.height,round(cy+3))):
            for x in range(max(0,round(cx-10)),min(original.width,round(cx+10))):
                r,g,b,a=original.getpixel((x,y))
                if a>20 and r>120 and r>g*1.1 and g>b*1.1:protected.putpixel((x,y),255)
    result.paste(original,(0,0),protected)
    for options in ({'lossless':True},*({'quality':q} for q in (98,95,90,85))):
        stream=io.BytesIO();result.save(stream,'WEBP',method=6,exact=True,**options);raw=stream.getvalue()
        if len(raw)<=200000:break
    assert len(raw)<=200000
    local=f'assets/hero-preview/{variant_id}-walk-cycle.webp'
    (ROOT/local).write_bytes(raw)
    decoded=Image.open(io.BytesIO(raw)).convert('RGBA')
    same_alpha=ImageChops.difference(original.getchannel('A'),decoded.getchannel('A')).getbbox() is None
    if definition.get('registrationMode')!='neck-anchored':assert same_alpha
    neck_exact=all(ImageChops.multiply(c,protected).getbbox() is None for c in ImageChops.difference(original,decoded).split())
    metadata={'id':variant_id,'name':definition.get('name','赤曜战法师'),'gender':gender,'baseBody':gender+'-walk',
        'local':local,'width':original.width,'height':original.height,'bytes':len(raw),'sha256':sha(raw),
        'encoding':options,'source':{'method':'built-in image_gen reference edit',
        'sha256':sha(source.read_bytes()),'reference':reference_path.resolve().relative_to(ROOT).as_posix(),'referenceSha256':sha(reference_path.read_bytes()),'geometryBase':base['local']},
        'validation':{'sameAlpha':same_alpha,'registrationMode':definition.get('registrationMode','original-alpha'),'neckPixelsExact':neck_exact,'unchangedGeometry':True},
        'registration':registration,'promptRef':('art-references/body-variants/no-cape-prompts.json' if definition.get('registrationMode')=='neck-anchored' else 'art-references/body-variants/prompts.json') if definition else 'art-references/male2-body-prompt.json'}
    target=ROOT/'art-references/hero-body-variants.json'
    if prompt_ref:metadata['promptRef']=prompt_ref
    manifest=json.loads(target.read_text(encoding='utf-8')) if target.exists() else {'version':1,'scope':'preview-only','variants':{}}
    previous=manifest['variants'].get(variant_id,{})
    if previous.get('sha256')==metadata['sha256'] and previous.get('cdn'):metadata['cdn']=previous['cdn']
    manifest['variants'][variant_id]=metadata
    target.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(variant_id,len(raw),options,metadata['validation'])

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,required=True);parser.add_argument('--id',default='male2')
    parser.add_argument('--reference',type=Path);parser.add_argument('--prompt-ref')
    args=parser.parse_args();prepare(args.source,args.id,args.reference,args.prompt_ref)
