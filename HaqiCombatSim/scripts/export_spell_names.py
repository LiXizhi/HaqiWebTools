#!/usr/bin/env python3
"""Export display names without evaluating Lua. Optional source checkout, no runtime dependency."""
import base64,json,argparse
from pathlib import Path
from lib.lua_data import LuaData
app=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--root',type=Path,default=app.parents[1]);args=p.parse_args()
raw=base64.b64decode((args.root/'Database/globalstore.db.mem').read_bytes());key=b'Copyright@ParaEngine, LiXizhi\0'
literal=bytes(b^key[i%len(key)] for i,b in enumerate(raw)).decode();parser=LuaData(literal);rows=parser.value();parser.skip()
if parser.pos!=len(literal): raise ValueError('Trailing data')
cards=json.loads((app/'data/kids/cards.json').read_text());names={}
for row in rows:
    k=row[12].partition('_')[2]
    if k in cards:names.setdefault(k,row[18][0])
(app/'data/kids/card_names.json').write_text(json.dumps(names,ensure_ascii=False,indent=2)+'\n')
print(f'{len(names)} source card names exported')
