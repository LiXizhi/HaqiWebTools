import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as A from '../js/adventure_core.js';
import * as P from '../js/combat_pve_core.js';
import {SimpleBot} from '../js/combat_policy_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {openingTrainingMonsters,openingEnemyIntent,openingStrategyCue} from '../js/opening_training_core.js';
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

test('intent stops announcing a shield after the opening, and no longer promises scripted charge after its sequence',()=>{
 const ice=start('ice-scout').battle;P.playPveRound(ice,{pass:true});
 assert.doesNotMatch(openingEnemyIntent(ice),/开护盾/);
 const storm=start('storm-scout').battle;storm.turn=14;
 assert.doesNotMatch(openingEnemyIntent(storm),/不攻击|蓄力/);
 storm.finished=true;assert.equal(openingEnemyIntent(storm),null);
});

test('new training checkpoints have stable HP across seeds, while old rare-trait battles replay unchanged',()=>{
 for(let seed=1;seed<=100;seed++){
  const {save,battle}=start('ice-scout',seed);
  assert.equal(save.pendingEncounter.openingTrainingVersion,3);
  assert.deepEqual(save.pendingEncounter.monsterTraits,[{}]);
  assert.equal(battle.sides.far[0].maxHp,260,`seed ${seed}`);
 }
 const {save}=start('ice-scout',35),legacy=structuredClone(save.pendingEncounter);
 legacy.openingTrainingVersion=1;legacy.monsterTraits=[{vitality:6}];
 const battle=P.restorePveBattle(dataset,content,legacy);
 assert.equal(battle.sides.far[0].maxHp,530);
 const action=new SimpleBot().pick(battle,battle.sides.near[0]);P.playPveRound(battle,action);
 legacy.decisions.push(action);
 const replay=P.restorePveBattle(dataset,content,legacy);
 assert.equal(replay.sides.far[0].hp,battle.sides.far[0].hp);
 assert.equal(replay.sides.near[0].hp,battle.sides.near[0].hp);
});

test('paired storm training has a decision window without changing solo or legacy checkpoint HP',()=>{
 const monster={id:'storm-scout',attributes:{}};
 const hp=checkpoint=>openingTrainingMonsters([monster],{encounterId:'storm-scout',...checkpoint})[0].hp;
 assert.equal(hp({openingTrainingVersion:2,party:[{hp:415},{hp:460}]}),480);
 assert.equal(hp({openingTrainingVersion:2,party:[{hp:415},{hp:0}]}),360);
 assert.equal(hp({openingTrainingVersion:2}),360);
 assert.equal(hp({openingTrainingVersion:1,party:[{hp:415},{hp:460}]}),360);
});

test('v3 fire prepares before attacking and life has exactly one recovery window',()=>{
 const fire=start('fire-scout').battle;
 assert.match(openingEnemyIntent(fire),/不攻击/);
 const before=fire.sides.near[0].hp;P.playPveRound(fire,{pass:true});
 assert.equal(fire.sides.near[0].hp,before);
 assert.ok(fire.events.some(e=>e.type==='cast'&&e.card==='Fire_FireDamageBlade'));
 P.playPveRound(fire,{pass:true});assert.ok(fire.sides.near[0].hp<before);
 const life=start('life-scout').battle;
 P.playPveRound(life,{pass:true});assert.match(openingEnemyIntent(life),/下回合恢复/);
 P.playPveRound(life,{pass:true});assert.match(openingEnemyIntent(life),/恢复生命.*不攻击/);
 life.sides.far[0].hp-=150;const wounded=life.sides.far[0].hp,hp=life.sides.near[0].hp;
 P.playPveRound(life,{pass:true});assert.equal(life.sides.near[0].hp,hp);assert.ok(life.sides.far[0].hp>wounded);
 assert.match(openingEnemyIntent(life),/加强攻击/);
 assert.equal(life.monsterTemplates[0].sequences.flat().filter(r=>r.card==='Life_SingleHeal_Level0').length,1);
});

test('new training replays all setup and recovery turns exactly; v2 keeps its prior setup',()=>{
 for(const id of ['fire-scout','life-scout']){
  const {save,battle}=start(id);
  for(let n=0;n<4&&!battle.finished;n++){const decision={pass:true};P.playPveRound(battle,decision);A.recordDecision(save,decision,battle);}
  const replay=P.restorePveBattle(dataset,content,save.pendingEncounter);
  assert.deepEqual(replay.events,battle.events);assert.equal(replay.rng.state(),battle.rng.state());
 }
 const {save}=start('fire-scout');save.pendingEncounter.openingTrainingVersion=2;
 const old=P.restorePveBattle(dataset,content,save.pendingEncounter);assert.equal(old.sides.far[0].maxHp,150);
 P.playPveRound(old,{pass:true});assert.ok(!old.events.some(e=>e.type==='cast'&&e.card==='Fire_FireDamageBlade'));
});

test('strategy bubbles only describe a real consumed effect in new training',()=>{
 const battle={monsterTemplates:[{openingTrainingVersion:3}],unitsById:{hero:{}},resolved:{wards:{1:{boost_damage:-50},2:{boost_damage:30}},charms:{3:{boost_damage:40}}}};
 const event={sourceType:'effect_used',target:'hero',kind:'ward',id:1};
 assert.match(openingStrategyCue(battle,event).text,/一层护盾/);
 assert.match(openingStrategyCue(battle,{...event,id:2}).text,/陷阱/);
 assert.match(openingStrategyCue(battle,{...event,kind:'charm',id:3}).text,/增益/);
 assert.equal(openingStrategyCue(battle,{...event,sourceType:'damage'}),null);
 assert.equal(openingStrategyCue(battle,{...event,id:999}),null);
 battle.monsterTemplates[0].openingTrainingVersion=2;assert.equal(openingStrategyCue(battle,event),null);
});
