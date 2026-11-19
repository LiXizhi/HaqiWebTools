import {playPveRound} from '../js/combat_pve_core.js';
import {buildHudTrackerViewModel} from '../js/adventure/presenters/hud_view_model.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {applyAction,createAdventure,parseSave} from '../js/adventure_core.js';
import {checkedProgress} from '../js/adventure_cloud_core.js';
import {adventureHonors,activeAdventureHonor} from '../js/adventure_honors_core.js';
import {createTacticsChallenge,tacticsLoanDeck,TACTICS_LOADOUTS,TACTICS_SCHOOLS,recordTacticsChallengeVictory,validateTacticsChallenges} from '../js/tactics_challenge_core.js';
import {selectableCards} from '../js/combat_unit_core.js';
import {tacticalHandRole} from '../js/battle_tactics_core.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../data/'+f,import.meta.url)));
const {content,dataset}=installExpansion(...['adventure/chapter.json','adventure/combat.json','adventure/pets.json','adventure/shop-candidates.json','kids/cards.json','kids/charms.json'].map(read));
test('compact hand labels match the native effects of every loan card',()=>{
 for (const school of Object.keys(TACTICS_SCHOOLS)) {
  const b=createTacticsChallenge(dataset,content,{school});
  const roles=tacticsLoanDeck(school).map(row=>tacticalHandRole(b,b.sides.near[0],b.resolved.cards[row.key]));
  assert.deepEqual(roles,[
   '小攻', school==='fire'?'灼烧':'攻击', {fire:'灼烧',death:'吸血'}[school]||'攻击',
   '强化','陷阱','护盾','虚弱','治疗',
  ]);
 }
});
test('loan inputs reject inherited object keys and non-string coercion',()=>{
 for(const invalid of ['constructor','toString','__proto__',null,{},['fire']]){
  assert.throws(()=>tacticsLoanDeck(invalid,'balanced'),/挑战学派无效/);
  assert.throws(()=>tacticsLoanDeck('fire',invalid),/挑战配卡无效/);
 }
 assert.equal('counterMode' in createTacticsChallenge(dataset,content).tacticalEncounter,false);
});
test('five loan schools use existing cards with random hands and unchanged same-level equipment',()=>{
 for(const school of Object.keys(TACTICS_SCHOOLS)){
  const a=createTacticsChallenge(dataset,content,{school,seed:1}),b=createTacticsChallenge(dataset,content,{school,seed:99});
  assert.equal(a.sides.near[0].level,5);assert.equal(a.sides.near[0].school,school);
  assert.ok(tacticsLoanDeck(school).every(row=>a.resolved.cards[row.key]));
  assert.notDeepEqual(selectableCards(a.sides.near[0]).map(c=>c.key),selectableCards(b.sides.near[0]).map(c=>c.key));
 }
});
test('wins persist across normal save and cloud allowlist without currency or experience reward',()=>{
 const save=createAdventure(content),battle=createTacticsChallenge(dataset,content);
 const before=structuredClone(save);assert.equal(recordTacticsChallengeVictory(save,battle),false);assert.deepEqual(save,before);
 battle.finished=true;battle.winner='near';battle.turn=5;battle.completedDecisions=4;
 assert.equal(recordTacticsChallengeVictory(save,battle),true);recordTacticsChallengeVictory(save,battle);
 assert.deepEqual(save.tacticsChallenges.completed.normal,{wins:2,bestRounds:4});
 const {tacticsChallenges,...rest}=save;assert.deepEqual(rest,before);
 assert.deepEqual(parseSave(JSON.stringify(save),content).tacticsChallenges,tacticsChallenges);
 assert.deepEqual(checkedProgress(save,content,dataset).save.tacticsChallenges,tacticsChallenges);
 assert.equal(adventureHonors(save).find(r=>r.id==='tactical:normal').earned,true);
 save.tacticsRecord={combo:1};assert.equal(activeAdventureHonor(save).id,'tactical:normal');
});
test('equipping an earned challenge honor persists through local and cloud saves',()=>{
 const save=createAdventure(content);
 for(const id of ['normal','boss']){
  const battle=createTacticsChallenge(dataset,content,{id});
  Object.assign(battle,{finished:true,winner:'near',completedDecisions:6});
  recordTacticsChallengeVictory(save,battle);
 }
 const wear=id=>applyAction(save,content,{type:'equip-tactics-honor',id});
 assert.equal(activeAdventureHonor(save).id,'tactical:boss');
 assert.equal(wear('normal').changed,true);
 assert.equal(activeAdventureHonor(parseSave(JSON.stringify(save),content)).id,'tactical:normal');
 assert.equal(activeAdventureHonor(checkedProgress(save,content,dataset).save).id,'tactical:normal');
 assert.throws(()=>wear('elite'),/尚未获得/);
 assert.throws(()=>validateTacticsChallenges({tacticsChallenges:{...save.tacticsChallenges,equipped:'elite'}}),/尚未获得/);
 wear(null);
 assert.equal(activeAdventureHonor(save).id,'tactical:boss');
});
test('old saves remain valid and malformed challenge claims are rejected',()=>{
 validateTacticsChallenges({});
 for(const completed of [{unknown:{wins:1,bestRounds:1}},{normal:{wins:0,bestRounds:1}},{normal:{wins:1,bestRounds:-1}}])assert.throws(()=>validateTacticsChallenges({tacticsChallenges:{version:1,completed}}));
});

test('loadout choices keep native copy limits and distinct preparation tradeoffs',()=>{
 for(const school of Object.keys(TACTICS_SCHOOLS))for(const loadout of Object.keys(TACTICS_LOADOUTS)){
 const deck=tacticsLoanDeck(school,loadout),b=createTacticsChallenge(dataset,content,{school,loadout});
 assert.equal(deck.reduce((n,r)=>n+r.count,0),loadout==='attack'?12:20);
 assert.ok(deck.every(r=>r.count<=4&&b.resolved.cards[r.key]));assert.equal(b.tacticsField.loadout,loadout);
 }
 assert.notDeepEqual(tacticsLoanDeck('fire','burst'),tacticsLoanDeck('fire','guard'));
});

test('new visitor keeps tutorial tracker and optional challenge entry together',()=>{
 const save=createAdventure(content);save.zone='camp';save.openingJourney={version:1,phase:'offer'};const vm=buildHudTrackerViewModel({save,assets:{content,dataset}});assert.ok(vm.tacticsGoal);assert.equal(vm.mode,'opening');assert.ok(vm.payload.goal);assert.equal(vm.tacticsGoal.id,'focus');
});

test('only challenge hands initialize and refill at six native random cards',()=>{
 for(const school of Object.keys(TACTICS_SCHOOLS))for(const id of ['normal','elite','boss']){const b=createTacticsChallenge(dataset,content,{school,id,seed:101});assert.equal(b.resolved.global.handSize,6);assert.equal(selectableCards(b.sides.near[0]).length,6);for(let n=0;n<4&&!b.finished;n++){playPveRound(b,{pass:true,aiVersion:1});assert.ok(selectableCards(b.sides.near[0]).length<=6);}}
});
