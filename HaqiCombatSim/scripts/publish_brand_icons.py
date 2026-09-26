"""Publish only prepared branding files, then verify remote bytes and CORS."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--uploader', type=Path)
parser.add_argument('--verify', action='store_true')
parser.add_argument('--kind', choices=('logo', 'splash'), default='logo')
args = parser.parse_args()
path = ROOT / f'art-references/magic-haqi-{args.kind}.json'
manifest = json.loads(path.read_text(encoding='utf-8'))
rows = [row for row in manifest['files'] if row['upload']]
for row in rows:
    assert hashlib.sha256((ROOT/row['local']).read_bytes()).hexdigest() == row['sha256']
if not args.verify:
    assert args.uploader and args.uploader.is_file(), 'Specify the existing Keepwork uploader'
    pending = [row for row in rows if not row.get('verified')]
    digest = hashlib.sha256(''.join(row['sha256'] for row in rows).encode()).hexdigest()[:12]
    version = 'elf-v1' if args.kind == 'logo' else 'splash-v1'
    prefix = f'keepwork/haqi/branding/{version}-{digest}/'
    if pending:
        result = subprocess.run([sys.executable, str(args.uploader), '--prefix', prefix,
                                 *[str(ROOT/row['local']) for row in pending]],
                                capture_output=True, text=True, encoding='utf-8',
                                env=dict(os.environ, PYTHONIOENCODING='utf-8'))
        if result.returncode:
            raise RuntimeError('CDN uploader failed; manifest unchanged')
        for row in pending:
            url = 'https://cdn.keepwork.com/'+prefix+Path(row['local']).name
            if url not in result.stdout:
                raise RuntimeError('Upload not confirmed: '+row['local'])
            row['cdn'] = url
for row in rows:
    request = urllib.request.Request(row['cdn'], headers={'Origin': 'http://127.0.0.1:8792'})
    with urllib.request.urlopen(request, timeout=45) as response:
        body = response.read()
        cors = response.headers.get('Access-Control-Allow-Origin')
    assert hashlib.sha256(body).hexdigest() == row['sha256'], row['local']
    assert cors in ('*', 'http://127.0.0.1:8792'), (row['local'], cors)
    row.update(verified=True, cors=cors)
    print(row['cdn'], flush=True)
path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(f'Verified {len(rows)} CDN files: SHA-256 and CORS')
