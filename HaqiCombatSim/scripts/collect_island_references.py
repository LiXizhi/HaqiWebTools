"""Archive original kids island maps for design, never loaded by the game."""
import hashlib
import io
import json
from pathlib import Path
import urllib.request
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    'town': ('哈奇岛', 'townmap/haqitownmap_bg.png.p'),
    'fire': ('火鸟岛', 'flamingphoenixisland/flamingphoenixisland_bg.png.p'),
    'ice': ('寒冰岛', 'frostroarisland/loginisland_frostroarisland_bg_32bits.png.p'),
    'desert': ('沙漠岛', 'ancientegyptisland/loginisland_ancientegyptisland_bg_32bits.png.p'),
    'dark': ('幽暗岛', 'darkforestisland/loginisland_darkforestisland_bg.png.p'),
}

def main():
    entries = {line.rsplit(',', 2)[0]: line for line in
               (ROOT.parents[1] / 'assets_manifest.txt').read_text().splitlines()}
    folder = ROOT / 'assets/adventure/island-references'
    folder.mkdir(parents=True, exist_ok=True)
    rows = []
    for key, (name, suffix) in SOURCES.items():
        entry = entries['texture/aries/worldmaps/' + suffix]
        path, md5, size = entry.rsplit(',', 2)
        url = 'https://cdn.keepwork.com/update61/assetdownload/update/' + entry
        with urllib.request.urlopen(url, timeout=40) as response:
            raw = response.read()
        assert len(raw) == int(size) and hashlib.md5(raw).hexdigest() == md5, key
        picture = Image.open(io.BytesIO(raw)).convert('RGB')
        output = io.BytesIO()
        picture.save(output, format='WEBP', lossless=True, method=6)
        lossless_bytes = len(output.getvalue())
        if lossless_bytes > 200_000:
            output = io.BytesIO()
            picture.save(output, format='WEBP', quality=88, method=6)
        data = output.getvalue()
        assert len(data) <= 200_000, key
        local = f'assets/adventure/island-references/{key}.webp'
        (ROOT / local).write_bytes(data)
        rows.append(dict(id=key, name=name, sourceEntry=entry, sourceUrl=url,
                         sourceMd5=md5, sourceSha256=hashlib.sha256(raw).hexdigest(),
                         local=local, width=picture.width, height=picture.height,
                         size=len(data), sha256=hashlib.sha256(data).hexdigest(),
                         losslessAttemptBytes=lossless_bytes))
        print(key, picture.size, len(data), flush=True)
    (folder / 'sources.json').write_text(json.dumps(dict(version=1, usage='design-reference-only',
        maps=rows), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

if __name__ == '__main__':
    main()
