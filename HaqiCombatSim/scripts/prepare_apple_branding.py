"""Generate Apple catalog assets from the approved logo and splash masters."""
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / 'ios/App/App/Assets.xcassets'
rows = []


def save(im, path, usage):
    im.save(path, optimize=True)
    rows.append(dict(local=path.relative_to(ROOT).as_posix(), width=im.width,
        height=im.height, sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
        bytes=path.stat().st_size, usage=usage))


logo = Image.open(ROOT/'art-references/magic-haqi-logo-elf.webp').convert('RGBA')
logo = logo.crop(logo.getchannel('A').getbbox())
logo.thumbnail((900, 900), Image.Resampling.LANCZOS)
icon = Image.new('RGB', (1024, 1024), '#eeeaff')
icon.paste(logo, ((1024-logo.width)//2, (1024-logo.height)//2), logo)
save(icon, CATALOG/'AppIcon.appiconset/AppIcon-512@2x.png', 'iOS通用1024图标，无alpha')

# Size-class variants: portrait phones use the approved portrait composition;
# landscape phones use landscape; iPads use a centered square crop. AspectFit keeps
# the entire approved image visible even in iPad split-screen/window sizes.
sources = {name: Image.open(ROOT/f'art-references/magic-haqi-splash-{name}.webp').convert('RGB')
           for name in ('landscape', 'portrait')}
entries = []
for scale, filename in [('1x', 'splash-2732x2732-2.png'), ('2x', 'splash-2732x2732-1.png'),
                        ('3x', 'splash-2732x2732.png')]:
    # Keep existing filenames so the screenshot's placeholder assets are replaced.
    land = sources['landscape'].copy()
    square = ImageOps.fit(land, (min(land.size), min(land.size)), Image.Resampling.LANCZOS)
    save(square, CATALOG/'Splash.imageset'/filename, 'iOS默认及iPad方形启动图')
    entries.append(dict(idiom='universal', filename=filename, scale=scale))
    portrait_name = 'splash-portrait-'+scale+'.png'
    port = sources['portrait'].copy()
    port.thumbnail((2732, 2732), Image.Resampling.LANCZOS)
    save(port, CATALOG/'Splash.imageset'/portrait_name, 'iPhone竖屏启动图')
    entries.append(dict(idiom='universal', filename=portrait_name, scale=scale,
                        **{'width-class': 'compact', 'height-class': 'regular'}))
    landscape_name = 'splash-landscape-'+scale+'.png'
    save(land, CATALOG/'Splash.imageset'/landscape_name, 'iPhone横屏启动图')
    entries.append(dict(idiom='universal', filename=landscape_name, scale=scale,
                        **{'height-class': 'compact'}))
(CATALOG/'Splash.imageset/Contents.json').write_text(json.dumps(dict(images=entries,
    info=dict(version=1, author='xcode')), indent=2)+'\n', encoding='utf-8')

manifest = dict(schemaVersion=1, sources=['art-references/magic-haqi-logo.json',
    'art-references/magic-haqi-splash.json'], files=rows,
    macIcon='shell/electron/icons/magic-haqi.icns',
    launchContentMode='scaleAspectFit', launchBackground='#241c5d')
(ROOT/'art-references/magic-haqi-apple.json').write_text(json.dumps(manifest,
    ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

sheet = Image.new('RGB', (1100, 650), '#eeeaff')
draw = ImageDraw.Draw(sheet)
for x, label, size, orientation in [(10, 'iPhone portrait', (180, 390), 'portrait'),
    (210, 'iPhone landscape', (390, 180), 'landscape'),
    (620, 'iPad portrait', (240, 320), 'landscape')]:
    art = square if label.startswith('iPad') else sources[orientation]
    preview = ImageOps.pad(art, size, Image.Resampling.LANCZOS, color='#241c5d')
    sheet.paste(preview, (x, 30)); draw.text((x, 10), label, fill='#241653')
sheet.paste(icon.resize((180, 180), Image.Resampling.LANCZOS), (210, 260))
draw.text((210, 445), 'iOS app icon / opaque', fill='#241653')
mac = Image.open(ROOT/'shell/electron/icons/magic-haqi.png').convert('RGBA')
mac.thumbnail((180, 180), Image.Resampling.LANCZOS)
sheet.paste(mac, (415, 260), mac)
draw.text((415, 445), 'macOS app / Dock', fill='#241653')
preview_path = ROOT/'.asset-cache/apple-branding-preview.png'
preview_path.parent.mkdir(exist_ok=True); sheet.save(preview_path)
print('Prepared iOS icon, nine launch images, asset catalog and Apple branding manifest')
