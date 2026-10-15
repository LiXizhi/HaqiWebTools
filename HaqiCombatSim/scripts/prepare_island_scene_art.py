"""Pack per-island scene art kits (ground textures, props, features) into <=200KB WebP atlases.

Usage: python scripts/prepare_island_scene_art.py <island> [<island> ...]
Sources: .cache/island-scene-art/<island>/{ground,props,features}.png (image_gen output).
Ground is a 2x2 grid of tileable squares, made seamless by a half-offset cross-fade.
Props/features are 3x2 sprite grids on real alpha, flat white, or flat magenta.
Writes assets/adventure/environment/<island>-{ground,props,features}-<hash>.webp and
the matching rows in data/adventure/environment-art.json (CDN kept only for equal hashes).
"""
import argparse, collections, hashlib, io, json, sys
from pathlib import Path
from PIL import Image, ImageFilter
sys.path.insert(0, str(Path(__file__).resolve().parent))
from prepare_environment_art import prepare, ROOT
from prepare_camp_scene_art import remove_white_background

KITS = {
    'fire': {'ground': ['volcanicRock', 'ashGround', 'basaltRoad', 'lavaFlow'],
             'props': ['obsidianRocks', 'lavaVent', 'emberBrazier', 'charredFence', 'bonePile', 'magmaCrystal'],
             'features': ['volcano', 'basaltCrag', 'lavaPool', 'basaltColumns', 'fireShrine', 'ashRockArch']},
    'ice': {'ground': ['snowField', 'frozenTundra', 'snowRoad', 'iceSheet'],
            'props': ['iceCrystals', 'snowman', 'snowBoulder', 'iceLantern', 'snowFence', 'frostBush'],
            'features': ['snowPeak', 'iceCrag', 'frozenPond', 'iceSpires', 'frozenShrine', 'glacierBoulders']},
    'desert': {'ground': ['sandDunes', 'hardpan', 'sandstoneRoad', 'oasisWater'],
               'props': ['sandstoneBoulder', 'obelisk', 'clayPots', 'animalSkull', 'shadeCanopy', 'dryShrub'],
               'features': ['mesa', 'sandstoneCrag', 'oasisPond', 'ruinedColumns', 'sphinxStatue', 'duneRocks']},
    'dark': {'ground': ['darkRock', 'marshMud', 'runeRoad', 'darkWater'],
             'props': ['violetCrystals', 'mossyGravestone', 'glowMushrooms', 'spiritLantern', 'deadStump', 'runeStone'],
             'features': ['darkPeak', 'shadowCrag', 'swampPool', 'ruinedArch', 'crystalSpire', 'brokenTower']},
    'town': {'ground': ['lushGrass', 'autumnGround', 'cobbleRoad', 'riverWater'],
             'props': ['flowerCart', 'streetLamp', 'stoneWell', 'hayBales', 'barrelStack', 'flowerHedge'],
             'features': ['snowyHill', 'goldenHill', 'flowerPond', 'stoneCircle', 'gazebo', 'fountain']},
}
CELLS = {'props': 272, 'features': 320}

def seamless(tile, overlap=.2):
    """Overlap cross-fade: the extra strip beyond each far edge is blended into
    the near edge, so wrapping is continuous and there is no centre seam."""
    def wrap(img, axis):
        w, h = img.size
        size = w if axis == 0 else h
        o = int(size * overlap); n = size - o
        ramp = Image.linear_gradient('L').rotate(90 if axis == 0 else 0, expand=True)
        if axis == 0:
            core = img.crop((0, 0, n, h))
            far = img.crop((n, 0, size, h)); near = img.crop((0, 0, o, h))
            mask = ramp.resize((o, h))
        else:
            core = img.crop((0, 0, w, n))
            far = img.crop((0, n, w, size)); near = img.crop((0, 0, w, o))
            mask = ramp.resize((w, o))
        core.paste(Image.composite(near, far, mask), (0, 0))
        return core
    return wrap(wrap(tile, 0), 1)

def pack_ground(src, names, kind, tile=384):
    image = Image.open(src).convert('RGB')
    cw, ch = image.width // 2, image.height // 2
    tiles = []
    for i in range(4):
        x, y = i % 2 * cw, i // 2 * ch
        inset = max(4, cw // 64)  # drop any thin seam between generated quadrants
        crop = image.crop((x + inset, y + inset, x + cw - inset, y + ch - inset))
        tiles.append(seamless(crop).resize((tile, tile), Image.Resampling.LANCZOS))
    for size in [tile, round(tile * .85), round(tile * .72)]:
        atlas = Image.new('RGB', (size * 2, size * 2))
        frames = {}
        for i, (name, t) in enumerate(zip(names, tiles)):
            t = t if size == tile else t.resize((size, size), Image.Resampling.LANCZOS)
            atlas.paste(t, (i % 2 * size, i // 2 * size))
            frames[name] = {'rect': [i % 2 * size, i // 2 * size, size, size], 'tile': True,
                            'sourceRect': [i % 2 * cw, i // 2 * ch, cw, ch]}
        for quality in [92, 88, 84, 80]:
            stream = io.BytesIO(); atlas.save(stream, 'WEBP', quality=quality, method=6)
            data = stream.getvalue()
            if len(data) <= 200000:
                digest = hashlib.sha256(data).hexdigest()
                local = f'assets/adventure/environment/{kind}-{digest[:12]}.webp'
                (ROOT / local).write_bytes(data)
                return {'local': local, 'cdn': '', 'width': atlas.width, 'height': atlas.height, 'size': len(data), 'sha256': digest,
                        'source': {'generator': 'image_gen', 'sha256': hashlib.sha256(Path(src).read_bytes()).hexdigest(),
                                   'width': image.width, 'height': image.height, 'seamless': 'half-offset cross-fade'},
                        'encoding': {'lossless': False, 'quality': quality}, 'frames': frames}
    raise ValueError('Ground atlas exceeds 200,000 bytes')

def remove_magenta(src, out):
    img = Image.open(src).convert('RGBA'); px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            key = min(r, b) - g  # magenta strength
            if key > 120 and r > 150 and b > 150:
                px[x, y] = (0, 0, 0, 0)
            elif key > 40 and r > 110 and b > 110:
                # Anti-aliased fringe: fade out and remove the magenta spill.
                alpha = max(0, min(255, int(255 * (120 - key) / 80)))
                px[x, y] = (r - key // 2, g, b - key // 2, alpha)
    out.parent.mkdir(parents=True, exist_ok=True); img.save(out); return out

def sprite_source(src, cache, cols, rows):
    img = Image.open(src)
    if img.mode == 'RGBA' and img.getchannel('A').getextrema()[0] == 0:
        return src
    rgb = img.convert('RGB')
    corners = [rgb.getpixel(p) for p in [(2, 2), (rgb.width - 3, 2), (2, rgb.height - 3), (rgb.width - 3, rgb.height - 3)]]
    if all(c[0] > 200 and c[2] > 200 and c[1] < 90 for c in corners):
        return remove_magenta(src, cache)
    return dehalo(remove_white_background(src, cache, cols, rows))

def dehalo(path, reach=3):
    """Drop pale, unsaturated fringe pixels within a few px of transparency (white matte residue)."""
    img = Image.open(path).convert('RGBA')
    near = img.getchannel('A').point(lambda a: 255 if a > 8 else 0).filter(ImageFilter.MinFilter(reach * 2 + 1))
    px, inner = img.load(), near.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a and not inner[x, y]:
                lum = (r * 299 + g * 587 + b * 114) // 1000
                if lum > 200 and max(r, g, b) - min(r, g, b) < 34:
                    px[x, y] = (0, 0, 0, 0)
    img.save(path); return path

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('islands', nargs='+', choices=sorted(KITS))
    args = parser.parse_args()
    manifest_path = ROOT / 'data/adventure/environment-art.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf8'))
    summary = {}
    for island in args.islands:
        base = ROOT / '.cache' / 'island-scene-art' / island
        for part, names in KITS[island].items():
            src = base / f'{part}.png'
            if not src.exists():
                print(f'skip {island}/{part}: missing {src}'); continue
            key = f'{island}{part.capitalize()}'
            kind = f'{island}-{part}'
            if part == 'ground':
                row = pack_ground(src, names, kind)
            else:
                clean = sprite_source(src, base / f'{part}-alpha.png', 3, 2)
                row = prepare(Path(clean), names, 3, CELLS[part], kind)
                row['source']['sha256'] = hashlib.sha256(src.read_bytes()).hexdigest()
            row['layer'] = 'terrain'
            row['source']['prompt'] = 'assets/adventure/environment/prompts.json#islandSceneArt.' + island
            row['source']['reference'] = 'data/adventure/world-map-art.json#' + island
            old = manifest['atlases'].get(key)
            if old and old.get('sha256') == row['sha256'] and old.get('cdn'):
                row['cdn'] = old['cdn']
            elif old and old.get('local') and old['local'] != row['local']:
                stale = ROOT / old['local']
                if stale.exists(): stale.unlink()
            manifest['atlases'][key] = row
            summary[key] = {k: row[k] for k in ('local', 'width', 'height', 'size')}
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(json.dumps(summary, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
