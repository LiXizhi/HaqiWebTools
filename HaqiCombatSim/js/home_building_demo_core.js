import {buildingTemplateObjects} from './home_building_templates_core.js';
import {createHome,chunkKey,homeWaterAt} from './home_core.js';
import {applyHomeAction} from './home_actions_core.js';
// An isolated, reproducible playground; never changes a real role.
export function createBuildingDemo(catalog){
 const parts={residents:{$selection:{version:1}}};
 let serial=0;
 function place(itemId,x,y,rotation=0){
  const key='chunk:'+chunkKey(x,y);parts[key]||={};
  applyHomeAction(parts,{type:'place',object:{id:'demo-'+serial++,itemId,x,y,rotation}},catalog);
 }
 for(const [style,x,y]of [['wood',-9,3],['stone',2,2]])for(const o of buildingTemplateObjects(style,x,y))place(o.itemId,o.x,o.y,o.rotation);
 for(const [id,x,y] of [['bed',-8,4],['table',-5.3,4],['chair',-4,7],['bookshelf',-8,7],['table',5,4],['chair',6,7],['bookshelf',3.3,7]])place(id,x,y);
 for(const [itemId,x,y]of [['brick-chimney',-8,4],['roof-windmill',-4,4],['stone-chimney',3,3]]){
  const roof=Object.entries(parts).filter(([k])=>k.startsWith('chunk:')).flatMap(([,v])=>Object.values(v)).find(o=>o.x===x&&o.y===y&&o.itemId.endsWith('-roof'));
  applyHomeAction(parts,{type:'place',object:{id:'demo-'+serial++,itemId,x,y,properties:{surface:'roof'},parentId:roof.id}},catalog);
 }
 // The central lawn is guaranteed dry. Check the east tower's small overhang too.
 let seed=1;while(seed<10000&&[2,3,8,9].some(y=>homeWaterAt(seed,9.5,y+.5).water))seed++;
 const home=createHome('connected-building-demo','木屋与石堡试玩',seed);home.revision=1;
 home.parts=Object.fromEntries(Object.keys(parts).map(k=>[k,1]));return {home,parts};
}
