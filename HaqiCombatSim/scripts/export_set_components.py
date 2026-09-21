import base64
import hashlib
import json
from pathlib import Path
from lib.lua_data import LuaData

source = Path(__file__).resolve().parents[3] / 'database/globalstore.db.mem'
data = source.read_bytes()
raw = base64.b64decode(data)
key = b'Copyright@ParaEngine, LiXizhi\0'
parser = LuaData(bytes(value ^ key[index % len(key)] for index, value in enumerate(raw)).decode('utf-8'))
rows = parser.value()
parser.skip()
if parser.pos != len(parser.text):
    raise ValueError('Trailing Lua data')
components = {}
for row in rows:
    item_id, template = row[0], row[18]
    if 1001 <= item_id <= 8999 and template[30] > 0:
        components[str(item_id)] = template[30]
if not components:
    raise ValueError('Empty item set components')
print(json.dumps({'components': components, 'source': 'database/globalstore.db.mem', 'sha256': hashlib.sha256(data).hexdigest()}))