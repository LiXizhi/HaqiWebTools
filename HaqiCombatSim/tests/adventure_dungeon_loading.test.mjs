import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareDungeonBundle} from '../scripts/package_dungeons.mjs';
import {installDungeonIndex,enterDungeon,leaveDungeon} from '../js/adventure_dungeons_core.js';
import {createDungeonLoader} from '../js/adventure_dungeons.js';
import {createRoleStore} from '../js/adventure_roles.js';
import {createAdventure,beginEncounter,parseSave} from '../js/adventure_core.js';
import {checkedProgress} from '../js/adventure_cloud_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p+'.json',import.meta.url)));
const cards=read('kids/cards'),names=read('kids/card_names'),catalog=read('adventure/dungeons'),camp=read('adventure/maps/camp');
const {index,payload}=prepareDungeonBundle(catalog,cards,names,camp.rules);
const id='dungeon:HaqiTown_FireCavern',other='dungeon:HaqiTown_LightHouse_S1';
function setup(request=async()=>structuredClone(payload)){
    const content=read('adventure/chapter'),dataset=read('adventure/combat');content.worldMaps={camp:structuredClone(camp)};
    installDungeonIndex(content,index);
    const calls=[];const loader=createDungeonLoader({content,dataset,cards,names,readJson:async url=>{calls.push(url);return request(url);}});
    return {content,dataset,loader,calls};
}
test('startup installs only metadata; first entry loads the whole JSON once, shared by all dungeons',async()=>{
    let resolve;const s=setup(()=>new Promise(r=>resolve=r));
    assert.equal(s.calls.length,0);assert.equal(s.content.worldMaps[id],undefined);
    const a=s.loader.load(id),b=s.loader.load(other);assert.deepEqual(s.calls,['data/adventure/dungeons.json']);
    resolve(structuredClone(payload));await Promise.all([a,b]);
    assert.ok(s.content.dungeons.every(d=>d.loaded));assert.ok(s.content.worldMaps[other]);
    await s.loader.load(other);assert.equal(s.calls.length,1);
});
test('failed/mismatched whole-file preload does not install partial state and can retry',async()=>{
    let attempt=0;const s=setup(async()=>++attempt===1?{version:1,worlds:[],monsters:{}}:structuredClone(payload));
    const before=JSON.stringify(s.content);await assert.rejects(s.loader.load(id),/不匹配/);assert.equal(JSON.stringify(s.content),before);
    await s.loader.load(id);assert.equal(s.calls.length,2);assert.ok(s.content.worldMaps[id]);
});
test('old cleared runs validate with only the index; active dungeon saves preload before combat replay',async()=>{
    const full=setup();await full.loader.load(id);const save=createAdventure(full.content);enterDungeon(save,full.content,id);
    const arena=full.content.dungeons.find(d=>d.id===id).arenas[0];save.dungeonRuns[id].cleared=[arena.id];leaveDungeon(save,full.content);
    const fresh=setup();await fresh.loader.prepareSaves([save]);assert.equal(fresh.calls.length,0);assert.deepEqual(parseSave(save,fresh.content).dungeonRuns,save.dungeonRuns);
    enterDungeon(save,full.content,id,{restart:true});beginEncounter(save,full.content,arena.id);
    await fresh.loader.prepareSaves([save]);assert.equal(fresh.calls.length,1);
    assert.deepEqual(checkedProgress(save,fresh.content,fresh.dataset).battle.events,checkedProgress(save,full.content,full.dataset).battle.events);
});
test('local role preparation hydrates saved dungeons before synchronous validation, without writing storage',async()=>{
    const full=setup();await full.loader.load(id);const save=createAdventure(full.content);enterDungeon(save,full.content,id);
    const values=new Map([['haqi.roles.v1.guest',JSON.stringify({catalog:{schemaVersion:1,activeId:'12345678-1234-1234-1234-123456789abc',roles:[{id:'12345678-1234-1234-1234-123456789abc',lastPlayedAt:1,save}]},base:null,dirty:false})]]);
    const raw=values.get('haqi.roles.v1.guest'),fresh=setup();let writes=0;
    const store=createRoleStore({...fresh,prepareSaves:fresh.loader.prepareSaves,storage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>{writes++;values.set(k,v);}}});
    await store.prepareOpen();store.open();assert.equal(fresh.calls.length,1);assert.equal(writes,0);assert.equal(values.get('haqi.roles.v1.guest'),raw);
});
