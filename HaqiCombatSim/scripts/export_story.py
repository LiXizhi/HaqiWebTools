#!/usr/bin/env python3
"""Read-only kids narrative projection. Writes ONLY docs/story generated artifacts.

No source scripts are evaluated. Registry tombstones preserve published identifiers.
--check verifies sources, mapping, coverage and byte-for-byte reproducibility.
"""
import argparse
import hashlib
import html
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/story'
REGIONS = ['camp', 'town', 'fire', 'ice', 'desert', 'dark']
NAMES = dict(zip(REGIONS, ['魔法营地', '哈奇岛', '火鸟岛', '寒冰岛', '沙漠岛', '幽暗岛']))
GENERIC = {'继续', '下一步', '关闭', '取消', '确定', '接受任务', '完成任务', '返回', '领取奖励'}


def digest(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def read(file):
    return json.loads((ROOT / file).read_text(encoding='utf-8-sig'))


def pointer(doc, path):
    for part in path.strip('/').split('/'):
        part = part.replace('~1', '/').replace('~0', '~')
        doc = doc[int(part)] if isinstance(doc, list) else doc[part]
    return doc


def clean(value):
    value = re.sub(r'\bscript/[^\s<>]+', '', str(value))
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', value))).strip()


def node_text(node, tag):
    return next((c.get('text', '') for c in node.get('children', []) if c['tag'] == tag), '')


class Exporter:
    def __init__(self):
        self.registry = read('docs/story/story-registry.json') if (OUT / 'story-registry.json').exists() else {'version': 1, 'nextScene': 1, 'scenes': {}}
        self.active_line_ids = {line['id'] for row in self.registry['scenes'].values() for line in row['lines'].values() if line.get('active')}
        for row in self.registry['scenes'].values():
            row['active'] = False
            for line in row['lines'].values():
                line['active'] = False
        self.scenes, self.filtered, self.issues, self.sources = [], [], [], {}
        self.catalog = self.load('data/adventure/quest-catalog.json')
        self.chapter = self.load('data/adventure/chapter.json')
        self.journal = self.load('data/adventure/quest-journal.json')
        self.runtime = self.load('data/adventure/quest-runtime.json')
        self.names = {113: '经验', 100: '奇豆', 17213: '仙豆', 984: '魔豆'}
        for item in self.catalog['tables']['reward_list.xml']['data'].get('children', []):
            ident = node_text(item, 'id')
            if ident.isdigit():
                self.names.setdefault(int(ident), node_text(item, 'name') or f'物品 {ident}')
        for q in self.journal['quests']:
            for g in q['rewards']:
                for item in g['items']:
                    if not item['name'].startswith('物品 '):
                        self.names.setdefault(int(item['id']), item['name'])
        for k, item in self.chapter['items'].items():
            self.names.setdefault(int(k), item.get('name', f'物品 {k}'))
        self.npcs = {str(k): v['name'] for k, v in self.chapter['npcs'].items()}
        for n in self.catalog['worldNpcs']:
            name = n.get('data', {}).get('attributes', {}).get('name')
            if name:
                self.npcs.setdefault(str(n['id']), name)

    def load(self, file):
        raw = (ROOT / file).read_bytes()
        self.sources[file] = hashlib.sha256(raw).hexdigest()
        return json.loads(raw)

    def scene(self, key, title, kind, region='camp', requires=None, **extra):
        regs = self.registry['scenes']
        if key not in regs:
            regs[key] = {'id': f'S{self.registry["nextScene"]:04d}', 'nextLine': 1, 'lines': {}}
            self.registry['nextScene'] += 1
        regs[key]['active'] = True
        s = dict(id=regs[key]['id'], key=key, title=clean(title), kind=kind, region=region,
                 requires=requires or [], lines=[], rewards=[], **extra)
        self.scenes.append(s)
        return s

    def line(self, s, key, text, speaker, phase, file, ptr, authority=None, action=None, force=False):
        if not text or not str(text).strip():
            return
        if clean(text) in GENERIC and not force:
            self.filtered.append({'scene': s['id'], 'file': file, 'pointer': ptr, 'reason': '通用界面按钮', 'text': text})
            return
        writable = s['kind'] == 'current' and authority is not None and authority.get('pointer') is not None
        line = dict(id=None, key=key, text=text, speaker=speaker, phase=phase,
                    source={'file': file, 'pointer': ptr, 'sha256': digest(text)},
                    author=authority, writable=writable, action=action)
        s['lines'].append(line)

    def rewards(self, groups, original=False):
        parts = []
        for g in groups:
            choices = int(g.get('choice', -1))
            items = g.get('items', [])
            desc = '、'.join(f'{self.names.get(int(x["id"]), x.get("name", "物品 " + str(x["id"])))} × {x.get("count", x.get("value", 1))}' for x in items)
            if not desc:
                continue
            flags = []
            if g.get('schoolFilter'):
                flags.append('按学系过滤')
            if choices > 0:
                flags.append(f'选取{choices}项' + ('' if original else '，当前按候选顺序发放'))
            parts.append(desc + (f'（{"；".join(flags)}）' if flags else ''))
        return '；'.join(parts) or '无配置奖励'

    def build(self):
        chapter_file = 'data/adventure/chapter.json'
        opening_file = 'config/opening-dialogue.json'
        self.load(opening_file)
        chapter_ids = {q['id'] for q in self.chapter['quests']}
        for i, q in enumerate(self.chapter['quests']):
            s = self.scene(f'chapter:{q["id"]}', q['title'], 'current', questId=q['id'], requires=q['requires'], objective=q['description'], classification='教学主线', level=0)
            s['rewards'] = q['rewards']
            s['rewardSource'] = {'file': chapter_file, 'pointer': f'/quests/{i}/rewards', 'readOnly': True}
            self.line(s, 'description', q['description'], '任务', '目标', chapter_file, f'/quests/{i}/description', {'file': opening_file, 'pointer': f'/quests/{q["id"]}/description', 'generator': 'scripts/export_adventure.py'})
            blocks = [('startDialog', q['startDialog'], '接取', f'/quests/{i}/startDialog', f'/quests/{q["id"]}/startDialog')]
            for ti, talk in enumerate(q['talks']):
                blocks.append((f'talk:{talk["npcId"]}', talk['dialog'], '交谈', f'/quests/{i}/talks/{ti}/dialog', f'/quests/{q["id"]}/talks/{talk["npcId"]}/dialog'))
            blocks.append(('endDialog', q['endDialog'], '交付', f'/quests/{i}/endDialog', f'/quests/{q["id"]}/endDialog'))
            for block, rows, phase, base, authorbase in blocks:
                for j, row in enumerate(rows):
                    self.line(s, f'{block}:{j}:text', row['text'], self.npcs.get(str(row['npcId']), str(row['npcId'])), phase, chapter_file, f'{base}/{j}/text', {'file': opening_file, 'pointer': f'{authorbase}/{j}/text', 'generator': 'scripts/export_adventure.py'})
                    for b, button in enumerate(row['buttons']):
                        if j == len(rows) - 1 or b > 0:
                            self.filtered.append({'scene': s['id'], 'file': chapter_file, 'pointer': f'{base}/{j}/buttons/{b}/label', 'reason': '当前UI仅显示首按钮，末句由通用完成动作按钮替代', 'text': button['label']})
                            continue
                        self.line(s, f'{block}:{j}:button:{b}', button['label'], '我', phase, chapter_file, f'{base}/{j}/buttons/{b}/label', {'file': opening_file, 'pointer': f'{authorbase}/{j}/reply', 'generator': 'scripts/export_adventure.py'}, button['action'])
        runtime = {q['id']: q for q in self.runtime['quests']}
        for i, q in enumerate(self.journal['quests']):
            if q['id'] in chapter_ids:
                continue
            r = runtime[q['id']]
            s = self.scene(f'journal:{q["id"]}', q['title'], 'current', q['region'], questId=q['id'], requires=[p['id'] for p in r['prerequisites'] if p['value'] > 0], classification='独立任务／可选支线', level=max([int(x.get('min') or 0) for x in q['requirements']] or [0]), conditions=r['requirements'], repeat=q['repeat'] == '1', objective=q['description'])
            s['rewards'] = r['rewards']
            s['rewardSource'] = {'file': 'data/adventure/quest-runtime.json', 'questId': q['id'], 'readOnly': True}
            self.line(s, 'description', q['description'], '任务', '任务说明', 'data/adventure/quest-journal.json', f'/quests/{i}/description', {'file': '../../config/Aries/Quests/quest_list.xml', 'selector': f'Quest[Id={q["id"]}]/Detail', 'generator': 'scripts/export_quest_catalog.py → scripts/package_quests.mjs'})
            s['note'] = f'接取：{q["startNpc"]}；交付：{q["endNpc"]}。当前执行通用任务流程，原版对白见文末同名场景。'
        for i, q in enumerate(self.catalog['quests']):
            s = self.scene(f'original:{q["id"]}', q['title'], 'obsolete' if q['obsolete'] else 'original', q.get('island') or 'other', questId=q['id'], requires=[int(r['id']) for r in q['requires'] if str(r['id']).isdigit() and int(r.get('value') or 1) > 0], classification='历史任务' if q['obsolete'] else '原版待恢复', objective=q['description'])
            s['originalConditions'] = q['requires']
            self.walk_xml(s, q['data'], f'/quests/{i}/data', '原版', str(q['startNpc']))
            phase_order = {'原版': 0, '接取': 1, '进行中': 2, '指定交谈': 3, '交付': 4}
            s['lines'].sort(key=lambda line: phase_order.get(line['phase'], 2))
            reward = next((c for c in q['data'].get('children', []) if c['tag'] == 'Reward'), {})
            for g in reward.get('children', []):
                a = g['attributes']
                s['rewards'].append({'choice': int(a.get('choice', -1)), 'schoolFilter': a.get('schoolfilter') == '1', 'items': [{'id': int(x['attributes']['id']), 'count': x['attributes']['value']} for x in g.get('children', [])]})
            s['rewardNote'] = '原版配置，非网页新增发放承诺。'
        self.conversations()
        self.journeys()
        self.courses()
        self.movies()
        self.residents()
        for file in ['js/language_story.js', 'js/language_encounter_core.js', 'js/adventure_core.js', 'js/adventure_catalog_quests_core.js', 'js/adventure_dungeon_story.js', 'js/combat_params_core.js', 'js/view_red_mushroom.js', 'js/view_adventure.js', 'js/adventure_npc_core.js', 'js/adventure_npc_art_core.js']:
            self.sources[file] = hashlib.sha256((ROOT / file).read_bytes()).hexdigest()
        self.title_sources()
        return self

    def residents(self):
        file = 'data/adventure/npc-catalog.json'
        data = self.load(file)
        art = self.load('data/adventure/npc-art.json')
        for i, npc in enumerate(data['npcs']):
            if npc.get('gossip'):
                g = self.scene('gossip:' + npc['instanceId'], npc['name'] + '：原版招呼', 'original', npc['zone'], classification='原版招呼／当前网页未播放')
                for j, row in enumerate(npc['gossip']):
                    self.line(g, str(j), row.get('text'), npc['name'], '原版招呼', file, f'/npcs/{i}/gossip/{j}/text')
            service = str(npc['id']) in data['mentors'] or any(r['npcId'] == npc['id'] for r in data['shops'])
            for button in npc.get('buttons', []):
                ident = str(button.get('param1') or npc['id'])
                if 'NPCShopPage.ShowPage' in button.get('dofunction', '') or ('LearnSkill' in button.get('dofunction', '') and ident in data['mentors']):
                    service = True
            hidden = npc.get('hidden', npc['zone'] == 'town' and str(npc['id']) not in self.chapter['npcs'] and not service)
            active = not hidden and npc.get('enabled') != '0' and art['instances'][npc['instanceId']].get('visible') is not False
            if not npc.get('description'):
                self.filtered.append({'file': file, 'pointer': f'/npcs/{i}', 'reason': '无专属介绍，游戏使用通用欢迎语'})
                continue
            s = self.scene('resident:' + npc['instanceId'], npc['name'] + '：日常交谈', 'current' if active else 'inactive', npc['zone'], classification='可选居民交谈' if active else '停用居民原资料', conditions={'enabled': npc.get('enabled'), 'hidden': hidden})
            self.line(s, 'description', npc['description'], npc['name'], '无任务对白时', file, f'/npcs/{i}/description', {'file': '../../' + npc['source'], 'selector': {'npcId': npc['id'], 'instanceId': npc['instanceId'], 'field': 'item_ex/desc'}, 'generator': 'scripts/export_npc_catalog.py'})

    def title_sources(self):
        collections = {
            'chapter:': ('data/adventure/chapter.json', 'quests', self.chapter['quests'], 'title'),
            'journal:': ('data/adventure/quest-journal.json', 'quests', self.journal['quests'], 'title'),
            'original:': ('data/adventure/quest-catalog.json', 'quests', self.catalog['quests'], 'title'),
            'journey:': ('data/adventure/dungeon-journeys.json', 'entries', read('data/adventure/dungeon-journeys.json')['entries'], 'name'),
            'course:': ('data/adventure/language-courses.json', 'courses', read('data/adventure/language-courses.json')['courses'], 'title'),
        }
        for s in self.scenes:
            for prefix, (file, collection, items, field) in collections.items():
                if not s['key'].startswith(prefix):
                    continue
                ident = s['key'] if prefix == 'journey:' else s['key'][len(prefix):]
                i = next(i for i, item in enumerate(items) if str(item['id']) == ident)
                s['titleSource'] = {'file': file, 'pointer': f'/{collection}/{i}/{field}', 'sha256': digest(items[i][field]), 'writable': prefix == 'journey:'}
                if prefix in ('chapter:', 'journal:', 'original:'):
                    s['titleSource']['author'] = {'file': '../../config/Aries/Quests/quest_list.xml', 'selector': f'Quest[Id={ident}]/Title', 'requiresManualReview': True}
                break

    def walk_xml(self, s, node, ptr, phase, npc):
        phases = {'StartDialog': '接取', 'ProgressingDialog': '进行中', 'EndDialog': '交付', 'ClientDialogNPC': '指定交谈'}
        phase = phases.get(node['tag'], phase)
        npc = node_text(node, 'id') or npc
        if node['tag'] in ('content', 'Detail') and node.get('text'):
            self.line(s, ptr + '/text', node['text'], '任务' if node['tag'] == 'Detail' else self.npcs.get(npc, f'居民 {npc}'), phase, 'data/adventure/quest-catalog.json', ptr + '/text')
        if node['tag'] == 'button' and node['attributes'].get('label'):
            self.line(s, ptr + '/attributes/label', node['attributes']['label'], '我／选项', phase, 'data/adventure/quest-catalog.json', ptr + '/attributes/label', action=node['attributes'].get('action'))
        for i, child in enumerate(node.get('children', [])):
            self.walk_xml(s, child, f'{ptr}/children/{i}', phase, npc)

    def conversations(self):
        file = 'data/adventure/camp-conversations.json'
        data = self.load(file)
        for i, profile in enumerate(data['profiles']):
            for j, story in enumerate(profile['stories']):
                active = profile['source']['active']
                s = self.scene('conversation:' + story['id'], profile['name'] + '：' + story['title'], 'current' if active else 'inactive', requires=[story['requiresQuest']] if story.get('requiresQuest') else [], storyId=story['id'], classification='可选交流／配音入口', conditions={'requiresPet': story.get('requiresPet', False)}, level=0)
                s['note'] = '交流中的物品与动作是话题，不代替主线操作；回答是示例，可使用已支持的同义表达。'
                s['rewardNote'] = '完成按课程账本结算；基础通常10奇豆，独立表达挑战通常30仙豆，受共享次数与每日额度限制。配音另走全局临时加成。'
                author = {'file': story.get('authorSource', 'scripts/prepare_camp_conversations.mjs'), 'selector': {'npcId': profile['npcId'], 'storyId': story['id']}, 'dependencies': ['scripts/language_patterns.mjs'], 'generator': 'scripts/prepare_camp_conversations.mjs'}
                base = f'/profiles/{i}/stories/{j}'
                # The live controller starts with turn[0].question; opening duplicates it.
                if story.get('opening'):
                    self.filtered.append({'scene': s['id'], 'file': file, 'pointer': base + '/opening/zh-CN', 'reason': '控制器以第一轮问题开场，opening不单独显示'})
                for k, turn in enumerate(story['turns']):
                    for field, speaker in [('question', profile['name']), ('answer', '我'), ('response', profile['name'])]:
                        if field == 'response' and k != len(story['turns']) - 1:
                            self.filtered.append({'scene': s['id'], 'file': file, 'pointer': f'{base}/turns/{k}/response/zh-CN', 'reason': '非末轮response当前控制器不呈现'})
                            continue
                        self.line(s, turn['id'] + ':' + field, turn[field]['zh-CN'], speaker, f'第{k+1}轮', file, f'{base}/turns/{k}/{field}/zh-CN', {**author, 'field': field, 'turnId': turn['id']}, force=True)
                self.filtered.append({'scene': s['id'], 'file': file, 'pointer': base + '/ending', 'reason': '当前控制器结束于末轮response，未呈现ending字段'})

    def journeys(self):
        file = 'data/adventure/dungeon-journeys.json'
        for i, d in enumerate(self.load(file)['entries']):
            s = self.scene(d['id'], d['name'], 'current', d['island'], storyId=d['id'], classification='可选副本入场／配音入口', level=d['recommendedLevel'])
            s['note'] = '全部对白发生在入场时；文中行动是故事叙述，不表示已有机关、送信或战后结局交互。'
            s['rewardNote'] = ('战斗经验与货币依实际怪物结算；宝箱额外奖励未据故事台词推定。' if d['kind'] == 'elite' else f'共{d["floors"]}层；每10层领取里程碑奖励，金额以试炼塔规则与实际进度计算。')
            for j, row in enumerate(d['story']):
                ptr = f'/entries/{i}/story/{j}/text'
                self.line(s, row['id'], row['text'], row['speaker'], '入场', file, ptr, {'file': file, 'pointer': ptr}, force=True)

    def courses(self):
        file = 'data/adventure/language-courses.json'
        for i, c in enumerate(self.load(file)['courses']):
            s = self.scene('course:' + c['id'], c['title'], 'current', classification='可选基础交流／按情境触发', conditions={'events': c['events'], 'requiresItem': c['requiresItem']})
            author = {'file': 'scripts/prepare_language_adventure.mjs', 'selector': {'courseId': c['id']}, 'generator': 'scripts/prepare_language_adventure.mjs'}
            self.line(s, 'scenario', c['scenario'], '情境', '挑战', file, f'/courses/{i}/scenario', author)
            for j, pair in enumerate(c['pairs']):
                for field, speaker in [('question', '交流对象'), ('answer', '我')]:
                    self.line(s, pair['id'] + ':' + field, pair[field], speaker, '基础示例', file, f'/courses/{i}/pairs/{j}/{field}', author, force=True)
            s['rewardNote'] = '基础通常10奇豆；挑战按档位30／50／80仙豆，受角色共享日额度及次数限制；非每条示例独立领奖。'

    def movies(self):
        base = ROOT.parent.parent / 'config/Aries/StaticMovies'
        if not base.exists():
            self.issues.append('本机缺少原版StaticMovies，无法导出过场正文')
            return
        for file in sorted(base.glob('*.xml')):
            if 'teen' in file.name.lower():
                continue
            rel = '../../config/Aries/StaticMovies/' + file.name
            try:
                root = ET.fromstring(file.read_bytes())
            except ET.ParseError as error:
                self.issues.append(f'{rel}: {error}')
                continue
            frames = [(mi, li, fi, f) for mi, m in enumerate(root) for li, line in enumerate(m) if line.get('TargetType') == 'Text' for fi, f in enumerate(line) if f.text and f.text.strip()]
            if not frames:
                continue
            self.sources[rel] = hashlib.sha256(file.read_bytes()).hexdigest()
            s = self.scene('movie:' + file.stem, '原版过场：' + clean(frames[0][3].text)[:24], 'original', 'other', classification='原版非teen过场／实际启用待核验')
            for mi, li, fi, frame in frames:
                key = f'{mi}/{li}/{fi}'
                self.line(s, key, frame.text.strip(), '过场字幕', '原版过场', rel, 'xml:' + key)

    def ordered(self, kind):
        pending = [s for s in self.scenes if s['kind'] == kind]
        pending.sort(key=lambda s: (REGIONS.index(s['region']) if s['region'] in REGIONS else 6, s.get('level', 0), self.scenes.index(s)))
        result, done = [], set()
        all_quests = {s.get('questId') for s in pending}
        while pending:
            ready = next((s for s in pending if all(q in done or q not in all_quests for q in s['requires'])), None)
            if ready is None:
                self.issues.append(f'{kind}: 前置环或无法确定顺序：' + ','.join(s['id'] for s in pending))
                result.extend(pending)
                break
            pending.remove(ready)
            result.append(ready)
            if ready.get('questId'):
                done.add(ready['questId'])
        return result

    def render(self, scenes):
        rows = []
        region = None
        for s in scenes:
            if s['region'] != region:
                region = s['region']
                rows += [f'## {NAMES.get(region, "其他地区与独立故事")}', '']
            rows += [f'### [{s["id"]}] {s["title"]}', '', f'> {s["classification"]}' + (' · 可重复' if s.get('repeat') else ''), '']
            if s['requires']:
                rows += ['> 前置：' + '、'.join(self.quest_link(q, s['kind']) for q in s['requires']), '']
            if s.get('conditions'):
                if isinstance(s['conditions'], list):
                    for c in s['conditions']:
                        if c.get('id') == 214:
                            rows += [f'> 等级条件：{c["min"]}' + (f'—{c["max"]}' if c.get('max') is not None else '起') + '（原配置；实际接取还受当前运行时校验）。', '']
                elif s['conditions'].get('requiresPet'):
                    rows += ['> 需要已有可用宠物。', '']
            if s.get('note'):
                rows += [s['note'], '']
            phase = None
            for line in s['lines']:
                if line['phase'] != phase:
                    phase = line['phase']
                    rows += [f'**{phase}**', '']
                rows += [f'[{line["id"]}] {line["speaker"]}：{clean(line["text"])}', '']
            if s['rewards']:
                rows += ['**奖励**：' + self.rewards(s['rewards'], s['kind'] in ('original', 'obsolete')), '']
            if s.get('rewardNote'):
                rows += ['**奖励说明**：' + s['rewardNote'], '']
        return rows

    def quest_link(self, qid, kind):
        s = next((s for s in self.scenes if s.get('questId') == qid and s['kind'] == kind), None)
        return f'[{s["id"]}] {s["title"]}' if s else f'任务 {qid}（本部分外的条件，不假定已完成）'

    def validate(self):
        ids = set()
        cache = {}
        for s in self.scenes:
            assert s['id'] not in ids
            ids.add(s['id'])
            for i, line in enumerate(s['lines']):
                assert line['id'] not in ids
                ids.add(line['id'])
                line['previous'] = s['lines'][i-1]['id'] if i else None
                line['next'] = s['lines'][i+1]['id'] if i+1 < len(s['lines']) else None
                src = line['source']
                if not src['pointer'].startswith('xml:'):
                    if src['file'] not in cache:
                        cache[src['file']] = read(src['file'])
                    assert pointer(cache[src['file']], src['pointer']) == line['text'], line['id']
                else:
                    if src['file'] not in cache:
                        cache[src['file']] = ET.fromstring((ROOT / src['file']).read_bytes())
                    node = cache[src['file']]
                    for n in src['pointer'][4:].split('/'):
                        node = node[int(n)]
                    assert node.text.strip() == line['text'], line['id']
                if line['writable']:
                    a = line['author']
                    if a['file'] not in cache:
                        cache[a['file']] = read(a['file'])
                    assert pointer(cache[a['file']], a['pointer']) == line['text'], f'作者源与快照不一致: {line["id"]}'
                if line['author']:
                    for file in [line['author']['file'], *line['author'].get('dependencies', [])]:
                        if file not in self.sources and (ROOT / file).exists():
                            self.sources[file] = hashlib.sha256((ROOT / file).read_bytes()).hexdigest()
        assert len({s['questId'] for s in self.scenes if s['kind'] in ('original', 'obsolete') and 'questId' in s}) == len(self.catalog['quests'])

    def assign_lines(self):
        """Preserve text identities on insertion/reordering, including positional XML.

        A changed text at the same key keeps its ID only when its former text has
        not moved elsewhere. Duplicated text uses the exact key; ambiguous moves
        get new IDs with an explicit report, never somebody else's identity.
        """
        for s in self.scenes:
            reg = self.registry['scenes'][s['key']]
            old = [{**v, 'key': v.get('key', k)} for k, v in reg['lines'].items()]
            by_id = {v['id']: {**v, 'active': False} for v in old}
            used = set()
            incoming = {digest(l['text']) for l in s['lines']}
            for line in s['lines']:
                fingerprint = digest(line['text'])
                matches = [v for v in old if v['id'] in self.active_line_ids and v['id'] not in used and v.get('hash') == fingerprint and v.get('speaker') == line['speaker'] and v.get('phase') == line['phase']]
                same = next((v for v in old if v['id'] in self.active_line_ids and v['id'] not in used and v['key'] == line['key']), None)
                chosen = next((v for v in matches if v['key'] == line['key']), None)
                if chosen is None and len(matches) == 1:
                    chosen = matches[0]
                if chosen is None and not matches and same and (not same.get('hash') or same['hash'] not in incoming):
                    chosen = same
                if chosen is None:
                    ident = f'{s["id"]}-L{reg["nextLine"]:02d}'
                    reg['nextLine'] += 1
                    if len(matches) > 1:
                        self.issues.append(f'{ident}: 重复文字移位存在歧义，分配新编号，旧编号停用待编辑核对')
                else:
                    ident = chosen['id']
                used.add(ident)
                line['id'] = ident
                by_id[ident] = {'id': ident, 'key': line['key'], 'hash': fingerprint, 'speaker': line['speaker'], 'phase': line['phase'], 'active': True}
            reg['lines'] = by_id

    def outputs(self):
        self.assign_lines()
        current, original = self.ordered('current'), self.ordered('original')
        self.validate()
        intro = ['# 魔法哈奇故事总稿', '', '> 当前可见故事与原版待恢复故事分开阅读。正文保留来源文字，不添加小说式衔接；顺序是一条符合已知前置的建议路线，不是新增任务限制。', '',
                 '自由支线可不按此顺序游玩。目标和对白中的动作不自动表示已有机关或交互；等级、物品等条件仍由游戏校验。通用按钮和纯技术信息移至索引。', '',
                 '配音共用当天临时加成：有效语音按现有入口规则增加属性，生命／攻击／防御各最多10%，之后超级魔力生成率最多10%；本机午夜重置。它不等于任务物品奖励，也不代表语言掌握程度。', '',
                 '本稿不是一条已经连贯的小说：通用任务之间没有原对白衔接的地方保持原貌。改写及新情节请看 [故事设计](story-design.md) 和 [三档样章](story-samples.md)。', '', '# 第一部：当前可见故事', '']
        index = {'version': 1, 'sources': dict(sorted(self.sources.items())), 'scenes': self.scenes, 'filtered': self.filtered, 'issues': self.issues}
        counts = {k: len([s for s in self.scenes if s['kind'] == k]) for k in ['current', 'original', 'obsolete', 'inactive']}
        report = ['# 故事导出检查报告', '', f'- 场景分类：{json.dumps(counts, ensure_ascii=False)}', f'- 原任务归属：{len(self.catalog["quests"])} / {len(self.catalog["quests"])}。', f'- 正文条目：{sum(len(s["lines"]) for s in self.scenes)}；过滤记录：{len(self.filtered)}。', '- 全部JSON文字字段精确回读一致；可回写作者源与快照一致；编号唯一。', '- 未执行Lua、未生成运行时数据、未读取玩家存档。', '', '## 实际边界', '', '- 红蘑菇当前入口为模式、备战、匹配和战斗规则，没有固定叙事对白树；不把按钮和数值规则伪装成故事。', '- 通用任务仅展示当前任务说明，原对白另列；不存在的剧情衔接没有补造。', '- 非teen过场保留独立原文，未证明每个文件仍被儿童版入口调用，不能作为已启用剧情。', '- 场景事件脚本的全部叙事字符串与动态拼接未穷举；不执行脚本，未迁移机关与宝箱仍需逐场景审计。', '- 动态AI聊天、原版音频无字幕内容不生成虚构逐字稿。', '- 生成脚本作者源提供语义选择器，未提供安全JSON写入定位的条目标为不可直接回写。', '- 主支线分类不明的任务保留“独立任务”，原等级条件不是网页实际可接取证明。', '- 配置报酬与对白的语义承诺尚需编辑逐章复核；自动检查不判断角色是否在撒谎。', '- 文学吸引力、真实麦克风与不同年龄阅读效果待真实读者验证。', '', '## 排序与来源问题', ''] + (['- ' + x for x in self.issues] or ['- 无前置环或解析错误。'])
        return {
            'story-master.md': '\n'.join(intro + self.render(current) + ['# 第二部：原版待恢复故事', '', '下文不代表网页当前可见；原始奖励仅供核对。', ''] + self.render(original)) + '\n',
            'story-history.md': '\n'.join(['# 废除任务与停用课程档案', '', '保留历史，不恢复开放。', ''] + self.render(self.ordered('obsolete') + self.ordered('inactive'))) + '\n',
            'story-index.json': json.dumps(index, ensure_ascii=False, indent=2) + '\n',
            'story-registry.json': json.dumps(self.registry, ensure_ascii=False, indent=2) + '\n',
            'story-report.md': '\n'.join(report) + '\n',
        }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    outputs = Exporter().build().outputs()
    if args.check:
        stale = [name for name, body in outputs.items() if not (OUT / name).exists() or (OUT / name).read_text(encoding='utf-8') != body]
        if stale:
            raise SystemExit('故事产物过期：' + ', '.join(stale))
        print('故事覆盖、来源定位、稳定编号和重复导出检查通过。')
    else:
        OUT.mkdir(parents=True, exist_ok=True)
        for name, body in outputs.items():
            (OUT / name).write_text(body, encoding='utf-8', newline='\n')
        print('已写入 docs/story 的五份生成产物；人工稿不会覆盖。')


if __name__ == '__main__':
    main()
