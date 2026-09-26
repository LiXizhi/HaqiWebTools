"""Prepare approved splash art for Android, preserving aspect ratio with center crops."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'art-references/magic-haqi-splash.json'
SIZES = {'mdpi': (480, 320), 'hdpi': (800, 480), 'xhdpi': (1280, 720),
         'xxhdpi': (1600, 960), 'xxxhdpi': (1920, 1280)}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--landscape', type=Path)
    parser.add_argument('--portrait', type=Path)
    args = parser.parse_args()
    previous = json.loads(MANIFEST.read_text(encoding='utf-8')) if MANIFEST.exists() else {}
    old = {row['local']: row for row in previous.get('files', [])}
    sources, images, rows = {}, {}, []
    for orientation in ('landscape', 'portrait'):
        path = ROOT / f'art-references/magic-haqi-splash-{orientation}.webp'
        supplied = getattr(args, orientation)
        if supplied:
            Image.open(supplied).convert('RGB').save(path, lossless=True, method=6)
        im = Image.open(path).convert('RGB')
        sources[orientation] = dict(local=path.relative_to(ROOT).as_posix(), sha256=sha(path),
            originalPngSha256=sha(supplied) if supplied else previous['sources'][orientation]['originalPngSha256'],
            width=im.width, height=im.height, generator='built-in imagegen',
            prompt='已批准的无文字启动画面：精灵主角巫师帽标志、紫色暮空、魔法浮岛学院、瀑布、水晶、草地小径与魔法卡牌。')
        images[orientation] = im

    def output(im, relative, orientation, upload=False):
        path = ROOT / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.suffix == '.webp':
            im.save(path, lossless=True, method=6)
            for quality in (95, 90, 85, 80, 75, 70, 65):
                if path.stat().st_size <= 200000:
                    break
                im.save(path, quality=quality, method=6)
            assert path.stat().st_size <= 200000, relative
        else:
            im.save(path, optimize=True)
        row = dict(local=relative, width=im.width, height=im.height,
                   bytes=path.stat().st_size, sha256=sha(path), orientation=orientation, upload=upload)
        if old.get(relative, {}).get('sha256') == row['sha256']:
            for key in ('cdn', 'cors', 'verified'):
                if key in old[relative]: row[key] = old[relative][key]
        rows.append(row)

    for orientation, im in images.items():
        output(im, f'assets/branding/magic-haqi-splash-{orientation}.webp', orientation, True)
        for density, landscape in SIZES.items():
            size = landscape if orientation == 'landscape' else landscape[::-1]
            name = 'land' if orientation == 'landscape' else 'port'
            output(ImageOps.fit(im, size, Image.Resampling.LANCZOS),
                   f'android/app/src/main/res/drawable-{name}-{density}/splash.png', orientation)
    output(ImageOps.fit(images['landscape'], (480, 320), Image.Resampling.LANCZOS),
           'android/app/src/main/res/drawable/splash.png', 'landscape')
    MANIFEST.write_text(json.dumps(dict(schemaVersion=1, sources=sources,
        resize='center crop, preserve aspect ratio', files=rows), ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    sheet = Image.new('RGB', (1100, 740), '#eeeaff')
    draw = ImageDraw.Draw(sheet)
    for i, (density, size) in enumerate(SIZES.items()):
        x = i*220
        draw.text((x+8, 8), density, fill='#241653')
        for y, orientation, target in [(32, 'landscape', size), (220, 'portrait', size[::-1])]:
            im = ImageOps.fit(images[orientation], target, Image.Resampling.LANCZOS)
            im.thumbnail((210, 420), Image.Resampling.LANCZOS)
            sheet.paste(im, (x+5, y))
    preview = ROOT / '.asset-cache/brand-splash-preview.png'
    preview.parent.mkdir(exist_ok=True); sheet.save(preview)
    print(f'Prepared {len(rows)} assets: 11 Android PNGs and 2 CDN WebPs')


if __name__ == '__main__':
    main()
