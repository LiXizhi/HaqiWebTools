"""Pack visually verified native-alpha food props; does not upload or modify catalog."""
from pathlib import Path
from PIL import Image
import hashlib,io,json,sys
source=Path(sys.argv[1]);im=Image.open(source)
assert im.mode=='RGBA' and im.size==(1536,1024)
assert im.getchannel('A').getextrema()[0]==0
# Whole silhouettes verified on light, dark and game-green composites.
# Fish and milk have a faint alpha connection: these explicit bounds preserve
# each complete silhouette instead of blindly slicing nominal grid quarters.
rects=[(62,30,350,356),(398,58,755,350),(812,46,1124,359),(1220,30,1459,361),(47,382,370,646),(462,389,670,644),(730,411,1155,639),(1148,413,1521,644),(15,674,435,967),(483,669,694,980),(844,644,1017,982),(1133,698,1522,963)]
ids=['apple','banana','orange-fruit','pear','rice-bowl','egg','cooked-fish','cooked-meat','roast-chicken','juice-glass','milk-bottle','bread-loaf']
atlas=Image.new('RGBA',(768,576));frames={}
for n,(id,rect) in enumerate(zip(ids,rects)):
 sprite=im.crop(rect);sprite.thumbnail((176,176),Image.Resampling.LANCZOS)
 x=n%4*192+(192-sprite.width)//2;y=n//4*192+(192-sprite.height)//2
 atlas.alpha_composite(sprite,(x,y));frames[id]={'cell':n,'sourceRect':list(rect),'rect':[x,y,sprite.width,sprite.height]}
for options in [{'lossless':True}]+[{'lossless':False,'quality':q} for q in [94,90,86,82]]:
 raw=io.BytesIO();atlas.save(raw,format='WEBP',method=6,**options)
 if len(raw.getvalue())<=200000:break
assert len(raw.getvalue())<=200000
sha=hashlib.sha256(raw.getvalue()).hexdigest();out=Path('assets/adventure/home')/f'home-food-{sha[:12]}.webp';out.write_bytes(raw.getvalue())
manifest={'version':1,'id':'home-food-01','local':out.as_posix(),'width':768,'height':576,'bytes':len(raw.getvalue()),'sha256':sha,'encoding':options,'frames':frames,'source':{'generator':'image_gen','transparentBackground':True,'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'width':1536,'height':1024,'alphaProcessing':'native alpha preserved; individually verified whole-object bounds; no color key'},'prompt':'One 4-column by 3-row native-transparent food sprite atlas. Row1: single apple, banana, orange, pear. Row2: bowl of white rice, whole egg, cooked whole fish on plate, cooked steak on plate. Row3: roast chicken on plate, glass of orange juice, milk bottle, bread loaf. Warm hand-painted storybook RPG, three-quarter overhead, complete separate silhouettes, generous margins, no text, grid, borders or ground shadows.'}
Path('data/adventure/home/home-food-art.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
review=Image.new('RGB',(2304,576));decoded=Image.open(out).convert('RGBA')
for n,color in enumerate(['#fff8e6','#192d24','#8fb967']):
 bg=Image.new('RGBA',decoded.size,color);bg.alpha_composite(decoded);review.paste(bg.convert('RGB'),(768*n,0))
Path('tmp').mkdir(exist_ok=True);review.save('tmp/home-food-packed-review.png')
print(out.as_posix(),len(raw.getvalue()),sha)
