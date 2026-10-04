import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {npcCharacter} from '../js/adventure_city_people_core.js';
const source=file=>fs.readFileSync(new URL('../js/'+file,import.meta.url),'utf8');

test('actual scene NPC branch preserves original dragon art and limits generated outfits to city dungeons',()=>{
    const s=source('adventure_renderer.js'),start=s.indexOf("if(o.kind==='npc') {"),end=s.indexOf("if(o.kind==='mob')",start),code=s.slice(start,end);
    const draws=[],avatars=[];
    const context={npcCharacter,o:{kind:'npc',id:36211,name:'青龙',zone:'camp',portrait:{id:'dragon'},x:100,y:200},world:{isCityDungeon:false},assets:{hero:{},content:{},draw:(...args)=>{draws.push(args);return true;}},ctx:{},t:0,save:{},stats:()=>({}),shadow(){},avatar:(...args)=>avatars.push(args),plate(){},PLATE:{npc:{}},questMarker:()=>null,earthCityNpcMarker:()=>null,text(){},ellipse(){},Math};
    vm.runInNewContext(code,context);assert.equal(avatars.length,0);assert.deepEqual(draws[0].slice(4,6),[100,104]);assert.equal(draws[0][1].id,'dragon');
    context.world.isCityDungeon=true;context.o={...context.o,id:991000,zone:'city:sample:default'};
    vm.runInNewContext(code,context);assert.equal(draws.length,1);assert.equal(avatars.length,1);assert.ok(avatars[0][1].appearance);
});

test('actual free-chat portrait callback keeps island and Earth surface art',()=>{
    const s=source('adventure_app.js'),line=s.split('\n').find(l=>l.includes('getPortrait:source=>')),callback=line.trim().replace(/^getPortrait:/,'').replace(/,$/,'');
    const portraits=[],outfits=[],assets={content:{npcs:{36211:{id:36211,zone:'camp',portrait:{id:'dragon'}}}},hero:{}};
    const getPortrait=vm.runInNewContext('('+callback+')',{npcCharacter,assets,V:{art:(...args)=>{portraits.push(args);return'original';}},heroPortrait:(...args)=>{outfits.push(args);return'outfit';}});
    assert.equal(getPortrait({kind:'npc',id:36211}),'original');
    assert.equal(getPortrait({kind:'npc',id:991000,zone:'earth',portrait:'earth-old'}),'original');
    assert.equal(getPortrait({kind:'npc',id:991001,zone:'city:sample:default',portrait:'city-old'}),'outfit');
    assert.equal(getPortrait({kind:'player',id:'friend'}),'outfit');
    assert.equal(portraits.length,2);assert.equal(portraits[0][1].id,'dragon');assert.equal(outfits.length,2);
});

test('actual Earth surface story canvas draws its original NPC portrait',()=>{
    const s=source('view_adventure_earth.js'),code=s.slice(s.indexOf('export function renderEarthStory(')).replace('export function','function'),draws=[],avatars=[];
    const element=()=>({classList:{add(){}},setAttribute(){},append(){},replaceChildren(){},getContext(){return{};}});
    const context={npcCharacter,heroPortrait:(...args)=>{avatars.push(args);return element();},el:element,button:element,createCloseButton:element};
    vm.createContext(context);vm.runInContext(code,context);
    context.renderEarthStory(element(),{assets:{draw:(...args)=>draws.push(args)},npc:{id:991000,zone:'earth',earthNpc:true,portrait:'surface-original'},story:{},quests:{steps:[]},learning:{prompts:[]}},{});
    assert.equal(avatars.length,0);assert.equal(draws[0][1],'surface-original');
});
