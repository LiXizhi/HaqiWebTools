"""Upload reviewed urban atlas objects and verify their bytes and CORS."""
import argparse, hashlib, json, os, subprocess, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT/'art-references/urban-residents/assets.json'
parser = argparse.ArgumentParser()
parser.add_argument('--uploader', type=Path, required=True)
args = parser.parse_args()
manifest = json.loads(path.read_text(encoding='utf-8'))
rows = [*manifest['heads'].values(), *manifest['bodyVariants'].values()]
assert len(rows) == 40
pending = [row for row in rows if not row.get('cdn')]
if pending:
    assert args.uploader.is_file()
    digest = hashlib.sha256(''.join(row['sha256'] for row in pending).encode()).hexdigest()[:12]
    prefix = 'keepwork/haqi/urban-residents/20261003/'+digest+'/'
    result = subprocess.run([sys.executable, str(args.uploader), '--prefix', prefix,
                             *[str(ROOT/row['local']) for row in pending]],
                            capture_output=True, text=True, encoding='utf-8',
                            env=dict(os.environ, PYTHONIOENCODING='utf-8'))
    if result.returncode:
        raise RuntimeError('Existing CDN uploader failed; resource URLs were not changed')
    for row in pending:
        url = 'https://cdn.keepwork.com/'+prefix+Path(row['local']).name
        if url not in result.stdout:
            raise RuntimeError('Uploader did not confirm '+Path(row['local']).name)
        row['cdn'] = url
checks = []
for row in rows:
    request = urllib.request.Request(row['cdn'], headers={'Origin': 'http://127.0.0.1:8793'})
    with urllib.request.urlopen(request, timeout=45) as response:
        data = response.read()
        cors = response.headers.get('Access-Control-Allow-Origin')
    assert len(data) <= 200000
    assert hashlib.sha256(data).hexdigest() == row['sha256'], row['local']
    assert cors in ('*', 'http://127.0.0.1:8793'), (row['local'], cors)
    checks.append({'local': row['local'], 'cdn': row['cdn'], 'sha256': row['sha256'], 'bytes': len(data), 'cors': cors})
    print('Verified', row['id'])
path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
(ROOT/'.asset-cache/urban-residents/cdn-verification.json').write_text(json.dumps(checks, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print('Verified 40 CDN objects')
