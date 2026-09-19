"""Import original upgradeable item metadata from the hash-matched export.
Usage: python scripts/import_strengthening_catalog.py path/to/kids/ruleset.json
"""
import json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];path=ROOT/'data/adventure/chapter.json'
c=json.loads(path.read_text(encoding='utf8'));r=json.loads(Path(sys.argv[1]).read_text(encoding='utf8'))
assert r['version']=='kids'
for source in ['Database/globalstore.db.mem','config/Aries/Others/globalstore.addonlevel.kids.xml']:
    assert r['manifest']['sources'][source]==c['sources'][source]
items={item['gsid']:item for item in r['items'].values()}
catalog={}
for group in c['upgradeGroups']:
    for id in group['gsids']:
        item=items[id]
        catalog[str(id)]={**item,'id':id,'kind':item['class'],'subtype':item['subclass']}
c['strengtheningCatalog']=catalog
path.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Exported',len(catalog),'original equipment definitions')
