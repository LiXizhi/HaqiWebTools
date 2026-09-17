import test from 'node:test';import assert from 'node:assert/strict';
import {rules} from '../fixtures/data.mjs';import {defaultScenario} from '../../js/data/presets.js';
import {compileCharacter} from '../../js/rules/character.js';import {createBattle,getLegalActions,stepBattle,exportReplay,replayBattle} from '../../js/engine/battle.js';
const pass=state=>state.units.filter(u=>u.side===state.side&&u.hp>0).map(u=>({unitId:u.id,kind:'pass'}));
for(const version of ['kids','teen'])test(`${version}: discard, retain, refill N, exhaust and replay`,()=>{
 const r=rules[version],s=defaultScenario(r,1);for(const team of s.teams){team[0].deck=team[0].deck.slice(0,5);team[0].deckCapacity=5;team[0].handSize=3;team[0].drawPerRound=2;}
 const b=createBattle(s,r,33),u=b.units[0];assert.equal(u.hand.length,2);assert.equal(u.deck.length-u.drawIndex,3);
 const kept=u.hand[1].seq;stepBattle(b,[{...pass(b)[0],discardSeqs:[u.hand[0].seq]}]);assert.equal(u.hand.length,1);assert.equal(u.discardedCount,1);
 stepBattle(b,pass(b));assert.equal(u.hand.length,3);assert.ok(u.hand.some(h=>h.seq===kept));assert.equal(u.deck.length-u.drawIndex,1);
 stepBattle(b,[{...pass(b)[0],discardSeqs:u.hand.map(h=>h.seq)}]);stepBattle(b,pass(b));assert.equal(u.hand.length,1);
 stepBattle(b,[{...pass(b)[0],discardSeqs:u.hand.map(h=>h.seq)}]);stepBattle(b,pass(b));assert.equal(u.discardedCount,5);assert.equal(u.hand.length,0);assert.equal(u.deck.length-u.drawIndex,0);assert.deepEqual(getLegalActions(b,u.id),[{unitId:u.id,kind:'pass'}]);
 assert.deepEqual(replayBattle(exportReplay(b),r).events,b.events);
});
test('deck capacity and invalid discard validation are atomic',()=>{
 const r=rules.kids,s=defaultScenario(r,1);assert.throws(()=>compileCharacter({...s.teams[0][0],deckCapacity:1},r),/超过/);assert.throws(()=>compileCharacter({...s.teams[0][0],handSize:2,drawPerRound:3},r),/补牌/);
 const b=createBattle(s,r,1),before=JSON.stringify(b);assert.throws(()=>stepBattle(b,[{...pass(b)[0],discardSeqs:[999]}]),/弃牌/);assert.equal(JSON.stringify(b),before);
 const action=getLegalActions(b,'0-0').find(a=>a.kind==='cast');assert.ok(action);assert.throws(()=>stepBattle(b,[{...action,discardSeqs:[action.seq]}]),/弃牌/);assert.equal(JSON.stringify(b),before);
});
test('successful casts permanently consume finite cards',()=>{
 const r=structuredClone(rules.kids),s=defaultScenario(r,1),key=s.teams[0][0].deck[0];r.cards[key]={...r.cards[key],pipcost:0,accuracy:100,params:{damage_min:1,damage_max:1,cooldown:0}};
 for(const team of s.teams)team[0].deck=[key];const b=createBattle(s,r,1);stepBattle(b,[getLegalActions(b,'0-0').find(a=>a.kind==='cast')]);stepBattle(b,pass(b));assert.equal(b.units[0].usedCount,1);assert.equal(b.units[0].hand.length,0);assert.equal(getLegalActions(b,'0-0').length,1);
});

test('six-copy limit applies to compilation and battle, without padding short decks',()=>{
 for(const r of Object.values(rules)){const s=defaultScenario(r,1),build=s.teams[0][0],key=build.deck[0];assert.equal(build.deckCapacity,40);assert.ok(build.deck.length<40);const six={...build,deck:Array(6).fill(key)};assert.equal(compileCharacter(six,r).deck.length,6);const seven={...six,deck:Array(7).fill(key)};assert.throws(()=>compileCharacter(seven,r),/最多 6/);s.teams[0][0]=seven;assert.throws(()=>createBattle(s,r),/最多 6/);}
});
