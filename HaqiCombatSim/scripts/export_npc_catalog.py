"""Export kids island residents, merchant rows and mentor menus without executing Lua."""
import argparse, base64, hashlib, json, re, xml.etree.ElementTree as ET
from pathlib import Path
from lib.lua_data import LuaData

APP = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser()
p.add_argument('--root', type=Path, default=APP.parents[1])
ROOT = p.parse_args().root
sources = {}
def read(path):
    raw = (ROOT / path).read_bytes()
    sources[path] = hashlib.sha256(raw).hexdigest()
    return raw
def decode(path):
    raw = base64.b64decode(read(path)); key = b'Copyright@ParaEngine, LiXizhi\0'
    return bytes(v ^ key[i % len(key)] for i, v in enumerate(raw)).decode('utf-8')
def pairs(value):
    return [{'id':int(a), 'count':int(b)} for a,b in re.findall(r'key=(-?\d+),value=(-?\d+)', value)]

items = {}
for row in LuaData(decode('Database/globalstore.db.mem')).value():
    t = row[18]
    items[str(row[0])] = dict(id=row[0], name=t[0], description=t[1], sourceIcon=row[3],
        assetkey=row[12], stats={str(t[i]):t[i+1] for i in range(2,22,2) if t[i]},
        slot=t[22], kind=t[23], subtype=t[24], maxCount=t[31], maxCopiesInStack=t[37], source='Database/globalstore.db.mem', sourceRecord=row)
exchanges = {}
for line in decode('Database/extendedcost.db.mem').splitlines():
    m = re.search(r'exname="([^"]*)",(\d+),pres=\{(.*?)\},froms=\{(.*?)\},', line)
    if not m: continue
    rewards = LuaData(line[len('{otos='):]).value()
    try: parsed = json.loads(rewards) if rewards else []
    except json.JSONDecodeError: parsed = []
    exchanges[m[2]] = dict(id=int(m[2]), name=m[1], prerequisites=pairs(m[3]), costs=pairs(m[4]),
                          rewards=parsed, rawRewards=rewards, sourceRecord=line)

islands = dict(camp='NewUserIsland', town='61HaqiTown', fire='FlamingPhoenixIsland',
               ice='FrostRoarIsland', desert='AncientEgyptIsland', dark='DarkForestIsland')
npcs = []
for zone, name in islands.items():
    source = f'config/Aries/WorldData/{name}.NPC.xml'
    for index, e in enumerate(ET.fromstring(read(source)).findall('.//NPC')):
        nid = int(e.get('npc_id', '0'))
        buttons = [dict(b.attrib) for b in e.findall('item_ex/nativebuttons/button')]
        model = e.find('assetfile_char')
        npcs.append(dict(id=nid, instanceId=f'{zone}:{index}:{nid}', zone=zone, name=e.get('name',''),
            subtitle=e.get('name2',''), description=(e.findtext('item_ex/desc') or '').strip(),
            place=(e.findtext('item_ex/place') or '').strip(), originalPosition=e.get('position'),
            model=model.get('filename','') if model is not None else '', source=source,
            attributes=dict(e.attrib), enabled=(e.findtext('item_ex/enabled') or '').strip(),
            buttons=buttons, gossip=[dict(w.attrib) for w in e.findall('gossip/hello/word')],
            sourceXml=ET.tostring(e, encoding='unicode')))

ns = {'s':'urn:schemas-microsoft-com:office:spreadsheet'}
shops = []
for index, row in enumerate(ET.fromstring(read('config/Aries/NPCShop/npcshop.xml')).findall('.//s:Table/s:Row',ns)):
    cells = {}; col = 1
    for cell in row:
        col = int(cell.get('{'+ns['s']+'}Index',col))
        cells[col] = ''.join(cell.itertext()).strip(); col += 1
    if not re.fullmatch(r'-?\d+',cells.get(1,'')) or not cells.get(5,'').isdigit(): continue
    shops.append(dict(id=f'shop:{index}', npcId=int(cells[1]), menu=cells.get(2) or 'menu1',
        category=cells.get(3) or 'normal', categoryName=cells.get(4) or '通用', itemId=int(cells[5]),
        exchangeId=int(cells.get(6) or 0), currencies=cells.get(7,''), dailyLimit=int(cells.get(8) or -1),
        name=cells.get(9,''), npcName=cells.get(10,''), platform=cells.get(11,''), timeRange=cells.get(12,''),
        sourceRow=index+1, rawColumns=cells))

mentors = {}
for node in ET.fromstring(read('config/Aries/Mentor/7Mentor.xml')):
    if not node.tag.startswith('NPC_'): continue
    mentors[node.tag[4:]] = dict(attributes=dict(node.attrib), courses=[dict(type=e.tag, **e.attrib) for e in node])
used = {r['itemId'] for r in shops}
ids = {r['exchangeId'] for r in shops}
for mentor in mentors.values():
    for course in mentor['courses']:
        used.add(int(course['gsid']))
        ids.update(int(course[k]) for k in ['exID','other_exID'] if course.get(k))
selected = {str(i):exchanges[str(i)] for i in sorted(ids) if str(i) in exchanges}
for ex in selected.values():
    used.update(r['id'] for r in ex['costs']+ex['prerequisites'] if r['id']>=0)
    used.update(r['gsid'] for r in ex['rewards'])
result = dict(version=1, sources=sources, npcs=npcs, shops=shops, mentors=mentors,
    exchanges=selected, items={str(i):items[str(i)] for i in sorted(used) if str(i) in items},
    report=dict(islands={z:sum(n['zone']==z for n in npcs) for z in islands},
                missingExchanges=sorted(i for i in ids if i and str(i) not in exchanges),
                unplacedShopNpcIds=sorted({r['npcId'] for r in shops}-{n['id'] for n in npcs})))
(APP/'data/adventure/npc-catalog.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'Exported {len(npcs)} NPC instances, {len(shops)} merchant rows, {len(mentors)} mentors, {len(selected)} exchanges')
