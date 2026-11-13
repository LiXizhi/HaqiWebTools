import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {SimpleBot} from '../js/combat_policy_core.js';
import {selectableCards} from '../js/combat_unit_core.js';
import {TACTICS_FIELD_ENCOUNTERS,createTacticsFieldBattle,playTacticsFieldRound,tacticsFieldCue,nextTacticsFieldId,recordTacticsFieldVictory} from '../js/tactics_field_battle_core.js';
import {validateTacticsTraining} from '../js/tactics_training_core.js';

const read=f=>JSON.parse(fs.readFileSync(new URL('../data/'+f,import.meta.url)));
const {content,dataset}=installExpansion(...['adventure/chapter.json','adventure/combat.json','adventure/pets.json','adventure/shop-candidates.json','kids/cards.json','kids/charms.json'].map(read));
const ATTACK='Fire_SingleAttack_Level0_45',BLADE='Fire_FireDamageBlade',TRAP='Fire_FireDamageTrap',SHIELD='Ice_GlobalShield',WEAK='Death_AreaDamageWeakness';
function session(lessonId='focus',seed=1){
 const create=()=>createTacticsFieldBattle(dataset,content,{lessonId,seed});
 return {create,battle:create(),decisions:[]};
}
function round(s,decision){
 const result=playTacticsFieldRound(s,{...decision,aiVersion:1});s.battle=result.battle;assert.equal(result.error,null);return result;
}
function cast(s,key,target){
 const card=selectableCards(s.battle.sides.near[0]).find(row=>row.key===key);assert.ok(card,key+' in hand');
 return round(s,{key,seq:card.seq,targetId:target});
}

test('every encounter runs normal monsters and autonomous allies to a genuine victory across seeds',()=>{
 for(const {id,size} of TACTICS_FIELD_ENCOUNTERS)for(const seed of [1,23,91]){
  const s=session(id,seed);assert.equal(s.battle.sides.near.length,size);assert.equal(s.battle.sides.far.length,size);
  assert.ok(s.battle.sides.near.slice(1).every(unit=>unit.arenaProfile));
  for(let turn=0;turn<45&&!s.battle.finished;turn++)round(s,new SimpleBot().pick(s.battle,s.battle.sides.near[0]));
  assert.equal(s.battle.finished,true,id+' seed '+seed);assert.equal(s.battle.winner,'near');assert.ok(s.decisions.length>1);
  assert.equal(tacticsFieldCue(s.battle),null);
 }
});

test('attacking immediately and passing are legal and never reset the fight to a prescribed step',()=>{
 const s=session(),start=s.battle.turn;cast(s,ATTACK,'mob0');
 assert.equal(s.battle.turn,start+1);assert.ok(s.battle.unitsById.mob0.hp<s.battle.unitsById.mob0.maxHp);
 const hp=s.battle.sides.near[0].hp;round(s,{pass:true});
 assert.equal(s.battle.turn,start+2);assert.ok(s.battle.sides.near[0].hp<hp);assert.equal(s.decisions.length,2);
 assert.equal(typeof tacticsFieldCue(s.battle).label,'string');
});

test('a real failed round restores prior state, AI choices and subsequent damage',()=>{
 const s=session('guard',91);round(s,{pass:true});const before=JSON.stringify(s.battle),history=JSON.stringify(s.decisions);
 const failed=playTacticsFieldRound(s,{card:'not-a-card',target:'mob0',aiVersion:1});
 assert.ok(failed.error);assert.equal(JSON.stringify(failed.battle),before);assert.equal(JSON.stringify(s.decisions),history);
 const control={create:s.create,battle:s.create(),decisions:[]};round(control,{pass:true});
 s.battle=failed.battle;round(s,{pass:true});round(control,{pass:true});assert.equal(JSON.stringify(s.battle),JSON.stringify(control.battle));
});

test('buff and trap alter actual attack damage and are consumed by the hit',()=>{
 const boosted=session(),plain=session();
 cast(boosted,BLADE,'hero');cast(boosted,TRAP,'mob0');
 round(plain,{pass:true});round(plain,{pass:true});
 const hpA=boosted.battle.unitsById.mob0.hp,hpB=plain.battle.unitsById.mob0.hp;
 cast(boosted,ATTACK,'mob0');cast(plain,ATTACK,'mob0');
 assert.ok(hpA-boosted.battle.unitsById.mob0.hp>hpB-plain.battle.unitsById.mob0.hp);
 assert.equal(boosted.battle.unitsById.mob0.wards.filter(w=>w.id).length,0);
});

test('shield then weakness reduces the telegraphed monster heavy attack',()=>{
 const protectedFight=session('guard'),exposed=session('guard');
 assert.match(tacticsFieldCue(protectedFight.battle).label,/护盾/);
 cast(protectedFight,SHIELD,'hero');round(exposed,{pass:true});
 assert.match(tacticsFieldCue(protectedFight.battle).label,/虚弱/);
 const a=protectedFight.battle.sides.near[0].hp,b=exposed.battle.sides.near[0].hp;
 cast(protectedFight,WEAK,'mob0');round(exposed,{pass:true});
 assert.ok(a-protectedFight.battle.sides.near[0].hp<b-exposed.battle.sides.near[0].hp);
});

test('only actual wins count, while old classroom saves remain valid but do not skip fights',()=>{
 const save={tacticsTraining:{version:1,completed:{focus:{runs:2,plain:45,actual:80}}}},s=session();
 validateTacticsTraining(save);assert.equal(nextTacticsFieldId(save),'focus');
 assert.equal(recordTacticsFieldVictory(save,s.battle),false);
 for(let i=0;i<40&&!s.battle.finished;i++)round(s,new SimpleBot().pick(s.battle,s.battle.sides.near[0]));
 assert.equal(recordTacticsFieldVictory(save,s.battle),true);validateTacticsTraining(save);
 assert.equal(save.tacticsTraining.completed.focus.fieldWins,1);assert.equal(nextTacticsFieldId(save),'break-shield');
 save.tacticsTraining.completed.focus.fieldWins=-1;assert.throws(()=>validateTacticsTraining(save),/实战记录/);
});
