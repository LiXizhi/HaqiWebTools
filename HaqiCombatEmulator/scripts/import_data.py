#!/usr/bin/env python3
"""Read-only source extraction; outputs only emulator data/. Python is development-only.

The .mem parser accepts Lua data literals, never executes Lua or eval().
"""
import base64
import hashlib
import json
import re
from pathlib import Path
import xml.etree.ElementTree as ET

APP = Path(__file__).resolve().parents[1]
ROOT = APP.parents[1]
LITERAL = re.compile(r'(true|false|nil)|(-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)')


class LuaData:
    def __init__(self, text):
        self.text, self.pos = text, 0

    def skip(self):
        while self.pos < len(self.text):
            if self.text[self.pos].isspace():
                self.pos += 1
            elif self.text.startswith('--', self.pos):
                end = self.text.find('\n', self.pos)
                self.pos = len(self.text) if end < 0 else end + 1
            else:
                break

    def value(self):
        self.skip()
        c = self.text[self.pos]
        self.pos += 1
        if c == '{':
            values = []
            while True:
                self.skip()
                if self.text[self.pos] == '}':
                    self.pos += 1
                    return values
                values.append(self.value())
                self.skip()
                if self.text[self.pos] in ',;':
                    self.pos += 1
                elif self.text[self.pos] != '}':
                    raise ValueError(f'Expected data delimiter at {self.pos}')
        if c in '\"\'':
            out = []
            while self.pos < len(self.text):
                ch = self.text[self.pos]
                self.pos += 1
                if ch == c:
                    return ''.join(out)
                if ch == '\\':
                    ch = self.text[self.pos]
                    self.pos += 1
                    if ch.isdigit():
                        digits = ch
                        while len(digits) < 3 and self.text[self.pos].isdigit():
                            digits += self.text[self.pos]
                            self.pos += 1
                        ch = chr(int(digits))
                    else:
                        ch = {'n': '\n', 'r': '\r', 't': '\t', 'a': '\a', 'b': '\b', 'v': '\v', 'f': '\f'}.get(ch, ch)
                out.append(ch)
            raise ValueError('Unterminated Lua string')
        self.pos -= 1
        match = LITERAL.match(self.text, self.pos)
        if not match:
            raise ValueError(f'Unsupported Lua data at {self.pos}')
        self.pos += len(match[0])
        if match[1]:
            return {'true': True, 'false': False, 'nil': None}[match[1]]
        return float(match[2]) if any(x in match[2] for x in '.eE') else int(match[2])


def scalar(value):
    if value == 'true': return True
    if value == 'false': return False
    if re.fullmatch(r'-?\d+(?:\.\d+)?', value):
        return float(value) if '.' in value else int(value)
    return value


def attrs(node):
    return {k: scalar(v) for k, v in node.attrib.items()} if node is not None else {}


def tree(node):
    return {'tag': node.tag, 'attrs': attrs(node), 'children': [tree(c) for c in node]}


def extract(version):
    suffix = '.teen' if version == 'teen' else ''
    sources, missing, duplicates = {}, [], []

    def read(path):
        file = ROOT / path
        if not file.exists():
            missing.append(path)
            return None
        raw = file.read_bytes()
        sources[path] = hashlib.sha256(raw).hexdigest()
        return raw

    def xml(path):
        raw = read(path)
        return ET.fromstring(raw) if raw is not None else None

    cards, card_sources = {}, []
    listing = xml(f'config/Aries/Cards/CardList{suffix}.xml')
    for ref in listing.findall('card'):
        path = ref.get('datafile')
        node = xml(path)
        if node is None: continue
        card_sources.append({'source':path,'xml':ET.tostring(node,encoding='unicode')})
        key = node.find('key').get('name')
        if key in cards: duplicates.append({'key': key, 'previous': cards[key]['source'], 'effective': path})
        basics = attrs(node.find('basics'))
        school = str(basics.get('spell_school', 'balance')).lower()
        spell = node.find('spell')
        cards[key] = {
            'key': key, 'school': school, 'type': basics.get('type'),
            'pipcost': basics.get('pipcost', 0),
            'accuracy': 100 if version == 'teen' else basics.get('accuracy', 100),
            'hitchance': basics.get('hitchance', 100),
            'requireLevel': basics.get('require_level', 0),
            'target': basics.get('target'), 'canLearn': basics.get('can_learn', False),
            'spell': spell.get('name', key) if spell is not None else key,
            'params': attrs(node.find('params')), 'source': path,
        }
    path = f'Database/globalstore{suffix}.db.mem'
    raw = base64.b64decode(read(path), validate=False)
    key = b'Copyright@ParaEngine, LiXizhi\0'
    decoded = bytes(b ^ key[i % len(key)] for i, b in enumerate(raw)).decode('utf-8')
    parser = LuaData(decoded)
    records = parser.value()
    parser.skip()
    if parser.pos != len(decoded): raise ValueError('Trailing content in GlobalStore')
    items = {}
    for row in records:
        t = row[18]
        stats = {str(t[i]): t[i+1] for i in range(2,22,2) if t[i]}
        item = {'gsid': row[0], 'icon': row[3], 'assetkey': row[12], 'name': t[0],
                'description': t[1], 'stats': stats, 'slot': t[22], 'class': t[23],
                'subclass': t[24], 'itemset': t[30], 'source': path}
        items[str(row[0])] = item
        cardkey = str(row[12]).partition('_')[2]
        if cardkey in cards:
            cards[cardkey].setdefault('gsids', []).append(row[0])
            cards[cardkey].setdefault('name', t[0])
    effects = {}
    effectroot = xml(f'config/Aries/Cards/CharmWardList{suffix}.xml')
    for group in effectroot:
        effects[group.tag] = {str(child.get('id')): attrs(child) for child in group}
    sets = xml('config/Aries/ItemSet/AllItemSetAttr'+('_Teen' if version == 'teen' else '')+'.xml')
    itemsets = {str(s.get('id')): {'name': s.get('name'), 'groups': [
        {'count': int(g.get('items')), 'stats': {n.get('type'): scalar(n.get('value')) for n in g}}
        for g in s]} for s in sets}
    addonroot = xml(f'config/Aries/Others/globalstore.addonlevel.{version}.xml')
    addons = {}
    for group in addonroot:
        for gsid in group.get('gsids', '').split(','):
            if gsid.strip(): addons[gsid.strip()] = {str(a.get('level')): attrs(a) for a in group}
    arenas = {}
    for size in range(1,5):
        path = f'config/Aries/WorldData{"_Teen" if version == "teen" else ""}/HaqiTown_RedMushroomArena_{size}v{size}.Arenas_Mobs.xml'
        node = xml(path)
        arenas[str(size)] = attrs(node.find('pvp_arena')) if node is not None else {}
    auxiliary = {}
    for rel in [f'Cards/RuneList{suffix}.xml',f'Combat/DragonTotemStats{suffix}.xml',
                f'Combat/DeckAttackerAITemplates.{version}.xml',
                'CombatPet_Teen/properties.xml', 'CombatPet_Teen/commons.xml']:
        node = xml('config/Aries/'+rel)
        if node is not None: auxiliary[rel] = tree(node)
    for rel in ['card_server.lua','player_server.lua','arena_server.lua']:
        read('script/apps/Aries/Combat/ServerObject/'+rel)
    manifest = {'schemaVersion': 1, 'version': version, 'sources': sources, 'missing': missing,
                'duplicates': duplicates, 'listedCards': len(listing.findall('card')),
                'cards': len(cards), 'items': len(items), 'status': 'source-snapshot',
                'converterHash': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                'loadOrder': [ref.get('datafile') for ref in listing.findall('card')]}
    digest = hashlib.sha256(json.dumps(manifest,sort_keys=True).encode()).hexdigest()
    manifest['hash'] = digest
    data = {'schemaVersion': 1, 'version': version, 'hash': digest,
            'cards': cards, 'items': items, 'effects': effects, 'itemsets': itemsets,
            'addons': addons, 'arenas': arenas, 'auxiliary': auxiliary, 'manifest': manifest}
    (APP/'data'/version/'source-records.json').write_text(json.dumps({'schemaVersion':1,'version':version,'cardsInLoadOrder':card_sources,'globalstoreRows':records},ensure_ascii=False,separators=(',',':'))+'\n')
    (APP/'data'/version/'ruleset.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
    (APP/'data/manifests'/f'{version}.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(f'{version}: {len(cards)} cards, {len(items)} items, {len(missing)} missing sources; {digest[:12]}')


if __name__ == '__main__':
    for version in ['kids', 'teen']: extract(version)
