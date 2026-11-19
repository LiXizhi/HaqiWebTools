import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {createTacticsChallenge} from '../js/tactics_challenge_core.js';
import {playPveRound} from '../js/combat_pve_core.js';
import {playTacticsFieldRound} from '../js/tactics_field_battle_core.js';
import {lockTacticalIntents,tacticalEnemyIntents,tacticalNextIntents,tacticalEffectDetails,recordTacticalStatus} from '../js/tactical_encounter_core.js';
import {useCard,tickDots} from '../js/combat_cards_core.js';
import {observeBattle} from '../js/battle_ai/haqi_adapter_core.js';
import {describeIntent,preparedHitDetail} from '../js/views/adventure/view_tactical_intents.js';
import {spellEffect,effectDuration,validateSpellEffects} from '../js/spell_effects_core.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../data/'+f,import.meta.url)));
const {content,dataset}=installExpansion(...['adventure/chapter.json','adventure/combat.json','adventure/pets.json','adventure/shop-candidates.json','kids/cards.json','kids/charms.json'].map(read));
const battle=(id='boss')=>createTacticsChallenge(dataset,content,{id,seed:17});
test('every tactical runtime card resolves real spell art and duration; cloned statuses retain native icons',()=>{
 const effects=read('adventure/spell-effects.json');
 for(const id of ['normal','elite','boss']){
  const a=battle(id);
  for(const card of Object.values(a.resolved.cards)){assert.ok(spellEffect(effects,card));assert.ok(effectDuration(effects,card)>0);}
  validateSpellEffects(effects,a.resolved.cards);
  assert.equal(a.resolved.charms[900011].icon_gsid,a.resolved.charms[31].icon_gsid);
  assert.equal(spellEffect(effects,a.resolved.cards.Fire_FireDamageBlade_Adv).base,effects.cards.Fire_FireDamageBlade_Adv.base);
 }
});
test('challenge preparation preserves player status values and counter window requires actual native consumption',()=>{
 const original=JSON.stringify(dataset.charms);
 for(const id of ['normal','elite','boss'])for(const mode of ['shield','weak','none','controlled']){
  const a=battle(id);a.resolved.fairPlay={...a.resolved.fairPlay,forceAccuracy:100};
  assert.equal(a.resolved.charms[11].boost_damage,dataset.charms.charm[11].boost_damage);
  assert.equal(a.resolved.wards[42].boost_damage,20);
  assert.equal(a.resolved.charms[900011].boost_damage,{normal:65,elite:100,boss:75}[id]);
  playPveRound(a,{pass:true});
  const intent=tacticalEnemyIntents(a)[0],target=a.unitsById[intent.targetId],caster=a.sides.far[0];
  for(const unit of a.sides.near){unit.wards=[];if(unit!==a.sides.near[0])unit.stunned=1;}
  caster.charms=caster.charms.filter(id=>Number(a.resolved.charms[id]?.boost_damage)>=0);
  assert.match(intent.counter,/消耗护盾或虚弱.*100%/);
  if(mode==='shield')target.wards.push({id:Number(a.resolved.cards.Ice_GlobalShield.params.wards)});
  if(mode==='weak'){const p=a.resolved.cards.Death_AreaDamageWeakness.params;caster.charms.push(Number(p.charm??p.charms));}
  if(mode==='controlled')caster.stunned=1;
  playPveRound(a,{pass:true});
  const window=a.events.find(e=>e.type==='tactic_counter_window');
  assert.equal(!!window,['shield','weak'].includes(mode),id+mode);
  if(window){assert.equal(window.caster,'mob0');assert.equal(window.boost,100);assert.ok(target.charms.includes(window.statusId));}
 }
 assert.equal(JSON.stringify(dataset.charms),original);
 assert.equal(dataset.charms.charm[900011],undefined);
});
test('locked previews use the native accuracy and direct heavy values',()=>{
 for(const id of ['normal','elite']){
 const a=battle(id),intent=tacticalNextIntents(a)[0];
 assert.equal(intent.key,'Fire_Pet_SingleAttack_FireRockyOgresDominance');
 assert.equal(intent.baseAccuracy,75);
 assert.equal(intent.baseAccuracy,a.resolved.cards[intent.key].accuracy);
 assert.deepEqual(intent.effects.damage,{min:370,max:370});
 assert.deepEqual(intent.effects.dot,[]);
 assert.match(intent.effectDetail,/基础命中率75%.*即时伤害370/);
 const queued=tacticalNextIntents(a);
 a.sides.near[0].charms.push(1);
 assert.deepEqual(tacticalNextIntents(a),queued);
 }
});

test('heavy forecast follows the announced preparation and the actual status when the turn advances',()=>{
 for(const [id,boost,damage] of [['normal',65,611],['elite',100,740]]){
  const a=battle(id);
  a.resolved.fairPlay={...a.resolved.fairPlay,forceAccuracy:100};
  assert.ok(describeIntent(a,tacticalEnemyIntents(a)[0],true).includes('+'+boost+'%'));
  assert.ok(preparedHitDetail(a,tacticalNextIntents(a)[0]).includes('若本轮蓄力成功，重击命中约 '+damage));
  const hero=a.sides.near[0],startHp=hero.hp;
  hero.hp=damage+1;
  assert.doesNotMatch(describeIntent(a,tacticalNextIntents(a)[0],true),/未减伤/);
  hero.hp=damage;
  assert.ok(describeIntent(a,tacticalNextIntents(a)[0],true).includes('未减伤命中约'+damage));
  hero.hp=startHp;
  if(id==='elite'){
   const ally=a.sides.near[1],startAllyHp=ally.hp;
   ally.hp=damage;
   const allyIntent={...tacticalNextIntents(a)[0],targetId:ally.id};
   assert.match(describeIntent(a,allyIntent,true),/可能击倒茜茜/);
   ally.hp=startAllyHp;
  }
  playPveRound(a,{pass:true});
  assert.ok(preparedHitDetail(a,tacticalEnemyIntents(a)[0]).includes('蓄力已生效，重击命中约 '+damage));
  a.sides.far[0].charms=[];
  assert.equal(preparedHitDetail(a,tacticalEnemyIntents(a)[0]),'');
  assert.doesNotMatch(describeIntent(a,tacticalEnemyIntents(a)[0],true),/未减伤/);
 }
 const boss=battle('boss');
 assert.equal(preparedHitDetail(boss,tacticalNextIntents(boss)[0]),'');
});
test('locked native DOT detail separates immediate damage and every periodic tick',()=>{
 const a=battle('boss'),intent=tacticalNextIntents(a)[0],p=a.resolved.cards[intent.key].params;
 assert.deepEqual(intent.effects.damage,{min:Number(p.damage_min),max:Number(p.damage_max)});
 assert.deepEqual(intent.effects.dot,String(p.dots).split(',').map(Number));
 assert.match(intent.effectDetail,/即时伤害.*持续3次/);assert.match(intent.mitigationDetail,/施法时.*虚弱/);
 const heal=tacticalEffectDetails(a.resolved.cards.Life_SingleHeal_Level0,a.resolved,a.sides.far[0]);
 assert.ok(heal.effects.heal.min>0);assert.match(heal.effectDetail,/即时治疗/);
 const shield=tacticalEffectDetails(a.resolved.cards.Ice_GlobalShield,a.resolved,a.sides.far[0]);
 assert.ok(shield.effects.modifiers.some(m=>m.kind==='ward'&&m.damagePercent<0));
 const weak=tacticalEffectDetails(a.resolved.cards.Death_AreaDamageWeakness,a.resolved,a.sides.far[0]);
 assert.ok(weak.effects.modifiers.some(m=>m.kind==='charm'&&m.damagePercent<0));
});
test('blade counter reward snapshots the entire fire DOT without stacking a trap',()=>{
 const run=reward=>{
  const a=battle(),hero=a.sides.near[0],enemy=a.sides.far[0];
  a.resolved.fairPlay={...a.resolved.fairPlay,forceAccuracy:100};
  playPveRound(a,{pass:true});
  assert.equal(tacticalEnemyIntents(a)[0].targetId,hero.id);
  hero.wards.push({id:Number(a.resolved.cards.Ice_GlobalShield.params.wards)});
  playPveRound(a,{pass:true});
  const event=a.events.find(e=>e.type==='tactic_counter_window');
  assert.equal(event.kind,'charm');assert.equal(event.targetId,hero.id);
  assert.equal(enemy.wards.some(w=>Number(w.id)===900042),false);
  if(!reward)hero.charms=hero.charms.filter(id=>id!==event.statusId);
  enemy.wards=[];hero.pips={normal:4,power:0};
  const start=a.events.length;
  useCard(a,hero,a.resolved.cards.Fire_SingleAttackWithDOT_Level2,enemy);
  tickDots(a,enemy);tickDots(a,enemy);
  assert.equal(hero.charms.includes(event.statusId),false);
  return a.events.slice(start).filter(e=>e.type==='damage'||e.type==='dot').map(e=>e.amount);
 };
 const plain=run(false),boosted=run(true);
 assert.equal(plain.length,3);assert.equal(boosted.length,3);
 for(let i=0;i<3;i++)assert.ok(Math.abs(boosted[i]-plain[i]*2)<=1);
});
test('boss preparation announces a native breakable shield and consumes only one damage segment',()=>{
 const a=battle(),enemy=a.sides.far[0],hero=a.sides.near[0];
 a.resolved.fairPlay={...a.resolved.fairPlay,forceAccuracy:100};
 const intent=tacticalEnemyIntents(a)[0];
 assert.match(intent.effectDetail,/护盾/);assert.match(intent.counter,/小攻击.*持续伤害/);
 assert.ok(intent.effects.modifiers.some(row=>row.kind==='ward'&&row.damagePercent===-50));
 playPveRound(a,{pass:true});
 const event=a.events.find(row=>row.type==='tactic_prepare_guard');
 assert.equal(event.caster,enemy.id);assert.equal(event.boost,-50);
 assert.equal(a.events.filter(row=>row.type==='cast'&&row.caster===enemy.id).length,1);
 assert.ok(enemy.wards.some(row=>Number(row.id)===event.statusId));
 a.onStatusEffect=e=>recordTacticalStatus(a,e);
 useCard(a,hero,a.resolved.cards.Fire_SingleAttack_Level0_45,enemy);
 const first=a.events.findLast(row=>row.type==='damage').amount;
 assert.equal(enemy.wards.some(row=>Number(row.id)===event.statusId),false);
 useCard(a,hero,a.resolved.cards.Fire_SingleAttack_Level0_45,enemy);
 assert.ok(Math.abs(a.events.findLast(row=>row.type==='damage').amount-first*2)<=1);
 assert.ok(a.events.some(row=>row.type==='tactic_shield_break'&&row.caster===hero.id));
});
test('native immediate shield does not shield later DOT and new shield protects one tick',()=>{
 const run=(initial,late,weakBefore=false,weakAfter=false)=>{
  const a=battle('normal'),u=a.sides.far[0],target=a.sides.near[0];
  a.resolved.fairPlay={...a.resolved.fairPlay,forceAccuracy:100};u.pips={normal:4,power:0};
  const shield=String(a.resolved.cards.Ice_GlobalShield.params.wards).split(',')[0];
  const wp=a.resolved.cards.Death_AreaDamageWeakness.params,weakness=String(wp.charm??wp.charms).split(',')[0];
  a.onStatusEffect=e=>recordTacticalStatus(a,e);
  if(weakBefore)u.charms.push(weakness);
  if(initial)target.wards.push({id:shield});
  useCard(a,u,a.resolved.cards.Fire_SingleAttackWithDOT_Level2,target);
  const immediate=a.events.findLast(e=>e.type==='damage').amount;
  if(late)target.wards.push({id:shield});
  if(weakAfter)u.charms.push(weakness);
  tickDots(a,target);tickDots(a,target);
  const block=a.events.findLast(e=>e.type==='tactic_block');
  if(initial||late){assert.equal(block.segment,late?'dot':'immediate');assert.equal(block.key,'Fire_SingleAttackWithDOT_Level2');assert.equal(block.caster,u.id);}
  return {immediate,ticks:a.events.filter(e=>e.type==='dot').map(e=>e.amount)};
 };
 const plain=run(false,false),early=run(true,false),late=run(false,true);
 assert.ok(early.immediate<plain.immediate);assert.deepEqual(early.ticks,plain.ticks);
 assert.ok(late.ticks[0]<plain.ticks[0]);assert.equal(late.ticks[1],plain.ticks[1]);
 const before=run(false,false,true),after=run(false,false,false,true);
 assert.ok(before.immediate<plain.immediate);assert.ok(before.ticks[0]<plain.ticks[0]);assert.deepEqual(after,plain);
});
test('enemy public observation excludes player hand and private resource events',()=>{
 const a=battle('elite');a.events.push({type:'tactic_resources',hand:[{key:'secret'}]});
 const obs=observeBattle(a,'mob0');
 for(const u of obs.units.filter(u=>u.id!=='mob0')){assert.deepEqual(u.deckSeq,[]);assert.deepEqual(u.deckMap,[]);}
 assert.ok(obs.publicHistory.every(e=>!('hand' in e)));assert.ok(!JSON.stringify(obs.publicHistory).includes('secret'));
});
test('next intent is announced during preparation and stays locked through public changes',()=>{
 const a=battle(),queued=tacticalNextIntents(a);
 assert.equal(tacticalEnemyIntents(a)[0].kind,'buff');assert.equal(queued[0].kind,'attack');
 assert.ok(queued[0].baseDamage>0);assert.equal(queued[0].targetId,'hero');
 a.sides.near[0].hp-=10;playPveRound(a,{pass:true});
 assert.deepEqual(tacticalEnemyIntents(a),queued);
 assert.equal(tacticalNextIntents(a)[0].effect,'恢复');
});
test('boss phase change keeps committed move and grants no extra action',()=>{
 const a=battle(),queued=tacticalNextIntents(a);a.sides.far[0].hp=a.sides.far[0].maxHp*0.4;
 playPveRound(a,{pass:true});assert.equal(a.tacticalEncounter.phase,2);
 assert.deepEqual(tacticalEnemyIntents(a),queued);
 assert.equal(a.events.filter(e=>e.type==='cast'&&e.caster==='mob0').length,1);
 assert.equal(a.events.find(e=>e.type==='tactic_phase').extraAction,false);
});
test('elite inference has real public-state alternatives and ignores hidden player deck',()=>{
 const a=battle('elite'),b=battle('elite');
 a.sides.near[0].deckSeq.reverse();a.sides.near[0].deckMap.fill(0);
 for(const x of [a,b]){x.tacticalEncounter.queued=[];lockTacticalIntents(x);}
 assert.deepEqual(tacticalEnemyIntents(a),tacticalEnemyIntents(b));
 assert.ok(a.tacticalEncounter.intents.every(r=>r.policy==='reasoning'&&r.evaluated>1));
 const original=a.tacticalEncounter.intents[1].key;
 a.sides.far[0].hp=20;a.sides.far[1].pips={normal:4,power:0};a.tacticalEncounter.queued=[];lockTacticalIntents(a);
 assert.notEqual(a.tacticalEncounter.intents[1].key,original);
 assert.equal(a.tacticalEncounter.intents[1].key,'Life_SingleHeal_Level0');
 assert.equal(a.tacticalEncounter.intents[1].targetId,'mob0');
 assert.match(a.tacticalEncounter.intents[1].counter,/治疗者.*伤员/);
 assert.doesNotMatch(a.tacticalEncounter.intents[1].counter,/给锁定目标加盾/);
});

test('inferred shield and preparation advice follows final beneficial action',()=>{
 const a=battle('elite');
 const rows=tacticalEnemyIntents(a);
 assert.equal(rows[0].effect,'蓄力');
 assert.match(rows[0].counter,/准备期/);
 assert.equal(rows[1].effect,'守护');
 assert.match(rows[1].counter,/尚未上盾.*小攻击/);
 assert.doesNotMatch(rows[1].counter,/给锁定目标加盾/);
});
test('same seed decisions replay both intent queues and outcomes',()=>{
 for(const id of ['normal','elite','boss']){
  const a=battle(id),b=battle(id);
  for(let n=0;n<3;n++){playPveRound(a,{pass:true});playPveRound(b,{pass:true});}
  assert.deepEqual(a.tacticalEncounter,b.tacticalEncounter);assert.deepEqual(a.events,b.events);
 }
});

test('presentation failure after resolution rolls back RNG, frozen intents and phase state',()=>{
 for(const id of ['normal','elite','boss']){
  const create=()=>battle(id),a=create(),decisions=[];
  playTacticsFieldRound({battle:a,decisions,create},{pass:true,aiVersion:1});
  const expected=create();playPveRound(expected,decisions[0]);
  const failed=playTacticsFieldRound({battle:a,decisions,create},{pass:true,aiVersion:1},(current,resolve)=>{
   resolve();throw Error('presentation failed after native resolution');
  });
  assert.ok(failed.error);assert.equal(decisions.length,1);
  assert.deepEqual(failed.battle.tacticalEncounter,expected.tacticalEncounter);
  playPveRound(failed.battle,{pass:true,aiVersion:1});playPveRound(expected,{pass:true,aiVersion:1});
  assert.deepEqual(failed.battle.events,expected.events);
  assert.deepEqual(failed.battle.tacticalEncounter,expected.tacticalEncounter);
 }
});
test('dead locked target cancels instead of retargeting the surviving ally',()=>{
 const a=battle('elite');playPveRound(a,{pass:true});const intent=tacticalEnemyIntents(a)[0];
 assert.equal(intent.targetId,'hero');a.unitsById[intent.targetId].hp=0;
 playPveRound(a,{pass:true});
 assert.equal(a.tacticalEncounter.history.find(e=>e.caster==='mob0'&&e.turn===2).outcome,'target_unavailable');
 assert.equal(a.events.some(e=>e.type==='cast'&&e.caster==='mob0'&&e.turn===2),false);
});
test('control cancels a locked attack without substituting a different spell',()=>{
 const a=battle();playPveRound(a,{pass:true});a.sides.far[0].stunned=1;
 playPveRound(a,{pass:true});
 assert.equal(a.tacticalEncounter.history.find(e=>e.turn===2).outcome,'controlled');
});
test('native shield consumption is reported without presentation hooks',()=>{
 const a=battle();a.resolved.fairPlay={...a.resolved.fairPlay,forceAccuracy:100};
 playPveRound(a,{pass:true});
 const ward=String(a.resolved.cards.Ice_GlobalShield.params.wards||a.resolved.cards.Ice_GlobalShield.params.ward).split(',')[0];
 a.sides.near[0].wards.push({id:ward});playPveRound(a,{pass:true});
 const receipt=a.tacticalEncounter.history.find(e=>e.turn===2);
 assert.equal(receipt.shieldConsumed,true);assert.ok(receipt.damage.length);
 assert.ok(a.events.some(e=>e.type==='tactic_block'&&e.action==='consumed'&&e.boost<0));
 assert.ok(a.events.some(e=>e.type==='tactic_charge'&&e.action==='consumed'&&e.boost>0));
 assert.ok(a.events.some(e=>e.type==='tactic_resources'&&e.hand.every(c=>typeof c.affordable==='boolean')));
});
test('player native attacks expose actual enemy shield consumption',()=>{
 const a=battle('normal'),hero=a.sides.near[0];a.resolved.fairPlay={...a.resolved.fairPlay,forceAccuracy:100};
 const seq=hero.deckSeq.findIndex(k=>k==='Fire_SingleAttack_Level0_45');hero.deckMap[seq]=1;
 const ward=String(a.resolved.cards.Ice_GlobalShield.params.wards||a.resolved.cards.Ice_GlobalShield.params.ward).split(',')[0];
 a.sides.far[0].wards.push({id:ward});
 playPveRound(a,{seq,key:hero.deckSeq[seq],targetId:'mob0'});
 const event=a.events.find(e=>e.type==='tactic_shield_break');
 assert.equal(event.caster,'hero');assert.equal(event.targetId,'mob0');assert.equal(event.statusId,ward);
});
test('phase two weakness is announced a whole turn before its native cast',()=>{
 const a=battle();a.resolved.fairPlay={...a.resolved.fairPlay,forceAccuracy:100};
 a.sides.near[0].hp=a.sides.near[0].maxHp=10000;
 a.sides.far[0].hp=a.sides.far[0].maxHp*0.4;
 assert.equal(tacticalNextIntents(a)[0].effect,'重击');
 let announced=null;
 for(let i=0;i<8&&!announced;i++){
  const next=tacticalNextIntents(a).find(r=>r.kind==='weaken');
  if(next){announced={...next,announcedAt:a.turn};break;}
  playPveRound(a,{pass:true});
 }
 assert.ok(announced,'second phase must reach its native weakness branch');
 assert.equal(announced.scope,'all');assert.equal(announced.targetName,'我方全体');
 assert.deepEqual(announced.affectedTargetIds,a.sides.near.filter(u=>u.hp>0).map(u=>u.id));
 assert.equal(announced.turn,announced.announcedAt+1);
 playPveRound(a,{pass:true});
 assert.deepEqual(tacticalEnemyIntents(a)[0].affectedTargetIds,announced.affectedTargetIds);
 playPveRound(a,{pass:true});
 assert.ok(a.events.some(e=>e.type==='cast'&&e.caster==='mob0'&&e.card===announced.key&&e.turn===announced.turn));
 assert.equal(a.tacticalEncounter.history.find(e=>e.turn===announced.turn).outcome,'resolved');
});
test('announced all-target spell still affects survivors when its anchor dies',()=>{
 const a=battle('elite');a.resolved.fairPlay={...a.resolved.fairPlay,forceAccuracy:100};
 const key='Death_AreaDamageWeakness',caster=a.sides.far[0];
 caster.pips={normal:7,power:0};
 a.tacticalEncounter.intents[0]={...a.tacticalEncounter.intents[0],key,kind:'weaken',effect:'全体虚弱',scope:'all',targetId:'challenge-support',affectedTargetIds:['hero','challenge-support']};
 a.unitsById['challenge-support'].hp=0;
 playPveRound(a,{pass:true});
 assert.ok(a.events.some(e=>e.type==='cast'&&e.caster===caster.id&&e.card===key));
 assert.equal(a.tacticalEncounter.history.find(e=>e.caster===caster.id).outcome,'resolved');
 assert.ok(a.sides.near[0].charms.length>0);
});
test('five schools retain real native elite defense and healing with ordered locked receipts',()=>{
 for(const school of ['fire','ice','storm','life','death']){
  const a=createTacticsChallenge(dataset,content,{id:'elite',school,seed:17});
  a.resolved.fairPlay={...a.resolved.fairPlay,forceAccuracy:100};
  assert.equal(a.tacticalEncounter.intents[1].kind,'shield');
  const initial=structuredClone(a.tacticalEncounter.intents);
  playPveRound(a,{pass:true});
  const enemyEvents=a.events.filter(e=>e.turn===1&&['mob0','mob1'].includes(e.caster)&&['cast','tactic_resolution'].includes(e.type));
  assert.deepEqual(enemyEvents.map(e=>[e.type,e.caster]),[['cast','mob0'],['tactic_resolution','mob0'],['cast','mob1'],['tactic_resolution','mob1']]);
  for(const intent of initial)assert.equal(enemyEvents.find(e=>e.type==='cast'&&e.caster===intent.caster).card,intent.key);
  if(school==='fire')assert.equal(initial[1].targetId,'mob0');
  assert.ok(a.unitsById[initial[1].targetId].wards.length);
  a.sides.far[1].hp=a.sides.far[1].maxHp;a.sides.far[0].hp=150;a.sides.far[1].pips={normal:4,power:0};a.sides.far[1].cooldowns={};
  a.tacticalEncounter.queued=[];lockTacticalIntents(a);
  assert.equal(a.tacticalEncounter.intents[1].key,'Life_SingleHeal_Level0');
  assert.equal(a.tacticalEncounter.intents[1].targetId,'mob0');
  playPveRound(a,{pass:true});
  assert.ok(a.events.some(e=>e.type==='heal'&&e.target==='mob0'&&e.amount>0));
 }
});
test('elite charger prepares and spends native mana rather than only free poking',()=>{
 const a=battle('elite'),queued=tacticalNextIntents(a)[0];
 assert.equal(tacticalEnemyIntents(a)[0].effect,'蓄力');
 assert.equal(queued.effect,'重击');assert.equal(queued.turn,2);
 for(let i=0;i<6;i++)playPveRound(a,{pass:true});
 const rows=a.tacticalEncounter.history.filter(e=>e.caster==='mob0');
 assert.ok(rows.some(e=>e.effect==='蓄力'&&e.outcome==='resolved'));
 assert.ok(rows.some(e=>e.effect==='重击'&&e.outcome==='resolved'));
 assert.ok(rows.some(e=>e.outcome==='waiting'));
 assert.ok(a.events.some(e=>e.type==='tactic_charge'&&e.caster==='mob0'&&e.key===queued.key));
});
test('boss phase one repeats preparation with locked actions and a full recovery turn',()=>{
 const a=battle();a.sides.near[0].hp=a.sides.near[0].maxHp=50000;
 a.resolved.fairPlay={...a.resolved.fairPlay,forceAccuracy:100};
 for(let i=0;i<12;i++){
  const current=structuredClone(tacticalEnemyIntents(a)[0]);
  const next=structuredClone(tacticalNextIntents(a)[0]);
  playPveRound(a,{pass:true});
  const receipt=a.tacticalEncounter.history.find(e=>e.turn===current.turn&&e.caster==='mob0');
  assert.equal(receipt.key,current.key);assert.equal(receipt.targetId,current.targetId);
  assert.deepEqual(tacticalEnemyIntents(a)[0],next);
  const casts=a.events.filter(e=>e.type==='cast'&&e.caster==='mob0'&&e.turn===current.turn);
  assert.equal(casts.length,current.key?1:0);
 }
 const rows=a.tacticalEncounter.history.filter(e=>e.caster==='mob0');
 assert.ok(rows.filter(e=>e.effect==='蓄力'&&e.outcome==='resolved').length>=3);
 assert.ok(rows.filter(e=>e.effect==='重击'&&e.outcome==='resolved').length>=3);
 assert.equal(rows.some(e=>e.effect==='全体虚弱'),false);
 for(let i=0;i<rows.length-1;i++)if(rows[i].effect==='重击'){
  assert.equal(rows[i+1].effect,'恢复');assert.equal(rows[i+1].outcome,'waiting');
 }
});
test('boss phase two repeats preparation and suppression before later heavy attacks',()=>{
 const a=battle();a.sides.near[0].hp=a.sides.near[0].maxHp=50000;
 a.sides.far[0].hp=Math.floor(a.sides.far[0].maxHp*.49);
 for(let i=0;i<16;i++)playPveRound(a,{pass:true});
 const rows=a.tacticalEncounter.history.filter(e=>e.caster==='mob0'&&e.outcome==='resolved');
 const preparations=rows.filter(e=>e.effect==='蓄力');
 assert.ok(preparations.length>=3);
 assert.ok(rows.filter(e=>e.effect==='全体虚弱').length>=2);
 assert.ok(rows.filter(e=>e.effect==='重击').length>=3);
 const casts=a.events.filter(e=>e.type==='cast'&&e.caster==='mob0');
 assert.equal(new Set(casts.map(e=>e.turn)).size,casts.length);
 assert.ok(a.events.filter(e=>e.type==='tactic_charge'&&e.caster==='mob0').length>=3);
});



test('elite native direct heavy is payable on round two and shield reduces the whole hit',()=>{
 const run=shield=>{
  const a=battle('elite'),hero=a.sides.near[0];
  a.resolved.fairPlay={...a.resolved.fairPlay,forceAccuracy:100};
  hero.hp=hero.maxHp=10000;
  const announced=tacticalNextIntents(a)[0];
  for(const ally of a.sides.near.slice(1))ally.stunned=3;
  playPveRound(a,{pass:true});
  assert.equal(tacticalEnemyIntents(a)[0].key,announced.key);
  assert.equal(tacticalEnemyIntents(a)[0].targetId,announced.targetId);
  if(shield)hero.wards.push({id:Number(a.resolved.cards.Ice_GlobalShield.params.wards)});
  playPveRound(a,{pass:true});
  const receipt=a.tacticalEncounter.history.find(e=>e.caster==='mob0'&&e.turn===2);
  assert.equal(receipt.outcome,'resolved');
  assert.equal(receipt.pips.normal+receipt.pips.power,0);
  assert.equal(receipt.damage.length,1);
  assert.equal(receipt.shieldConsumed,shield);
  assert.equal(a.events.filter(e=>e.type==='cast'&&e.caster==='mob0').length,2);
  assert.equal(hero.dots.length,0);
  return receipt.damage[0].amount;
 };
 const full=run(false),blocked=run(true);
 assert.ok(Math.abs(blocked-full/2)<=1);
});
