"""Archive original kids strengthening textures; verify source bytes and published WebP.
Run once, upload assets/adventure/upgrade-ui/*.webp, then run --verify-cdn.
"""
import hashlib, io, json, sys, urllib.request
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
CHAPTER=ROOT/'data/adventure/chapter.json'
content=json.loads(CHAPTER.read_text(encoding='utf8'))
sources={line.rsplit(',',2)[0][:-2].lower():line for line in (ROOT.parents[1]/'assets_manifest.txt').read_text().splitlines()}
textures={
 'window':'texture/aries/common/themekid/window_bg_32bits.png',
 'title':'texture/aries/common/themekid/wnd_title.png',
 'close':'texture/aries/common/themekid/close_btn_32bits.png',
 'panel':'texture/aries/common/themekid/equip_exchange/bg_left_panel_32bits.png',
 'arrow':'texture/aries/common/themekid/equip_exchange/yellow_arrow_32bits.png',
 'slot':'texture/aries/desktop/combatcharacterframe/inventory/bg.png',
 'grid':'texture/aries/haqishop/bg4_32bits.png',
 'material':'texture/aries/haqishop/bg3_32bits.png',
 'tab':'texture/aries/haqishop/radiobg2_32bits.png',
 'selected':'texture/aries/haqishop/radiobg1_32bits.png',
 'button':'texture/aries/common/themekid/btn_thick_hl_32bits.png',
 'previous':'texture/aries/desktop/combatcharacterframe/common/arrow_left.png',
 'next':'texture/aries/desktop/combatcharacterframe/common/arrow_right.png',
 'pearl':'texture/aries/item/17487_bless_themagicpearl.png',
 'beans':'texture/aries/item/17213_godbean.png',
}
digest=lambda data:hashlib.sha256(data).hexdigest()
if '--verify-cdn' in sys.argv:
    for row in [*content['upgradeSkin'].values(),*content.get('strengtheningIcons',{}).values()]:
        # Exact prefix used by the repository uploader, checked against its output.
        url='https://cdn.keepwork.com/keepwork/haqi-adventure/upgrade-ui/'+Path(row['local']).name
        with urllib.request.urlopen(url,timeout=45) as response:
            assert response.headers.get('Access-Control-Allow-Origin')=='*'
            assert digest(response.read())==row['sha256']
        row['cdn']=url
else:
    out=ROOT/'assets/adventure/upgrade-ui';out.mkdir(parents=True,exist_ok=True)
    skin={}
    for key,path in textures.items():
        line=sources[path];original,md5,size=line.rsplit(',',2)
        url='https://cdn.keepwork.com/update61/assetdownload/update/'+line
        with urllib.request.urlopen(url,timeout=45) as response:raw=response.read()
        assert len(raw)==int(size) and hashlib.md5(raw).hexdigest()==md5
        im=Image.open(io.BytesIO(raw)).convert('RGBA')
        # Source MCML uses only these normal-state crops.
        crop={'close':(0,0,28,28),'arrow':(0,0,32,45),'slot':(0,0,90,90),'previous':(0,0,19,19),'next':(0,0,22,19)}.get(key)
        if crop:im=im.crop(crop)
        buf=io.BytesIO();im.save(buf,format='WEBP',lossless=True,exact=True,method=6);data=buf.getvalue()
        assert len(data)<=200000
        assert Image.open(io.BytesIO(data)).convert('RGBA').tobytes()==im.tobytes()
        name=f'{key}-{digest(data)[:12]}.webp';(out/name).write_bytes(data)
        skin[key]={'local':f'assets/adventure/upgrade-ui/{name}','cdn':None,'size':len(data),'width':im.width,'height':im.height,'sha256':digest(data),'sourceSha256':digest(raw),'sourceEntry':line,'sourceCrop':crop}
        print(key,len(data),im.size,flush=True)
    content['upgradeSkin']=skin
CHAPTER.write_text(json.dumps(content,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
