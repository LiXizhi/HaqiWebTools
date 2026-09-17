// Snapshot the shared MagicHaqi catalog; runtime never reads the source checkout.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isSupportedType } from '../js/combat_cards_core.js';
const source=process.argv[2] || 'C:/lxzsrc/maisi/maisi/maisi/webgames/MagicHaqi/famous-pets/_pet_index.json';
const previous=JSON.parse(await fs.readFile('data/adventure/pets.json','utf8').catch(()=>'{}')).pets||{};
const rows=JSON.parse(await fs.readFile(source,'utf8'));
const content=JSON.parse(await fs.readFile('data/adventure/chapter.json','utf8'));
const cards=JSON.parse(await fs.readFile('data/kids/cards.json','utf8'));
const mapping={'火':'fire','冰':'ice','雷':'storm','生命':'life','自然':'life','暗':'death'};
const sorted=[...rows].sort((a,b)=>(a.rarity||0)-(b.rarity||0)||a.id.localeCompare(b.id,'en'));
const stages=[1,10,25,40], tiers=[1,5,10,15,20,25,30,35,40,45];
const pets={};
for(const [index,row] of sorted.entries()) {
 const school=mapping[row.traits.elementalAttribute];
 if(!school)throw Error('Unknown element '+row.id);
 const lessons=content.learn[school].map(x=>({...x}));
 const extra=Object.values(cards).filter(c=>c.spellSchool===school&&isSupportedType(c.type)&&/^(Fire|Ice|Storm|Life|Death)_[A-Za-z]+_Level[1-7]$/.test(c.key)&&Number(c.pipcost)>=0&&Number(c.pipcost)<=7).map(c=>({...c,unlock:Math.max(10,Number(c.requireLevel)||Number(c.key.match(/Level(\d+)$/)[1])*5)})).sort((a,b)=>a.unlock-b.unlock||a.key.localeCompare(b.key));
 // Stable species variation without consuming gameplay randomness.
 for(const level of [10,15,20,25,30,35,40,45,50]) {
  const pool=extra.filter(c=>c.unlock<=level&&!lessons.some(x=>x.key===c.key));
  const role=index%3;const preferred=pool.filter(c=>role===0?c.type.includes('Attack'):role===1?['Wards','Charms'].includes(c.type):['SingleHeal','DOTAttack'].includes(c.type));const choices=preferred.length?preferred:pool;const card=choices.length?choices[(index+level)%choices.length]:null;
  if(card&&!lessons.some(x=>x.key===card.key))lessons.push({key:card.key,level,copies:3});
 }
 pets[row.id]={id:row.id,name:row.name,sourceId:row.id,dna:row.dna,traits:row.traits,school,rarity:row.rarity||0,unlockLevel:tiers[Math.min(9,Math.floor(index*10/rows.length))],lessons,art:{...(previous[row.id]?.art||{}),cdn:row.imageSheetUrl,local:`assets/adventure/pets/${row.id}.webp`,rows:4,cols:4}};
}
for(const id of ['dragon_green','dragon_purple','dragon_orange'])pets[id].unlockLevel=1;
await fs.writeFile('data/adventure/pets.json',JSON.stringify({version:1,source:'MagicHaqi/famous-pets/_pet_index.json',sourceSha256:createHash('sha256').update(await fs.readFile(source)).digest('hex'),stageLevels:stages,pets},null,2)+'\n');
console.log(`${rows.length} pets exported`);
