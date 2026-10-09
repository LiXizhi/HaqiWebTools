import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateEarthCity} from '../js/adventure_earth_city_config_core.js';
import {validateCityNodeBindings} from '../js/adventure_city_dungeons_core.js';
export function updateCityNode(city,node,index){
    const next=structuredClone(city),previous=next.nodes?.find(n=>n.id===node.id);
    if(previous){
        if(previous.cityId!==node.cityId||previous.dungeon.id!==node.dungeon.id||previous.source.kind!==node.source.kind||previous.source.id!==node.source.id)throw Error('已有节点身份不可改变');
        for(const key of ['actions','encounters'])for(const row of previous.dungeon[key])if(!node.dungeon[key].some(n=>n.id===row.id))throw Error('更新不能删除已有事件身份');
        for(const old of previous.dungeon.actions.filter(a=>a.learning)){const next=node.dungeon.actions.find(a=>a.id===old.id)?.learning;if(next?.id!==old.learning.id||old.learning.prompts.some(p=>!next.prompts.some(n=>n.id===p.id)))throw Error('更新不能改变已有学习身份');}
    }
    next.nodes=[...(next.nodes||[]).filter(n=>n.id!==node.id),structuredClone(node)];
    if(previous)next.nodes.sort((a,b)=>city.nodes.findIndex(n=>n.id===a.id)-city.nodes.findIndex(n=>n.id===b.id));
    validateEarthCity(next);
    const routes=structuredClone(index),route=routes.regions.find(r=>r.id===next.id);if(!route)throw Error('城市世界索引缺失');
    route.dungeonIds=[next.entrance.dungeonId,...next.nodes.map(n=>n.dungeon.id)];
    return {city:next,index:routes};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
    const [cityFile,nodeFile,...flags]=process.argv.slice(2);
    if(!cityFile||!nodeFile)throw Error('用法：node scripts/update_earth_city_node.mjs 城市JSON 节点JSON [--write]');
    const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),indexFile=path.join(root,'data/adventure/earth/index.json');
    const read=file=>JSON.parse(fs.readFileSync(file,'utf8')),index=read(indexFile),city=read(cityFile),result=updateCityNode(city,read(nodeFile),index);
    validateCityNodeBindings(index.regions.map(r=>r.id===city.id?result.city:read(path.join(root,'data/adventure/earth',r.manifest))));
    if(flags.includes('--write')){fs.writeFileSync(cityFile,JSON.stringify(result.city,null,2)+'\n');fs.writeFileSync(indexFile,JSON.stringify(result.index,null,2)+'\n');}
    console.log(`${flags.includes('--write')?'已写入':'检查通过，未写入'}：${city.name} / ${result.city.nodes.length} 个节点`);
}
