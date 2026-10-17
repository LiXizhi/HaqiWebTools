import {stepMonsterWander} from '../js/adventure_monster_motion_core.js';
import {takeAutoInteraction} from '../js/adventure_world_core.js';
import {defaultParams} from '../js/combat_params_core.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHanziMemory} from '../js/adventure_hanzi_memory.js';
import {createHanziProgress} from '../js/hanzi_core.js';
import {emptyDictionary} from '../js/dictionary_core.js';
import {durableSave,runtimeValues} from '../js/adventure_storage_core.js';
const pack=JSON.parse(fs.readFileSync(new URL('../data/adventure/island-packs/hanzi.json',import.meta.url)));
const data=JSON.parse(fs.readFileSync(new URL('../data/adventure/dictionary/zh.json',import.meta.url)));
function harness(){
    let cb,shown,notice='',retry,fail=false,success=0;
    const save={seed:77,zone:'hanzi',position:{x:100,y:100},hanzi:createHanziProgress(),quests:{873100:{accepted:true,claimed:false,progress:{}}},trackedQuestIds:[873100]};
    const world={zone:'hanzi',w:2000,h:1000,isCityDungeon:true,dungeon:{scene:{map:{obstacles:[]}}},layout:{spawn:{x:100,y:100}},paths:[{a:{x:100,y:100},b:{x:1800,y:100}}],npcs:[],encounters:[{id:pack.encounters[0].id,x:700,y:100}],monsterSceneParams:{territoryRadius:100}};
    const state={save,world,content:{islandPacks:[pack]},stage:'world',panel:null,owner:null,role:'a'},dictionary=emptyDictionary();let battles=0;
    const c=createHanziMemory({root:{},getState:()=>state,persist(){},commit:p=>{if(fail)throw Error('disk full');save.hanzi=p;},show:()=>{state.panel='hanzi-memory';},close:()=>{state.panel=null;c.close();},track(){},dictionary(){},legacy(){},onBuff(){},encounter(){battles++;},toast(){},load:async()=>data,
        storage:{async read(){return dictionary;}},practice:(id,accept)=>{shown={entry:data.entries.find(e=>e.id===id)};cb={close:()=>{state.panel=null;c.close();},accept};},
        viewFactory:(root,callbacks)=>{cb=callbacks;return {practice:p=>shown=p,book(){},success(){success++;},message:t=>notice=t,retry:f=>retry=f,close(){}};}});
    c.tick(.1,false);
    const open=async()=>{state.panel='hanzi-memory';await c.open();};
    const pending=word=>{save.hanziMemoryRuntime.pending={...save.hanziMemoryRuntime.nodes[0],word};};
    return {c,state,save,world,dictionary,open,pending,get cb(){return cb;},get shown(){return shown;},get notice(){return notice;},get success(){return success;},get retry(){return retry;},get battles(){return battles;},set fail(v){fail=v;}};
}
test('closing retains pending; one completed exercise rotates the local node without creating collection data',async()=>{
    const h=harness();h.pending('shan');await h.open();assert.equal(h.shown.entry.id,'shan');h.cb.close();assert.equal(h.save.hanziMemoryRuntime.pending.word,'shan');await h.open();
    h.cb.accept();assert.equal(h.save.hanzi.memories,undefined);assert.equal(h.save.hanziMemoryRuntime.pending,undefined);assert.equal(h.save.hanziMemoryRuntime.cycles['hanzi:0'],1);assert.equal(h.state.panel,null);
});
test('late exercise completion cannot cross a role switch',async()=>{
    const h=harness();h.pending('shan');await h.open();h.state.role='b';h.cb.accept();assert.equal(h.save.hanzi.memories,undefined);assert.ok(h.save.hanziMemoryRuntime.pending);
});
test('guard uses normal combat contact instead of immediate combat; victory releases all nodes and auto-opens only one target',()=>{
    const h=harness(),guardian=h.world.encounters[0];h.save.position={x:guardian.x,y:guardian.y};h.c.tick(.1,true);assert.equal(h.battles,0);assert.equal(h.save.hanziMemoryRuntime.pending,undefined);
    h.save.hanziMemoryRuntime.nodes[0]={...h.save.hanziMemoryRuntime.nodes[0],x:guardian.x,y:guardian.y};h.save.hanziMemoryRuntime.nodes[1]={...h.save.hanziMemoryRuntime.nodes[1],x:guardian.x+10,y:guardian.y};
    h.c.won('other');assert.equal(h.save.hanziMemoryRuntime.pending,undefined);h.c.won(guardian.id);assert.equal(h.save.hanziMemoryRuntime.pending.word,'shan');assert.equal(h.save.hanziMemoryRuntime.autoOpen,true);
    for(const n of h.save.hanziMemoryRuntime.nodes.slice(0,2))assert.ok(Math.hypot(n.x-guardian.x,n.y-guardian.y)>124);
    h.c.tick(.1,true);assert.equal(h.state.panel,'hanzi-memory');
});

test('guard warning allows chanting but never grants a guarded memory before normal combat',()=>{
    const h=harness(),e=h.world.encounters[0];h.save.position={x:e.x,y:e.y};
    h.save.hanziMemoryRuntime.nodes[0]={...h.save.hanziMemoryRuntime.nodes[0],x:e.x,y:e.y};
    for(let i=0;i<60;i++)h.c.tick(.1,true);
    assert.equal(h.battles,0);assert.equal(h.state.panel,null);assert.equal(h.save.hanziMemoryRuntime.pending,undefined);assert.ok(h.world.memoryGathering.progress<1);
});

test('guardian uses the standard warning and contact before the longer memory chant',()=>{
    const h=harness(),e=h.world.encounters[0];h.world.monsterSceneParams=defaultParams('kids').monsterScene;h.save.position={x:e.x,y:e.y};h.save.hanziMemoryRuntime.nodes[0]={...h.save.hanziMemoryRuntime.nodes[0],x:e.x,y:e.y};
    const view={x:0,y:0,w:2000,h:1000};
    for(let i=0;i<29;i++){stepMonsterWander(h.world,e,.05,view,{hero:h.save.position,ambient:false});h.c.tick(.05,true);assert.equal(takeAutoInteraction(h.world,h.save.position),null);assert.equal(h.state.panel,null);}
    stepMonsterWander(h.world,e,.05,view,{hero:h.save.position,ambient:false});assert.equal(takeAutoInteraction(h.world,h.save.position)?.id,e.id);h.c.tick(.05,false);assert.equal(h.world.memoryGathering,null);assert.equal(h.save.hanziMemoryRuntime.pending,undefined);
});

test('exploration and chanting never write learning or collection records',()=>{
    const h=harness();const node=h.save.hanziMemoryRuntime.nodes.find(n=>Math.hypot(n.x-700,n.y-100)>150);h.save.position={x:node.x,y:node.y};
    for(let i=0;i<80;i++)h.c.tick(.1,true);
    assert.equal(h.save.hanzi.memories,undefined);assert.deepEqual(h.dictionary.languages,{});
});
