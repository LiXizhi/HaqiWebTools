"""Prepare isolated preview assets; never rewrite source atlases or mount layouts.

The authored head masks are the only regions allowed to change in body atlases.
Run with --male/--female generated PNG paths, or --verify for pixel verification.
"""
import argparse, hashlib, json
from pathlib import Path
from PIL import Image, ImageDraw, ImageChops
from calibrate_hero_heads import calibrate

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/hero-preview'
MANIFEST = ROOT / 'data/hero-preview.json'
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def read(path): return json.loads(path.read_text(encoding='utf-8'))

def clean_head(cell):
 # Keep the principal alpha component; generated isolated specks must not shift
 # the bounding box/attachment point. This is atlas packing, not a body edit.
 alpha=cell.getchannel('A');w,h=cell.size;pixels=alpha.tobytes();seen=bytearray(w*h);largest=[]
 for start,value in enumerate(pixels):
  if seen[start] or value<=12:continue
  seen[start]=1;stack=[start];component=[]
  while stack:
   n=stack.pop();component.append(n);x=n%w;y=n//w
   for nxt in ([n-1] if x else [])+([n+1] if x+1<w else [])+([n-w] if y else [])+([n+w] if y+1<h else []):
    if not seen[nxt] and pixels[nxt]>12:seen[nxt]=1;stack.append(nxt)
  if len(component)>len(largest):largest=component
 keep=bytearray(w*h)
 for n in largest:keep[n]=pixels[n]
 cell.putalpha(Image.frombytes('L',(w,h),bytes(keep)))
 return cell

def neck_bridge(im, polygon, center, scale, female=False):
 # The neck belongs to the body WebP. Confine every added pixel to the authored
 # head-removal mask, so torso/clothes/seat geometry are exactly unchanged.
 cx,cy=center;half=9*scale;height=18*scale
 layer=Image.new('RGBA',im.size);draw=ImageDraw.Draw(layer)
 draw.polygon([(cx-half*.8,cy-height),(cx+half*.8,cy-height),(cx+half,cy+3*scale),(cx-half,cy+3*scale)],fill=(239,190,149,255) if not female else (246,202,165,255))
 draw.line([(cx-half*.8,cy-height),(cx-half,cy+3*scale)],fill=(179,122,88,255),width=max(1,round(scale)))
 mask=Image.new('L',im.size);ImageDraw.Draw(mask).polygon(polygon,fill=255)
 layer.putalpha(ImageChops.multiply(layer.getchannel('A'),mask));im.alpha_composite(layer)
 return {'center':[cx,cy],'height':height,'width':half*2,'overlap':2*scale}

# Lower mask boundary follows the chin/hair rather than cutting an entire row.
# Coordinates are in the original 384px cells; no body re-centering is performed.
PROFILES = {
 'standing': [[(0,124),(145,124),(167,145),(205,145),(234,126),(384,126)],[(0,136),(150,136),(170,148),(192,143),(217,131),(384,131)],[(0,132),(159,132),(180,145),(210,145),(238,129),(384,129)],[(0,132),(141,132),(165,145),(216,145),(244,131),(384,131)]],
 'rider': [[(0,116),(139,116),(166,137),(204,137),(233,119),(384,119)],[(0,126),(148,126),(169,139),(198,136),(225,124),(384,124)],[(0,127),(157,127),(181,139),(211,139),(240,125),(384,125)],[(0,121),(143,121),(167,138),(215,138),(245,119),(384,119)]],
 'female-standing': [[(0,147),(161,147),(180,147),(212,147),(231,146),(384,146)],[(0,151),(155,151),(172,145),(197,147),(220,155),(384,155)],[(0,151),(159,151),(179,143),(211,143),(232,150),(384,150)],[(0,145),(154,145),(177,144),(214,144),(235,149),(384,149)]],
 'female-rider': [[(0,137),(160,137),(179,141),(211,141),(232,138),(384,138)],[(0,148),(150,148),(168,143),(200,143),(222,148),(384,148)],[(0,151),(157,151),(179,140),(210,140),(236,151),(384,151)],[(0,142),(153,142),(175,140),(215,140),(239,148),(384,148)]],
}

def main():
 p=argparse.ArgumentParser();p.add_argument('--male');p.add_argument('--female');p.add_argument('--verify',action='store_true');a=p.parse_args()
 if a.verify:
  m=read(MANIFEST); checks=[]
  for key,row in m['bodies'].items():
   original=Image.open(ROOT/row['source']['local']).convert('RGBA');body=Image.open(ROOT/row['local']).convert('RGBA')
   mask=Image.new('L',original.size);d=ImageDraw.Draw(mask)
   for frame in row['frames']: d.polygon(frame['mask'],fill=255)
   for box in row.get('excludedNonCharacterRegions',[]):d.rectangle(box,fill=255)
   difference=ImageChops.difference(original,body)
   for channel in difference.split(): assert ImageChops.multiply(channel,ImageChops.invert(mask)).getbbox() is None,key
   assert original.size==body.size and sha(ROOT/row['local'])==row['sha256']
   checks.append(key)
  for row in [*m['bodies'].values(),*m['heads'].values()]:
   assert (ROOT/row['local']).stat().st_size<=200000
   im=Image.open(ROOT/row['local']);im.load();assert im.mode=='RGBA'
  print(json.dumps({'unchangedOutsideMasks':checks,'webpLimit':200000}));return
 OUT.mkdir(parents=True,exist_ok=True)
 old=read(MANIFEST) if MANIFEST.exists() else {}
 manifest={'version':2,'directionCount':16,'directions':['前','左偏前','左前','左前偏侧','左','左后偏侧','左后','左偏后','后','右偏后','右后','右后偏侧','右','右前偏侧','右前','右偏前'],'bodies':{},'heads':{}}
 catalog=read(ROOT/'data/adventure/mount-catalog.json');media=read(ROOT/'data/adventure/media.json')
 def save(im,key,section,extra):
  path=OUT/(key+'.webp');im.save(path,'WEBP',lossless=True,exact=True,method=6)
  assert path.stat().st_size<=200000,(key,path.stat().st_size)
  row={'local':path.relative_to(ROOT).as_posix(),'width':im.width,'height':im.height,'bytes':path.stat().st_size,'sha256':sha(path),**extra}
  prev=old.get(section,{}).get(key,{})
  if prev.get('walk'):row['walk']=prev['walk']
  if prev.get('sha256')==row['sha256'] and prev.get('cdn'):row['cdn']=prev['cdn']
  manifest[section][key]=row
 for key,profile in PROFILES.items():
  source=dict(catalog['sheets'][key]);source['local']='demos/mount-lab/'+source['local'];src=ROOT/source['local'];im=Image.open(src).convert('RGBA');frames=[]
  for i,boundary in enumerate(profile):
   ox=i%2*384;oy=i//2*384;poly=[(ox,oy),(ox+383,oy)]+[(ox+x,oy+y) for x,y in reversed(boundary)]
   ImageDraw.Draw(im).polygon(poly,fill=(0,0,0,0))
   neck=boundary[2:4];cx=sum(x for x,y in neck)/2+[0,14,-10,0][i];cy=sum(y for x,y in neck)/2
   bridge=neck_bridge(im,poly,[ox+cx,oy+cy],1,key.startswith('female'))
   frames.append({'crop':[ox,oy,384,384],'neck':[cx,cy],'headHeight':cy-18,'mask':poly,'neckBridge':bridge})
  save(im,key,'bodies',{'source':{**source,'sha256':sha(src)},'frames':frames,'defaultHead':'elf-girl' if key.startswith('female') else 'elf-boy'})
 # The original walking atlas includes trees/buildings: preserve the full atlas.
 src=ROOT/'assets/adventure/webp/sprites.webp';original=Image.open(src).convert('RGBA');w,h=original.size
 for gender,rowindex in [('male',2),('female',3)]:
  im=original.copy();frames=[];cuts=[0,323,650,929,1254];sy=cuts[rowindex]*h/1254;sh=(cuts[rowindex+1]-cuts[rowindex])*h/1254;cw=w/4
  # Authored against the 660px original; masks do not touch cloak/arms.
  cutoffs=[410,409,409,410] if gender=='male' else [550,549,549,552]
  # Side attachment is under the ear/base of skull, not under the chin.
  centers=[81,248,397,561]
  for i in range(4):
   ox=i*cw;cy=cutoffs[i]*h/642
   # Follow the lower hair/chin contour while leaving the staff tip untouched.
   baseline=cy-(4 if gender=='male' else 1)
   poly=[(ox,sy),(ox+cw-1,sy),(ox+cw-1,cy-16),(ox+cw*.78,cy-16),(ox+cw*.70,baseline),(ox+cw*.56,cy),(ox+cw*.44,cy),(ox+cw*.30,baseline),(ox+cw*.23,cy-16),(ox,cy-16)]
   ImageDraw.Draw(im).polygon(poly,fill=(0,0,0,0));crop=[ox,sy,cw,sh]
   center=centers[i]*w/642
   bridge=neck_bridge(im,poly,[center,cy],.48*w/642,gender=='female')
   frames.append({'crop':crop,'neck':[center-ox,cy-sy],'headHeight':(cy-sy)-5,'mask':poly,'neckBridge':bridge})
  source={**media['entries']['sprites'],'local':src.relative_to(ROOT).as_posix(),'sha256':sha(src)}
  # Keep full canvas and original coordinates; unrelated trees/buildings/other gender
  # are empty in this dedicated body asset, never consumed by the hero renderer.
  excluded=[[0,0,w-1,int(sy)-1],[0,int(sy+sh)+1,w-1,h-1]]
  excluded=[box for box in excluded if box[1]<=box[3]]
  for box in excluded:ImageDraw.Draw(im).rectangle(box,fill=(0,0,0,0))
  save(im,gender+'-walk','bodies',{'source':source,'frames':frames,'defaultHead':'elf-girl' if gender=='female' else 'elf-boy','trimOriginal':True,'excludedNonCharacterRegions':excluded})
 for gender,input_path in [('male',a.male),('female',a.female)]:
  if not input_path:raise ValueError('Both generated PNGs required')
  src=Path(input_path);im=Image.open(src).convert('RGBA');cw=im.width//4;ch=im.height//4
  for head_id in ['elf-girl' if gender=='female' else 'elf-boy']:
   atlas=Image.new('RGBA',(4*144,4*144));frames=[]
   for i in range(16):
    n=i;cell=clean_head(im.crop((n%4*cw,n//4*ch,(n%4+1)*cw,(n//4+1)*ch)));bounds=cell.getchannel('A').point(lambda v:255 if v>20 else 0).getbbox()
    if not bounds:raise ValueError('Empty generated head')
    cell=cell.crop(bounds);cell.thumbnail((132,132),Image.Resampling.LANCZOS)
    x=i%4*144+(144-cell.width)//2;y=i//4*144+136-cell.height;atlas.alpha_composite(cell,(x,y))
    frames.append({'crop':[i%4*144,i//4*144,144,144],'neck':[72,134],'height':cell.height})
   path=OUT/('head-'+head_id+'.webp');atlas.save(path,'WEBP',quality=90,method=6)
   # Quantized atlas only; lossless body images above retain exact source pixels.
   row={'name':'双马尾精灵少女' if gender=='female' else '棕发精灵少年','gender':gender,'directionCount':16,'local':path.relative_to(ROOT).as_posix(),'width':576,'height':576,'bytes':path.stat().st_size,'sha256':sha(path),'sourceSha256':sha(src),'frames':frames}
   assert row['bytes']<=200000
   prev=old.get('heads',{}).get(head_id,{})
   if prev.get('sha256')==row['sha256'] and prev.get('cdn'):row['cdn']=prev['cdn']
   manifest['heads'][head_id]=row
 for key,head in old.get('heads',{}).items():
  if key not in manifest['heads']:manifest['heads'][key]=head
 calibrate(manifest)
 MANIFEST.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 (ROOT/'data/adventure/hero-art.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print('Prepared',len(manifest['bodies']),'body atlases and',len(manifest['heads']),'head atlases')
if __name__=='__main__':main()
