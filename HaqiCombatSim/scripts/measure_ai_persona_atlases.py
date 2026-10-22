"""Read generated textures; emit Haqi HeroRenderer metadata without modifying pixels.
Requires Pillow. Every character has its own 16-view head and 7x4 body texture.
"""
from pathlib import Path
from PIL import Image
from collections import deque
import hashlib,json,sys
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(sys.argv[1]).resolve()
def descriptor(path):
    im=Image.open(path).convert('RGBA')
    return im,{'local':'assets/personas/'+path.name,'width':im.width,'height':im.height,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
def cell(im,col,row,cols,rows):
    x0=round(col*im.width/cols); x1=round((col+1)*im.width/cols)
    y0=round(row*im.height/rows); y1=round((row+1)*im.height/rows)
    a=im.getchannel('A').crop((x0,y0,x1,y1));w,h=a.size
    # Measure solid pixels only; faint generated edge halos are not anchors.
    mask=a.point(lambda n:255 if n>=180 else 0)
    # Ignore clipped fragments from adjacent generated atlas cells. Their alpha
    # may be solid, but they are not part of this cell's character silhouette.
    pixels=bytearray(mask.tobytes());largest=[]
    for index in range(w*h):
        if not pixels[index]:continue
        pixels[index]=0;queue=deque([index]);component=[]
        while queue:
            k=queue.popleft();component.append(k);x=k%w;y=k//w
            for neighbor in ([k-1] if x else [])+([k+1] if x<w-1 else [])+([k-w] if y else [])+([k+w] if y<h-1 else []):
                if pixels[neighbor]:pixels[neighbor]=0;queue.append(neighbor)
        if len(component)>len(largest):largest=component
    cleaned=bytearray(w*h)
    for k in largest:cleaned[k]=255
    mask=Image.frombytes('L',(w,h),bytes(cleaned))
    box=mask.getbbox()
    if not box: raise ValueError('Empty texture cell')
    return [x0,y0,w,h],mask,box
characters={}
for id in ['astra','claude','deepseek','gemini']:
    head,hd=descriptor(OUT/f'{id}-head.png');body,bd=descriptor(OUT/f'{id}-body.png')
    headframes=[]
    for n in range(16):
        crop,mask,box=cell(head,n%4,n//4,4,4);w,h=mask.size
        # Bottom of central chin/back-of-head, not long side hair.
        center=mask.crop((round(w*.43),0,round(w*.57),h)).getbbox()
        neck_y=center[3]-2 if center else box[3]-2
        # Same directional neck offsets as Haqi's original head alignment.
        offset=[0,-.02,-.04,-.06,-.08,-.06,-.04,-.02,0,.02,.04,.06,.08,.06,.04,.02][n]
        height=neck_y-box[1]
        # Tuck the neck into the head silhouette, beneath chin/back hair.
        headframes.append({'crop':crop,'neck':[w*(.5+offset),neck_y-height*.13],'height':height})
    hd.update(name=id,gender='female',directionCount=16,frames=headframes)
    frames=[]
    for row in range(4):
        for col in range(7):
            crop,mask,box=cell(body,col,row,7,4);w,h=mask.size
            # The visible short neck is the first solid run in the central band.
            top=mask.crop((round(w*.35),0,round(w*.65),round(h*.55))).getbbox()
            neck_y=top[1]+5 if top else box[1]+5
            # Find the center of the actual neck stub at its top, not the skirt.
            strip=mask.crop((round(w*.3),max(0,neck_y-3),round(w*.7),neck_y+1)).getbbox()
            neck_x=round(w*.3)+(strip[0]+strip[2])/2 if strip else w*.5
            frames.append({'crop':crop,'neck':[neck_x,neck_y],'headHeight':(box[3]-neck_y)*.9,'layoutBounds':crop,'footY':box[3]})
    # One fixed head height for all animation frames prevents scaling jitter.
    head_height=sorted(f['headHeight'] for f in frames)[len(frames)//2]
    for f in frames:f['headHeight']=round(head_height,3)
    idle=[frames[row*7+6] for row in range(4)]
    walk={**bd,'columns':7,'rows':4,'framesPerDirection':6,'fps':10,'directions':['down','left','right','up'],'frames':[frames[row*7+col] for row in range(4) for col in range(6)],'idleFrames':idle}
    base={**bd,'selfContained':True,'defaultHead':id,'frames':idle,'walk':walk}
    characters[id]={'directionCount':16,'bodies':{'female-walk':base},'heads':{id:hd}}
(OUT/'manifest.json').write_text(json.dumps({'version':1,'format':'HaqiCombatSim HeroRenderer','characters':characters},ensure_ascii=False,indent=2)+'\n')
print('Measured eight separate textures into Haqi-compatible manifest.json')
