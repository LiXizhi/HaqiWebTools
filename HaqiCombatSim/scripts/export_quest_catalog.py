#!/usr/bin/env python3
"""Archive every kids quest and its reference tables without executing source scripts.

Catalog availability does not imply gameplay support. Original strings, conditions,
ordering, repeated XML elements and dialogue actions remain authoritative.
"""
import argparse
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
ISLANDS = {'42': 'camp', '0': 'town', '1': 'fire', '2': 'ice', '5': 'desert', '6': 'dark'}
OBJECTIVES = {'Goal': 'goal_list_excel.xml', 'GoalItem': 'quest_item_list.xml',
              'ClientGoalItem': 'client_item_list.xml', 'ClientExchangeItem': 'client_exchange_item_list.xml',
              'FlashGame': 'flash_game_list.xml', 'ClientDialogNPC': 'npc_list.xml',
              'CustomGoal': 'custom_goal_list.xml'}


def scalar(node, name):
    return (node.findtext(name) or '').strip()


def record(node):
    # Arrays preserve duplicate tags and source order; no coercion of flags/expressions.
    result = {'tag': node.tag, 'attributes': dict(node.attrib)}
    if node.text and node.text.strip():
        result['text'] = node.text.strip()
    if len(node):
        result['children'] = [record(child) for child in node]
    if node.tail and node.tail.strip():
        result['tail'] = node.tail.strip()
    return result


def export(root, out):
    sources = {}
    def read(path):
        raw = (root / path).read_bytes()
        sources[path] = hashlib.sha256(raw).hexdigest()
        return raw
    def xml(path):
        return ET.fromstring(read(path))
    tables = {}
    nodes = {}
    invalid_tables = []
    # Include all kids quest configuration, including disabled/event/repeat definitions.
    for file in sorted((root / 'config/Aries/Quests').glob('*.xml')):
        path = file.relative_to(root).as_posix()
        raw = read(path)
        try:
            node = ET.fromstring(raw)
        except ET.ParseError as error:
            if file.name in {*OBJECTIVES.values(), 'quest_list.xml'}:
                raise
            tables[file.name] = {'source': path, 'rawXml': raw.decode('utf-8-sig'), 'parseError': str(error)}
            invalid_tables.append(file.name)
            continue
        nodes[file.name] = node
        if file.name != 'quest_list.xml':
            tables[file.name] = {'source': path, 'data': record(node)}
    lookup = {name: {scalar(e, 'id'): e for e in node if scalar(e, 'id')}
              for name, node in nodes.items()}
    # QuestHelp.LoadAllXmlFiles L2046-2055 uses Excel goals and world NPCs.
    ns = '{urn:schemas-microsoft-com:office:spreadsheet}'
    goals = []
    for index, row in enumerate(nodes['goal_list_excel.xml'].iter(ns + 'Row')):
        cells = {}; column = 1
        for cell in row:
            column = int(cell.get(ns + 'Index', column))
            cells[column] = ''.join(cell.itertext()).strip(); column += 1
        if not cells.get(1, '').isdigit():
            continue
        goals.append(dict(zip(['id', 'name', 'path', 'instance', 'level', 'world', 'worldLabel', 'place', 'enabled', 'helpfunction', 'position'],
                              [cells.get(i, '') for i in range(1, 12)]), sourceRow=index + 1))
    lookup['goal_list_excel.xml'] = {g['id']: g for g in goals}
    tables['goal_list_excel.xml']['goals'] = goals
    world_npcs = []
    for world in nodes['worlds_list.xml']:
        path = scalar(world, 'npcfile')
        if not path or not (root / path).exists():
            continue
        for npc in xml(path).findall('.//NPC'):
            world_npcs.append({'id': npc.get('npc_id'), 'world': scalar(world, 'worldname'), 'source': path, 'data': record(npc)})
            lookup['npc_list.xml'][npc.get('npc_id')] = npc
    lookup['custom_goal_list.xml'] = {**lookup['reward_list.xml'], **lookup['custom_goal_list.xml']}
    chapter = json.loads((APP / 'data/adventure/chapter.json').read_text())
    playable = {q['id'] for q in chapter['quests']}
    quests = []
    missing = []
    goal_quests = {}
    ids = [int(scalar(q, 'Id')) for q in nodes['quest_list.xml']]
    if len(set(ids)) != len(ids):
        raise ValueError('Duplicate quest IDs')
    for q in nodes['quest_list.xml']:
        qid = int(scalar(q, 'Id'))
        refs = []
        for tag, table in OBJECTIVES.items():
            for item in q.findall(tag + '/item'):
                rid = item.get('id', '')
                refs.append({'type': tag, 'id': rid, 'table': table})
                if rid not in lookup[table]:
                    missing.append({'questId': qid, 'type': tag, 'id': rid, 'table': table})
                if tag == 'Goal':
                    goal_quests.setdefault(rid, set()).add(qid)
                if tag == 'GoalItem':
                    producers = re.findall(r'\d+', item.get('producer_id', '') + ',' + item.get('append_producer_id_list', ''))
                    for producer in producers:
                        if producer == '0':
                            continue
                        goal_quests.setdefault(producer, set()).add(qid)
                        if producer not in lookup['goal_list_excel.xml']:
                            missing.append({'questId': qid, 'type': 'producer', 'id': producer, 'table': 'goal_list_excel.xml'})
        for tag in ['StartNPC', 'EndNPC']:
            rid = scalar(q, tag)
            if rid not in ('', '0', '-1') and rid not in lookup['npc_list.xml']:
                missing.append({'questId': qid, 'type': tag, 'id': rid, 'table': 'npc_list.xml'})
        for item in q.findall('RequestQuest/item'):
            rid = item.get('id', '')
            if rid and int(rid) not in ids:
                missing.append({'questId': qid, 'type': 'RequestQuest', 'id': rid, 'table': 'quest_list.xml'})
        quests.append({'id': qid, 'title': scalar(q, 'Title'), 'description': scalar(q, 'Detail'),
                       'island': ISLANDS.get(scalar(q, 'QuestGroup2')),
                       'group': [scalar(q, 'QuestGroup' + str(i)) for i in (1, 2, 3)],
                       'obsolete': scalar(q, 'Obsolesced') == '1',
                       'startNpc': scalar(q, 'StartNPC'), 'endNpc': scalar(q, 'EndNPC'),
                       'requires': [dict(e.attrib) for e in q.findall('RequestQuest/item')],
                       'references': refs, 'runtimeStatus': 'opening-adaptation' if qid in playable else 'catalog-only',
                       'source': 'config/Aries/Quests/quest_list.xml', 'data': record(q)})
    quests.sort(key=lambda q: q['id'])
    by_island = {zone: [q['id'] for q in quests if q['island'] == zone] for zone in ISLANDS.values()}
    report = {'unparsedTables': invalid_tables, 'total': len(quests), 'obsolete': sum(q['obsolete'] for q in quests),
              'islands': {zone: {'total': len(qids), 'active': sum(not q['obsolete'] for q in quests if q['id'] in qids)} for zone, qids in by_island.items()},
              'otherGroups': dict(Counter(q['group'][1] for q in quests if q['island'] is None)),
              'runtimeStatuses': dict(Counter(q['runtimeStatus'] for q in quests)), 'missingReferences': missing}
    result = {'version': 1, 'sources': sources, 'quests': quests, 'islands': by_island,
              'goalQuestIds': {k: sorted(v) for k, v in sorted(goal_quests.items())},
              'tables': tables, 'worldNpcs': world_npcs, 'report': report}
    out.mkdir(parents=True, exist_ok=True)
    (out / 'quest-catalog.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(json.dumps(report | {'missingReferences': len(missing)}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=APP.parents[1])
    parser.add_argument('--out', type=Path, default=APP / 'data/adventure')
    args = parser.parse_args()
    export(args.root.resolve(), args.out)
