"""Export fishing nets and stamina potions from extendedcost. Never executes Lua."""
import base64, hashlib, json, re
from pathlib import Path
from lib.lua_data import LuaData

root = Path(__file__).resolve().parents[3]
out = Path(__file__).resolve().parents[1] / 'data/adventure/fishing.json'
key = b'Copyright@ParaEngine, LiXizhi\0'

# 30388_CatchFish.lua nets table: gsid, exid, absolutely_hit.
# Apparatus rows are the auto casters; the web minigame still resolves their exchange on a manual cast.
NETS = [
    (17113, 1569, False),
    (17346, 1645, True),
    (17347, 1605, False),
    (17348, 1606, False),
    (17349, 1646, True),
    (17465, 1852, True),
    (17466, 1853, True),
    (17467, 1854, True),
]
POTIONS = [17393, 17344, 17345]
# Player.GetStamina kids branch when bean.energy == 0.
STAMINA_MAX = 100
STAMINA_GSID = -19


def decode(name):
    raw = (root / 'Database' / name).read_bytes()
    data = base64.b64decode(raw)
    text = bytes(b ^ key[i % len(key)] for i, b in enumerate(data)).decode()
    return text, hashlib.sha256(raw).hexdigest()


def pairs(value):
    return [{'id': int(a), 'count': int(b)} for a, b in re.findall(r'key=(-?\d+),value=(-?\d+)', value)]


text, exchange_hash = decode('extendedcost.db.mem')
needed = {net[1] for net in NETS}
exchanges = {}
for line in text.splitlines():
    match = re.search(r'exname="([^"]*)",(\d+),pres=\{(.*?)\},froms=\{(.*?)\},', line)
    if not match:
        continue
    exid = int(match[2])
    # Potion exchange ids are discovered from globalstore stats[51] after this pass.
    if exid not in needed and exid not in (21130, 21131, 21134):
        continue
    encoded = re.search(r'otos=("(?:\\.|[^"\\])*")', line)
    payload = json.loads(encoded.group(1)) if encoded else ''
    branches = [json.loads(part) for part in payload.split('|') if part] if payload else []
    exchanges[exid] = {
        'name': match[1],
        'prerequisites': pairs(match[3]),
        'costs': pairs(match[4]),
        'branches': branches,
    }

store, store_hash = decode('globalstore.db.mem')
items = {}
potion_exchange = {}
for row in LuaData(store).value():
    template = row[18]
    items[row[0]] = {
        'id': row[0],
        'name': template[0],
        'description': template[1],
        'kind': template[23],
        'sourceIcon': row[3],
    }
    for index in range(2, 22, 2):
        if template[index] == 51 and row[0] in POTIONS:
            potion_exchange[row[0]] = template[index + 1]

selected = {net[1] for net in NETS} | set(potion_exchange.values())
wanted = {net[0] for net in NETS} | set(POTIONS)
for exid in selected:
    exchange = exchanges[exid]
    for cost in exchange['costs'] + exchange['prerequisites']:
        if cost['id'] > 0:
            wanted.add(cost['id'])
    for branch in exchange['branches']:
        for reward in branch:
            if reward['gsid'] > 0:
                wanted.add(reward['gsid'])

lua = root / 'script/apps/Aries/NPCs/TownSquare/30388_CatchFish.lua'
nets = []
for gsid, exid, absolute in NETS:
    exchange = exchanges[exid]
    assert exchange['costs'] == [{'id': gsid, 'count': 1}], (gsid, exchange['costs'])
    assert exchange['prerequisites'] == [{'id': STAMINA_GSID, 'count': 10}], (exid, exchange['prerequisites'])
    assert exchange['branches'], exid
    nets.append({
        'id': gsid,
        'exchangeId': exid,
        'exchangeName': exchange['name'],
        'absolutelyHit': absolute,
        'staminaRequired': 10,
        'branches': [[{'gsid': row['gsid'], 'count': row['cnt'], 'p': row['p']} for row in branch] for branch in exchange['branches']],
    })

potions = []
for gsid in POTIONS:
    exchange = exchanges[potion_exchange[gsid]]
    assert exchange['costs'] == [{'id': gsid, 'count': 1}], exchange['costs']
    restore = next(row['cnt'] for branch in exchange['branches'] for row in branch if row['gsid'] == STAMINA_GSID)
    unknown = [row for row in exchange['prerequisites'] if row['id'] != STAMINA_GSID]
    potions.append({
        'id': gsid,
        'exchangeId': potion_exchange[gsid],
        'exchangeName': exchange['name'],
        'restore': restore,
        'blocked': '精力药剂的特殊前提尚未接入' if unknown else '',
    })

catalog = {
    'version': 1,
    'source': 'Database/extendedcost.db.mem; Database/globalstore.db.mem; script/apps/Aries/NPCs/TownSquare/30388_CatchFish.lua; script/apps/Aries/Player/main.lua:GetStamina',
    'extendedCostSha256': exchange_hash,
    'globalStoreSha256': store_hash,
    'catchFishSha256': hashlib.sha256(lua.read_bytes()).hexdigest(),
    'staminaMax': STAMINA_MAX,
    'staminaGsid': STAMINA_GSID,
    'nets': nets,
    'potions': potions,
    'items': {str(gsid): items[gsid] for gsid in sorted(wanted)},
}
out.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Exported {len(nets)} nets and {len(potions)} potions')

out.with_name('fishing-items.json').write_text(json.dumps(catalog['items'], ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
