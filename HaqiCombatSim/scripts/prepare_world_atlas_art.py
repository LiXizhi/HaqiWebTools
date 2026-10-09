"""Pack generated transparent island/vortex images; preserve alpha and bounded WebP."""
import argparse
import hashlib
import json
import io
from PIL import Image
from pathlib import Path
from prepare_environment_art import prepare, ROOT

NAMES = ['camp', 'town', 'fire', 'ice', 'desert', 'dark']

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--islands', type=Path)
    parser.add_argument('--vortex', type=Path)
    parser.add_argument('--ocean', type=Path)
    parser.add_argument('--decor', type=Path)
    args = parser.parse_args()
    target = ROOT / 'data/adventure/world-map-art.json'
    manifest = json.loads(target.read_text(encoding='utf-8'))
    if args.ocean:
        original=Image.open(args.ocean).convert('RGB')
        result=None
        for edge in [1536,1280,1024,768,512]:
            image=original.copy();image.thumbnail((edge,edge),Image.Resampling.LANCZOS)
            for quality in [None,94,90,86,82]:
                stream=io.BytesIO();image.save(stream,'WEBP',lossless=quality is None,quality=quality or 100,method=6)
                data=stream.getvalue()
                if len(data)<=200000:
                    digest=hashlib.sha256(data).hexdigest();local=f'assets/adventure/environment/world-atlas-ocean-{digest[:12]}.webp'
                    (ROOT/local).write_bytes(data)
                    result={'local':local,'cdn':'','width':image.width,'height':image.height,'size':len(data),'sha256':digest,'encoding':{'lossless':quality is None,'quality':quality},'source':{'generator':'image_gen','sha256':hashlib.sha256(args.ocean.read_bytes()).hexdigest(),'width':original.width,'height':original.height,'prompt':'docs/world-map-art.md'}}
                    break
            if result:break
        if not result:raise ValueError('Ocean exceeds 200,000 bytes')
        previous=manifest['resources'].get('ocean',{})
        if previous.get('sha256')==result['sha256']:result['cdn']=previous.get('cdn','')
        manifest['resources']['ocean']=result
        manifest.pop('oceanLayer',None)
        manifest['oceanTile']={'size':512}
    for name, source, frames, columns, size in [
        ('islands', args.islands, NAMES, 3, 384),
        ('vortex', args.vortex, ['vortex'], 1, 128),
        ('seaDecor', args.decor, ['rock','reef','lowRock','gull','gulls','glidingGull'], 3, 160),
    ]:
        if not source:
            continue
        row = prepare(source, frames, columns, size, 'world-atlas-' + name)
        row['source']['prompt'] = 'docs/world-map-art.md'
        previous = manifest['resources'].get(name, {})
        if previous.get('sha256') == row['sha256']:
            row['cdn'] = previous.get('cdn', '')
        manifest['resources'][name] = row
        if name=='seaDecor':
            manifest['seaDecor']={'seed':20261006,'count':32,'frames':[{'id':key,'aspect':frame['rect'][3]/frame['rect'][2],'minWidth':28 if 'ull' in key else 32,'maxWidth':42 if 'ull' in key else 58} for key,frame in row['frames'].items()]}
        if name == 'islands':
            for island in manifest['islands']:
                if island.get('resource') == name and island['id'] in row['frames']:
                    island['rect'] = row['frames'][island['id']]['rect']
    target.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: {k: row[k] for k in ['local', 'size', 'width', 'height']} for key, row in manifest['resources'].items()}))
