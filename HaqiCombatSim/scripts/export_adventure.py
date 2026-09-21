#!/usr/bin/env python3
"""Export the original kids opening chapter. No engine, account, or sibling app required."""
import argparse, base64, hashlib, json, re, xml.etree.ElementTree as ET
from pathlib import Path
from lib.lua_data import LuaData

APP = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--root', type=Path, default=APP.parents[1])
args = parser.parse_args()
ROOT = args.root.resolve()
OUT = APP / 'data/adventure'
OUT.mkdir(parents=True, exist_ok=True)
sources = {}

def read(path):
    raw = (ROOT / path).read_bytes()
    sources[path] = hashlib.sha256(raw).hexdigest()
    return raw

def xml(path): return ET.fromstring(read(path))
def text(node, name, default=''): return (node.findtext(name) or default).strip()
def number(value):
    try: return float(value) if '.' in str(value) else int(value)
    except (ValueError, TypeError): return value

def mem(path):
    raw = base64.b64decode(read(path))
    key = b'Copyright@ParaEngine, LiXizhi\0'
    literal = bytes(b ^ key[i % len(key)] for i,b in enumerate(raw)).decode('utf-8')
    p = LuaData(literal)
    result = p.value(); p.skip()
    if p.pos != len(literal): raise ValueError('Trailing Lua data')
    return result

all_items = {}
for row in mem('Database/globalstore.db.mem'):
    t=row[18]
    all_items[str(row[0])] = dict(id=row[0], name=t[0], description=t[1], icon=row[3], assetkey=row[12],
        stats={str(t[i]):t[i+1] for i in range(2,22,2) if t[i]}, slot=t[22], kind=t[23], subtype=t[24], source='Database/globalstore.db.mem')

manifest = {}
for line in read('assets_manifest.txt').decode().splitlines():
    p,md5,size=line.rsplit(',',2)
    manifest.setdefault(p[:-2].lower(), []).append(dict(path=p,md5=md5,size=int(size),entry=line))
assets={}
missing=[]
def asset(path, optional=False):
    if not path:return None
    parts=path.split(';'); clean=parts[0].strip().replace('\\','/').lower()
    crop=[int(x) for x in re.findall(r'\d+',parts[1])] if len(parts)>1 else None
    key=clean
    if key not in assets:
        choices=manifest.get(clean,[])
        if not choices:
            if not optional:missing.append(clean)
            return None
        row=next((a for a in choices if a['path'].endswith('.p')),choices[0])
        ext=Path(clean).suffix
        assets[key]={**row,'url':'https://cdn.keepwork.com/update61/assetdownload/update/'+row['entry'],
          'local':'assets/adventure/cdn/'+row['md5']+ext,'optional':optional}
    return {'id':key, **({'crop':crop} if crop else {})}

cards=json.loads((APP/'data/kids/cards.json').read_text())
card_items={}
for item in all_items.values():
    k=item['assetkey'].partition('_')[2]
    if k in cards:card_items[str(item['id'])]=k

schools={'fire':6,'ice':7,'storm':8,'life':10,'death':11}
# Original spells. Unlock timing is the compact chapter adaptation, not a server learning table.
lessons={
 'fire':[22362,22101,22109,22102,22104,22103,22120],
 'ice':[22364,22139,22153,22140,22148,22141,22157],
 'storm':[22363,22121,22130,22122,22124,22123,22138],
 'life':[22365,22158,22170,22159,22161,22160,22167],
 'death':[22366,22181,22190,22182,22189,22183,22199],
}
unlock_levels=[1,1,2,3,4,6,7]
used_items={17487,17172,17307,17593,17213,17114,10136,24003}
used_cards=set()
learn={}
for school,ids in lessons.items():
    learn[school]=[]
    for i,gsid in enumerate(ids):
        k=card_items[str(gsid)];used_items.add(gsid);used_cards.add(k)
        learn[school].append({'key':k,'itemId':gsid,'level':unlock_levels[i],'copies':3})

quests=[]
def dialog(node):
    if node is None:return []
    return [{'npcId':int(text(e,'id','0')),'text':text(e,'content'),
       'buttons':[dict(b.attrib) for b in e.findall('buttons/button')]} for e in (node.findall('.//dialog/item') or node.findall('item'))]
for q in xml('config/Aries/Quests/quest_list.xml'):
    qid=int(text(q,'Id','0'))
    if not 63000<=qid<=63013:continue
    goals=[]
    for tag,kind in [('Goal','defeat'),('CustomGoal','action')]:
        for e in q.findall(tag+'/item'):goals.append({'kind':kind,'id':int(e.get('id')),'count':int(e.get('value','1'))})
    talks=[]
    for e in q.findall('ClientDialogNPC/item'):
        talks.append({'npcId':int(e.get('id')),'label':e.get('label'), 'dialog':dialog(e)})
        goals.append({'kind':'talk','id':int(e.get('id')),'count':1})
    rewards=[]
    for group in q.findall('Reward/items'):
        rows=[]
        for e in group.findall('item'):
            iid=int(e.get('id')); used_items.add(iid)
            rows.append({'id':iid,'count':int(e.get('value','1'))})
        rewards.append({'choice':int(group.get('choice','-1')),'schoolFilter':group.get('schoolfilter')=='1','items':rows})
    if qid==63008:goals.append({'kind':'action','id':'hatch-pet','count':1})
    quests.append({'id':qid,'title':text(q,'Title'),'description':text(q,'Detail'),
      'startNpc':int(text(q,'StartNPC')),'endNpc':int(text(q,'EndNPC')),
      'requires':[int(e.get('id')) for e in q.findall('RequestQuest/item')],
      'sourceLevel':[dict(e.attrib) for e in q.findall('RequestAttr/item')],
      'goals':goals,'talks':talks,'rewards':rewards,'startDialog':dialog(q.find('StartDialog')),
      'endDialog':dialog(q.find('EndDialog')),'source':'config/Aries/Quests/quest_list.xml'})
quests.sort(key=lambda q:q['id'])

# Preserve every original line alongside explicit browser/tutorial adaptations.
dialogue_adaptations=[]
replacements={
 (63000,'startDialog',4): '在游戏中，使用 WASD 或方向键移动；也可以点击或轻触地面自动寻路。触摸设备左下角有方向按钮。',
 (63000,'startDialog',5): '镜头会跟随你。点击居民走近交谈，或走到居民身边按 E；触摸设备也可以点下方的交谈按钮。',
 (63000,'startDialog',6): '右上角的小地图可以帮助你认识营地。点击任务中的“追踪目标”，就会沿小路走向下一位居民。',
 (63001,'startDialog',3): '想快速找到任务目标，就点击任务手记里的“追踪目标”。你会沿小路自动走过去，十分方便。',
 (63002,'startDialog',1): '战斗时，点击或轻触一张卡牌，再选择目标就可以施法。魔力不足时可以跳过回合；不需要的卡牌可以弃掉。',
 (63002,'endDialog',0): '刚才的战斗中，你是不是希望学会更多不同的卡牌技能？',
 (63007,'startDialog',3): '点击任务追踪，或打开背包里的“强化装备”，选择晶石法杖并点击“强化”。第一次需要70仙豆；强化任意一件支持强化的装备后，回来找我交任务吧！',
 (63008,'endDialog',1): '在原来的魔法世界里，一些怪物还可以捕捉成为战宠。这段旅程中，我们先来照顾从出奇蛋中获得的小伙伴。',
 (63008,'endDialog',2): '宠物会跟随你一起探索。这次先学习喂养，让它健康长大；捕捉和宠物战斗的课程留待以后的冒险。',
 (63008,'endDialog',3): '点击下方“宠物”，或按 P 打开宠物面板，查看它的信息。想让宠物快点长大，可以喂它吃一些战宠口粮。',
 (63009,'startDialog',1): '打开“宠物”面板，点击“喂养一包战宠口粮”。每包增加300经验，让你的小伙伴长大吧！',
 (63010,'endDialog',0): '每个系别的魔法都有不同的特点。认识五位导师后，也想想自己的学系擅长什么，怎样把学会的法术配合起来使用。',
 (63010,'endDialog',1): '随着等级提升，你会自动学会本系的新卡牌。打开“卡包”查看已学会的魔法，按加减按钮调整份数，再保存卡包。',
 (63012,'startDialog',1): '先在“背包”装备翡翠口袋，再打开“卡包”放入更强力的卡牌。可以使用“推荐配卡”，最后点击“保存卡包”。',
}
for q in quests:
    original_description=q['description']
    description=original_description.replace('传送到指定地点','沿小路前往指定地点').replace('完成任务后可以获得炫酷坐骑','任务奖励以对话中的奖励清单为准')
    if description!=original_description:
        q['originalDescription']=original_description
        q['description']=description
        dialogue_adaptations.append({'questId':q['id'],'section':'description','original':original_description,'replacement':description,'reason':'browser-controls-or-chapter-scope'})
    for section in ['startDialog','endDialog']:
        for index,line in enumerate(q[section]):
            original=line['text'];replacement=replacements.get((q['id'],section,index))
            if replacement:
                line['originalText']=original;line['text']=replacement
                dialogue_adaptations.append({'questId':q['id'],'section':section,'index':index,'original':original,'replacement':replacement,'reason':'browser-controls-or-chapter-scope'})
            for button in line['buttons']:
                label=button.get('label','');new=label
                if any(word in label for word in ['跳转','传送到','视觉调整','开始演示','选修','训练点','超级战宠','只学会了一种']):
                    new='我明白了，继续吧。'
                if replacement and ('NEXT' in label or '移动' in label):new='我明白了。'
                if new!=label:
                    button['originalLabel']=label;button['label']=new
                    dialogue_adaptations.append({'questId':q['id'],'section':section,'index':index,'original':label,'replacement':new,'reason':'browser-button'})

portraits={36200:'susu',36201:'moka',36202:'tutu',36203:'gucci',36204:'barth',36205:'faster',
 36206:'fire',36207:'ice',36208:'storm',36209:'life',36210:'death',36211:'qinglong',
 30525:'alcalde',30081:'sophie',30112:'qinglong'}
# Compact map coordinates are deliberately authored rather than falsely preserving a 3D projection.
placements={36211:(860,730),36200:(620,680),36201:(620,850),36203:(1110,670),36202:(1130,940),
 36204:(1450,1130),36205:(1000,1440),36206:(420,390),36207:(610,330),36208:(810,290),36209:(1010,330),36210:(1200,390),
 30525:(800,650),30081:(540,860),30112:(1050,820)}
npcs={}
for name,zone,ids in [('NewUserIsland','camp',range(36200,36212)),('61HaqiTown','town',[30525,30081,30112])]:
    path=f'config/Aries/WorldData/{name}.NPC.xml'
    for e in xml(path):
        iid=int(e.get('npc_id','0'))
        if iid not in ids:continue
        p=e.find('assetfile_char'); desc=text(e.find('item_ex'),'desc') if e.find('item_ex') is not None else ''
        npcs[str(iid)]={'id':iid,'name':e.get('name'),'zone':zone,'x':placements[iid][0],'y':placements[iid][1],
            'description':desc,'portrait':asset(f'texture/aries/penote/npcs/{portraits[iid]}_32bits.png'),
            'originalPosition':e.get('position'),'model':p.get('filename') if p is not None else '', 'source':path}

mob_paths=['NewIslandMonster/MobTemplate_Fire_FireScout.xml','NewIslandMonster/MobTemplate_Ice_IceScout.xml',
 'NewIslandMonster/MobTemplate_Storm_StormScout.xml','NewIslandMonster/MobTemplate_Life_LifeScout.xml',
 'NewIslandMonster/MobTemplate_Death_DeatgScout.xml','HaqiLand/MobTemplate_WaterBubble.xml','HaqiLand/MobTemplate_DeathBubble.xml']
# IDs taken from the original quest goal definitions.
goal_ids=[40250,40249,40247,40248,40251,None,None]
monsters={}
for idx,rel in enumerate(mob_paths):
    path='config/Aries/Mob/'+rel;r=xml(path);m=r.find('mob');a={k:number(v) for k,v in m.attrib.items()}
    pool=[]
    for gsid,w in re.findall(r'\((\d+),(\d+)\)',m.get('available_cards','')):
        key=card_items[gsid];used_cards.add(key);used_items.add(int(gsid));pool.append({'key':key,'weight':int(w)})
    sequences=[]
    for seq in r.findall('sequences/sequence'):
        rows=[]
        for e in seq:
            row=dict(e.attrib);key=card_items.get(row['card'],row['card']);used_cards.add(key)
            if row['card'].isdigit():used_items.add(int(row['card']))
            rows.append({**row,'card':key})
        sequences.append(rows)
    mid=['fire-scout','ice-scout','storm-scout','life-scout','death-scout','water-bubble','death-bubble'][idx]
    monsters[mid]={'id':mid,'name':m.get('displayname'),'school':m.get('phase'),'level':int(m.get('level')),
        'hp':int(m.get('hp')),'xp':int(m.get('experience_pts','0')),'coins':int(m.get('joybean_count','0')),
        'goalId':goal_ids[idx],'attributes':a,'pool':pool,'sequences':sequences,'source':path}
    genes=[]
    for e in r.findall('genes/gene'):
        row=dict(e.attrib)
        if 'card' in row:
            gsid=row['card'];row['card']=card_items.get(gsid,gsid);used_cards.add(row['card'])
            if gsid.isdigit():used_items.add(int(gsid))
        genes.append(row)
    sets={}
    for e in r.findall('cardsets/set'):
        sets[e.get('id')]=[]
        for gsid,w in re.findall(r'\((\d+),(\d+)\)',e.get('cards','')):
            k=card_items[gsid];used_cards.add(k);used_items.add(int(gsid));sets[e.get('id')].append({'key':k,'weight':int(w)})
    monsters[mid]['genes']=genes;monsters[mid]['cardsets']=sets

# Include original gear-granted spells and chapter rewards.
for iid in list(used_items):
    item=all_items.get(str(iid))
    if item:
        for sid in ['139','140','141']:
            gsid=item['stats'].get(sid)
            if gsid and str(gsid) in card_items:used_items.add(int(gsid));used_cards.add(card_items[str(gsid)])
for key in sorted(used_cards):
    if key not in cards:raise ValueError('Missing card '+key)
    gsid=next((int(g) for g,k in card_items.items() if k==key),None)
    if gsid:used_items.add(gsid)
    item=all_items.get(str(gsid),{})
    cards[key]={**cards[key],'name':item.get('name',key),'art':asset(item.get('icon')),'itemId':gsid}

items={}
for iid in sorted(used_items):
    if str(iid) in all_items:
        item=all_items[str(iid)];items[str(iid)]={**item,'art':asset(item['icon'])}
items['16103']['rewardPetId']='zodiac_tiger_tangtang'
# Virtual reward IDs are actor attributes, not missing store items.
for iid,label in [(113,'战斗经验'),(100,'奇豆')]:items[str(iid)]={'id':iid,'name':label,'kind':0,'stats':{}}

pet_node=next(e for e in xml('config/Aries/Others/combatpet_levels.xml') if e.get('gsid')=='10136')
pet={'itemId':10136,'name':all_items['10136']['name'],'levels':{k:number(v) for k,v in pet_node.attrib.items()},'foodId':17172,'foodXp':all_items['17172']['stats']['60']}
addons=xml('config/Aries/Others/globalstore.addonlevel.kids.xml')
upgrade=next(e for e in addons if '1912' in e.get('gsids','').split(',')).findall('addon')
gear_upgrade=[{**{k:number(v) for k,v in row.attrib.items()},'cost':LuaData(row.get('levelup_requirement')).value()} for row in upgrade]
upgrade_groups=[]
for itemset in addons:
    rows=[{**{k:number(v) for k,v in row.attrib.items()},'cost':LuaData(row.get('levelup_requirement')).value()} for row in itemset.findall('addon')]
    upgrade_groups.append({'gsids':[int(gsid) for gsid in re.findall(r'\d+',itemset.get('gsids',''))],'levels':rows})

encounters=[{'id':mid,'monsterId':mid,'zone':'camp' if i<5 else 'town',
 'x':[360,1380,380,1410,1510,1310,1430][i],'y':[880,560,1130,870,1200,1070,660][i]} for i,mid in enumerate(monsters)]
# Retain original arena IDs, slots and coordinates as provenance for compact encounters.
arenas=[]
for zone,name in [('camp','NewUserIsland'),('town','61HaqiTown')]:
    source=f'config/Aries/WorldData/{name}.Arenas_Mobs.xml'
    for arena in xml(source):
        templates=[mob.get('mob_template','') for mob in arena.findall('mob')]
        included=[m['id'] for m in monsters.values() if m['source'] in templates]
        if included:
            arenas.append({'id':arena.get('id'),'zone':zone,'attributes':dict(arena.attrib),'mobSlots':templates,'monsters':included,'source':source})
for encounter in encounters:
    matches=[a for a in arenas if a['zone']==encounter['zone'] and encounter['monsterId'] in a['monsters']]
    if not matches:raise ValueError('Missing original arena for '+encounter['id'])
    encounter['sourceArenaId']=matches[0]['id']
extras={'townMap':asset('texture/aries/worldmaps/townmap/haqitownmap_bg.png'),
 'campMap':asset('worlds/myworlds/newuserisland/minimap.png'),
 'music':asset('audio/haqi/ariesregionbgmusics/haqitownbg.ogg',True)}
previous_content=json.loads((OUT/'chapter.json').read_text(encoding='utf8')) if (OUT/'chapter.json').exists() else {}
strengthening_catalog={str(gsid):dict(all_items[str(gsid)]) for group in upgrade_groups for gsid in group['gsids'] if str(gsid) in all_items}
for gsid,item in strengthening_catalog.items():
    old=previous_content.get('strengtheningCatalog',{}).get(gsid,{})
    if old.get('artSource',{}).get('entry') in [row['entry'] for row in manifest.get(item['icon'].lower(),[])]:
        item['art']=old['art'];item['artSource']=old['artSource']
content={'schemaVersion':1,'contentVersion':'kids-opening-1','title':'魔法哈奇 · 初心之旅',
 'dialogueAdaptations':dialogue_adaptations,'arenas':arenas,
 'upgradeSkin':previous_content.get('upgradeSkin',{}),'strengtheningIcons':previous_content.get('strengtheningIcons',{}),
 'schools':schools,'quests':quests,'npcs':npcs,'monsters':monsters,'encounters':encounters,
 'strengtheningCatalog':strengthening_catalog,
 'items':items,'cardItems':card_items,'learn':learn,'pet':pet,'upgrade':gear_upgrade,'upgradeGroups':upgrade_groups,'extras':extras,
 'progression':{'xpThresholds':[0,41,114,255,495,869,1418,2479,3654,4654],'levelCap':10},
 'adaptations':[
 '任务63000–63013按编号串联，去除等级上限锁；地图距离缩短。',
 '旧版视角、传送和教学演示改为浏览器操作；原对白与逐条改编记录均保存在章节数据。',
 '毕业后来到哈奇小镇；原任务63014前往火鸟岛，未纳入本章。',
 '1–10级经验阈值按原任务奖励编排；技能解锁时间为本章安排。',
 '原出奇蛋随机结果在本章固定为水咕噜；宠物仅跟随、喂养，不参战。',
 'VIP仙豆礼盒保留为纪念收藏，不开放充值或随机兑换。',
 '帽子、衣服、鞋子奖励保留本系选项；桌面鼠标提示同步适配触摸。',
 '部分营地居民共用原版立绘，外观资源映射不改变NPC身份。',
 '初始基础牌每种3份；装备附带法术作为额外固定手牌补充。',
 '胜负后恢复生命；无耐久损耗、在线计时、会员或节日暴怒机制。'],
 'sources':sources,'missingAssets':missing}
charging_source=read('script/apps/Aries/Combat/ServerObject/card_server.lua').decode('utf-8',errors='replace')
charging=LuaData(re.search(r'local storm_charging_wards\s*=\s*(\{[^}]+\})',charging_source)[1]).value()
# Minimal runtime combat dataset; every card value still comes from the committed kids export.
dataset={'pve':{'stormChargingWardIds':charging},'version':'kids','cards':{k:cards[k] for k in sorted(used_cards)},
 'charms':json.loads((APP/'data/kids/charms.json').read_text()),'aiDecks':{},'manifest':{'name':'kids opening'}}
for name,obj in [('chapter.json',content),('combat.json',dataset),('assets.json',assets)]:
 (OUT/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
print(f'Exported {len(quests)} quests, {len(npcs)} NPCs, {len(monsters)} monsters, {len(used_cards)} cards, {len(assets)} assets.')
# Refresh learning rules after the chapter/card-item mapping has been exported.
import subprocess, sys
subprocess.run([sys.executable, str(APP/'scripts/export_skill_learning.py'), '--root', str(ROOT)], check=True)
subprocess.run([sys.executable, str(APP/'scripts/export_npc_catalog.py'), '--root', str(ROOT)], check=True)
if missing:raise SystemExit('Missing required assets: '+str(missing))
