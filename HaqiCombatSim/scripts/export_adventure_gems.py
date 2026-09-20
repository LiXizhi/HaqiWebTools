"""Export original kids gems and socket materials, without inventing shop prices."""
import base64, hashlib, json
from pathlib import Path
from lib.lua_data import LuaData

root = Path(__file__).resolve().parents[1]
source = (root.parents[1] / 'Database/globalstore.db.mem').read_bytes()
key = b'Copyright@ParaEngine, LiXizhi\0'
raw = base64.b64decode(source)
rows = LuaData(bytes(b ^ key[i % len(key)] for i, b in enumerate(raw)).decode()).value()
items = {}
for row in rows:
    if not (26001 <= row[0] <= 26703 or row[0] == 17179):
        continue
    t = row[18]
    stats = {str(t[i]): t[i+1] for i in range(2,22,2) if t[i]}
    items[str(row[0])] = dict(id=row[0], name=t[0], description=t[1], stats=stats,
        slot=t[22], kind=t[23], subtype=t[24], maxCopiesInStack=t[37], sourceIcon=row[3])
out = dict(source='Database/globalstore.db.mem', sourceSha256=hashlib.sha256(source).hexdigest(), items=items)
(root/'data/adventure/gems.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(f'Exported {len(items)} original gem/material definitions')
