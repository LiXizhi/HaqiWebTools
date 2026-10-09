#!/usr/bin/env python3
"""Export kids enrage stats/AI into the existing adventure combat dataset.

Source: mob_server.lua InitEnrageStatsIfNot / InitEnrageAICardsIfNot.
Only parses XML and the existing restricted Lua literal decoder; executes no Lua.
"""
import argparse
import base64
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from lib.lua_data import LuaData

APP = Path(__file__).resolve().parents[1]


def export(root, output):
    sources = {}

    def read(path):
        raw = (root / path).read_bytes()
        sources[path] = hashlib.sha256(raw).hexdigest()
        return raw

    cards = json.loads((APP / 'data/kids/cards.json').read_text(encoding='utf-8'))
    raw = base64.b64decode(read('Database/globalstore.db.mem'))
    key = b'Copyright@ParaEngine, LiXizhi\0'
    rows = LuaData(bytes(v ^ key[i % len(key)] for i, v in enumerate(raw)).decode()).value()
    items = {str(r[0]): r[12].partition('_')[2] for r in rows
             if isinstance(r[12], str) and r[12].partition('_')[2] in cards}
    used = set()

    def card(value):
        name = items.get(value, value)
        if name not in cards:
            raise ValueError(f'Unknown kids enrage card: {value}')
        used.add(name)
        return name

    def pool(text):
        return [{'key': card(a), 'weight': int(b)} for a, b in re.findall(r'\((\d+),(\d+)\)', text)]

    tree = ET.fromstring(read('config/Aries/EnrageStats.xml'))
    base = {e.get('key'): {k: int(v) for k, v in e.attrib.items() if k != 'key'}
            for e in tree.findall('stats_groups/group')}
    stats = {}
    for e in tree.findall('mob_groups/group'):
        value = {}
        for name in e.get('stats_group_keys', '').split('~'):
            value.update(base.get(name, {}))
        stats[e.get('key')] = value

    ai = {}
    for e in ET.fromstring(read('config/Aries/EnrageAICards.xml')).findall('template'):
        mob = e.find('mobtemplate')
        ai[e.get('name')] = {
            'pool': pool(mob.get('available_cards', '')),
            'cardsets': {n.get('id'): pool(n.get('cards', '')) for n in e.findall('.//cardsets/set')},
            'sequences': [[{**n.attrib, 'card': card(n.get('card', ''))} for n in seq]
                          for seq in e.findall('.//sequences/sequence')],
            'genes': [{**n.attrib, **({'card': card(n.get('card'))} if n.get('card') else {})}
                      for n in e.findall('.//genes/gene')],
        }

    dataset = json.loads(output.read_text(encoding='utf-8'))
    dataset.setdefault('pve', {})['enrage'] = {'version': 1, 'sources': sources, 'stats': stats, 'ai': ai,
                                            'cards': {name: cards[name] for name in sorted(used)}}
    output.write_text(json.dumps(dataset, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Kids enrage: {len(stats)} stat groups, {len(ai)} AI templates, {len(used)} referenced cards')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=APP.parents[1])
    parser.add_argument('--output', type=Path, default=APP / 'data/adventure/combat.json')
    args = parser.parse_args()
    export(args.root.resolve(), args.output)
