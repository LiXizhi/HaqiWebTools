"""Render the CC0 Commons/Natural Earth SVG as a pixel political atlas.

The source uses geographic M/L/Z polygons, not a curved map projection.
Keep the existing overview bounds and source aspect ratio (512:211).
"""
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/adventure/earth/source/BlankMap-Equirectangular.svg'
WIDTH, HEIGHT = 2048, 844
BOUNDS = dict(west=-180, east=180, south=-60, north=85)
COLORS = ['#edcf91', '#c6dca0', '#eab1a3', '#b8cfe3', '#d4b8dd', '#a6d6c3', '#eadca8']
OCEAN, BORDER = '#75b6cf', '#647078'


def prepare():
    root = ET.parse(SOURCE).getroot()
    countries = defaultdict(list)
    vertices = defaultdict(set)
    for group in root.findall('.//{*}g[@class]'):
        classes = group.get('class').split()
        if 'country' not in classes:
            continue
        code = next(c for c in classes if c != 'country')
        for path in group.findall('.//{*}path'):
            data = path.get('d')
            assert set(re.findall('[A-Za-z]', data)) <= {'M', 'L', 'Z'}
            polygons = []
            for segment in re.findall(r'M([^M]+)', data):
                numbers = list(map(float, re.findall(r'-?\d+(?:\.\d+)?', segment)))
                points = list(zip(numbers[::2], numbers[1::2]))
                assert len(points) >= 3
                polygons.append(points)
                for point in points:
                    vertices[point].add(code)
            countries[code].append(polygons)
    neighbors = {code: set() for code in countries}
    for shared in vertices.values():
        for code in shared:
            neighbors[code].update(shared - {code})
    coloring = {}
    for code in sorted(countries, key=lambda c: (-len(neighbors[c]), c)):
        used = {coloring[c] for c in neighbors[code] if c in coloring}
        coloring[code] = next(i for i in range(len(COLORS)) if i not in used)
    image = Image.new('RGB', (WIDTH, HEIGHT), OCEAN)
    outlines = []
    for code, paths in countries.items():
        mask = Image.new('1', image.size)
        for polygons in paths:
            path_mask = Image.new('1', image.size)
            for points in polygons:
                pixels = [((lon + 180) / 360 * WIDTH, (85 - lat) / 145 * HEIGHT) for lon, lat in points]
                part = Image.new('1', image.size)
                ImageDraw.Draw(part).polygon(pixels, fill=1)
                path_mask = ImageChops.logical_xor(path_mask, part)  # SVG evenodd within each path.
                outlines.append(pixels)
            mask = ImageChops.logical_or(mask, path_mask)
        image.paste(COLORS[coloring[code]], mask=mask)
    draw = ImageDraw.Draw(image)
    for points in outlines:
        draw.line(points + points[:1], fill=BORDER, width=1)
    target = ROOT / '.asset-cache/earth-political.webp'
    target.parent.mkdir(exist_ok=True)
    image.save(target, 'WEBP', lossless=True, method=6)
    size = target.stat().st_size
    assert size <= 500_000, size
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    local = f'assets/adventure/earth/world-political-{digest[:12]}.webp'
    (ROOT / local).write_bytes(target.read_bytes())
    manifest = dict(local=local, width=WIDTH, height=HEIGHT, bytes=size, sha256=digest,
                    bounds=BOUNDS, projection='equirectangular', style='political',
                    maxBytes=500000, ocean=OCEAN,
                    source=dict(page='https://commons.wikimedia.org/wiki/File:BlankMap-Equirectangular.svg',
                                url='https://upload.wikimedia.org/wikipedia/commons/5/51/BlankMap-Equirectangular.svg',
                                local=str(SOURCE.relative_to(ROOT)).replace('\\', '/'),
                                sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
                                license='CC0-1.0', author='Natural Earth; Bjørn Sandvik',
                                modifications='Country colors, one-pixel borders, crop to original overview bounds; no geometry changes'))
    (ROOT / '.asset-cache/earth-political.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(dict(local=local, width=WIDTH, height=HEIGHT, bytes=size, countries=len(countries))))


if __name__ == '__main__':
    prepare()
