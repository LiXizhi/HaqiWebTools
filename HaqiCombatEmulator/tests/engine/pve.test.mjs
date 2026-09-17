import test from 'node:test';
import assert from 'node:assert/strict';
import {rules} from '../fixtures/data.mjs';
import {defaultScenario} from '../../js/data/presets.js';
import {createBattle,stepBattle,getObservation,exportReplay,replayBattle} from '../../js/engine/battle.js';
import {chooseAction} from '../../js/bots/strategy.js';
const r=rules.kids;
const mobLike=(base,name)=>({...base,name,kind:'mob',mode:'snapshot'});
function pveScenario(mobCount) {
  const base=defaultScenario(r,1).teams[0][0],enemy=defaultScenario(r,1).teams[1][0];
  return {schemaVersion:1,size:mobCount,pve:true,firstSide:0,teams:[[base],Array.from({length:mobCount},(_,i)=>mobLike(enemy,`怪物${i+1}`))]};
}
test('pve: unequal teams are accepted, tagged and use the larger side\'s arena',()=>{
  for(const n of [1,2,3,4]){
    const b=createBattle(pveScenario(n),r,7);
    assert.equal(b.units.length,1+n);assert.equal(b.arena,r.arenas[n]);
    const o=getObservation(b,'0-0');
    assert.deepEqual(o.units.map(u=>u.kind),['player',...Array(n).fill('mob')]);
  }
});
test('pve: validation still fails closed',()=>{
  const s=pveScenario(2);
  assert.throws(()=>createBattle({...s,size:3},r),/size/);
  assert.throws(()=>createBattle({...s,pve:false},r),/相等|mob|怪物/);
  const pvp=defaultScenario(r,1);pvp.teams[1][0]={...pvp.teams[1][0],kind:'mob'};
  assert.throws(()=>createBattle(pvp,r),/PvE/);
  assert.throws(()=>createBattle({...pveScenario(1),teams:[[{...s.teams[0][0],kind:'pet'}],s.teams[1].slice(0,1)]},r),/kind/);
});
test('pve: deterministic to the end, replayable, mobs recycle their deck instead of growing it',()=>{
  const s=pveScenario(3);
  const run=seed=>{const b=createBattle(s,r,seed);while(!b.finished){const acting=b.units.filter(u=>u.side===b.side&&u.hp>0);stepBattle(b,acting.map(u=>chooseAction(getObservation(b,u.id),r,'tactical',seed)));}return b;};
  const a=run(11),b=run(11);
  assert.deepEqual(a.result,b.result);assert.deepEqual(a.events,b.events);
  assert.ok(a.finished&&a.result.units.every(u=>['player','mob'].includes(u.kind)));
  const replay=replayBattle(exportReplay(a),r);assert.deepEqual(replay.result,a.result);
  const recycles=a.events.filter(e=>e.type==='recycle').length,fizzles=a.events.filter(e=>e.type==='fizzle').length;
  for(const u of a.units.filter(u=>u.kind==='mob')){assert.ok(u.deck.length<=u.deckSource.length*(recycles+1)+fizzles,`deck of ${u.id} grew beyond recycles`);assert.ok(u.drawIndex<=u.deck.length);}
  assert.ok(a.units.find(u=>u.kind==='player').recycleDeck===false,'players only recycle when the scenario asks');
});
