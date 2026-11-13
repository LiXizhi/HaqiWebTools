import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as A from '../js/adventure_core.js';
import * as P from '../js/combat_pve_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {useCard,tickDots} from '../js/combat_cards_core.js';
import {attackTacticEffects,cardTacticAdvice} from '../js/battle_tactics_core.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../data/'+f,import.meta.url)));
const {content,dataset}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
function start(){
 const save=A.createAdventure(content,{starter:'dragon_green',school:'fire',seed:17});
 save.openingJourney={version:1,phase:'offer'};A.beginEncounter(save,content,'ice-scout');
 const b=P.restorePveBattle(dataset,content,save.pendingEncounter);b.resolved.fairPlay={...b.resolved.fairPlay,forceAccuracy:100};return b;
}
function setup(b,{boost=false,trap=false,shield=false,weaken=false}={}){
 const actor=b.sides.near[0],target=b.sides.far[0],R=b.resolved;
 const find=(field,positive)=>Number(Object.entries(R[field]).find(([,e])=>['fire','all'].includes(String(e.school).toLowerCase())&&(positive?Number(e.boost_damage)>0:Number(e.boost_damage)<0))[0]);
 actor.charms=[];target.wards=[];
 if(boost)actor.charms.push(find('charms',true));
 if(weaken)actor.charms.push(find('charms',false));
 if(trap)target.wards.push({id:find('wards',true)});
 if(shield)target.wards.push({id:find('wards',false)});
 return {actor,target,card:R.cards.Fire_SingleAttack_Level0_45};
}
function strike(options){
 const b=start(),{actor,target,card}=setup(b,options),before=target.hp;
 const actual=[];b.onStatusEffect=e=>actual.push(e);
 const snapshot=JSON.stringify(b),preview=attackTacticEffects(b,actor,target,card);
 assert.equal(JSON.stringify(b),snapshot);
 useCard(b,actor,card,target);
 return {damage:before-target.hp,preview,actual};
}
test('tactical explanation follows real buff, trap, shield and weakness consumption',()=>{
 const plain=strike({}),boost=strike({boost:true}),combo=strike({boost:true,trap:true}),shield=strike({shield:true}),weak=strike({weaken:true});
 assert.ok(boost.damage>plain.damage);assert.ok(combo.damage>boost.damage);
 assert.ok(shield.damage<plain.damage);assert.ok(weak.damage<plain.damage);
 for(const result of [boost,combo,shield,weak])assert.deepEqual(result.preview.effects.map(e=>[e.kind,e.id]),result.actual.filter(e=>e.type==='effect_used').map(e=>[e.kind,e.id]));
});
test('preview is read-only, follows school matching and consumes only one same-family layer',()=>{
 const b=start(),{actor,target,card}=setup(b,{boost:true,trap:true});
 actor.charms.push(actor.charms[0]);target.wards.push({...target.wards[0]});
 const before=JSON.stringify(b),trace=attackTacticEffects(b,actor,target,card);
 assert.equal(trace.effects.length,2);assert.equal(JSON.stringify(b),before);
 const mismatch={...card,spellSchool:'ice',params:{...card.params,damage_school:'ice'}};
 const fireOnly=id=>String(b.resolved.charms[id].school).toLowerCase()==='fire';
 actor.charms=actor.charms.filter(fireOnly);target.wards=target.wards.filter(w=>String(b.resolved.wards[w.id].school).toLowerCase()==='fire');
 assert.equal(attackTacticEffects(b,actor,target,mismatch).effects.length,0);
});
test('selected effect cards teach the recipient and follow-up instead of generic target instruction',()=>{
 const b=start(),actor=b.sides.near[0],R=b.resolved;
 assert.match(cardTacticAdvice(b,actor,R.cards.Fire_FireDamageBlade).text,/队友.*强化.*烈火攻击/);
 assert.match(cardTacticAdvice(b,actor,R.cards.Fire_FireDamageTrap).text,/对手.*陷阱.*烈火攻击/);
 assert.match(cardTacticAdvice(b,actor,R.cards.Ice_GlobalShield).text,/保护.*加盾/);
 assert.equal(cardTacticAdvice(b,actor,{type:'SingleAttackWithDOT',params:{}}),null);
});

test('group status advice reads the actual singular parameters and names the affected side',()=>{
 const b=start(),actor=b.sides.near[0],R=b.resolved;
 for(const [key,kind,side,field]of [
  ['Death_AreaDamageWeakness','weaken','far','charms'],
  ['Storm_AreaDamageTrap','trap','far','wards'],
  ['Balance_AreaGlobalShield_Pandora_01','shield','near','wards'],
 ]){
  const card=R.cards[key],advice=cardTacticAdvice(b,actor,card);
  assert.equal(advice.kind,kind);assert.match(advice.text,side==='far'?/敌方全体/:/己方全体/);
  const id=Number(card.params[field.slice(0,-1)]);assert.ok(Number.isFinite(id));
  useCard(b,actor,card,b.sides.far[0]);
  for(const unit of b.sides[side])assert.ok(field==='charms'?unit.charms.includes(id):unit.wards.some(w=>w.id===id),key+' applies to '+unit.id);
 }
 const single={...R.cards.Fire_FireDamageBlade,params:{charm:R.cards.Fire_FireDamageBlade.params.charms}};
 assert.equal(cardTacticAdvice(b,actor,single).kind,'boost');
});

test('ongoing damage advice follows cast-time charms and wards applied after casting',()=>{
 function run({boost=false,shieldAfterCast=false}={}){
  const b=start(),{actor,target}=setup(b,{boost}),card=b.resolved.cards.Fire_AreaDOTAttack_Level5;
  target.hp=5000;
  const before=JSON.stringify(b),advice=cardTacticAdvice(b,actor,card,[target]);
  assert.equal(JSON.stringify(b),before);assert.equal(advice.kind,'dot');
  assert.match(advice.text,/施放时.*强化.*每段伤害发生时.*当时的护盾/);
  assert.equal(useCard(b,actor,card,target).ok,true);
  assert.equal(actor.charms.filter(Boolean).length,0);assert.equal(target.hp,5000);
  if(shieldAfterCast){
   const id=Number(Object.entries(b.resolved.wards).find(([,w])=>['fire','all'].includes(String(w.school).toLowerCase())&&Number(w.boost_damage)<0)[0]);
   target.wards.push({id});
  }
  const beforeFirst=target.hp;tickDots(b,target);const first=beforeFirst-target.hp;
  assert.equal(target.wards.filter(w=>w.id).length,0);
  const beforeSecond=target.hp;tickDots(b,target);
  return {first,second:beforeSecond-target.hp};
 }
 const plain=run(),boosted=run({boost:true}),shielded=run({shieldAfterCast:true});
 assert.ok(boosted.first>plain.first);assert.ok(boosted.second>plain.second);
 assert.ok(shielded.first<plain.first);assert.equal(shielded.second,plain.second);
});
