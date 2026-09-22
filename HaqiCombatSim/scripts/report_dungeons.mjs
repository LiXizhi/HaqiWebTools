import fs from 'node:fs';
import {prepareDungeonFiles} from './package_dungeons.mjs';
import {installDungeons} from '../js/adventure_dungeons_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p+'.json',import.meta.url)));
const c=read('adventure/chapter'),data=read('adventure/combat'),catalog=read('adventure/dungeons');
c.worldMaps={camp:read('adventure/maps/camp')};installDungeons(c,data,catalog,read('kids/cards'));
const lines=['# 原版副本导出目录','','由 `npm run export:dungeons` 生成，不手工编辑。制作规范见 [副本快速制作](dungeon-authoring.md)。','',`共 ${c.dungeons.length} 个 kids/通用实例世界，${c.dungeons.filter(d=>d.playable).length} 个可探索，${c.dungeons.filter(d=>d.playable&&d.arenas.every(a=>!a.blocked.length)).length} 个全部怪物组可挑战。原版机关、过场、门票、难度倍率和宝箱掉落仍未复刻。`,'','| 世界 | 标识 | 怪物组 | 怪物数 | 可挑战组 |','| --- | --- | ---: | ---: | ---: |'];
for(const d of c.dungeons)lines.push(`| ${d.name} | ${d.id} | ${d.arenas.length} | ${d.monsterCount} | ${d.arenas.filter(a=>!a.blocked.length).length} |`);
for(const d of c.dungeons){
    lines.push('',`## ${d.name} — ${d.id}`,'',`来源：\`${d.arenaSource||d.source}\`；世界路径：\`${d.attributes.worldpath}\`。`,'','| 组标识 | 原三维坐标 x,y,z | 原卡位（空位保留） | 状态 |','| --- | --- | --- | --- |');
    for(const a of d.arenas)lines.push(`| ${a.id} | ${a.position.join(', ')} | ${a.slots.map((p,i)=>`${i}: ${p?(c.monsters[p]?.name||p):'空'}`).join(' / ')} | ${a.blocked.join('；')||'可挑战'} |`);
    if(d.warnings.length)lines.push('',...d.warnings.map(s=>`- ${s}`));
}
fs.writeFileSync(new URL('../docs/dungeon-catalog.md',import.meta.url),lines.join('\n')+'\n');
console.log('已生成 docs/dungeon-catalog.md');
prepareDungeonFiles();
