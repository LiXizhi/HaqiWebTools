import fs from 'node:fs';
import {characterProfile,fixedCharacterMemory} from '../js/character_relationship_core.js';
const read=name=>JSON.parse(fs.readFileSync(new URL(`../data/adventure/${name}.json`,import.meta.url),'utf8'));
const entries={};
function add(source){const profile=characterProfile(source);entries[profile.id]={file:'memory.md',profile,memory:fixedCharacterMemory(profile)};}
for(const [i,p] of read('social').personas.entries())for(const [direction,native] of ['en','zh','ja','ko'].entries())add({...p,id:`companion:${i}:${direction}`,kind:'companion',appearance:i%2?'girl':'boy',native});
for(const npc of read('npc-catalog').npcs)add({...npc,kind:'npc'});
for(const npc of read('camp-conversations').profiles)add({...npc,id:npc.npcId||npc.id,kind:'npc'});
fs.writeFileSync(new URL('../data/adventure/character-memories.json',import.meta.url),JSON.stringify({version:1,entries},null,2)+'\n');
console.log(`${Object.keys(entries).length} fixed character memory.md documents packed in JSON`);
