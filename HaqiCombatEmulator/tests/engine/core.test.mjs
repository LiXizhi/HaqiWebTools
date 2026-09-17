import test from 'node:test';
import assert from 'node:assert/strict';
import {rules} from '../fixtures/data.mjs';
import {defaultScenario} from '../../js/data/presets.js';
import {createBattle,stepBattle,getObservation,exportReplay,replayBattle} from '../../js/engine/battle.js';
import {runBattle} from '../../js/simulation/runner.js';
import {compileCharacter} from '../../js/rules/character.js';
import {applyPatch} from '../../js/ai/patch.js';
for(const version of ['kids','teen'])for(const size of [1,2,3,4])test(`${version} ${size}v${size}: deterministic headless/event/replay`,()=>{
  const r=rules[version],s=defaultScenario(r,size),original=JSON.stringify(s);
  const recorded=runBattle(s,r,328,{recordEvents:true});
  assert.deepEqual(recorded.result,runBattle(s,r,328));
  const replay=replayBattle(exportReplay(recorded),r);
  assert.deepEqual(replay.result,recorded.result);assert.deepEqual(replay.events,recorded.events);
  assert.equal(JSON.stringify(s),original);assert.ok(recorded.finished);assert.ok(recorded.turn<=100);
  for(const u of recorded.units){assert.ok(u.hp>=0&&u.hp<=u.attributes.maxHP);assert.ok(u.pips>=0);}
});
test('illegal action is atomic and observations exclude hidden decks/random',()=>{
  const r=rules.kids,b=createBattle(defaultScenario(r,2),r,1),before=JSON.stringify(b);
  assert.throws(()=>stepBattle(b,[{unitId:'0-0',kind:'cast',seq:999}]));assert.equal(JSON.stringify(b),before);
  const o=getObservation(b,'0-0');assert.equal(o.random,undefined);for(const u of o.units){assert.equal(u.deck,undefined);assert.equal(u.hand,undefined);}
  o.units[0].hp=0;assert.notEqual(b.units[0].hp,0);
});
test('unsupported card, missing data and pets fail closed',()=>{
 const r=rules.kids,s=defaultScenario(r,1);s.teams[0][0].deck=['missing'];assert.throws(()=>createBattle(s,r),/缺失卡牌/);
 s.teams[0][0]=defaultScenario(r,1).teams[0][0];s.teams[0][0].pet={gsid:1};assert.throws(()=>createBattle(s,r),/战宠/);
});
test('snapshot ignores equipment and VIP, never double counts',()=>{
 const r=rules.kids,b=defaultScenario(r,1).teams[0][0],a=compileCharacter(b,r);assert.deepEqual(compileCharacter({...b,equipment:[{gsid:-999}],vipLevel:10},r).attributes,a.attributes);
});
test('patch validates fields, old value, base hash, and clones baseline',async()=>{
 const r=rules.kids,key=Object.keys(r.cards).find(k=>typeof r.cards[k].params.damage_min==='number'&&r.cards[k].params.damage_min>1),before=r.cards[key].params.damage_min;
 const p={schemaVersion:1,baseHash:r.hash,changes:[{path:['cards',key,'params','damage_min'],before,value:before-1}]};
 const next=await applyPatch(r,p);assert.notEqual(next.hash,r.hash);assert.equal(r.cards[key].params.damage_min,before);assert.equal(next.cards[key].params.damage_min,before-1);
 await assert.rejects(applyPatch(r,{...p,baseHash:'wrong'}));await assert.rejects(applyPatch(r,{...p,changes:[{...p.changes[0],path:['__proto__','polluted']}]}));await assert.rejects(applyPatch(r,{...p,changes:[{...p.changes[0],value:NaN}]}));
});
test('teen final snapshot does not add level-derived absolute stats',()=>{const b=defaultScenario(rules.teen,1).teams[0][0];const c=compileCharacter(b,rules.teen);assert.equal(c.attributes.damageAbsolute.ice,0);assert.equal(c.attributes.resistAbsolute.ice,0);});
