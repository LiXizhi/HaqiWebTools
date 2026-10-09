import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {createAdventure} from '../js/adventure_core.js';
import {prepareDebugEdit} from '../js/adventure_debug_core.js';
import {createPromoDuoBattle,samplePromoDuoMotion} from '../js/promo_duo_core.js';
import {cardsInHand} from '../js/combat_unit_core.js';
import {restorePveBattle} from '../js/combat_pve_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p,import.meta.url)));
const {content,dataset}=installExpansion(...['adventure/chapter.json','adventure/combat.json','adventure/pets.json','adventure/shop-candidates.json','kids/cards.json','kids/charms.json'].map(read));
test('宣传片双人复用正式八张手牌与共同准备，第一人选好不推进回合',()=>{
 const saves=[531,532].map((seed,i)=>prepareDebugEdit(createAdventure(content,{seed,name:i?'小月':'小星'}),content,{level:15}).save);
 const round=createPromoDuoBattle(dataset,content,saves),before=structuredClone(round.battle.events);
 assert.equal(round.ids.length,2);
 for(const id of round.ids)assert.equal(cardsInHand(round.battle.unitsById[id]).length,8);
 const picks=[round.choice(0),round.choice(1)];
 assert.equal(round.submit(0,picks[0]),false);assert.deepEqual(round.battle.events,before);
 assert.equal(round.submit(1,picks[1]),true);assert.equal(round.battle.completedDecisions,1);
 for(const id of round.ids)assert.ok(round.battle.events.some(e=>e.type==='cast'&&e.caster===id),'双方均完成施法');
 assert.deepEqual(restorePveBattle(dataset,content,round.checkpoint).events,round.battle.events);
});

test('双人步行均为正式速度，端点暂停与折返不瞬移，回跳可复现',()=>{
 const world={layout:{route:[{x:0,y:0},{x:10000,y:0}]},paths:[{a:{x:0,y:0},b:{x:10000,y:0},width:20000}],encounters:[]},origin={x:1000,y:1000},path=[{x:1300,y:1000}];
 const a=samplePromoDuoMotion(world,origin,path,.2),b=samplePromoDuoMotion(world,origin,path,.3);
 for(let i=0;i<2;i++)assert.ok(Math.abs(b[i].position.x-a[i].position.x-21)<1e-6);
 let previous=samplePromoDuoMotion(world,origin,path,0);
 for(let t=.05;t<6;t+=.05){const next=samplePromoDuoMotion(world,origin,path,t);for(let i=0;i<2;i++)assert.ok(Math.abs(next[i].position.x-previous[i].position.x)<=10.500001);previous=next;}
 assert.deepEqual(samplePromoDuoMotion(world,origin,path,.2),a);
});
