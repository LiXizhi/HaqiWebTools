"""Export MiJiuHuLu exchange rewards; restricted literal decoding, never execute Lua."""
import base64,json,re,hashlib
from pathlib import Path
from lib.lua_data import LuaData
root=Path(__file__).resolve().parents[3]
key=b'Copyright@ParaEngine, LiXizhi\0'
def decode(name):
 raw=(root/'Database'/name).read_bytes();data=base64.b64decode(raw)
 return bytes(b^key[i%len(key)] for i,b in enumerate(data)).decode(),hashlib.sha256(raw).hexdigest()
text,digest=decode('extendedcost.db.mem');exchanges={}
for line in text.splitlines():
 match=re.search(r',(?P<id>180[1-6]),pres=',line)
 if not match:continue
 encoded=re.search(r'otos=("(?:\\.|[^"\\])*")',line).group(1)
 exchanges[int(match['id'])]=[json.loads(part) for part in json.loads(encoded).split('|')]
rows=[]
for exid in range(1802,1807):
 groups=exchanges[exid];assert all(group==groups[0] for group in groups)
 rows.append({'exchangeId':exid,'rewards':[{'id':r['gsid'],'count':r['cnt']} for r in groups[0] if r['gsid']<50000]})
source,item_hash=decode('globalstore.db.mem');items={};ids={r['id'] for row in rows for r in row['rewards']}
for row in LuaData(source).value():
 if row[0] not in ids or row[0]==17213:continue
 t=row[18];items[str(row[0])]={'id':row[0],'name':t[0],'description':t[1]+'；当前版本暂未开放使用，可保留在背包中。','stats':{},'slot':0,'kind':0,'sourceIcon':row[3],'sourceSha256':item_hash,'useUnavailable':True}
config={'source':'Database/extendedcost.db.mem:1801–1806; script/apps/Aries/Desktop/MiJiuHuLu.lua:GetObtainAwardState/GetVipTip','sourceSha256':digest,'gourds':rows,'vipCoinsByLevel':[0]+[next(r['cnt'] for r in group if r['gsid']==17213) for group in reversed(exchanges[1801])],'items':items}
Path('data/adventure/checkin.json').write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
