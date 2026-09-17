#!/usr/bin/env python3
"""Read-only extraction of Haqi world/NPC/quest/mob/shop data for the 2D game (Haqi.html).

Outputs only data/game/<version>/*.json and data/game/asset-index.json. Python is
development-only; the browser never runs it. Sources are the local config/Aries tree
and assets_manifest.txt of the paraworld checkout two levels above this app.
Missing production files are recorded in the manifest, never invented.
"""
import base64
import hashlib
import json
import re
import sys
from pathlib import Path
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_data import scalar  # noqa: E402


class LuaTable:
    """Data-only Lua table reader supporting positional, name= and [key]= fields. Never executes Lua."""
    TOKEN = re.compile(r'\s*(?:(--[^\n]*)|("(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\')|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(true|false|nil)|([A-Za-z_]\w*)|(.))', re.S)

    def __init__(self, text):
        self.tokens = [m for m in self.TOKEN.finditer(text) if m.group(1) is None and m.group(0).strip()]
        self.pos = 0

    def peek(self):
        return self.tokens[self.pos].group(0).strip() if self.pos < len(self.tokens) else None

    def take(self):
        tok = self.tokens[self.pos]
        self.pos += 1
        return tok

    def value(self):
        tok = self.take()
        raw = tok.group(0).strip()
        if raw == '{':
            positional, named = [], {}
            while self.peek() != '}':
                if self.peek() == '[':
                    self.take()
                    key = self.value()
                    assert self.take().group(0).strip() == ']' and self.take().group(0).strip() == '='
                    named[key] = self.value()
                elif tok_is_name(self.tokens[self.pos]) and self.pos + 1 < len(self.tokens) and self.tokens[self.pos + 1].group(0).strip() == '=':
                    key = self.take().group(5)
                    self.take()
                    named[key] = self.value()
                else:
                    positional.append(self.value())
                if self.peek() in (',', ';'):
                    self.take()
            self.take()
            return {'positional': positional, 'named': named}
        if tok.group(2):
            body = raw[1:-1]
            return re.sub(r'\\(.)', lambda m: {'n': '\n', 't': '\t'}.get(m.group(1), m.group(1)), body)
        if tok.group(3):
            return float(raw) if any(c in raw for c in '.eE') else int(raw)
        if tok.group(4):
            return {'true': True, 'false': False, 'nil': None}[raw]
        raise ValueError(f'Unsupported Lua data token {raw!r}')


def tok_is_name(tok):
    return tok.group(5) is not None


APP = Path(__file__).resolve().parents[1]
ROOT = APP.parents[1]
SS = '{urn:schemas-microsoft-com:office:spreadsheet}'
SCHOOLS = ['fire', 'ice', 'storm', 'life', 'death', 'myth', 'balance']
CDN_BASE = 'https://cdn.keepwork.com/update61/assetdownload/update/'


def text(node, tag, default=''):
    child = node.find(tag) if node is not None else None
    return (child.text or '').strip() if child is not None and child.text else default


def number(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        try:
            return float(value)
        except (TypeError, ValueError):
            return default


def vec(value):
    """'x,y,z' or '{ x, y, z, }' or '{x=..,y=..,z=..}' -> [x,y,z] floats."""
    if not value:
        return None
    nums = [float(v) for v in re.findall(r'-?\d+(?:\.\d+)?', str(value))]
    return nums[:3] if len(nums) >= 3 else None


def lua_named(value):
    """'{x=1, y=2, facing=-0.3}' -> dict of numbers."""
    return {k: float(v) for k, v in re.findall(r'(\w+)\s*=\s*(-?\d+(?:\.\d+)?)', value or '')}


def pairs(value):
    """'(22365,20)(22159,30)' -> [{gsid,weight}]"""
    return [{'gsid': int(a), 'weight': int(b)} for a, b in re.findall(r'\((\d+),(\d+)\)', value or '')]


def lua_loot(value):
    """'{[17176,1]=2,[17132,1]=70}' -> [{gsid,count,weight}]"""
    return [{'gsid': int(a), 'count': int(b), 'weight': int(c)} for a, b, c in re.findall(r'\[(\d+),(\d+)\]\s*=\s*(\d+)', value or '')]


def excel_rows(root):
    rows = []
    for row in root.iter(SS + 'Row'):
        cells = []
        for cell in row.findall(SS + 'Cell'):
            index = cell.get(SS + 'Index')
            if index:
                while len(cells) < int(index) - 1:
                    cells.append('')
            data = cell.find(SS + 'Data')
            cells.append((data.text or '').strip() if data is not None and data.text else '')
        rows.append(cells)
    return rows


def dialog_items(node):
    out = []
    for item in node.findall('item'):
        out.append({'npcId': number(text(item, 'id'), 0), 'content': text(item, 'content'),
                    'buttons': [{'action': b.get('action'), 'label': b.get('label', '')} for b in item.iter('button')]})
    return out


class Importer:
    def __init__(self, version):
        self.version = version
        self.teen = version == 'teen'
        self.sources, self.missing = {}, []

    def read(self, rel, optional=False):
        file = ROOT / rel
        if not file.exists():
            if not optional and rel not in self.missing:
                self.missing.append(rel)
            return None
        raw = file.read_bytes()
        self.sources[rel] = hashlib.sha256(raw).hexdigest()
        return raw

    def xml(self, rel, optional=False):
        raw = self.read(rel, optional)
        if raw is None:
            return None
        try:
            return ET.fromstring(raw.decode('utf-8-sig'))
        except ET.ParseError:
            # A few files carry a stray BOM or trailing whitespace before the prolog.
            return ET.fromstring(raw.decode('utf-8-sig').lstrip())

    def anchors(self, rel):
        raw = self.read(rel)
        if raw is None:
            return []
        out = []
        for m in re.finditer(r'<(?:pe:map-)?anchor\s+MapCoord\s*=\s*"([^"]+)"\s+AvatarPosition\s*=\s*"([^"]+)"', raw.decode('utf-8-sig')):
            mx, my = [float(v) for v in m.group(1).split(',')]
            wx, wz = [float(v) for v in m.group(2).split(',')]
            out.append({'map': [mx, my], 'world': [wx, wz]})
        return out

    # ---------------------------------------------------------------- worlds
    def worlds(self):
        quest_dir = 'config/Aries/Quests_Teen' if self.teen else 'config/Aries/Quests'
        listing = self.xml(f'{quest_dir}/worlds_list.xml')
        scene = self.xml('config/Aries/Scene/AriesGameWorlds.config.xml')
        scene_map = {}
        for w in scene.iter('World') if scene is not None else []:
            scene_map.setdefault(w.get('name'), w)
        worlds = []
        for item in listing.findall('item') if listing is not None else []:
            name = text(item, 'worldname')
            world = {'id': number(text(item, 'id')), 'label': text(item, 'label'), 'name': name,
                     'npcFile': text(item, 'npcfile'), 'isInstance': text(item, 'property') == '1',
                     'vip': text(item, 'vip') == '1'}
            s = scene_map.get(name)
            if s is not None:
                world['title'] = s.get('world_title') or world['label']
                world['bornPos'] = lua_named(s.get('born_pos'))
                world['loginPos'] = lua_named(s.get('login_pos'))
                world['canTeleport'] = s.get('can_teleport') == 'true'
                world['minLevel'] = number(s.get('min_level'), 0)
                settings = lua_named(s.get('local_map_settings'))
                bg = re.search(r'background="([^"]+)"', s.get('local_map_settings') or '')
                world['localMap'] = {'center': [settings.get('center_x'), settings.get('center_y')], 'radius': settings.get('radius'),
                                     'background': bg.group(1) if bg else None} if settings else None
            base = name.replace('_teen', '')
            anchor_file = next((p for p in [f'config/Aries/WorldMaps/{name}.xml', f'config/Aries/WorldMaps/{base}Anchor.xml', f'config/Aries/WorldMaps/{base}.xml'] if (ROOT / p).exists()), None)
            world['anchors'] = self.anchors(anchor_file) if anchor_file else []
            page = self.read(f'config/Aries/WorldMaps/{base}.map.html', optional=True)
            if not world['anchors'] and page is not None:
                world['anchors'] = self.anchors(f'config/Aries/WorldMaps/{base}.map.html')
            if page is not None:
                m = re.search(r'Texture/Aries/WorldMaps/[^"\s]+?\.(?:png|dds)', page.decode('utf-8-sig'))
                if m:
                    world['mapImage'] = m.group(0).replace('.dds', '.png')
                    # A page whose <pe:map> names another island (NewUserIsland.map.html is a stale copy of
                    # FrostRoarIsland) carries that island's anchors too; drop both so the world is not "playable" with the wrong map.
                    folder = m.group(0).split('/')[3].lower()
                    if folder not in (base.lower(), 'haqitownmap', 'townmap') and not folder.startswith(base.lower()[:8]):
                        world['mapImage'] = None
                        world['anchors'] = []
            region_rel = text(item, 'region_color')
            region = self.xml(region_rel, optional=True) if region_rel else None
            world['regions'] = [{'label': r.get('label'), 'key': r.get('key'), 'color': [int(c) for c in r.get('color', '0_0_0').split('_')],
                                 'open': r.get('isopen', 'true').strip() == 'true'} for r in region.findall('item')] if region is not None else []
            portal = self.xml(f'config/Aries/WorldData{"_Teen" if self.teen else ""}/{name}.Portal.xml', optional=True)
            world['portals'] = [{'id': number(p.get('id')), 'name': p.get('name'), 'pos': vec(p.get('pos')), 'gsid': number(p.get('portal_gsid')),
                                 'facing': number(p.get('facing'), 0)} for p in portal.iter('Portal')] if portal is not None else []
            worlds.append(world)
        return worlds

    # ------------------------------------------------------------------ npcs
    def npcs(self, worlds):
        out = {}
        for world in worlds:
            rel = world['npcFile']
            root = self.xml(rel, optional=True) if rel else None
            if root is None:
                continue
            npcs = []
            for n in root.findall('NPC'):
                char = n.find('assetfile_char')
                model = n.find('assetfile_model')
                ex = n.find('item_ex')
                char_file = (char.get('filename') or '') if char is not None else ''
                dummy = 'dummy' in char_file.lower() or (n.find('action') is not None and n.find('action').get('isdummy') == 'true')
                kind = 'object' if (dummy or not char_file) else 'character'
                if kind == 'character' and '/01human/' not in char_file.lower() and '/npc' not in char_file.lower() and 'human' not in char_file.lower():
                    kind = 'creature'
                gossip = n.find('gossip')
                npc = {
                    'id': number(n.get('npc_id')), 'uid': n.get('uid'), 'name': (n.get('name') or '').strip(), 'title': (n.get('name2') or '').strip(),
                    'pos': vec(n.get('position')), 'facing': number(n.get('facing'), 0), 'scaling': number(n.get('scaling'), 1),
                    'kind': kind, 'assetChar': char_file or None, 'assetModel': (model.get('filename') if model is not None else None),
                    'hasDialog': n.find('dialog') is not None, 'desc': text(ex, 'desc'), 'place': text(ex, 'place'),
                    'buttons': [b.get('label') for b in ex.iter('button')] if ex is not None else [],
                    'hello': [w.get('text') for w in gossip.find('hello').iter('word')] if gossip is not None and gossip.find('hello') is not None else [],
                    'goodbye': [w.get('text') for w in gossip.find('goodbye').iter('word')] if gossip is not None and gossip.find('goodbye') is not None else [],
                }
                if npc['pos'] and npc['id']:
                    npcs.append(npc)
            out[world['name']] = npcs
        return out

    # ---------------------------------------------------------------- arenas
    def arenas(self, worlds):
        out, templates = {}, set()
        folder = 'config/Aries/WorldData_Teen' if self.teen else 'config/Aries/WorldData'
        for world in worlds:
            root = self.xml(f'{folder}/{world["name"]}.Arenas_Mobs.xml', optional=True)
            if root is None:
                continue
            arenas = []
            for a in root.findall('arena'):
                mobs = [m.get('mob_template') for m in a.findall('mob') if m.get('mob_template')]
                if not mobs or not vec(a.get('position')):
                    continue
                templates.update(mobs)
                arenas.append({'id': a.get('id'), 'pos': vec(a.get('position')), 'facing': number(a.get('facing'), 0),
                               'respawn': number(a.get('respawn_interval'), 5000), 'label': a.get('label') or '', 'mobs': mobs,
                               'aiModule': a.get('ai_module') or ''})
            out[world['name']] = arenas
        return out, templates

    # ------------------------------------------------------------------ mobs
    def mobs(self, templates):
        out = {}
        stems = {}
        for rel in templates:
            stems[Path(rel).stem] = stems.get(Path(rel).stem, 0) + 1
        for rel in sorted(templates):
            root = self.xml(rel)
            if root is None:
                continue
            m = root.find('mob')
            if m is None:
                continue
            a = m.attrib
            stem = Path(rel).stem.replace('MobTemplate_', '')
            # Stems collide across folders (FireLand vs StormLand GhostOctopus); colliding keys carry the folder.
            key = stem if stems[Path(rel).stem] == 1 else f"{Path(rel).parent.name}_{stem}"
            mob = {
                'template': rel, 'key': key, 'stem': stem, 'name': a.get('displayname') or a.get('name') or Path(rel).stem,
                'level': number(a.get('level'), 1), 'hp': number(a.get('hp'), 100), 'school': (a.get('phase') or 'balance').lower(),
                'asset': a.get('asset'), 'scale': number(a.get('scale'), 1), 'aiModule': a.get('ai_module') or '',
                'exp': number(a.get('experience_pts'), 0), 'joybeans': number(a.get('joybean_count'), 0), 'loot': lua_loot(a.get('loot1')),
                'powerPip': number(a.get('power_pip_percent'), 0), 'startPips': number(a.get('startup_pips_normal'), 0), 'startPowerPips': number(a.get('startup_pips_power'), 0),
                'damage': {s: number(a.get(f'damage_{s}_percent'), 0) for s in SCHOOLS if a.get(f'damage_{s}_percent') is not None},
                'resist': {s: number(a.get(f'resist_{s}_percent'), 0) for s in SCHOOLS if a.get(f'resist_{s}_percent') is not None},
                'availableCards': pairs(a.get('available_cards')), 'speakDead': a.get('speak_dead') or '', 'catchPet': number(a.get('catch_pet'), 0) or None,
                'guardDistance': number(a.get('guard_distance'), 10), 'walkRange': number(a.get('random_walk_range'), 5),
                'cardsets': {s.get('id'): pairs(s.get('cards')) for cs in root.iter('cardsets') for s in cs},
                'genes': [{k: scalar(v) for k, v in g.attrib.items()} for gs in root.iter('genes') for g in gs],
            }
            out[mob['key']] = mob
        return out

    # ---------------------------------------------------------------- quests
    def quests(self):
        folder = 'config/Aries/Quests_Teen' if self.teen else 'config/Aries/Quests'
        root = self.xml(f'{folder}/quest_list.xml')
        quests = []
        for q in root.findall('Quest') if root is not None else []:
            if text(q, 'Obsolesced') == '1':
                continue
            req = q.find('RequestAttr')
            level = next(({'min': number(i.get('value'), 0), 'max': number(i.get('topvalue'), 999)} for i in req.iter('item') if i.get('id') == '214'), None) if req is not None else None
            quest = {
                'id': number(text(q, 'Id')), 'title': text(q, 'Title'), 'detail': text(q, 'Detail'), 'group': [number(text(q, 'QuestGroup1')), number(text(q, 'QuestGroup2')), number(text(q, 'QuestGroup3'))],
                'role': number(text(q, 'Role')), 'level': level, 'requestQuests': [number(i.get('id')) for i in q.find('RequestQuest').iter('item')] if q.find('RequestQuest') is not None else [],
                'goals': [{'goalId': number(i.get('id')), 'count': number(i.get('value'), 1)} for i in q.find('Goal').iter('item')] if q.find('Goal') is not None else [],
                'goalItems': [{'gsid': number(i.get('id')), 'count': number(i.get('value'), 1), 'producerId': number(i.get('producer_id'), 0), 'odds': number(i.get('producer_odds'), 1),
                               'producerNum': number(i.get('producer_num'), 1)} for i in q.find('GoalItem').iter('item')] if q.find('GoalItem') is not None else [],
                'clientGoalItems': [{'gsid': number(i.get('id')), 'count': number(i.get('value'), 1)} for i in q.find('ClientGoalItem').iter('item')] if q.find('ClientGoalItem') is not None else [],
                'exchangeItems': [{'id': number(i.get('id')), 'count': number(i.get('value'), 1)} for i in q.find('ClientExchangeItem').iter('item')] if q.find('ClientExchangeItem') is not None else [],
                'flashGames': [{'id': number(i.get('id')), 'count': number(i.get('value'), 1)} for i in q.find('FlashGame').iter('item')] if q.find('FlashGame') is not None else [],
                'customGoals': [{'id': number(i.get('id')), 'count': number(i.get('value'), 1)} for i in q.find('CustomGoal').iter('item')] if q.find('CustomGoal') is not None else [],
                'dialogNPCs': [{'npcId': number(i.get('id')), 'label': i.get('label', ''), 'dialog': dialog_items(i)} for i in q.find('ClientDialogNPC').findall('item')] if q.find('ClientDialogNPC') is not None else [],
                'rewards': [{'choice': number(g.get('choice'), -1), 'schoolFilter': g.get('schoolfilter') == '1',
                             'items': [{'gsid': number(i.get('id')), 'count': number(i.get('value'), 1)} for i in g.findall('item')]} for g in q.find('Reward').findall('items')] if q.find('Reward') is not None else [],
                'startNPC': number(text(q, 'StartNPC')), 'endNPC': number(text(q, 'EndNPC')),
                'startDialog': dialog_items(q.find('StartDialog').find('dialog')) if q.find('StartDialog') is not None and q.find('StartDialog').find('dialog') is not None else [],
                'endDialog': dialog_items(q.find('EndDialog').find('dialog')) if q.find('EndDialog') is not None and q.find('EndDialog').find('dialog') is not None else [],
                'repeat': number(text(q, 'QuestRepeat')), 'weekRepeat': number(text(q, 'WeekRepeat')), 'recommendLevel': number(text(q, 'RecommendLevel')),
                'autoShowStartDialog': text(q, 'AutoShowStartDialog') == '1', 'acceptSilent': text(q, 'AcceptQuestSilentMode') == '1', 'finishSilent': text(q, 'FinishQuestSilentMode') == '1',
                'trackLevel': number(text(q, 'TrackLevel')),
            }
            quests.append(quest)
        goals = {}
        excel = self.xml(f'{folder}/goal_list_excel{".teen" if self.teen else ""}.xml')
        if excel is not None:
            rows = excel_rows(excel)
            for row in rows[1:]:
                if len(row) < 3 or not row[0].isdigit():
                    continue
                row = row + [''] * (11 - len(row))
                goals[row[0]] = {'id': int(row[0]), 'name': row[1], 'template': row[2], 'key': Path(row[2]).stem.replace('MobTemplate_', '') if row[2] else None,
                                 'instance': row[3], 'level': number(row[4], 0), 'world': row[5], 'worldLabel': row[6], 'place': row[7],
                                 'enabled': row[8] in ('1', ''), 'position': vec(row[10].split('|')[0]) if row[10] else None}
        else:
            plain = self.xml(f'{folder}/goal_list.xml')
            for item in plain.findall('item') if plain is not None else []:
                path = text(item, 'path')
                goals[text(item, 'id')] = {'id': number(text(item, 'id')), 'name': text(item, 'label'), 'template': path, 'key': Path(path).stem.replace('MobTemplate_', '') if path else None,
                                           'level': number(text(item, 'level'), 0), 'place': text(item, 'place'), 'enabled': text(item, 'enabled') == '1',
                                           'position': vec(text(item, 'position').split('|')[0]) if text(item, 'position') else None, 'world': text(item, 'world')}
        custom = self.xml(f'{folder}/custom_goal_list.xml')
        custom_goals = {text(i, 'id'): {'id': number(text(i, 'id')), 'label': text(i, 'label'), 'customLabel': text(i, 'customlabel'), 'position': vec(text(i, 'position').split('|')[0]) if text(i, 'position') else None}
                        for i in custom.findall('item')} if custom is not None else {}
        names = {'100': '银币' if self.teen else '奇豆', '113': '战斗经验值'}
        for rel in [f'{folder}/quest_item_list.xml', f'{folder}/client_item_list.xml', f'{folder}/reward_list.xml']:
            node = self.xml(rel)
            for i in node.findall('item') if node is not None else []:
                label = text(i, 'label') or text(i, 'name')
                if label and text(i, 'id'):
                    names.setdefault(text(i, 'id'), label)
        return quests, goals, custom_goals, names

    # ----------------------------------------------------------------- shops
    def shops(self):
        root = self.xml(f'config/Aries/NPCShop{"_Teen" if self.teen else ""}/npcshop{".teen" if self.teen else ""}.xml')
        rules = {}
        raw = self.read(f'Database/extendedcost{".teen" if self.teen else ""}.db.mem')
        if raw is not None:
            key = b'Copyright@ParaEngine, LiXizhi\0'
            decoded = bytes(b ^ key[i % len(key)] for i, b in enumerate(base64.b64decode(raw, validate=False))).decode('utf-8')
            table = LuaTable(decoded).value()
            for row in table['positional']:
                # Row layout: named fields (otos, tmpid, exname, pres, froms) plus one positional exid.
                exid = next((v for v in row['positional'] if isinstance(v, int)), None)
                fields = row['named']
                if exid is None:
                    continue
                def entries(name):
                    group = fields.get(name) or {'positional': []}
                    return [{'gsid': f['named'].get('key'), 'count': f['named'].get('value', 1)} for f in group['positional'] if isinstance(f, dict)]
                rules[str(exid)] = {'exid': exid, 'name': fields.get('exname'), 'froms': entries('froms'), 'pres': entries('pres')}
        shops = {}
        for row in excel_rows(root)[1:] if root is not None else []:
            if len(row) < 7 or not row[0].isdigit():
                continue
            row = row + [''] * (11 - len(row))
            entry = {'gsid': number(row[4]), 'exid': number(row[5]), 'menu': row[1], 'classKey': row[2], 'className': row[3],
                     'moneyList': [number(m) for m in row[6].split('#') if m], 'dayChoice': number(row[7], -1), 'note': row[8]}
            rule = rules.get(str(entry['exid']))
            entry['cost'] = rule['froms'] if rule else []
            shops.setdefault(row[0], []).append(entry)
        return shops

    def hp_table(self):
        root = self.xml('config/Aries/HP/HP_level_mapping.xml')
        return {p.get('level'): number(p.get('hp')) for p in root.iter('pair')} if root is not None else {}

    # --------------------------------------------------------------- run all
    def run(self):
        worlds = self.worlds()
        npcs = self.npcs(worlds)
        arenas, templates = self.arenas(worlds)
        quests, goals, custom_goals, names = self.quests()
        for g in goals.values():
            if g.get('template'):
                templates.add(g['template'])
        mobs = self.mobs(templates)
        shops = self.shops()
        hp = self.hp_table()
        out = APP / 'data' / 'game' / self.version
        out.mkdir(parents=True, exist_ok=True)
        manifest = {'schemaVersion': 1, 'version': self.version, 'sources': self.sources, 'missing': self.missing,
                    'counts': {'worlds': len(worlds), 'npcs': sum(len(v) for v in npcs.values()), 'arenas': sum(len(v) for v in arenas.values()),
                               'mobs': len(mobs), 'quests': len(quests), 'goals': len(goals), 'shops': len(shops)},
                    'converterHash': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
        manifest['hash'] = hashlib.sha256(json.dumps(manifest, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        files = {'worlds': worlds, 'npcs': npcs, 'arenas': arenas, 'mobs': mobs, 'shops': shops, 'hp': hp,
                 'quests': {'quests': quests, 'goals': goals, 'customGoals': custom_goals, 'names': names}}
        for name, data in files.items():
            (out / f'{name}.json').write_text(json.dumps({'schemaVersion': 1, 'version': self.version, 'hash': manifest['hash'], 'data': data}, ensure_ascii=False, separators=(',', ':')) + '\n')
        (out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
        print(f'{self.version}: {manifest["counts"]}; missing {len(self.missing)}; {manifest["hash"][:12]}')
        return worlds, mobs


def asset_index(card_gsids):
    """Filter assets_manifest.txt to the 2D art the game needs. Values are the full manifest lines."""
    manifest = ROOT / 'assets_manifest.txt'
    if not manifest.exists():
        print('assets_manifest.txt missing; asset index not written')
        return
    wanted = re.compile(r'^texture/aries/(worldmaps/|npcs/portrait/|headon/|combat/unitbuffs/|cursor/|common/themeteen/school_|login/tutorial/school_|questlinksview/|combat/combatstate/|desktop/minimap_)')
    card = re.compile(r'^texture/aries/(item|item_teen)/(\d+)_')
    index = {}
    for line in manifest.read_text(encoding='utf-8', errors='replace').splitlines():
        path = line.split(',', 1)[0]
        if not path.endswith('.png.p') and not path.endswith('.jpg.p'):
            continue
        m = card.match(path)
        if not (wanted.match(path) or (m and int(m.group(2)) in card_gsids)):
            continue
        logical = re.sub(r'\.p$', '', path)
        index.setdefault(logical, line.strip())
    out = APP / 'data' / 'game' / 'asset-index.json'
    out.write_text(json.dumps({'schemaVersion': 1, 'base': CDN_BASE, 'count': len(index), 'assets': dict(sorted(index.items()))}, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'asset index: {len(index)} entries')


if __name__ == '__main__':
    gsids = set()
    for version in ['kids', 'teen']:
        ruleset = APP / 'data' / version / 'ruleset.json'
        if ruleset.exists():
            data = json.loads(ruleset.read_text())
            for c in data['cards'].values():
                gsids.update(c.get('gsids', []))
            for item in data['items'].values():
                icon = str(item.get('icon') or '')
                m = re.search(r'/(\d+)_', icon)
                if m and item.get('class') in (2, 3, 100):
                    gsids.add(int(m.group(1)))
    for version in sys.argv[1:] or ['kids']:
        Importer(version).run()
    asset_index(gsids)
