// Node-side loader for the exported config/Aries game snapshot (same JSON the browser fetches).
import fs from 'node:fs';
import {rules} from './data.mjs';
import {buildGameData} from '../../js/game/data.js';
const read=rel=>{const raw=JSON.parse(fs.readFileSync(new URL(`../../data/game/${rel}`,import.meta.url)));if(raw.schemaVersion!==1)throw new Error(rel);return raw.data;};
export const assetIndex=JSON.parse(fs.readFileSync(new URL('../../data/game/asset-index.json',import.meta.url)));
export const hasAsset=path=>!!assetIndex.assets[String(path).replace(/\\/g,'/').toLowerCase().replace(/\.dds$/,'.png')];
export const game=buildGameData('kids',{ruleset:rules.kids,worlds:read('kids/worlds.json'),npcs:read('kids/npcs.json'),arenas:read('kids/arenas.json'),mobs:read('kids/mobs.json'),quests:read('kids/quests.json'),shops:read('kids/shops.json'),hp:read('kids/hp.json')});
