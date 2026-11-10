import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as A from '../js/adventure_core.js';
import * as P from '../js/combat_pve_core.js';
import {SimpleBot} from '../js/combat_policy_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {openingEnemyIntent} from '../js/opening_training_core.js';
import {companionWorldGuide,guidePet} from '../js/companion_guide_core.js';
import {observeBattle,haqiRulesAdapter} from '../js/battle_ai/haqi_adapter_core.js';
import {analyzeDecision} from '../js/battle_ai/inference_core.js';
const read=file=>JSON.parse(fs.readFileSync(new URL('../data/'+file,import.meta.url)));
const {content,dataset}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
function start(id,seed=1,school='fire'){
 const save=A.createAdventure(content,{starter:'dragon_green',school,seed});
 save.openingJourney={version:1,phase:'offer'};
 A.beginEncounter(save,content,id);
 return {save,battle:P.restorePveBattle(dataset,content,save.pendingEncounter)};
}
test('training is versioned and old checkpoints retain original enemies',()=>{
 const {save,battle}=start('ice-scout');
 assert.equal(battle.sides.far[0].maxHp,260);
 assert.match(openingEnemyIntent(battle),/护盾/);
 const old=structuredClone(save.pendingEncounter);delete old.openingTrainingVersion;
 assert.equal(P.restorePveBattle(dataset,content,old).sides.far[0].maxHp,130);
});
test('ice opponent actually casts its shield before the player action; replay retains the result',()=>{
 const {save,battle}=start('ice-scout');
 const action=new SimpleBot().pick(battle,battle.sides.near[0]);
 P.playPveRound(battle,action);A.recordDecision(save,action,battle);
 assert.ok(battle.events.some(e=>e.type==='cast'&&e.card==='Ice_GlobalShield'||e.type==='cast'&&e.key==='Ice_GlobalShield'));
 const restored=P.restorePveBattle(dataset,content,save.pendingEncounter);
 assert.equal(restored.sides.far[0].hp,battle.sides.far[0].hp);
 assert.equal(restored.sides.near[0].hp,battle.sides.near[0].hp);
});
test('storm charge gives an honest warning before its third-round heavy attack',()=>{
 const {battle}=start('storm-scout');
 P.playPveRound(battle,{pass:true});
 assert.match(openingEnemyIntent(battle),/不攻击/);
 const hp=battle.sides.near[0].hp;
 P.playPveRound(battle,{pass:true});
 assert.equal(battle.sides.near[0].hp,hp);
 assert.match(openingEnemyIntent(battle),/重击/);
 P.playPveRound(battle,{pass:true});
 assert.ok(battle.sides.near[0].hp<hp);
});
test('companion gives real current objectives and does not mutate progress',()=>{
 const {save}=start('fire-scout');delete save.pendingEncounter;
 const before=JSON.stringify(save);
 assert.equal(guidePet(save,content),'dragon_green');
 assert.equal(companionWorldGuide(save,content).track,'opening-journey');
 save.zone='unknown-island';
 assert.equal(companionWorldGuide(save,content).panel,'quests');
 save.zone='camp';assert.equal(JSON.stringify(save),before);
});
test('all five starter schools can finish the first lesson with existing cards',()=>{
 const bot=new SimpleBot();
 for(const school of ['fire','ice','storm','life','death']){
  const {battle}=start('fire-scout',31,school);let rounds=0;
  while(!battle.finished&&rounds++<15)P.playPveRound(battle,bot.pick(battle,battle.sides.near[0]));
  assert.equal(battle.winner,'near',school);assert.ok(rounds<=6,school+' needs '+rounds+' rounds');
 }
});
test('advisory analysis retains the battle identity after storm status effects',()=>{
 const {battle}=start('storm-scout');
 for(let i=0;i<3;i++)P.playPveRound(battle,{pass:true});
 const observation=observeBattle(battle,battle.sides.near[0].id),before=structuredClone(observation);
 const result=analyzeDecision(observation,{rulesAdapter:haqiRulesAdapter,difficulty:'expert'});
 assert.deepEqual(observation,before);
 assert.equal(result.stateId,haqiRulesAdapter.stateId(before));
});
