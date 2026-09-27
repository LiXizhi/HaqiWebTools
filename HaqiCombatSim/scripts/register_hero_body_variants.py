"""Register verified costume textures without changing any pose geometry."""
import hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'art-references/hero-body-variants.json'
source=json.loads(path.read_text(encoding='utf-8'))
variants=source['variants']
assert set(variants)==({f'{gender}{i}' for gender in ('male','female') for i in range(2,12)}|{'male-ref','female-ref'})
manifest=json.loads((ROOT/'data/hero-preview.json').read_text(encoding='utf-8'))
for row in variants.values():
    raw=(ROOT/row['local']).read_bytes()
    assert len(raw)==row['bytes']<=200000
    assert hashlib.sha256(raw).hexdigest()==row['sha256']
    assert row['cdn'].startswith('https://cdn.keepwork.com/')
    base=manifest['bodies'][row['baseBody']]
    assert (row['width'],row['height'])==(base['width'],base['height'])
manifest['bodyVariants']={key:{k:v for k,v in row.items() if k!='registration'} for key,row in variants.items()}
for name in ('data/hero-preview.json','data/adventure/hero-art.json'):
    (ROOT/name).write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
source['scope']='runtime-body-costumes'
path.write_text(json.dumps(source,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Registered',len(variants),'body textures; pose geometry unchanged')
