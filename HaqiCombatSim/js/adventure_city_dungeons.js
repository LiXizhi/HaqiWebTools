// Lazy city route restoration. No city data is requested at ordinary startup.
import {validateEarthCity} from './adventure_earth_city_config_core.js';
import {installCityDungeons,isCityDungeonId} from './adventure_city_dungeons_core.js';
import {generateCityDungeon,generatedCityDungeonId} from './adventure_city_generated_core.js';
export function createCityDungeonLoader({content,readJson,registerImage=()=>{}}){
    let indexTask=null,artTask=null;const pending=new Map();
    async function streetArt(isCurrent){
        if(!isCurrent())throw Error('已取消城市副本加载');
        const art=await (artTask??=Promise.resolve().then(()=>readJson('data/adventure/earth/street-art.json')).catch(()=>{artTask=null;return null;}));
        if(!isCurrent())throw Error('已取消城市副本加载');
        if(art?.version===1&&art.entries){content.cityStreetArt=art;for(const entry of Object.values(art.entries))registerImage(entry.id,entry);if(art.npcAtlas)registerImage(art.npcAtlas.id,art.npcAtlas);}
    }
    const index=()=>indexTask??=(readJson('data/adventure/earth/index.json').catch(e=>{indexTask=null;throw e;}));
    async function load(id,{isCurrent=()=>true,cityFallback=null}={}){
        if(!isCityDungeonId(id))throw Error('城市副本编号无效');
        if(id.startsWith('city:generated-')){
            if(!cityFallback||id!==generatedCityDungeonId(cityFallback))throw Error('自动城市场景缺少入口记录');
            if(cityFallback.generationVersion===2)await streetArt(isCurrent);
            const generated=generateCityDungeon(content,cityFallback);
            if(!isCurrent())throw Error('已取消城市副本加载');
            installCityDungeons(content,generated.city);Object.assign(content.monsters,generated.monsters);
            return content.dungeons.find(d=>d.id===id);
        }
        const cityId=id.split(':')[1];
        if(!pending.has(cityId))pending.set(cityId,(async()=>{
            const routes=await index(),route=routes.regions.find(r=>r.id===cityId&&r.dungeonIds?.includes(id));
            if(!route)throw Error('城市副本路由不存在');
            const city=validateEarthCity(await readJson(`data/adventure/earth/${route.manifest}`));
            if(city.id!==cityId)throw Error('城市副本路由不匹配');
            for(const node of city.nodes||[])for(const e of node.dungeon.encounters)if(!content.monsters[e.monsterId])throw Error('城市怪物模板尚未加载');
            return city;
        })().catch(e=>{pending.delete(cityId);throw e;}));
        const city=await pending.get(cityId);
        if(city.nodes.some(n=>n.dungeon.id===id&&n.dungeon.streetscape))await streetArt(isCurrent);
        if(!isCurrent())throw Error('已取消城市副本加载');
        if(content.earthCities?.[cityId]!==city)installCityDungeons(content,city);
        const dungeon=content.dungeons.find(d=>d.id===id);if(!dungeon)throw Error('城市副本不存在');
        registerImage(city.art.npcs.id,city.art.npcs);return dungeon;
    }
    async function prepareSaves(saves){
        const ids=new Set(saves.flatMap(s=>[s.zone,...Object.keys(s.dungeonRuns||{}),...(s.cityReturnStack||[]).map(r=>r.zone)]).filter(isCityDungeonId));
        for(const id of ids)await load(id,{cityFallback:saves.find(s=>s.cityFallback&&generatedCityDungeonId(s.cityFallback)===id)?.cityFallback});
    }
    return {load,prepareSaves};
}
