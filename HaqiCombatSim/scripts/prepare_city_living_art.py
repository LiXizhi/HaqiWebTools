"""Pack inspected imagegen sheets into bounded atlases; retain existing street art.

python scripts/prepare_city_living_art.py --source-dir <generated images directory>
Atlas source specs are explicit; no background keying or inferred grid geometry.
"""
import argparse, hashlib, io, json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SPECS = [
    ('home-details', 'exec-35fda412-e63b-42fd-973e-52848bdeef46.png', 4, [0,512,1024],
     ['laundry-basket','courtyard-sink','reed-mat','hanging-fern','water-barrel','citrus-pot','porch-lamp','delivery-cooler']),
    ('details', 'exec-3f68ffe0-5566-4c68-8f21-4ebb848d3aca.png', 4, [0, 310, 650, 947, 1287],
     ['red-stools', 'newspaper-rack', 'delivery-boxes', 'wash-basin', 'mop-bucket', 'umbrella-holder', 'watering-can', 'wall-fan', 'broom-rack', 'shopping-bags', 'wall-hose', 'service-sign', 'paint-cans', 'mailbox', 'folded-cart', 'shoe-rack']),
    ('buildings', 'exec-6d9e85d7-d35f-468c-b487-f8724482c289.png', 4, [0, 458, 878, 1280],
     ['cream-balcony', 'brick-home', 'blue-walkup', 'stair-apartment', 'laundry-home', 'tank-apartment', 'peach-home', 'corner-home', 'green-shophouse', 'tile-home', 'white-walkup', 'brick-corner']),
    ('shops', 'exec-285f7cf4-cc6e-4176-8100-e3dbad01d2fb.png', 4, [0, 370, 710, 1086],
     ['breakfast', 'noodles', 'grocery', 'fruit', 'repair', 'tea', 'florist', 'restaurant', 'bakery', 'hardware', 'books', 'tailor']),
    ('connectors', 'exec-121c8cd5-e81f-4ca1-9f87-e3e783911e5f.png', 4, [0, 353, 700, 1086],
     ['courtyard-gate', 'garden-gate', 'service-gate', 'brick-wall', 'alley-roof', 'meter-wall', 'side-door', 'vine-fence', 'water-meters', 'store-shutter', 'fern-wall', 'alley-arch']),
    ('facilities', 'exec-4d45b875-b090-4391-994f-22da20e69c49.png', 5, [0, 365, 566, 850, 1122],
     ['wood-bench', 'stone-bench', 'green-lamp', 'gray-lamp', 'sorting-bin', 'manhole', 'drain', 'steps', 'fence', 'bollards', 'direction-sign', 'menu-board', 'notice-board', 'advert-board', 'bus-shelter', 'bike-rack', 'scooter', 'hydrant', 'utility-box', 'cones']),
    ('life', 'exec-fc1c0a16-c0d9-4d59-b393-b1462be63eee.png', 4, [0, 303, 566, 775, 1086],
     ['steamers', 'fruit-crates', 'vegetables', 'drink-crates', 'cafe-table', 'dining-table', 'handcart', 'baskets', 'aircon', 'laundry', 'awning', 'banner', 'door-canopy', 'shutter', 'shelf', 'wall-sign']),
    ('plants', 'exec-6a2e1e6b-2e9f-47dc-8ab3-33f0baf0b348.png', 4, [0, 478, 753, 1086],
     ['banyan-pit', 'shade-pit', 'palm-pit', 'bauhinia-pit', 'flowerbed', 'hedge', 'bougainvillea', 'home-pots', 'banana-planter', 'fern-pot', 'shrub-pot', 'grass-planter']),
    ('ground', 'exec-c337d133-cc18-493e-a8ce-ae258f7ccaa2.png', 4, [0, 512, 1024],
     ['asphalt', 'sidewalk', 'pavers', 'brick-paving', 'concrete', 'lawn', 'gravel', 'cobbles']),
]
HOME_DETAIL_CROPS = [(0,0,400,512),(400,0,820,512),(820,0,1090,512),(1090,0,1536,512),
                     (0,512,400,1024),(400,512,810,1024),(810,512,1090,1024),(1090,512,1536,1024)]
DETAIL_CROPS = [(0,0,305,309),(305,0,610,315),(610,0,916,310),(916,0,1222,310),
               (0,309,305,650),(305,315,610,650),(610,310,916,650),(916,310,1222,650),
               (0,650,305,949),(305,650,610,949),(610,650,916,943),(916,650,1222,950),
               (0,949,305,1287),(305,949,610,1287),(610,943,916,1287),(916,950,1222,1287)]
PLANT_CROPS = [(0,0,401,478),(402,0,740,478),(740,0,1057,478),(1058,0,1448,478),
               (0,506,397,717),(399,515,743,717),(745,478,1057,755),(1058,482,1448,753),
               (0,717,397,1086),(399,753,743,1086),(745,755,1057,1086),(1058,775,1448,1086)]
FACILITY_CROPS = {'wood-bench':(0,0,286,365),'stone-bench':(290,0,575,365),
                  'green-lamp':(640,0,800,365),'gray-lamp':(865,0,1095,365),'sorting-bin':(1100,0,1402,365),
                  'fence':(840,365,1100,566),'bollards':(1100,365,1402,566),
                  'bike-rack':(0,850,300,1122),'scooter':(310,850,560,1122),'hydrant':(580,850,810,1122),
                  'utility-box':(840,850,1070,1122),'cones':(1090,850,1402,1122),
                  'direction-sign':(0,566,280,850),'menu-board':(280,566,550,850),
                  'notice-board':(550,566,835,850),'advert-board':(835,566,1028,850),
                  'bus-shelter':(1028,566,1402,850)}

def digest(data):
    return hashlib.sha256(data).hexdigest()

def encode(image):
    for options in [{'lossless': True}] + [{'quality': q} for q in [94, 90, 86, 82, 78]]:
        output = io.BytesIO()
        image.save(output, 'WEBP', method=6, **options)
        if output.tell() <= 200000:
            return output.getvalue(), options
    raise ValueError('Atlas exceeds 200000 bytes; split instead of degrading further')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-dir', type=Path, required=True)
    parser.add_argument('--groups', nargs='+')
    args = parser.parse_args()
    manifest_path = ROOT / 'data/adventure/earth/street-art.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf8'))
    manifest.setdefault('atlases', {})
    records = []
    for group, filename, cols, cuts, names in SPECS:
        if args.groups and group not in args.groups:
            continue
        source = args.source_dir / filename
        original = Image.open(source).convert('RGBA')
        cells = []
        for index, name in enumerate(names):
            row, col = divmod(index, cols)
            box = (round(col * original.width / cols), cuts[row], round((col + 1) * original.width / cols), cuts[row + 1])
            if group == 'plants':
                box = PLANT_CROPS[index]
            if group == 'home-details':
                box = HOME_DETAIL_CROPS[index]
            if group == 'details':
                box = DETAIL_CROPS[index]
            if group == 'facilities' and name in FACILITY_CROPS:
                box = FACILITY_CROPS[name]
            cell = original.crop(box)
            # Inspectable per-cell alpha bounds preserve actual source proportions.
            # Imagegen stores near-transparent matte noise. It must not enlarge
            # the sprite's crop or distort narrow objects such as lamp posts.
            # This only selects bounds; source alpha pixels are kept unchanged.
            alpha_box = cell.getchannel('A').point(lambda value: 255 if value >= 16 else 0).getbbox()
            if group != 'ground':
                assert alpha_box, name
                cell = cell.crop(alpha_box)
            cell.thumbnail((376, 376) if group != 'ground' else (256, 256), Image.Resampling.LANCZOS)
            if group == 'ground':
                cell = cell.resize((256, 256), Image.Resampling.LANCZOS)
            cells.append((name, cell, box, alpha_box))
        for start in range(0, len(cells), 2):
            batch = cells[start:start + 2]
            edge = 384 if group != 'ground' else 264
            atlas = Image.new('RGBA', (edge * 2, edge))
            frame_rows = []
            for index, (name, cell, box, alpha_box) in enumerate(batch):
                x, y = (index % 2) * edge + 4, (index // 2) * edge + 4
                atlas.paste(cell, (x, y))
                frame_rows.append((name, cell, [x, y, cell.width, cell.height], box, alpha_box))
            data, options = encode(atlas)
            sha = digest(data)
            atlas_key = f'living-{group}-{start // 2}'
            local = f'assets/adventure/earth/streets/{atlas_key}-{sha[:12]}.webp'
            (ROOT / local).write_bytes(data)
            previous = manifest['atlases'].get(atlas_key, {})
            resource = {'id': f'city-street:{atlas_key}:{sha[:12]}', 'local': local, 'width': atlas.width, 'height': atlas.height,
                        'bytes': len(data), 'sha256': sha, 'sourceSha256': digest(source.read_bytes()), 'encoding': options,
                        'source': 'imagegen South China neighborhood illustration; frontal camera slightly elevated about 12 degrees, upper-left light; artistic, not surveyed', 'sourceFile': filename}
            if previous.get('sha256') == sha and previous.get('cdn'):
                resource['cdn'] = previous['cdn']
            manifest['atlases'][atlas_key] = resource
            for name, cell, crop, source_box, alpha_box in frame_rows:
                key = 'living:' + name
                entry = {'id': resource['id'], 'atlas': atlas_key, 'crop': crop, 'width': cell.width, 'height': cell.height,
                         'anchor': [0.5, 1], 'group': group, 'view': 'ground-plane' if group == 'ground' else 'front-slight-down', 'sourceCrop': source_box, 'sourceAlphaBounds': alpha_box}
                if group == 'shops':
                    entry['signSlots'] = [{'x': .5, 'y': .14, 'w': .73, 'h': .12, 'angle': 0, 'color': '#39463a'}]
                elif name in ['menu-board', 'notice-board', 'advert-board', 'direction-sign', 'banner', 'wall-sign', 'service-sign', 'mailbox']:
                    slot = {'menu-board': [.5, .44, .60, .49], 'notice-board': [.5, .49, .60, .35],
                            'advert-board': [.5, .4, .64, .46], 'direction-sign': [.68, .22, .43, .09],
                            'banner': [.5, .53, .72, .38], 'wall-sign': [.5, .53, .69, .44],
                            'service-sign': [.5, .26, .68, .26], 'mailbox': [.5, .37, .50, .12]}[name]
                    entry['signSlots'] = [{'x': slot[0], 'y': slot[1], 'w': slot[2], 'h': slot[3], 'angle': 0,
                                           'color': '#f5ecd8' if name in ['menu-board', 'banner'] else '#39463a'}]
                manifest['entries'][key] = entry
                records.append({'key': key, **entry})
    living_entries = {k: v for k, v in manifest['entries'].items() if k.startswith('living:')}
    manifest.setdefault('themes', {}).setdefault('south-china', {}).update({'name': '华南生活街区', 'kind': 'artistic', 'frames': list(living_entries), 'artRevision': 4 if 'living:laundry-basket' in living_entries else 3 if 'living:red-stools' in living_entries else 2, 'camera': {'view': 'front-slight-down', 'pitchDegrees': 12, 'facadeYawDegrees': 0, 'light': 'upper-left'}})
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    # Pure core defaults remain available when the art manifest cannot load.
    catalog = {key: {k: r[k] for k in ['width', 'height', 'group']} for key, r in living_entries.items()}
    (ROOT / 'js/adventure_city_living_art_core.js').write_text('// Generated by prepare_city_living_art.py; alpha-trimmed frame dimensions.\nexport const livingArtDimensions = ' + json.dumps(catalog, ensure_ascii=False, indent=2) + ';\n', encoding='utf8')
    print(json.dumps({'frames': len(records), 'atlases': len(manifest['atlases']), 'bytes': sum(a['bytes'] for a in manifest['atlases'].values())}))

if __name__ == '__main__':
    main()
