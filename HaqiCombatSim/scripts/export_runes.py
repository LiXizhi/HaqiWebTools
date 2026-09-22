"""Export the kids RuneList grid, card keys and original obtain paths. Never executes Lua."""
import base64, hashlib, json, re
import xml.etree.ElementTree as ET
from pathlib import Path
from lib.lua_data import LuaData

APP = Path(__file__).resolve().parents[1]
ROOT = APP.parents[1]
OUT = APP / 'data/adventure/runes.json'
KEY = b'Copyright@ParaEngine, LiXizhi\0'
ZONES = {'camp': '魔法营地', 'town': '哈奇岛', 'fire': '火鸟岛', 'ice': '寒冰岛', 'desert': '沙漠岛', 'dark': '幽暗岛'}
LOOT = re.compile(r'\[(\d+),(\d+(?:\.\d+)?)\]=([0-9.]+)')


def read(path):
    raw = (ROOT / path).read_bytes()
    return raw, hashlib.sha256(raw).hexdigest()


def decode(path):
    raw, digest = read(path)
    text = bytes(v ^ KEY[i % len(KEY)] for i, v in enumerate(base64.b64decode(raw))).decode('utf-8')
    return text, digest


def card_key(assetkey, gsid):
    prefix, sep, key = str(assetkey or '').partition('_')
    return key if sep and prefix == str(gsid) else ''


store_text, store_hash = decode('Database/globalstore.db.mem')
items = {}
for row in LuaData(store_text).value():
    template = row[18]
    gsid = int(row[0])
    items[gsid] = {
        'id': gsid, 'name': template[0], 'description': template[1], 'assetkey': row[12],
        'stats': {str(template[i]): template[i + 1] for i in range(2, 22, 2) if template[i]},
        'kind': template[23], 'subtype': template[24],
    }

rune_xml, rune_hash = read('config/Aries/Cards/RuneList.xml')
root = ET.fromstring(rune_xml)
listed = []
for slot, node in enumerate(root.findall('rune'), start=1):
    gsid = int(node.get('gsid') or 0)
    if gsid:
        listed.append((slot, gsid))
listed_ids = {gsid for _, gsid in listed}

cards = json.loads((APP / 'data/kids/cards.json').read_text(encoding='utf-8'))
journal = json.loads((APP / 'data/adventure/quest-journal.json').read_text(encoding='utf-8'))
chapter = json.loads((APP / 'data/adventure/chapter.json').read_text(encoding='utf-8'))
npc = json.loads((APP / 'data/adventure/npc-catalog.json').read_text(encoding='utf-8'))
chapter_rewards = {}
for quest in chapter['quests']:
    chapter_rewards[quest['id']] = {item['id'] for group in quest['rewards'] for item in group['items']}

npc_by_id = {}
for resident in npc['npcs']:
    npc_by_id.setdefault(resident['id'], resident)

sources = {gsid: [] for gsid in listed_ids}
seen = {gsid: set() for gsid in listed_ids}

def add(gsid, kind, identity, row):
    if gsid not in seen or identity in seen[gsid]:
        return
    seen[gsid].add(identity)
    sources[gsid].append(row)

for shop in npc['shops']:
    gsid = shop['itemId']
    if gsid not in listed_ids:
        continue
    exchange = npc['exchanges'].get(str(shop['exchangeId']))
    resident = npc_by_id.get(shop['npcId'], {})
    rewards = exchange.get('rewards') if exchange else None
    live = bool(exchange and shop['exchangeId'] and not shop.get('platform') and not shop.get('timeRange')
                and shop.get('dailyLimit', -1) < 0 and isinstance(rewards, list) and len(rewards) == 1
                and rewards[0].get('gsid') == gsid and rewards[0].get('p') == 1000
                and not exchange.get('prerequisites'))
    price = ''
    if exchange:
        price = '、'.join(f"{cost['count']}{items.get(cost['id'], {}).get('name') or '物品'+str(cost['id'])}" for cost in exchange['costs'])
    add(gsid, 'shop', ('shop', shop['npcId'], shop['exchangeId'], shop.get('menu')), {
        'kind': 'shop', 'npcId': shop['npcId'], 'npcName': resident.get('name') or shop.get('npcName') or '居民',
        'zone': resident.get('zone') or '', 'zoneName': ZONES.get(resident.get('zone'), resident.get('zone') or '未知地区'),
        'exchangeId': shop['exchangeId'], 'price': price, 'live': live,
    })

for quest in journal['quests']:
    for group in quest.get('rewards') or []:
        for reward in group.get('items') or []:
            gsid = int(reward['id'])
            if gsid not in listed_ids:
                continue
            playable = gsid in chapter_rewards.get(quest['id'], set())
            add(gsid, 'quest', ('quest', quest['id'], int(reward['count'])), {
                'kind': 'quest', 'questId': quest['id'], 'title': quest['title'],
                'count': int(reward['count']), 'playable': playable,
                'chapter': quest['id'] in chapter_rewards,
            })

for path in (ROOT / 'config/Aries').rglob('*.xml'):
    if 'teen' in path.name.lower():
        continue
    raw = path.read_bytes()
    if not any(str(gsid).encode() in raw for gsid in listed_ids):
        continue
    try:
        node = ET.fromstring(raw)
    except ET.ParseError:
        continue
    for mob in node.iter('mob'):
        name = mob.get('displayname') or mob.get('name') or '怪物'
        for attr, value in mob.attrib.items():
            if not attr.startswith('loot') or not value:
                continue
            for gsid, count, chance in LOOT.findall(value):
                gsid = int(gsid)
                if gsid not in listed_ids:
                    continue
                add(gsid, 'loot', ('loot', name, attr, count, chance), {
                    'kind': 'loot', 'name': name, 'field': attr, 'count': float(count) if '.' in count else int(count),
                    'chance': float(chance), 'source': str(path.relative_to(ROOT)).replace('\\', '/'),
                })

unlisted = sorted(gsid for gsid, item in items.items() if item['kind'] == 18 and item['subtype'] == 2 and gsid not in listed_ids)
runes = []
exported_items = {}
for slot, gsid in listed:
    item = items.get(gsid)
    key = card_key(item.get('assetkey'), gsid) if item else ''
    card = cards.get(key) or {}
    if item:
        exported_items[str(gsid)] = {
            'id': gsid, 'name': item['name'], 'description': item['description'], 'assetkey': item['assetkey'],
            'stats': item['stats'], 'kind': item['kind'], 'subtype': item['subtype'],
        }
    runes.append({
        'slot': slot, 'gsid': gsid, 'name': item['name'] if item else '', 'key': key,
        'type': card.get('type') or '', 'baseWeight': card.get('params', {}).get('base_weight'),
        'sources': sources[gsid],
    })

result = {
    'version': 1,
    'sources': {
        'config/Aries/Cards/RuneList.xml': rune_hash,
        'Database/globalstore.db.mem': store_hash,
    },
    'listed': len(runes),
    'unlisted': unlisted,
    'runes': runes,
    'items': exported_items,
}
OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Exported {len(runes)} RuneList entries, {len(unlisted)} unlisted rune items')
