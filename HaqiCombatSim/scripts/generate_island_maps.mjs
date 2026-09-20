import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {generateIsland} from '../js/adventure_map_generator_core.js';
import {createWorld,walkable,findPath,followPath,distance} from '../js/adventure_world_core.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const ids=['camp','town','fire','ice','desert','dark'];
const rules=read('config/maps/generator.json'),chapter=read('data/adventure/chapter.json');
const maps={},index={schemaVersion:1,layoutVersion:rules.layoutVersion,islands:{}};
for(const id of ids){
    const source=read(`config/maps/islands/${id}.json`),map=generateIsland(source,rules,chapter);
    map.sourceHash=createHash('sha256').update(JSON.stringify({source,rules,npcs:chapter.npcs,encounters:chapter.encounters})).digest('hex');
    maps[id]=map;
    index.islands[id]={name:map.name,w:map.w,h:map.h,spawn:map.spawn,initialSpawn:map.initialSpawn||map.spawn,retainPreviousPosition:!!map.retainPreviousPosition,file:`data/adventure/maps/${id}.json`};
}
const content={...chapter,worldMapIndex:index,worldMaps:maps};
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
    if(check){if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==text)throw Error(`地图配置过期：${file}，请运行 npm run generate:maps`);}
    else{fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);}
}
if(check){if(JSON.stringify(chapter.worldMapIndex)!==JSON.stringify(index))throw Error('章节地图索引过期');}
else{
    // Keep Python-exported numeric key ordering and untouched chapter text.
    // This generated field is always appended last by this script.
    const file=path.join(root,'data/adventure/chapter.json');
    let text=fs.readFileSync(file,'utf8').trimEnd();
    if(chapter.worldMapIndex){
        if(Object.keys(chapter).at(-1)!=='worldMapIndex')throw Error('worldMapIndex 必须位于章节末尾');
        text=text.replace(/,\r?\n  "worldMapIndex": [\s\S]*$/, '\n}');
    }
    const field=JSON.stringify(index,null,2).split('\n').map((line,i)=>i?`  ${line}`:line).join('\n');
    fs.writeFileSync(file,text.replace(/\s*}$/,',\n  "worldMapIndex": '+field+'\n}\n'));
}
console.log(check?'六岛配置与源文件一致。':'已生成六岛运行时JSON与章节出生点索引。');
