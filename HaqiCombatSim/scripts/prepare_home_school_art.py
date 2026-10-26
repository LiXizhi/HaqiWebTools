"""Pack visually verified native-alpha school props; does not upload or modify catalog."""
from pathlib import Path
from PIL import Image
import hashlib,io,json,sys
source=Path(sys.argv[1]);im=Image.open(source)
assert im.mode=='RGBA' and im.size==(1536,1024)
assert im.getchannel('A').getextrema()[0]==0
# Whole silhouettes verified on light, dark and game-green composites.
# Explicit whole-object bounds include the complete computer and mouse.
# Preserve native alpha; no color key and no equal-grid source slicing.
rects=[(53,45,467,476),(507,42,940,467),(1001,33,1473,509),(27,476,511,987),(529,573,994,954),(1011,531,1509,988)]
ids=['pencil','pen','paper','school-bag','telephone','computer']
atlas=Image.new('RGBA',(768,384));frames={}
for n,(id,rect) in enumerate(zip(ids,rects)):
 sprite=im.crop(rect);sprite.thumbnail((176,176),Image.Resampling.LANCZOS)
 x=n%4*192+(192-sprite.width)//2;y=n//4*192+(192-sprite.height)//2
 atlas.alpha_composite(sprite,(x,y));frames[id]={'cell':n,'sourceRect':list(rect),'rect':[x,y,sprite.width,sprite.height]}
for options in [{'lossless':True}]+[{'lossless':False,'quality':q} for q in [94,90,86,82]]:
 raw=io.BytesIO();atlas.save(raw,format='WEBP',method=6,**options)
 if len(raw.getvalue())<=200000:break
assert len(raw.getvalue())<=200000
sha=hashlib.sha256(raw.getvalue()).hexdigest();out=Path('assets/adventure/home')/f'home-school-{sha[:12]}.webp';out.write_bytes(raw.getvalue())
manifest={'version':1,'id':'home-school-01','local':out.as_posix(),'width':768,'height':384,'bytes':len(raw.getvalue()),'sha256':sha,'encoding':options,'frames':frames,'source':{'generator':'image_gen','transparentBackground':True,'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'width':1536,'height':1024,'alphaProcessing':'native alpha preserved; individually verified whole-object bounds; no color key'},'prompt':Path('docs/story/drafts/english-home-school-art-prompt.txt').read_text(encoding='utf8')}
Path('data/adventure/home/home-school-art.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
review=Image.new('RGB',(2304,384));decoded=Image.open(out).convert('RGBA')
for n,color in enumerate(['#fff8e6','#192d24','#8fb967']):
 bg=Image.new('RGBA',decoded.size,color);bg.alpha_composite(decoded);review.paste(bg.convert('RGB'),(768*n,0))
Path('tmp').mkdir(exist_ok=True);review.save('tmp/home-school-packed-review.png')
print(out.as_posix(),len(raw.getvalue()),sha)
