"""Resize the approved elf logo; native packaging formats stay outside the H5 build."""
import argparse
import hashlib
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'art-references/magic-haqi-logo.json'
MASTER = ROOT / 'art-references/magic-haqi-logo-elf.webp'
BG = '#eeeaff'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, help='Approved imagegen PNG; archived losslessly as WebP')
    args = parser.parse_args()
    original_hash = None
    if args.source:
        original_hash = sha(args.source)
        MASTER.parent.mkdir(parents=True, exist_ok=True)
        Image.open(args.source).convert('RGBA').save(MASTER, lossless=True, method=6)
    source = Image.open(MASTER).convert('RGBA')
    assert source.getchannel('A').getextrema() == (0, 255), 'Transparent source required'
    logo = source.crop(source.getchannel('A').getbbox())
    previous = json.loads(MANIFEST.read_text(encoding='utf-8')) if MANIFEST.exists() else {}
    old = {r['local']: r for r in previous.get('files', [])}
    rows = []

    def canvas(size, fraction=0.9, background=None):
        art = logo.copy()
        art.thumbnail((round(size * fraction), round(size * fraction)), Image.Resampling.LANCZOS)
        out = Image.new('RGBA', (size, size), background or (0, 0, 0, 0))
        out.alpha_composite(art, ((size-art.width)//2, (size-art.height)//2))
        return out

    def save(im, relative, usage, upload=False, **options):
        path = ROOT / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        im.save(path, **options)
        if path.suffix == '.webp':
            if path.stat().st_size > 200000:
                for quality in (95, 90, 85, 80):
                    im.save(path, quality=quality, method=6)
                    if path.stat().st_size <= 200000:
                        break
            assert path.stat().st_size <= 200000
        row = dict(local=relative, width=im.width, height=im.height, bytes=path.stat().st_size,
                   sha256=sha(path), usage=usage, upload=upload)
        if old.get(relative, {}).get('sha256') == row['sha256']:
            for key in ('cdn', 'cors', 'verified'):
                if key in old[relative]:
                    row[key] = old[relative][key]
        rows.append(row)
        return im

    for size in (32, 48, 64, 128, 192, 256, 512, 1024):
        save(canvas(size), f'assets/branding/magic-haqi-elf-{size}.webp', '透明品牌标志', True, lossless=True, method=6)
    desktop = canvas(1024)
    save(desktop, 'shell/electron/icons/magic-haqi.png', '桌面窗口图标及高清PNG', True)
    save(desktop, 'shell/electron/icons/magic-haqi.ico', 'Windows与Steam快捷方式', True,
         sizes=[(n, n) for n in (16, 24, 32, 48, 64, 128, 256)])
    save(desktop, 'shell/electron/icons/magic-haqi.icns', 'macOS与Steam快捷方式', True)
    save(canvas(184, background=BG).convert('RGB'), 'shell/branding/steam-app-184.jpg', 'Steam社区应用图标', True, quality=95)
    save(canvas(512, background=BG).convert('RGB'), 'shell/branding/android-store-512.png', 'Android商店图标', True)

    # Fit all visible pixels inside Android's 66dp circular safe zone on 108dp layers.
    radius = max(math.hypot(x-logo.width/2, y-logo.height/2)
                 for y in range(logo.height) for x in range(logo.width)
                 if logo.getpixel((x, y))[3] > 0)
    fraction = max(logo.size) * 32 / radius / 108
    for density, size, fg_size in [('mdpi', 48, 108), ('hdpi', 72, 162),
                                 ('xhdpi', 96, 216), ('xxhdpi', 144, 324), ('xxxhdpi', 192, 432)]:
        folder = f'android/app/src/main/res/mipmap-{density}'
        save(canvas(size, .8, BG), folder+'/ic_launcher.png', 'Android传统图标')
        round_icon = canvas(size, fraction*108/72, BG)
        mask = Image.new('L', (size, size))
        ImageDraw.Draw(mask).ellipse((0, 0, size-1, size-1), fill=255)
        round_icon.putalpha(mask)
        save(round_icon, folder+'/ic_launcher_round.png', 'Android圆形图标')
        save(canvas(fg_size, fraction), folder+'/ic_launcher_foreground.png', 'Android自适应前景')

    manifest = dict(schemaVersion=1, source=dict(local=MASTER.relative_to(ROOT).as_posix(),
                    sha256=sha(MASTER), originalPngSha256=original_hash or previous.get('source', {}).get('originalPngSha256'),
                    width=source.width, height=source.height, generator='built-in imagegen',
                    prompt='保留已批准的紫色巫师帽、金色星星、蓝眼睛、棕色头发与笑脸；将可见圆耳改为尖精灵耳；透明背景、无文字。'),
                    androidBackground=BG, files=rows)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    # Contact sheet shows actual small sizes and simulated circular Android masking.
    preview = Image.new('RGB', (840, 420), BG)
    draw = ImageDraw.Draw(preview)
    for x, size in [(12, 32), (65, 48), (135, 64), (225, 128), (395, 184), (610, 192)]:
        im = canvas(size)
        preview.paste(im, (x, 35), im)
        draw.text((x, 15), str(size), fill='#241653')
    fg = canvas(324, fraction)
    adaptive = Image.new('RGBA', fg.size, BG)
    adaptive.alpha_composite(fg)
    adaptive = adaptive.crop((54, 54, 270, 270)).resize((144, 144), Image.Resampling.LANCZOS)
    mask = Image.new('L', (144, 144)); ImageDraw.Draw(mask).ellipse((0, 0, 143, 143), fill=255)
    preview.paste(adaptive, (40, 260), mask)
    draw.text((205, 315), 'Android adaptive / 66dp safe zone', fill='#241653')
    report = ROOT / '.asset-cache/brand-icons-preview.png'
    report.parent.mkdir(exist_ok=True); preview.save(report)
    print(f'Prepared {len(rows)} icons; manifest: {MANIFEST}')


if __name__ == '__main__':
    main()
