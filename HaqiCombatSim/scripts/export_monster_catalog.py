#!/usr/bin/env python3
"""Export original kids mob templates, placements and quest links; art is a separate plan."""
import argparse
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path
from export_quest_catalog import APP, record

# Deliberate Web visual substitutions, never original species identities or stats.
PET_FAMILIES = [
    ('snowman|icebon|firebon', 'celadon_dream_bear'),
    ('bear', 'celadon_dream_bear'), ('frostfang|wolf', 'fenrir_snow_bite'),
    ('phoenix', 'phoenix_spark_peep'), ('eagle', 'leiting_sonic_eagle'),
    ('monkey|ape', 'zodiac_monkey_qiqi'), ('octopus|scylla', 'kraken_gummy_tako'),
    ('scorpion', 'rose_quantum_scorpion'), ('snake', 'rainbow_serpent_drop'),
    ('manekineko|cat', 'pixel_orange_cat_pudding'), ('crab|shell', 'rock_candy_lighthouse_crab'),
    ('bee|beatle|beetle', 'liuli_beetle_deer'), ('dragon', 'zodiac_dragon_bobo'),
    ('tree|flower|fungus', 'nono_leaf_guardian'), ('rat|mouse', 'sea_grape_mouse_egret'),
    ('pangolin', 'yogurt_armadillo_fish'), ('bull|ox', 'pomegranate_bull_eel'),
    ('lizard|crocodile', 'molten_chestnut_raptor'), ('bubble', 'pili_doumo'),
    ('shrimp', 'longan_marten_shrimp'), ('ogre|stonemonster|mudmonster|blazehair', 'bronze_lulu_teen'),
    ('mummy|anubis', 'anubis_cocoa_pup'), ('nian|tiger', 'zodiac_tiger_tangtang'),
    ('bat', 'anlan_armor_bat'), ('rabbit', 'zodiac_rabbit_ruanruan'),
]
STORY_PORTRAITS = {'40112', '40285', '40286', '40287'}


def export(root, out):
    sources = {}
    def read(path):
        raw = (root / path).read_bytes()
        sources[path] = hashlib.sha256(raw).hexdigest()
        return raw
    quests = json.loads((out / 'quest-catalog.json').read_text())
    pets_raw = (APP / 'data/adventure/pets.json').read_bytes()
    pets = json.loads(pets_raw)['pets']
    for _, pet in PET_FAMILIES:
        if pet not in pets:
            raise ValueError('Unknown pet: ' + pet)
    goals = quests['tables']['goal_list_excel.xml']['goals']
    main_story = {q['id'] for q in quests['quests'] if q['group'][0] == '0' and not q['obsolete'] and q['island']}
    manifest = {}
    for line in read('assets_manifest.txt').decode().splitlines():
        path, md5, size = line.rsplit(',', 2)
        key = path[:-2].lower()
        if key not in manifest or path.endswith('.p'):
            manifest[key] = {'entry': line, 'path': path, 'md5': md5, 'size': int(size)}
    placements = []
    for file in sorted((root / 'config/Aries/WorldData').glob('*.Arenas_Mobs.xml')):
        path = file.relative_to(root).as_posix()
        try:
            tree = ET.fromstring(read(path))
        except ET.ParseError as error:
            raise ValueError(f'{path}: {error}') from error
        for index, arena in enumerate(tree.iter('arena')):
            if not any(m.get('mob_template') for m in arena.iter('mob')):
                continue
            placements.append({'id': f'{file.stem}:{index}', 'world': file.name.split('.Arenas_Mobs')[0],
                               'source': path, 'data': record(arena),
                               'templates': [m.get('mob_template') for m in arena.iter('mob') if m.get('mob_template')]})
    monsters = []
    template_data = {}
    invalid = []
    for file in sorted((root / 'config/Aries/Mob').rglob('*.xml')):
        path = file.relative_to(root).as_posix()
        raw = read(path)
        try:
            node = ET.fromstring(raw.decode('utf-8-sig').lstrip())
        except ET.ParseError as error:
            invalid.append({'source': path, 'error': str(error), 'rawXml': raw.decode('utf-8-sig')})
            continue
        template_data[path] = record(node)
        for index, mob in enumerate(node.iter('mob')):
            model = mob.get('asset', '')
            linked = [g for g in goals if g['path'].lower() == path.lower()]
            qids = sorted({qid for g in linked for qid in quests['goalQuestIds'].get(g['id'], [])})
            story = sorted(set(qids) & main_story)
            special = any(g['id'] in STORY_PORTRAITS for g in linked)
            boss_hint = special or bool(re.search(r'boss|首领|领主|伯爵|大王|君王', path + mob.get('displayname', ''), re.I))
            art = {'status': 'needs-selection'}
            # Main-story bosses keep their distinct original appearance.
            if story and boss_hint:
                art = {'status': 'original-model-required', 'reason': '剧情首领保留原版造型'}
            else:
                for pattern, pet in PET_FAMILIES:
                    if re.search(pattern, model, re.I):
                        art = {'status': 'pet-reuse-proposal', 'petId': pet, 'petName': pets[pet]['name'],
                               'reason': '按原模型族选择近似宠物外观，待美术核验；不替换战斗数值', 'modelPattern': pattern}
                        break
            original = {kind: manifest[key] for kind, key in [('model', model.lower()), ('thumbnail', model.lower() + '.png')]
                        if key in manifest}
            monsters.append({'id': f'{path}#{index}', 'source': path, 'name': mob.get('displayname', ''),
                             'model': model, 'attributes': dict(mob.attrib), 'data': record(mob),
                             'goalIds': [g['id'] for g in linked], 'questIds': qids, 'mainStoryQuestIds': story,
                             'bossCandidate': boss_hint, 'art': art, 'originalAssets': original})
    templates = {m['source'].lower() for m in monsters}
    referenced = {g['path'] for g in goals if g['path']} | {p for a in placements for p in a['templates']}
    report = {'templates': len(templates), 'monsters': len(monsters), 'arenaPlacements': len(placements),
              'petCatalogCount': len(pets), 'art': dict(Counter(m['art']['status'] for m in monsters)),
              'unparsedTemplates': len(invalid), 'missingTemplates': sorted(p for p in referenced if p.lower() not in templates)}
    result = {'version': 1, 'sources': sources, 'petCatalogSha256': hashlib.sha256(pets_raw).hexdigest(),
              'questCatalogSha256': hashlib.sha256((out / 'quest-catalog.json').read_bytes()).hexdigest(),
              'monsters': monsters, 'templates': template_data, 'placements': placements, 'unparsedTemplates': invalid, 'report': report}
    (out / 'monster-catalog.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(json.dumps(report | {'missingTemplates': len(report['missingTemplates'])}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=APP.parents[1])
    parser.add_argument('--out', type=Path, default=APP / 'data/adventure')
    args = parser.parse_args()
    export(args.root.resolve(), args.out)
