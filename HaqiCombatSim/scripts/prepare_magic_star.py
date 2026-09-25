"""Validate and encode a generated 4x4 magic-star sheet; preserve alpha and grid."""
import argparse
import hashlib
import io
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def prepare(source, idle=False, levels=False):
    image = Image.open(source).convert('RGBA')
    assert image.width == image.height, 'Expected square 4x4 sheet'
    assert image.getchannel('A').getextrema()[0] == 0, 'Expected genuine transparent alpha'
    # One uniform rescale preserves the frame centers, relative scale and motion.
    max_edge = 512 if levels else 768
    if image.width > max_edge:
        image = image.resize((max_edge, max_edge), Image.Resampling.LANCZOS)
    assert image.width % 4 == 0, 'Encoded dimensions must divide into four equal cells'
    master = image
    accepted = False
    for edge in ([512, 384, 320, 256] if levels else [image.width]):
        image = master if master.width == edge else master.resize((edge, edge), Image.Resampling.LANCZOS)
        for quality in [None, 95, 90, 85, 80, 75, 70]:
            stream = io.BytesIO()
            image.save(stream, format='WEBP', lossless=quality is None, quality=quality or 100, method=6, exact=True)
            encoded = stream.getvalue()
            if len(encoded) < (32000 if levels else 200001):
                accepted = True
                break
        if accepted:
            break
    if not accepted:
        raise ValueError('Sheet exceeds its byte budget; review before reducing it further')
    result = Image.open(io.BytesIO(encoded)).convert('RGBA')
    cell = result.width // 4
    bounds = []
    for i in range(16):
        alpha = result.crop((i % 4 * cell, i // 4 * cell, (i % 4 + 1) * cell, (i // 4 + 1) * cell)).getchannel('A')
        # Measure the visible body, excluding extremely faint generated bloom.
        # Keep the delivered alpha intact; do not key or erase the generated glow.
        box = alpha.point(lambda a: 255 if a >= 32 else 0).getbbox()
        margin = 0 if levels else 2
        assert box and min(box[:2]) > margin and max(box[2:]) < cell - margin, f'Frame {i} empty or touches boundary: {box}'
        bounds.append(box)
    filename = 'magic-star-blue-idle-16.webp' if idle else 'magic-star-blue-16.webp'
    if levels:
        filename = 'magic-star-vip-levels-16.webp'
    target = ROOT / 'assets/adventure/effects' / filename
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(encoded)
    metadata = {
        'version': 1, 'name': '蓝色魔法星正面软弹待机' if idle else '蓝色魔法星循环图集', 'local': target.relative_to(ROOT).as_posix(),
        'animation': 'front-facing-wiggle' if idle else 'turntable',
        'cdn': None, 'width': result.width, 'height': result.height, 'columns': 4, 'rows': 4,
        'frameCount': 16, 'frameWidth': cell, 'frameHeight': cell,
        'frameOrder': 'row-major', 'fps': 10, 'loopDurationMs': 1600, 'frameBounds': bounds, 'boundsAlphaThreshold': 32,
        'bytes': len(encoded), 'sha256': hashlib.sha256(encoded).hexdigest(),
        'encoding': 'lossless' if quality is None else f'quality-{quality}',
        'source': {'kind': 'imagegen-reinterpretation', 'generatedSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                   'originalModel': 'character/v5/11vip/MagicStar/MagicStar.x',
                   'originalTextureEntry': (ROOT / 'art-references/magic-star/source.txt').read_text().strip(),
                   'attachmentSource': 'script/apps/Aries/Pet/main.lua L1906-1915, L2027-2035: AddAttachment(asset, 4, 1)',
                   'note': '原版贴图参考的AI重绘，并非原模型动画直接导出；头顶绕行由预览单独驱动。'},
    }
    manifest = ROOT / 'art-references/magic-star' / ('atlas-idle.json' if idle else 'atlas.json')
    if levels:
        metadata.update(name='魔法星VIP 1–16级静态图集', animation='none',
                        levels=[{'level':i+1,'cell':i} for i in range(16)])
        metadata.pop('fps')
        metadata.pop('loopDurationMs')
        metadata['source']['note']='按用户要求创作的16级外观设计，不代表原版会员等级规则；每级固定一格，仅由代码摇摆和缩放。'
        manifest = ROOT / 'art-references/magic-star/atlas-vip-levels.json'
    manifest.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'path': str(target), 'bytes': len(encoded), 'size': result.size, 'encoding': metadata['encoding']}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('--idle', action='store_true')
    parser.add_argument('--levels', action='store_true')
    args = parser.parse_args()
    prepare(args.source, args.idle, args.levels)
