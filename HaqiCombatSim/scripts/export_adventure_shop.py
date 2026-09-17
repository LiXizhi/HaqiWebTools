"""Export kids equipment candidates without modifying the original chapter."""
import base64,json,sys,hashlib
from pathlib import Path
from lib.lua_data import LuaData
root=Path(__file__).resolve().parents[3]
source=(root/'Database/globalstore.db.mem').read_bytes()
raw=base64.b64decode(source)
source_hash=hashlib.sha256(source).hexdigest()
key=b'Copyright@ParaEngine, LiXizhi\0'
rows=LuaData(bytes(b^key[i%len(key)] for i,b in enumerate(raw)).decode()).value()
items={}
for row in rows:
 t=row[18]; stats={str(t[i]):t[i+1] for i in range(2,22,2) if t[i]}
 if (t[23]==1 or t[22]==24) and t[22]>0 and 0<=float(stats.get('138',0))<=50:
  items[str(row[0])]={'id':row[0],'name':t[0],'description':t[1],'stats':stats,'slot':t[22],'kind':t[23],'source':'Database/globalstore.db.mem','sourceSha256':source_hash,'sourceIcon':row[3]}
Path('data/adventure/shop-candidates.json').write_text(json.dumps(items,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(len(items),'equipment candidates')
