"""Read original item tables, preserving distinct appearances and every original GSID."""
import base64, hashlib, json, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
APP = HERE.parents[1]
ROOT = APP.parents[1]
sys.path.insert(0, str(APP / 'scripts'))
from lib.lua_data import LuaData

def export():
    source = ROOT / 'Database/globalstore.db.mem'
    raw = source.read_bytes(); data = base64.b64decode(raw); key = b'Copyright@ParaEngine, LiXizhi\0'
    rows = LuaData(bytes(b ^ key[i % len(key)] for i,b in enumerate(data)).decode()).value()
    items = []
    for row in rows:
        t = row[18]
        if (t[23:25] == [10,1]) or (t[23:25] == [2,6]) or t[22] == 33:
            items.append(dict(id=row[0], name=t[0], slot=t[22], kind=t[23], subtype=t[24],
                assetKey=row[12], model=row[13].strip().replace('\\','/'), icon=row[3],
                stats={str(t[i]):t[i+1] for i in range(2,22,2) if t[i]}))
    groups = {}
    for item in sorted(items,key=lambda x:x['id']):
        if item['kind'] != 2 or item['subtype'] != 6: continue
        model = item['model']
        groups.setdefault(model.lower(),dict(id='original-'+str(item['id']),name=item['name'],model=model,items=[]))['items'].append(item['id'])
    jobs=list(groups.values())
    jobs.append(dict(id='original-10001',name='抱抱龙',model='character/v3/PurpleDragonMajor/Female/PurpleDragonMajorFemale.xml',items=[10001]))
    for job in jobs:
        job['markers']=[i['id'] for i in items if i['slot']==33 and i['model'].lower()==job['model'].lower()]
        p=job['model'].lower()
        job['kind']='wings' if any(s in p for s in ['chibang','jinglingyuyi']) else 'platform' if 'carpet' in p else 'vehicle' if any(s in p for s in ['vehicles','nanguache','xuediche','shuangren']) else 'broom' if 'besom' in p else 'animal'
        job['sourceVersion']='kids'
    manifest={}
    for line in (ROOT/'assets_manifest.txt').read_text().splitlines():
        p,md5,size=line.rsplit(',',2)
        if not size.isdigit():continue
        if p[:-2].lower() not in manifest or p.endswith('.p'):manifest[p[:-2].lower()]=dict(entry=line,md5=md5,bytes=int(size))
    for j in jobs:j['originalAsset']=manifest.get(j['model'].lower())
    result=dict(version=1,scope='Original local kids globalstore snapshot; aliases retained; unavailable teen store is not inferred.',
        sources={'Database/globalstore.db.mem':hashlib.sha256(raw).hexdigest(),'assets_manifest.txt':hashlib.sha256((ROOT/'assets_manifest.txt').read_bytes()).hexdigest()},
        items=items,jobs=jobs)
    (HERE/'original-catalog.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Original mount appearances:',len(jobs),'items:',len(items))

if __name__=='__main__':export()
