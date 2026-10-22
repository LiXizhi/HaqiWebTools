"""Import persona source PNGs and measured anchors; publishable WebP <=200KB.
Usage: python scripts/prepare_ai_personas.py /path/to/source/personas
The resulting Haqi catalogue owns runtime assets and geometry for all consumers.
"""
from pathlib import Path
from PIL import Image
import hashlib,json,sys,io
root=Path(__file__).resolve().parents[1];source=Path(sys.argv[1])
manifest=json.loads((source/'manifest.json').read_text());catalogue=json.loads((root/'data/hero-preview.json').read_text())
rows={};names={'astra':'GPT 白龙画师','claude':'Claude 向日葵','deepseek':'DeepSeek 蓝鲸','gemini':'Gemini 星猫'}
for id,m in manifest['characters'].items():
 assets={}
 for part in ['head','body']:
  original=(source/f'{id}-{part}.png').read_bytes();im=Image.open(io.BytesIO(original)).convert('RGBA')
  original_size=im.size
  while True:
   for quality in [100,92,85,78,70]:
    out=io.BytesIO();im.save(out,format='WEBP',lossless=quality==100,quality=quality,method=1)
    if len(out.getvalue())<=200000:break
   data=out.getvalue()
   if len(data)<=200000:break
   im=im.resize((round(im.width*.8),round(im.height*.8)),Image.Resampling.LANCZOS)
  sx,sy=im.width/original_size[0],im.height/original_size[1]
  def scale_frame(f):
   f=dict(f)
   for k in ['crop','layoutBounds']:
    if k in f:f[k]=[v*(sx if i%2==0 else sy) for i,v in enumerate(f[k])]
   if 'neck' in f:f['neck']=[f['neck'][0]*sx,f['neck'][1]*sy]
   for k in ['height','headHeight','footY']:
    if k in f:f[k]*=sy
   return f
  if part=='head':m['heads'][id]['frames']=[scale_frame(f) for f in m['heads'][id]['frames']]
  else:
   body=m['bodies']['female-walk'];body['frames']=[scale_frame(f) for f in body['frames']]
   for k in ['frames','idleFrames']:body['walk'][k]=[scale_frame(f) for f in body['walk'][k]]
  sha=hashlib.sha256(data).hexdigest();local=f'assets/hero-preview/ai/{id}-{part}-{sha[:12]}.webp';path=root/local;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
  assets[part]={'local':local,'width':im.width,'height':im.height,'bytes':len(data),'sha256':sha,'encoding':{'quality':quality,'lossless':quality==100},'sourceSha256':hashlib.sha256(original).hexdigest()}
 for part,old in [('head',catalogue['heads'].get(id,{})),('body',catalogue['bodyVariants'].get(f'female-ai-{id}',{}))]:
  if old.get('sha256')==assets[part]['sha256'] and old.get('cdn'):assets[part]['cdn']=old['cdn']
 head={**m['heads'][id],**assets['head'],'name':names[id],'recommendedBodyId':f'female-ai-{id}'}
 body=m['bodies']['female-walk'];walk={**body['walk'],**assets['body']}
 body={**body,**assets['body'],'walk':walk}
 variant={**assets['body'],'id':f'female-ai-{id}','name':names[id],'gender':'female','baseBody':'female-walk','geometry':{'selfContained':True,'frames':body['frames'],'walk':{'frames':walk['frames'],'idleFrames':walk['idleFrames'],'columns':7,'rows':4,'framesPerDirection':6,'fps':10}},'source':{'method':'built-in image_gen; shared AI persona art','promptRef':'art-references/ai-personas-prompts.json'}}
 catalogue['heads'][id]=head;catalogue['bodyVariants'][variant['id']]=variant
 rows[id]={'headId':id,'bodyId':variant['id']}
 print(id,assets['head']['bytes'],assets['body']['bytes'])
(root/'data/hero-preview.json').write_text(json.dumps(catalogue,ensure_ascii=False,indent=2)+'\n')
(root/'data/ai-personas.json').write_text(json.dumps({'version':1,'characters':rows},indent=2)+'\n')

(root/'data/adventure/hero-art.json').write_bytes((root/'data/hero-preview.json').read_bytes())
