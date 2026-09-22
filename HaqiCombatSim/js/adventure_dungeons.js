// One complete dungeon JSON is preloaded on first entry, never split per world.
import {dungeonFor,installDungeons} from './adventure_dungeons_core.js';
export function createDungeonLoader({content,dataset,cards,names,readJson}){
    let pending=null;
    function preload(){
        if(content.dungeons.every(d=>d.loaded!==false))return Promise.resolve();
        if(!pending)pending=(async()=>{
            const payload=await readJson('data/adventure/dungeons.json');
            const expected=content.dungeons.map(d=>d.id).sort();
            if(payload?.version!==1||!Array.isArray(payload.worlds)||JSON.stringify(payload.worlds.map(d=>d.id).sort())!==JSON.stringify(expected)||!payload.monsters)throw Error('副本数据不匹配，请刷新后重试');
            // Install atomically after download; a failure never changes saves or live content.
            const scratch={...content,monsters:{...content.monsters},encounters:content.encounters.filter(e=>!dungeonFor(content,e.zone)),worldMaps:{...content.worldMaps},worldMapIndex:{...content.worldMapIndex,islands:{...content.worldMapIndex.islands}}};
            const nextDataset={...dataset,cards:{...dataset.cards}};
            installDungeons(scratch,nextDataset,payload,cards,names);
            content.monsters=scratch.monsters;content.encounters=scratch.encounters;content.worldMaps=scratch.worldMaps;
            content.worldMapIndex=scratch.worldMapIndex;content.dungeons=scratch.dungeons;dataset.cards=nextDataset.cards;
        })().catch(error=>{pending=null;throw error;});
        return pending;
    }
    async function load(id){
        if(!dungeonFor(content,id))throw Error('副本不存在');
        await preload();return dungeonFor(content,id);
    }
    async function prepareSaves(saves){
        if(!Array.isArray(saves)||saves.length>5)throw Error('角色列表无效');
        // Past clears validate using the lightweight index. An active dungeon needs the full pack.
        if(saves.some(s=>dungeonFor(content,s?.zone)))await preload();
    }
    return {preload,load,prepareSaves};
}
