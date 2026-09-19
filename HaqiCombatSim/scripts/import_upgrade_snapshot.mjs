// Recovery when original XML is unavailable: require a matching source hash.
// node scripts/import_upgrade_snapshot.mjs path/to/exported/ruleset.json
import fs from 'node:fs';
import assert from 'node:assert/strict';
const path=new URL('../data/adventure/chapter.json',import.meta.url);
const raw=fs.readFileSync(path,'utf8'),chapter=JSON.parse(raw);
const snapshot=JSON.parse(fs.readFileSync(process.argv[2]));
const source='config/Aries/Others/globalstore.addonlevel.kids.xml';
assert.equal(snapshot.version,'kids');
assert.ok(chapter.sources[source]);
assert.equal(snapshot.manifest.sources[source],chapter.sources[source]);
const byItem=Object.fromEntries(Object.entries(snapshot.addons).map(([id,levels])=>[id,Object.values(levels).sort((a,b)=>a.level-b.level).map(row=>{
    const match=/^\{(-?\d+),(\d+)\}$/.exec(row.levelup_requirement);
    assert.ok(match,`Invalid cost for ${id}`);
    return {...row,cost:[Number(match[1]),Number(match[2])]};
})]));
assert.deepEqual(byItem[1912],chapter.upgrade);
const groups=new Map();
for(const [id,levels] of Object.entries(byItem)) {
    const key=JSON.stringify(levels);
    if(!groups.has(key))groups.set(key,{gsids:[],levels});
    groups.get(key).gsids.push(Number(id));
}
const upgradeGroups=[...groups.values()];
if(chapter.upgradeGroups){chapter.upgradeGroups=upgradeGroups;fs.writeFileSync(path,JSON.stringify(chapter,null,2)+'\n');}
else fs.writeFileSync(path,raw.trimEnd().slice(0,-1).trimEnd()+',\n'+JSON.stringify({upgradeGroups},null,2).slice(2)+'\n');
console.log(`Imported ${Object.keys(byItem).length} equipment tables in ${groups.size} groups; source SHA-256 ${chapter.sources[source]}`);
