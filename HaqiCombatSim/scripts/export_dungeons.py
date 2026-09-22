"""Deterministic kids instance export; never execute world/mob Lua scripts."""
import argparse, base64, hashlib, json, re, xml.etree.ElementTree as ET
from pathlib import Path
from lib.lua_data import LuaData
APP = Path(__file__).resolve().parents[1]

def export(root, out):
    sources = {}
    def read(path):
        raw = (root / path).read_bytes()
        sources[path] = hashlib.sha256(raw).hexdigest()
        return raw
    def tree(path):
        return ET.fromstring(read(path))
    def number(v):
        try: return float(v) if '.' in v else int(v)
        except (ValueError, TypeError): return v
    raw = base64.b64decode(read('Database/globalstore.db.mem'))
    key = b'Copyright@ParaEngine, LiXizhi\0'
    rows = LuaData(bytes(v ^ key[i % len(key)] for i, v in enumerate(raw)).decode()).value()
    cards = json.loads((APP / 'data/kids/cards.json').read_text())
    card_items = {str(r[0]):r[12].partition('_')[2] for r in rows if isinstance(r[12],str) and r[12].partition('_')[2] in cards}
    monsters, invalid = {}, {}
    def monster(path):
        if path in monsters or path in invalid: return
        try:
            r = tree(path); m = r.find('mob')
            if m is None: raise ValueError('缺少 mob')
            def card(value): return card_items.get(value, value)
            def pool(text): return [{'key':card(a),'weight':int(b)} for a,b in re.findall(r'\((\d+),(\d+)\)',text)]
            sequences = [[{**n.attrib,'card':card(n.get('card',''))} for n in seq] for seq in r.findall('sequences/sequence')]
            genes = [{**n.attrib, **({'card':card(n.get('card'))} if n.get('card') else {})} for n in r.findall('genes/gene')]
            monsters[path] = dict(id=path, source=path, name=m.get('displayname') or m.get('name') or '副本守卫',
                school=m.get('phase'), level=int(m.get('level','1')), hp=int(m.get('hp','0')),
                xp=int(m.get('experience_pts','0')), coins=int(m.get('joybean_count','0')),
                attributes={k:number(v) for k,v in m.attrib.items()},pool=pool(m.get('available_cards','')),
                sequences=sequences,genes=genes,cardsets={n.get('id'):pool(n.get('cards','')) for n in r.findall('cardsets/set')},
                originalXml=ET.tostring(r,encoding='unicode'))
        except (OSError, ET.ParseError, ValueError) as e: invalid[path] = str(e).replace(str(root),'源目录')
    source = 'config/Aries/Scene/AriesGameWorlds.config.xml'
    worlds = []
    for w in tree(source).findall('World'):
        if w.get('version') == 'teen' or '/Instances/' not in w.get('worldpath',''): continue
        name = w.get('name'); path = f'config/Aries/WorldData/{name}.Arenas_Mobs.xml'
        row = dict(id='dungeon:'+name, name=w.get('world_title') or name, source=source, attributes=dict(w.attrib),arenas=[], warnings=[])
        try:
            r = tree(path); row['arenaSource']=path; row['originalArenaXml']=ET.tostring(r,encoding='unicode')
            row['difficultyModifiers']=[dict(n.attrib) for n in r.findall('difficulty_modifier/modifier')]
            for i,a in enumerate(r.iter('arena')):
                slots=[n.get('mob_template','') for n in a.findall('mob')]
                if not any(slots): continue
                for p in filter(None,slots): monster(p)
                position=[float(v) for v in a.get('position','').split(',')]
                if len(position)!=3: raise ValueError('出生点坐标无效')
                row['arenas'].append(dict(id=f'{row["id"]}:{i}',sourceId=a.get('id'),attributes=dict(a.attrib),position=position,slots=slots))
        except (OSError, ET.ParseError, ValueError) as e: row['warnings'].append(str(e).replace(str(root),'源目录'))
        row['monsterCount']=sum(bool(p) for a in row['arenas'] for p in a['slots'])
        levels=[monsters[p]['level'] for a in row['arenas'] for p in a['slots'] if p in monsters]
        row['recommendedLevel']=min(levels,default=1)
        worlds.append(row)
    # Persistent authoring input, separate from generated snapshots.
    custom_path = APP / 'config/dungeons/custom.json'
    custom_raw = custom_path.read_bytes()
    sources['web/config/dungeons/custom.json'] = hashlib.sha256(custom_raw).hexdigest()
    custom = json.loads(custom_raw)
    if custom.get('version') != 1: raise ValueError('原创副本配置版本无效')
    ids = {w['id'] for w in worlds}
    for w in custom['worlds']:
        world_id = w['id']
        if not world_id.startswith('dungeon:') or world_id in ids: raise ValueError('副本 ID 重复或无效')
        ids.add(world_id)
        row = dict(id=world_id,name=w['name'],source='web/config/dungeons/custom.json',
                   attributes={'born_pos':w['born_pos'],'worldpath':'web-authored'},arenas=[],warnings=[],difficultyModifiers=[])
        for i,a in enumerate(w['arenas']):
            if not 1 <= len(a['slots']) <= 4 or not any(a['slots']): raise ValueError('每组须有1至4个卡位')
            if len(a['position']) != 3 or not all(isinstance(n,(int,float)) for n in a['position']): raise ValueError('坐标无效')
            for path in filter(None,a['slots']): monster(path)
            row['arenas'].append(dict(id=f'{world_id}:{i}',sourceId=str(i),attributes={},position=a['position'],slots=a['slots']))
        row['monsterCount']=sum(bool(p) for a in row['arenas'] for p in a['slots'])
        row['recommendedLevel']=w['recommendedLevel']
        worlds.append(row)
    result=dict(version=1,sources=sources,worlds=worlds,monsters=monsters,invalidTemplates=invalid)
    out.mkdir(parents=True,exist_ok=True)
    (out/'dungeons.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(dict(worlds=len(worlds),arenas=sum(len(w['arenas']) for w in worlds),monsters=len(monsters),invalidTemplates=len(invalid)),ensure_ascii=False))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,default=APP.parents[1]);p.add_argument('--out',type=Path,default=APP/'data/adventure');args=p.parse_args();export(args.root.resolve(),args.out)
