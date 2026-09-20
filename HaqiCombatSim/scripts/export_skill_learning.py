"""Export verified class-learning exchanges as data; never execute Lua."""
import argparse, base64, hashlib, json, re
from pathlib import Path
from lib.lua_data import LuaData

APP = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--root',type=Path,default=APP.parents[1])
source = parser.parse_args().root / 'Database/extendedcost.db.mem'
raw = source.read_bytes()
encoded = base64.b64decode(raw)
key = b'Copyright@ParaEngine, LiXizhi\0'
text = bytes(v ^ key[i % len(key)] for i, v in enumerate(encoded)).decode()
path = APP / 'data/adventure/chapter.json'
chapter = json.loads(path.read_text(encoding='utf-8'))
items = chapter['cardItems']
schools = {986:'fire', 987:'ice', 988:'storm', 990:'life', 991:'death'}
courses = {}
for line in text.splitlines():
    match = re.search(r'exname="\s*Get_(\d+)_(thisClass|otherClass)_[^"]*",(\d+),pres=\{(.*?)\},froms=\{(.*?)\},', line)
    if not match or match[1] not in items:
        continue
    gsid, mode, exid, pres, costs = match.groups()
    rewards = json.loads(LuaData(line[len('{otos='):]).value())
    if rewards != [{'gsid':int(gsid),'cnt':1,'p':1000}]:
        continue
    conditions = [(int(a), int(b)) for a,b in re.findall(r'key=(-?\d+),value=(-?\d+)', pres)]
    froms = [(int(a), int(b)) for a,b in re.findall(r'key=(-?\d+),value=(-?\d+)', costs)]
    # Do not invent quest/item/VIP requirements when an exchange cannot be represented.
    supported = all(a in (-14,-18) or (str(a) in items and b == 1) for a,b in conditions) and all(a == 22000 for a,b in froms)
    supported = supported and all(a != -18 or b in schools for a,b in conditions)
    course = {'exchangeId':int(exid), 'level':max([1]+[b for a,b in conditions if a == -14]),
              'cost':sum(b for a,b in froms), 'prerequisites':[items[str(a)] for a,b in conditions if str(a) in items],
              'supported':supported}
    for a,b in conditions:
        if a == -18: course['school'] = schools.get(b)
    courses.setdefault(items[gsid], {})['own' if mode == 'thisClass' else 'other'] = course
chapter['skillLearning'] = {'version':1, 'source':'Database/extendedcost.db.mem',
    'sha256':hashlib.sha256(raw).hexdigest(), 'courses':courses}
path.write_text(json.dumps(chapter,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'Exported {len(courses)} verified skill entries')
