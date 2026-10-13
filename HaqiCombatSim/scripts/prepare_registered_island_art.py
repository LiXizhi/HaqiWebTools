"""Prepare coordinate-registered imagegen references and pack full-canvas WebP art.

References are diagrams from authoritative map JSON, not replacement artwork.
Packing writes a staging manifest; CDN verification precedes runtime installation.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.cache/registered-islands'
THEMES = {
    'camp': 'Welcoming magical training camp, blue canvas tents, a modest blue-roof academy, small central crystal fountain, pine trees, warm grassy clearings. Original style reference is TOP LEFT island.',
    'town': 'Lively green fantasy town with blue-roof miniature castle houses in the southeast town district, northern snowy overlook, western forest, eastern golden valley and seaside, southwest fields, southern lake and beach. Keep the castle modest, not covering the roads. Original style reference is TOP MIDDLE island.',
    'fire': 'Fiery volcanic island, charcoal and russet rock, glowing lava, small dramatic crater beside the northeastern ring road, gold tree at north, southwest landing dock. Clearly walkable tan-grey stone paths contrast lava. Original style reference is TOP RIGHT island.',
    'ice': 'Snow and ice island, blue glacial cliffs, snowy pine grove in west, northern snow ridge and northeast blue peaks, south landing dock, frozen river and lake. Readable blue-grey packed snow paths. Original style reference is BOTTOM LEFT island.',
    'desert': 'Golden desert island, palms at southern oasis and tiny northern pool, weathered western pyramid ruins, modest northeastern gold-domed temple on a rocky plateau, sandstone canyon, sandy paths. Original style reference is BOTTOM MIDDLE island.',
    'dark': 'Mysterious purple woodland island, violet crystal accents, twisted trees and dark cliffs, northwest red forbidden crater, north forest and east ruined lookout. Moody but friendly fantasy, readable pale lavender paths. Original style reference is BOTTOM RIGHT island.',
    'tide': 'Moon-tide coastal village, teal-blue roofs, small warm golden lanterns, two lighthouses at the marked tower footprints, turquoise stream, letter street and wooden docks. A small moon pavilion by northwest road. Original style reference is LEFT island.',
    'float': 'Verdant terraced fantasy island, ivory and blue-roof buildings, brass astronomy instruments on the marked towers, tiny market, waterfall scenery beside the actual stream, courtyard, two-name well near southwest landmark. Low terracing only: do not break connected terrain into separate floating islands. Original style reference is MIDDLE island.',
    'sail': 'Wind and sail island, white canvas sails, cream stone architecture, blue and gold accents, small windmills along east road, communal square and sail-shaped tower at marked footprints, south dock. Original style reference is RIGHT island.',
}

def read(path):
    return json.loads(path.read_text(encoding='utf8'))

def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf8')

def references():
    atlas = read(ROOT/'data/adventure/world-map-art.json')
    CACHE.mkdir(parents=True, exist_ok=True)
    result=[]
    for island in atlas['islands']:
        key=island['id']
        if key not in THEMES:
            continue
        m=read(ROOT/f'data/adventure/maps/{key}.json')
        p=lambda x,y:(round(x/m['w']*1024),round(y/m['h']*1024))
        im=Image.new('RGB',(1024,1024),'#dceefa'); d=ImageDraw.Draw(im)
        d.polygon([p(*xy) for xy in m['coast']],fill='#9bb87a',outline='#d8c393',width=4)
        for r in m.get('rivers',[]):
            d.line([p(*xy) for xy in r['points']],fill='#e47238' if r.get('material')=='lava' else '#73c6ce',width=max(6,round(r['width']/m['w']*1024)))
        for lake in m.get('lakes',[]):
            x,y=p(lake['x'],lake['y']);rx=lake['rx']/m['w']*1024;ry=lake['ry']/m['h']*1024
            d.ellipse((x-rx,y-ry,x+rx,y+ry),fill='#e47238' if lake.get('material')=='lava' else '#73c6ce')
        for r in m['paths']:
            d.line([p(r['a']['x'],r['a']['y']),p(r['b']['x'],r['b']['y'])],fill='#fff0ca',width=max(5,round(r['width']/m['w']*1024)))
        for b in m.get('bridges',[]):
            if b.get('polygon'):d.polygon([p(v['x'],v['y']) for v in b['polygon']],fill='#bc915e')
        font=ImageFont.load_default(size=14)
        for b in m.get('buildings',[]):
            x,y=p(b['x'],b['y']);w=max(14,b['w']/m['w']*1024);h=max(14,b['h']/m['h']*1024)
            d.rectangle((x-w/2,y-h/2,x+w/2,y+h/2),fill='#886145')
            d.text((x-w/2,y-h/2-15),b.get('frame','building'),font=font,fill='#283d33')
        for mark in m['landmarks']:
            x,y=p(mark['x'],mark['y']);d.ellipse((x-5,y-5,x+5,y+5),fill='#fff8ec',outline='#264637',width=2)
        for xy in m.get('npcPositions',{}).values():
            x,y=p(*xy);d.ellipse((x-4,y-4,x+4,y+4),fill='#c337ca')
        ref=CACHE/f'{key}-layout.png';im.save(ref)
        building_points=[{'kind':b.get('frame','building'),'xPercent':round(b['x']/m['w']*100,1),'yPercent':round(b['y']/m['h']*100,1)} for b in m.get('buildings',[])]
        landmarks=[{'name':v['name'],'xPercent':round(v['x']/m['w']*100,1),'yPercent':round(v['y']/m['h']*100,1)} for v in m['landmarks']]
        # Keep original source atlases as style references even after installation.
        style='assets/adventure/environment/'+('world-atlas-islands-7ea6b95c97f7.webp' if key in ['camp','town','fire','ice','desert','dark'] else 'world-atlas-continuation-4e93b584fc9a.webp')
        prompt=(f'Create ONE replacement island map for {island["name"]}. Input 1 is the STRICT coordinate layout. Input 2 is an architectural and painted style reference ONLY. '+THEMES[key]+
            ' Output one square transparent RGBA island map, full canvas registration with input 1. Do not crop, recenter, rotate or enlarge its coastline. Preserve exactly the positions and topology of every cream road, junction, bridge, river and lake. Smooth paths slightly but keep their centerlines and clear ground; never cover paths with trees or buildings. Low relief almost top-down view, lush detailed hand-painted children\'s fantasy game illustration like input 2; soften flat green areas into biome-specific scenery and coast into natural rocks/beach without moving it. Brown rectangles are building footprint guides; keep structures modest at these coordinates. White circles and violet dots are empty walkable ground for game labels/NPCs, remove the dots and text but keep their exact locations clear. No characters, text, letters, numbers, UI, pins, circles, grid or watermark. Transparent sea outside a very narrow turquoise coastal fringe. NOT an image of the full reference sheet. Prioritize road geometry over decorative composition. Building coordinates (percent of full canvas): '+json.dumps(building_points,ensure_ascii=False)+'. Location context (do not draw text): '+json.dumps(landmarks,ensure_ascii=False)+'.')
        result.append({'id':key,'name':island['name'],'references':[str(ref),str(ROOT/style)],'prompt':prompt})
    write(CACHE/'generation-plan.json',result)
    print(json.dumps([{'id':r['id'],'references':r['references']} for r in result]))

def pack(key,source):
    image=Image.open(source).convert('RGBA')
    alpha_min,alpha_max=image.getchannel('A').getextrema()
    assert alpha_min==0 and alpha_max>=240,'Real transparency and a substantially opaque subject required'
    for edge in [896,832,768,704,640]:
        out=image.resize((edge,edge),Image.Resampling.LANCZOS)
        for quality in [None,94,90,86,82,78]:
            stream=io.BytesIO();out.save(stream,'WEBP',lossless=quality is None,quality=75 if quality is None else quality,method=1)
            raw=stream.getvalue()
            if len(raw)<=200000:break
        if len(raw)<=200000:break
    assert len(raw)<=200000
    sha=hashlib.sha256(raw).hexdigest();local=f'assets/adventure/environment/world-atlas-{key}-layout-{sha[:12]}.webp'
    (ROOT/local).write_bytes(raw)
    row={'local':local,'cdn':'','width':edge,'height':edge,'size':len(raw),'sha256':sha,'encoding':{'lossless':quality is None,'quality':quality},
         'source':{'generator':'image_gen','sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'width':image.width,'height':image.height,'layout':f'data/adventure/maps/{key}.json','layoutSha256':hashlib.sha256((ROOT/f'data/adventure/maps/{key}.json').read_bytes()).hexdigest(),'prompt':f'data/adventure/island-map-repaint-prompts.json#{key}'},
         'frames':{key:{'rect':[0,0,edge,edge],'sourceRect':[0,0,image.width,image.height]}}}
    write(CACHE/f'{key}-resource.json',row)
    print(json.dumps(row))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--references',action='store_true');parser.add_argument('--id',choices=list(THEMES));parser.add_argument('--source',type=Path);args=parser.parse_args()
    if args.references:references()
    elif args.id and args.source:pack(args.id,args.source)
    else:parser.error('Use --references, or --id ID --source PNG')
