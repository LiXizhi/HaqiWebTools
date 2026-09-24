import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {installDungeons} from '../js/adventure_dungeons_core.js';
import {projectRuntimeData} from './package_runtime_data.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
export function prepareDungeonBundle(catalog,cards,names,rules){
    const payload=projectRuntimeData('adventure/dungeons.json',catalog);
    const content={dungeons:[],monsters:{},encounters:[],worldMaps:{camp:{rules}},worldMapIndex:{islands:{}}};
    installDungeons(content,{cards:{}},payload,cards,names);
    const index={version:1,worlds:content.dungeons.map(d=>({
        id:d.id,name:d.name,playable:d.playable,recommendedLevel:d.recommendedLevel,monsterCount:d.monsterCount,boss:d.boss,bossArenaId:d.bossArenaId,
        battleRewards:{
            xp:d.arenas.some(a=>!a.blocked.length&&a.monsterIds.some(id=>content.monsters[id]?.xp>0)),
            coins:d.arenas.some(a=>!a.blocked.length&&a.monsterIds.some(id=>content.monsters[id]?.coins>0)),
        },
        mapInfo:content.worldMapIndex.islands[d.id],arenas:d.arenas.map(a=>({id:a.id,blocked:a.blocked})),loaded:false,
    }))};
    return {index,payload};
}
export function prepareDungeonFiles(base=root){
    const read=p=>JSON.parse(fs.readFileSync(path.join(base,p),'utf8'));
    const result=prepareDungeonBundle(read('data/adventure/dungeons.json'),read('data/kids/cards.json'),read('data/kids/card_names.json'),read('data/adventure/maps/camp.json').rules);
    // Only the catalogue is part of the startup pack. Dungeon content stays in one JSON.
    fs.writeFileSync(path.join(base,'data/adventure/dungeon-index.json'),JSON.stringify(result.index,null,2)+'\n');
    return result;
}
