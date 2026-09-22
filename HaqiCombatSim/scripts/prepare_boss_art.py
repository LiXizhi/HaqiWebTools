#!/usr/bin/env python3
"""Prepare source-faithful boss art jobs and optional original thumbnail previews.

--render-dir consumes 512px+ transparent PNG renders named by job ID. Render them
from the recorded model in an isolated Paracraft mini-scene, as in prepare_npc_art.py.
Outputs remain staging assets until uploaded, visually reviewed and CDN-verified.
No low-resolution thumbnail is upscaled or presented as a final combat portrait.
"""
import argparse
import hashlib
import io
import json
import urllib.request
import zipfile
import zlib
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
CACHE = APP / '.asset-cache/boss-art'
sha = lambda raw: hashlib.sha256(raw).hexdigest()


def prepare(previews=False, render_dir=None, archive=False):
    catalog_raw = (APP / 'data/adventure/monster-catalog.json').read_bytes()
    catalog = json.loads(catalog_raw)
    art_file = APP / 'data/adventure/boss-art.json'
    previous_art = json.loads(art_file.read_text()) if art_file.exists() else {'entries': {}}
    jobs = []
    for monster in catalog['monsters']:
        if monster['art']['status'] != 'original-model-required':
            continue
        jobs.append({'id': 'boss-' + '-'.join(monster['goalIds']), 'name': monster['name'],
                     'monsterId': monster['id'], 'model': monster['model'], 'source': monster['source'],
                     'sourceSha256': catalog['sources'][monster['source']],
                     'attributes': monster['attributes'], 'originalAssets': monster['originalAssets'],
                     'questIds': monster['mainStoryQuestIds'],
                     'render': {'width': 512, 'height': 512, 'transparent': True, 'method': 'original-model-mini-scene'},
                     'output': {'width': 256, 'height': 256, 'format': 'webp', 'byteLimitExclusive': 48000},
                     'status': 'awaiting-native-render'})
    for job in jobs:
        saved = previous_art['entries'].get(job['id'])
        if saved and saved.get('templateSha256') == job['sourceSha256'] and saved.get('model') == job['model']:
            local = APP / saved['local']
            if local.exists() and sha(local.read_bytes()) == saved['sha256']:
                job['status'] = 'cdn-verified' if saved.get('cdn') else 'prepared-local'
    plan = {'version': 1, 'monsterCatalogSha256': sha(catalog_raw), 'jobs': jobs}
    (APP / 'data/adventure/boss-art-plan.json').write_text(json.dumps(plan, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Prepared', len(jobs), 'original boss rendering jobs')
    if not previews and render_dir is None:
        return
    from PIL import Image
    CACHE.mkdir(parents=True, exist_ok=True)
    outputs = []
    for job in jobs:
        if render_dir is not None:
            path = render_dir / (job['id'] + '.png')
            if not path.exists():
                continue
            raw = path.read_bytes()
            image = Image.open(io.BytesIO(raw)).convert('RGBA')
            bounds = image.getbbox()
            if min(image.size) < 512 or not bounds or min(bounds[:2]) <= 2 or bounds[2] >= image.width-2 or bounds[3] >= image.height-2:
                raise ValueError('Empty, clipped or low-resolution native render: ' + job['id'])
            if image.getchannel('A').getextrema()[0] != 0:
                raise ValueError('Native render must have transparency: ' + job['id'])
            image = image.crop(bounds)
            if max(image.size) < 248:
                raise ValueError('Native subject is too small: ' + job['id'])
            image.thumbnail((248, 248), Image.Resampling.LANCZOS)
            canvas = Image.new('RGBA', (256, 256))
            canvas.alpha_composite(image, ((256-image.width)//2, (256-image.height)//2))
            image = canvas
            kind = 'native-render-staging'
        else:
            source = job['originalAssets'].get('thumbnail')
            if not source:
                continue
            path = CACHE / (source['md5'] + '.source')
            if not path.exists():
                request = urllib.request.urlopen('https://cdn.keepwork.com/update61/assetdownload/update/' + source['entry'], timeout=30)
                path.write_bytes(request.read())
            raw = path.read_bytes()
            if len(raw) != source['size'] or hashlib.md5(raw).hexdigest() != source['md5']:
                raise ValueError('Original thumbnail hash mismatch: ' + job['id'])
            decoded = raw
            if source['path'].endswith('.z'):
                if raw.startswith(b'PK'):
                    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
                        decoded = archive.read(archive.namelist()[0])
                else:
                    decoded = zlib.decompress(raw)
            image = Image.open(io.BytesIO(decoded)).convert('RGBA')
            kind = 'original-size-reference-only'
        for quality in [None, 95, 90, 85, 80, 75, 70]:
            buffer = io.BytesIO()
            image.save(buffer, format='WEBP', lossless=quality is None, quality=quality or 100, method=6, exact=True)
            encoded = buffer.getvalue()
            if len(encoded) < 48000:
                break
        else:
            raise ValueError('Boss image exceeds byte budget: ' + job['id'])
        output = CACHE / (job['id'] + '-' + kind + '.webp')
        output.write_bytes(encoded)
        outputs.append({'id': job['id'], 'name': job['name'], 'path': str(output.relative_to(APP)),
                        'status': kind, 'sourceSha256': sha(raw), 'sha256': sha(encoded),
                        'width': image.width, 'height': image.height, 'bytes': len(encoded)})
    (CACHE / ('renders.json' if render_dir else 'previews.json')).write_text(json.dumps(outputs, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print('Prepared', len(outputs), 'WebPs in staging; no runtime art replaced')
    if archive:
        if len(outputs) != len(jobs):
            raise ValueError('Archiving requires every planned boss render')
        entries = {}
        by_id = {job['id']: job for job in jobs}
        for output in outputs:
            job = by_id[output['id']]
            local = 'assets/adventure/bosses/' + output['sha256'] + '.webp'
            target = APP / local
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((APP / output['path']).read_bytes())
            old = previous_art['entries'].get(output['id'], {})
            entries[output['id']] = dict(name=job['name'], local=local,
                cdn=old.get('cdn') if old.get('sha256') == output['sha256'] else None,
                sha256=output['sha256'], size=output['bytes'], width=output['width'], height=output['height'],
                model=job['model'], monsterId=job['monsterId'], questIds=job['questIds'],
                source=job['source'], templateSha256=job['sourceSha256'], originalAssets=job['originalAssets'],
                renderSha256=output['sourceSha256'], method='original-model-mini-scene', renderSize=512)
        art_file.write_text(json.dumps({'version': 1, 'byteLimitExclusive': 48000, 'entries': entries}, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
        prepare()
        print('Archived', len(entries), 'boss portraits; CDN publication remains separate')


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--source-previews', action='store_true')
    p.add_argument('--render-dir', type=Path)
    p.add_argument('--archive', action='store_true', help='Archive the complete native-render batch into local WebP assets')
    args = p.parse_args()
    if args.archive and not args.render_dir:
        p.error('--archive requires --render-dir')
    if args.source_previews and args.render_dir:
        p.error('Select source previews or native renders, not both')
    prepare(args.source_previews, args.render_dir, args.archive)
