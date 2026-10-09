import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {streamEarthWild} from '../js/adventure_earth_wild_stream_core.js';
import {earthRules} from '../js/adventure_earth_core.js';
import {monsterInteractionTargets,monsterTerritoryWarning} from '../js/adventure_monster_motion_core.js';
import {nearbyWorldObjects,invalidateWorldObjects} from '../js/adventure_world_core.js';
const content={pets:JSON.parse(fs.readFileSync(new URL('../data/adventure/pets.json',import.meta.url))).pets};
const spawns=Array.from({length:60},(_,i)=>({id:`slot:${i}`,profile:{id:`slot:${i}`},position:{x:100+i%10*110,y:100+Math.floor(i/10)*110},chunkX:i,chunkY:1,slot:0,level:12,targetPower:400,version:1}));
const view={x:0,y:0,w:1000,h:800},leader={x:500,y:400};
function world(){const w={earthRules:earthRules(),wildSpawns:spawns,wildAuthored:[],encounters:[],npcs:[],landmarks:[],trees:[],buildings:[],zone:'earth',isEarth:true,revision:0};w.onObjectsChanged=()=>invalidateWorldObjects(w);return w;}
function tick(w,v=view,n=1){for(let i=0;i<n;i++)streamEarthWild(w,content,leader,v,.1);}
test('dormant monster candidates have no combat state; only six load and share the AI fade lifecycle',()=>{
    const w=world();tick(w);assert.equal(w.encounters.length,6);assert.equal(w.wildActors.length,6);
    assert.ok(spawns.every(s=>!s.monster&&!s.encounter&&!s.rng&&!s.path));assert.ok(w.encounters.every(e=>e.sceneState.opacity===0));
    assert.deepEqual(monsterInteractionTargets(w,w.encounters[0]),[]);assert.equal(monsterTerritoryWarning(w,w.encounters[0],leader),null);
    const objects=nearbyWorldObjects(w,view),ref=objects.find(o=>o.kind==='mob').sceneState;tick(w,view,4);
    assert.ok(ref.opacity>0&&ref.opacity<1,'spatial index keeps a live opacity reference');tick(w,view,6);assert.equal(ref.opacity,1);
    assert.ok(monsterInteractionTargets(w,w.encounters[0]).length>0);
});
test('offscreen monsters fade out, unload their live state and reappear with the same reproducible identity',()=>{
    const w=world();tick(w,view,12);const ids=w.encounters.map(e=>e.id),old=w.encounters[0];
    const outside={x:2000,y:0,w:900,h:800};tick(w,outside,5);assert.equal(old.sceneState.opacity,1);
    tick(w,outside,12);assert.ok(old.sceneState.opacity>0&&old.sceneState.opacity<1);assert.equal(old.sceneState.retiring,true);
    assert.deepEqual(monsterInteractionTargets(w,old),[]);tick(w,outside,10);assert.equal(w.encounters.length,0);assert.equal(w.wildActors.length,0);
    assert.equal(nearbyWorldObjects(w,view).length,0);tick(w);assert.deepEqual(w.encounters.map(e=>e.id),ids);assert.ok(w.encounters.every(e=>e.sceneState.opacity===0));
});
test('fade ticks preserve active encounters and do not repeatedly invalidate scene indices',()=>{
    const w=world();let changes=0;w.onObjectsChanged=()=>changes++;tick(w);const first=w.encounters,actor=w.wildActors[0];tick(w,view,10);
    assert.equal(w.encounters,first);assert.equal(w.wildActors[0],actor);assert.equal(changes,1);
    w.wildSpawns=spawns.map(s=>({...s,targetPower:800}));tick(w);assert.ok(w.encounters.every(e=>e.monster.gearScore>=800));assert.equal(w.wildActors[0],actor);
});
