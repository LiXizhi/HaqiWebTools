import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installExpansion} from '../js/adventure_expansion_core.js';
import * as A from '../js/adventure_core.js';
import {createTacticsTraining} from '../js/tactics_training_core.js';
import {useCard} from '../js/combat_cards_core.js';
import {captureBattlePresentation} from '../js/view_battle_presentation.js';
import {roundTacticsReport,recordTacticsRound,settleTacticsRecord,validateTacticsRecords} from '../js/battle_tactics_journal_core.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../data/'+f,import.meta.url)));
const {content,dataset}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
function scenario(defensive=false){
 const b=createTacticsTraining(dataset,{lessonId:'focus',seed:23}).arena;
 const actor=defensive?b.sides.far[0]:b.sides.near[0],target=defensive?b.sides.near[0]:b.sides.far[0];
 const find=(field,positive)=>Number(Object.entries(b.resolved[field]).find(([,e])=>['fire','all'].includes(String(e.school).toLowerCase())&&(positive?Number(e.boost_damage)>0:Number(e.boost_damage)<0))[0]);
 actor.charms=[find('charms',!defensive)];target.wards=[{id:find('wards',!defensive)}];
 const playback=captureBattlePresentation(b,()=>useCard(b,actor,b.resolved.cards.Fire_SingleAttack_Level0_45,target));
 return {b,playback,report:roundTacticsReport(b,playback.events)};
}
test('records only actual friendly effects consumed by the engine, including same-hit combinations',()=>{
 const attack=scenario(),guard=scenario(true);
 assert.equal(attack.report.boost,1);assert.equal(attack.report.trap,1);assert.equal(attack.report.combo,1);assert.equal(attack.report.teamCombo,1);
 assert.equal(attack.report.shield,0);assert.equal(guard.report.weaken,1);assert.equal(guard.report.shield,1);assert.equal(guard.report.guardCombo,1);assert.equal(guard.report.combo,0);
 const unrelated=roundTacticsReport(attack.b,[{type:'effect_used',target:attack.b.sides.far[0].id,kind:'charm',id:attack.b.resolved.cards.Fire_FireDamageBlade.params.charms}]);
 assert.equal(unrelated.boost,0,'enemy buffs are not the player\'s accomplishment');
});
test('one round receipt is idempotent and optional records preserve old saves',()=>{
 const {b,playback}=scenario(),save=A.createAdventure(content,{school:'fire',seed:23}),pending={decisions:[{pass:true}]};
 assert.equal(recordTacticsRound(pending,b,playback),true);assert.equal(recordTacticsRound(pending,b,playback),false);assert.equal(pending.tactics.combo,1);
 b.winner='far';assert.equal(settleTacticsRecord(save,pending,b),null);assert.equal(save.tacticsRecord,undefined);
 b.winner='near';assert.deepEqual(settleTacticsRecord(save,pending,b),['combo','teamCombo']);
 assert.equal(save.tacticsRecord.wins,1);validateTacticsRecords(save);
 assert.deepEqual(A.parseSave(save,content).tacticsRecord,save.tacticsRecord);
 const legacy=A.createAdventure(content,{seed:23});assert.equal(A.parseSave(legacy,content).tacticsRecord,undefined);
 assert.throws(()=>validateTacticsRecords({...save,tacticsRecord:{...save.tacticsRecord,combo:-1}}),/无效/);
 assert.throws(()=>validateTacticsRecords({pendingEncounter:{...pending,decisions:[]}}),/不同步/);
 pending.decisions.push({pass:true});recordTacticsRound(pending,b,{events:[]});assert.equal(pending.tactics.combo,1);
});
