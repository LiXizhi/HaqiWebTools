import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {generateIsland} from '../js/adventure_map_generator_core.js';
import {prepareIslandRegistry} from './prepare_island_packs.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const packs=prepareIslandRegistry(process.argv.includes('--check'));
const {createWorld,walkable,findPath,followPath,distance}=await import('../js/adventure_world_core.js');
const {installIslandPackActors}=await import('../js/adventure_island_packs_core.js');
const ids=['camp','town','fire','ice','desert','dark',...packs.map(p=>p.island.id)];
const rules=read('config/maps/generator.json'),chapter=read('data/adventure/chapter.json');
const mapContent=structuredClone(chapter);installIslandPackActors(mapContent,packs);
for(const pack of packs)mapContent.encounters.push(...pack.encounters);
const maps={},index={schemaVersion:1,layoutVersion:rules.layoutVersion,islands:{}};
for(const id of ids){
    const source=read(packs.find(p=>p.island.id===id)?.mapSource||`config/maps/islands/${id}.json`),input=packs.some(p=>p.island.id===id)?mapContent:chapter,map=generateIsland(source,rules,input);
    map.sourceHash=createHash('sha256').update(JSON.stringify({source,rules,npcs:input.npcs,encounters:input.encounters})).digest('hex');
    maps[id]=map;
    index.islands[id]={name:map.name,w:map.w,h:map.h,spawn:map.spawn,initialSpawn:map.initialSpawn||map.spawn,retainPreviousPosition:!!map.retainPreviousPosition,file:`data/adventure/maps/${id}.json`};
}
const content={...mapContent,worldMapIndex:index,worldMaps:maps};
for(const id of ids){
    const world=createWorld(id,content),start=index.islands[id].spawn;
    for(const target of [start,index.islands[id].initialSpawn,...world.npcs,...world.encounters,...world.landmarks,world.portal]){
        if(!walkable(world,target.x,target.y))throw Error(`${id} 目标不可通行：${target.name||target.id||JSON.stringify(target)}`);
        const route=findPath(world,start,target),result=followPath(world,start,route,100000);
        if(!route.length||result.blocked||distance(result.position,target)>1)throw Error(`${id} 目标不可达：${target.name||target.id||JSON.stringify(target)}`);
    }
    // Keep legacy camp roads compatible with its authored buildings; all new
    // island roads are tested in both directions against actual movement.
    if(id!=='camp')for(const road of world.paths)for(const [a,b] of [[road.a,road.b],[road.b,road.a]]){
        const result=followPath(world,a,[b],100000);
        if(result.blocked||distance(result.position,b)>1)throw Error(`${id} 道路受阻：${JSON.stringify(road)}`);
    }
    console.log(`${id}: ${world.w}×${world.h}, ${world.landmarks.length} 地标, ${world.trees.length} 树木, ${world.layout.bridges.length} 桥梁，可达性通过`);
}
const outputs=Object.fromEntries(ids.map(id=>[`data/adventure/maps/${id}.json`,maps[id]]));
outputs['data/adventure/maps/index.json']=index;
const check=process.argv.includes('--check');
for(const [file,data] of Object.entries(outputs)){
    const text=JSON.stringify(data,null,2)+'\n',target=path.join(root,file);
    if(check){if(!fs.existsSync(target)||fs.readFileSync(target,'utf8').replace(/\r\n/g,'\n')!==text)throw Error(`地图配置过期：${file}，请运行 npm run generate:maps`);}
    else{fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);}
}
if(check){if(JSON.stringify(chapter.worldMapIndex)!==JSON.stringify(index))throw Error('章节地图索引过期');}
else if(JSON.stringify(chapter.worldMapIndex)!==JSON.stringify(index)){
    chapter.worldMapIndex=index;
    fs.writeFileSync(path.join(root,'data/adventure/chapter.json'),JSON.stringify(chapter,null,2)+'\n');
}
console.log(check?'岛屿配置与源文件一致。':'已生成岛屿运行时JSON与章节出生点索引。');
