import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateEarthCity} from '../js/adventure_earth_city_config_core.js';
import {validateCityNodeBindings} from '../js/adventure_city_dungeons_core.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const index=JSON.parse(fs.readFileSync(path.join(root,'data/adventure/earth/index.json'),'utf8'));
const files=process.argv.slice(2);
const selected=files.length?files:index.regions.map(row=>`data/adventure/earth/${row.manifest}`);
const npcIds=new Set();
const cities=[];
const streetFile=path.join(root,'data/adventure/earth/street-art.json');
if(fs.existsSync(streetFile)){
    const street=JSON.parse(fs.readFileSync(streetFile,'utf8'));
    for(const art of Object.values(street.entries)){
        const bytes=fs.readFileSync(path.join(root,art.local));
        if(bytes.toString('ascii',8,12)!=='WEBP'||bytes.length!==art.bytes||bytes.length>200000||createHash('sha256').update(bytes).digest('hex')!==art.sha256)throw Error('街景美术校验失败：'+art.local);
        if(new URL(art.cdn).hostname!=='cdn.keepwork.com')throw Error('街景美术 CDN 无效');
    }
    console.log(`街景共享素材：${Object.keys(street.entries).length} 张，格式、大小与哈希通过`);
}
for(const file of selected){
    const city=validateEarthCity(JSON.parse(fs.readFileSync(path.resolve(root,file),'utf8')));
    cities.push(city);validateCityNodeBindings(cities);
    if(city.nodes){const route=index.regions.find(r=>r.id===city.id);const ids=[city.entrance.dungeonId,...city.nodes.map(n=>n.dungeon.id)];if(!route||JSON.stringify(route.dungeonIds)!==JSON.stringify(ids))throw Error('城市副本路由需与作者源同步');}
    for(const npc of city.npcs){if(npcIds.has(npc.id))throw Error(`跨城市居民编号重复：${npc.id}`);npcIds.add(npc.id);}
    for(const art of Object.values(city.art)){
        const bytes=fs.readFileSync(path.join(root,art.local));
        if(bytes.toString('ascii',8,12)!=='WEBP'||bytes.length!==art.bytes||bytes.length>200000||createHash('sha256').update(bytes).digest('hex')!==art.sha256)throw Error(`城市美术校验失败：${art.local}`);
        const url=art.cdn||art.atlas;if(!url||new URL(url).hostname!=='cdn.keepwork.com')throw Error(`城市美术缺少正式 CDN：${art.local}`);
    }
    console.log(`${city.name}：${city.npcs.length} 位居民，${city.sideQuests.length} 条支线，单文件 ${fs.statSync(path.resolve(root,file)).size} 字节`);
}
