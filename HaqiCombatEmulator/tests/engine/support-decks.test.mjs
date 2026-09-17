import test from 'node:test';import assert from 'node:assert/strict';
import {rules} from '../fixtures/data.mjs';import {defaultBuild,defaultScenario,legacyDefaultBuild,upgradeLegacyDecks,autoConfigureDeck} from '../../js/data/presets.js';import {cardCategory} from '../../js/data/card-categories.js';import {createBattle,getLegalActions,getObservation,stepBattle} from '../../js/engine/battle.js';import {chooseAction} from '../../js/bots/strategy.js';
for(const version of ['kids','teen'])test(`${version}: all five default decks include playable buffs/debuffs`,()=>{
 for(const school of ['ice','fire','storm','death','life']){const build=defaultBuild(school,rules[version]),types=new Set(build.deck.map(k=>cardCategory(rules[version].cards[k],rules[version])));for(const type of ['attack','buff','debuff'])assert.ok(types.has(type),`${school}: ${type}`);assert.ok(build.deck.length<=build.deckCapacity);createBattle({size:1,teams:[[build],[build]]},rules[version]);}
});
test('upgrade only exact old preset decks; preserve custom cards and attributes',()=>{
 const r=rules.kids,s=defaultScenario(r,1);s.teams[0][0]={...legacyDefaultBuild('ice',r),name:'自定义姓名',attributes:{maxHP:8123}};s.teams[1][0].deck.pop();const custom=structuredClone(s.teams[1][0]);const next=upgradeLegacyDecks(s,r);assert.equal(next.count,1);assert.equal(next.scenario.teams[0][0].attributes.maxHP,8123);assert.equal(next.scenario.teams[0][0].name,'自定义姓名');assert.deepEqual(next.scenario.teams[1][0],custom);assert.notEqual(next.scenario.teams[0][0].deck.length,s.teams[0][0].deck.length);assert.equal(autoConfigureDeck({...s.teams[0][0],deckCapacity:6},r).deck.length,6);
});
for(const version of ['kids','teen'])test(`${version}: support targeting, bot use, buff and debuff application`,()=>{
 const r=rules[version],a=defaultBuild('fire',r),b=defaultBuild('death',r);a.deck=['Fire_FireDamageBlade','Fire_FireDamageTrap',a.deck[0]];b.deck=['Death_AreaDamageWeakness'];const state=createBattle({size:1,teams:[[a],[b]]},r,45);
 const legal=getLegalActions(state,'0-0'),blade=legal.find(x=>x.card==='Fire_FireDamageBlade'),trap=legal.find(x=>x.card==='Fire_FireDamageTrap');assert.equal(blade.targetId,'0-0');assert.equal(trap.targetId,'1-0');
 assert.ok(['Fire_FireDamageBlade','Fire_FireDamageTrap'].includes(chooseAction(getObservation(state,'0-0'),r).card));stepBattle(state,[blade]);assert.ok(state.units[0].charms.some(x=>x.id===11));
 const debuff=getLegalActions(state,'1-0').find(x=>x.card==='Death_AreaDamageWeakness');assert.ok(debuff);assert.equal(debuff.targetId,'0-0');stepBattle(state,[debuff]);assert.ok(state.units[0].charms.some(x=>x.id===24));stepBattle(state,[getLegalActions(state,'0-0').find(x=>x.card==='Fire_FireDamageTrap')]);assert.ok(state.units[1].wards.some(x=>x.id===21));
});
