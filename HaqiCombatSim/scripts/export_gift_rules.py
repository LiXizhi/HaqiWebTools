"""kids gift eligibility only; preserve original template fields and provenance."""
import base64, hashlib, json
from pathlib import Path
from lib.lua_data import LuaData
APP = Path(__file__).resolve().parents[1]
source = APP.parents[1] / 'Database/globalstore.db.mem'
raw = source.read_bytes()
encoded = base64.b64decode(raw)
key = b'Copyright@ParaEngine, LiXizhi\0'
rows = LuaData(bytes(b ^ key[i % len(key)] for i, b in enumerate(encoded)).decode('utf-8')).value()
items = {}
for row in rows:
    t = row[18]
    stats = {t[i]: t[i+1] for i in range(2, 22, 2) if t[i]}
    # class 18 = collectable/consumable; no currency, equipment, pets or mounts.
    if t[23] == 18:
        items[str(row[0])] = dict(canGift=t[39] is True, canExchange=t[33] is True,
            bindType=stats.get(223, 0), kind=t[23], stackOnly=t[37] > 1)
payload = dict(version=1, source='Database/globalstore.db.mem', sha256=hashlib.sha256(raw).hexdigest(),
    mapping='paraworld.globalstore.lua L535-554; ItemManager.lua L5460-5492; GenericTooltip.lua L505-522', items=items)
(APP / 'data/adventure/gift-rules.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(f'{len(items)} kids collectable templates exported')
