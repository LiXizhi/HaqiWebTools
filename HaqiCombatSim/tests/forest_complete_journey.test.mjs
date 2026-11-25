import {applySparkRescue} from '../js/spark_rescue_core.js';
import {forestCommissionPhase,forestCommissionPouch,FOREST_NPCS,FOREST_SITES} from '../js/forest_commission_core.js';
import {SimpleBot} from '../js/combat_policy_core.js';
import {recommendAdventureDeck} from '../js/battle_ai/adventure_adapter_core.js';
import {tickCare} from '../js/adventure_pets_core.js';
import {initializePetWorld} from '../js/adventure_pet_world_core.js';
import {recordTacticsRound} from '../js/battle_tactics_journal_core.js';
import {dungeonFirstReward} from '../js/dungeon_first_rewards_core.js';
import {installNpcCatalog} from '../js/adventure_npc_core.js';
import {installIslandEncounters} from '../js/adventure_island_encounters_core.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {installDungeonIndex,installDungeons,enterDungeon,leaveDungeon} from '../js/adventure_dungeons_core.js';
import {makeCloudSnapshot,parseCloudSnapshot} from '../js/adventure_cloud_core.js';
import * as A from '../js/adventure_core.js';
import * as P from '../js/combat_pve_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p+'.json',import.meta.url)));
const {content,dataset}=installExpansion(read('adventure/chapter'),read('adventure/combat'),read('adventure/pets'),read('adventure/shop-candidates'),read('kids/cards'),read('kids/charms'));
content.worldMaps=Object.fromEntries(Object.entries(content.worldMapIndex.islands).map(([id,row])=>[id,JSON.parse(fs.readFileSync(new URL('../'+row.file,import.meta.url)))]));
installIslandEncounters(content,dataset,read('adventure/island-encounters'),read('kids/cards'));
installNpcCatalog(content,read('adventure/npc-catalog'));
content.dungeonJourneys=read('adventure/dungeon-journeys');
installDungeonIndex(content,read('adventure/dungeon-index'));
installDungeons(content,dataset,read('adventure/dungeons'),read('kids/cards'));
import {forestExchangeLines} from '../js/forest_exchange_core.js';
import {forestCommissionGoal} from '../js/forest_commission_core.js';
import {dungeonWatchStory} from '../js/dungeon_watch_story_core.js';
import {companionWorldGuide} from '../js/companion_guide_core.js';

// Core fixtures position interaction targets and choose decks; this is not browser navigation.
// All levels, quest phases, clear records and story progress use real actions.
for(const scenario of [
 {school:'fire',gear:[1415,1260],language:'en',plan:'tracks',ending:'sign',method:'lamp',promise:'signal'},
 {school:'ice',gear:[1416,1256],language:'ja',plan:'light',ending:'pair',method:'shelter',promise:'together'},
 {school:'storm',gear:[1417,1259],language:'ko',plan:'tracks',ending:'pair',method:'lamp',promise:'together'},
 {school:'life',gear:[1419,1258],language:'en',plan:'light',ending:'sign',method:'shelter',promise:'signal'},
 {school:'death',gear:[1418,1257],language:'ja',plan:'tracks',ending:'sign',method:'lamp',promise:'signal'},
])test(`complete forest journey: ${scenario.school}/${scenario.language}/${scenario.plan}/${scenario.method}`,()=>{
 const {school,gear,language,plan,ending,method,promise}=scenario,seed=23,opening=true;
 let save=A.createAdventure(content,{school,seed});const bot=new SimpleBot();
 assert.equal(save.level,1);let now=1000;save.careAt=now;
 const roundtrip=()=>{save=A.parseSave(JSON.stringify(save),content);save=parseCloudSnapshot(JSON.stringify(makeCloudSnapshot(save,content,dataset,'2026-11-13T05:40:00.000Z','12345678-1234-1234-1234-123456789abc')),content,dataset).save;};
 if(opening){
  initializePetWorld(save,content);save.openingJourney={version:1,phase:'offer'};
  const step=(value,props={})=>{
   const npc={accept:36211,meet:36201,route:36201,explain:36201,rescue:36201}[value];
   if(npc){const [x,y]=content.worldMaps.camp.npcPositions[npc];save.position={x,y};}
   A.applyAction(save,content,{type:'opening-journey',step:value,...props});
  };
  step('accept');step('meet');step('route',{route:'talk'});
  step('explain',{text:'We are friends.',receipt:'forest-opening-'+school,at:now});step('rescue',{join:true});roundtrip();
  A.beginEncounter(save,content,'ice-scout');const battle=P.restorePveBattle(dataset,content,save.pendingEncounter);
  for(let turn=0;turn<120&&!battle.finished;turn++){
   const pick={...bot.pick(battle,battle.sides.near[0]),aiVersion:1};P.playPveRound(battle,pick);A.recordDecision(save,battle.lastDecision,battle);
  }
  assert.equal(battle.winner,'near',school+' English opening');A.settleEncounter(save,content,battle,{now});
  assert.equal(save.openingJourney.phase,'done');step('continue');roundtrip();
 }
 const act=(step,props={})=>{
  const id=step==='accept'?FOREST_NPCS.giver:['deliver','exchange','brief','report','plan'].includes(step)?FOREST_NPCS.receiver:step==='take-boots'?FOREST_SITES.boots:FOREST_SITES.note;
  A.applyAction(save,content,{type:'forest-commission',step,...props},{forestTarget:{id,kind:typeof id==='number'?'npc':'landmark',...save.position}});
 };
 act('accept');act('take-boots',{object:'boots'});roundtrip();
 assert.equal(forestCommissionPouch(save)[0].id,'patrol-boots');
 save.languageLearning={...save.languageLearning,target:language};
 act('exchange',{word:'boots',language,input:'text',text:forestExchangeLines(save,'boots')[0],learning:{at:now,attempts:1,assisted:false}});roundtrip();
 A.applyAction(save,content,{type:'equip',itemId:gear[1]});
 act('take-note',{revealed:true});
 if(opening){
  save.languageLearning={...save.languageLearning,target:language};
  act('exchange',{word:'note',language,input:'text',text:forestExchangeLines(save,'note')[0],learning:{at:now,attempts:2,assisted:true}});roundtrip();
  assert.equal(forestCommissionPhase(save),'briefing');assert.deepEqual(save.forestCommission.exchangeCompleted,['note']);
 }
 act('plan',{plan});
 act('brief',{tactic:'focus',recalled:'boots',learning:{at:now,attempts:2,assisted:false}});roundtrip();
 assert.equal(forestCommissionPhase(save),'patrol');assert.equal(forestCommissionPouch(save)[0].id,'patrol-note');
 // Earn the entrance level through the actual first six mainline quests.
 // This also reproduces why another hat/robe would be a duplicate reward.
 for(const quest of content.quests.slice(0,6)){
  if(save.quests[quest.id]?.claimed)continue;
  assert.equal(A.currentQuest(save,content).id,quest.id);
  A.applyAction(save,content,{type:'accept',questId:quest.id,npcId:quest.startNpc});
  for(const goal of quest.goals){
   if(A.questProgress(save,quest).some(row=>row.kind===goal.kind&&row.id===goal.id&&row.value>=row.count))continue;
   if(goal.kind==='talk')A.applyAction(save,content,{type:'talk',npcId:goal.id});
   else{
    assert.equal(goal.kind,'defeat');
    const encounter=content.encounters.find(e=>e.zone==='camp'&&content.monsters[e.monsterId]?.goalId===goal.id);assert.ok(encounter);
    now+=60000;tickCare(save,content,A.playerSpec(save,content),now);
    save.deck=recommendAdventureDeck(save,content,dataset).deck;A.beginEncounter(save,content,encounter.id);
    const battle=P.restorePveBattle(dataset,content,save.pendingEncounter);
    for(let turn=0;turn<120&&!battle.finished;turn++){
     const pick={...bot.pick(battle,battle.sides.near[0]),aiVersion:1};P.playPveRound(battle,pick);A.recordDecision(save,battle.lastDecision,battle);
    }
    assert.equal(battle.winner,'near',school+' mainline '+quest.id);A.settleEncounter(save,content,battle,{now});
   }
  }
  assert.equal(A.questReady(save,quest),true);A.applyAction(save,content,{type:'claim',questId:quest.id,npcId:quest.endNpc});roundtrip();
  if(quest.id===63004){
   // Use the school hat and robe already earned before the harder scout and patrol fights.
   for(const itemId of [1236,1237,1238,1239,1240,1246,1247,1248,1249,1250]){
    if(save.inventory[itemId])A.applyAction(save,content,{type:'equip',itemId});
   }
  }
 }
 assert.ok(save.level>=5);assert.equal(forestCommissionPhase(save),'patrol','mainline fights cannot count as a patrol clear');
 if(opening)assert.deepEqual(save.forestCommission.exchangeCompleted,['note'],'mainline and cloud reloads retain the delivered note');
 save.deck=recommendAdventureDeck(save,content,dataset).deck;
 const dungeon=content.dungeons.find(d=>d.id==='journey:first-watch');
 now+=60000;tickCare(save,content,A.playerSpec(save,content),now);
 enterDungeon(save,content,dungeon.id);
 const watchStory=()=>dungeonWatchStory(save,dungeon,save.dungeonRuns[dungeon.id]?.cleared||[]);
 assert.equal(watchStory().stage,0);assert.match(watchStory().remembered,plan==='tracks'?/脚印/:/巡夜灯/);
 for(const [index,arena]of dungeon.arenas.entries()){
  assert.equal(watchStory().stage,index);assert.equal(companionWorldGuide(save,content).track,'dungeon-next');
  A.beginEncounter(save,content,arena.id);const battle=P.restorePveBattle(dataset,content,save.pendingEncounter);
  for(let turn=0;turn<60&&!battle.finished;turn++){
   const playback=P.playPveRound(battle,{...bot.pick(battle,battle.sides.near[0]),aiVersion:1});
   save.pendingEncounter.decisions.push(battle.lastDecision);recordTacticsRound(save.pendingEncounter,battle,playback);
  }
  assert.equal(battle.winner,'near',arena.id);A.settleEncounter(save,content,battle);roundtrip();
  assert.equal(forestCommissionPhase(save),index===dungeon.arenas.length-1?'report':'patrol');
  assert.equal(forestCommissionPouch(save)[0].id,'patrol-note');
  assert.equal(watchStory().stage,index+1);assert.equal(companionWorldGuide(save,content).text,watchStory().reply);
  assert.equal(companionWorldGuide(save,content).track,index===dungeon.arenas.length-1?'dungeon-exit':'dungeon-next');
  if(index<dungeon.arenas.length-1){leaveDungeon(save,content);now+=60000;tickCare(save,content,A.playerSpec(save,content),now);enterDungeon(save,content,dungeon.id);}
 }
 leaveDungeon(save,content);act('report');roundtrip();
 assert.equal(forestCommissionPhase(save),'done');assert.deepEqual(forestCommissionPouch(save),[]);
 for(const id of gear)assert.equal(save.inventory[id],1);
 assert.equal(save.dungeonChallengeRecords[dungeon.id].clears,1);
 const investigate=(step,props={})=>{const goal=forestCommissionGoal(save);return A.applyAction(save,content,{type:'forest-commission',step,...props},{forestTarget:{id:goal.id,kind:goal.kind,...save.position}});};
 investigate('mystery-start');roundtrip();
 const observations=plan==='tracks'?['grass','paper','tracks','lamp']:['tracks','lamp','grass','paper'];
 for(const object of observations){investigate('mystery-inspect',{object});roundtrip();}
 investigate('mystery-question');roundtrip();
 investigate('mystery-solve',{order:['dim','find','return'],ending});roundtrip();
 assert.equal(save.forestCommission.mystery.status,'solved');
 assert.equal(save.forestCommission.mystery.ending,ending);
 const afterInvestigation=structuredClone(save);
 assert.equal(investigate('mystery-start').changed,false);
 assert.throws(()=>act('report'));
 assert.throws(()=>act('exchange',{word:'note',language,input:'text',text:forestExchangeLines(save,'note')[0]}));
 assert.deepEqual(save,afterInvestigation,'reopened investigation and stale handovers cannot repeat rewards or receipts');
 assert.deepEqual(save.forestCommission.exchangePractice.map(p=>[p.word,p.language]),[['boots',language],['note',language]]);
 const beforeVisit={inventory:structuredClone(save.inventory),exp:save.exp};
 investigate('promise-start');roundtrip();
 assert.equal(forestCommissionPhase(save),'promise');
 if(ending==='sign')investigate('promise-mark',{place:'tent'});
 else investigate('promise-invite',{response:'ask'});
 roundtrip();investigate('promise-pause');roundtrip();
 assert.equal(forestCommissionPhase(save),'done','an optional paused visit never blocks the main adventure');
 investigate('promise-start');roundtrip();
 assert.equal(save.forestCommission.mystery.promise.stage,'confirm','resume preserves the actual interaction');
 investigate('promise-confirm');roundtrip();
 assert.equal(forestCommissionPhase(save),'done');
 assert.deepEqual(save.inventory,beforeVisit.inventory);assert.equal(save.exp,beforeVisit.exp);
 {
  // The first reward should lead to an attainable second challenge with owned
  // companions, not a fixture that invents levels, pets or combat stats.
  A.applyAction(save,content,{type:'equip',itemId:gear[0]});
  A.applyAction(save,content,{type:'equip',itemId:24002});
  for(const quest of content.quests.slice(6,8)){
   assert.equal(A.currentQuest(save,content).id,quest.id);
   A.applyAction(save,content,{type:'accept',questId:quest.id,npcId:quest.startNpc});
   if(quest.id===63007){
    A.applyAction(save,content,{type:'equip',itemId:1912});
    A.applyAction(save,content,{type:'upgrade',itemId:1912});
   }
   assert.equal(A.questReady(save,quest),true);
   A.applyAction(save,content,{type:'claim',questId:quest.id,npcId:quest.endNpc});roundtrip();
  }
  assert.ok(save.level>=6);
  if(!opening){
   const heroSlot=save.formation.findIndex(id=>!id);assert.ok(heroSlot>=0);
   A.applyAction(save,content,{type:'formation',slots:[...save.formation],heroSlot});roundtrip();
  }
  const next=content.dungeons.find(d=>d.id==='journey:lost-spark');
  // Recover the companion after the four-floor patrol before attempting a 2v2.
  now+=20*60000;tickCare(save,content,A.playerSpec(save,content),now);save.deck=recommendAdventureDeck(save,content,dataset).deck;
  enterDungeon(save,content,next.id);A.beginEncounter(save,content,next.arenas[0].id);
  let battle=P.restorePveBattle(dataset,content,save.pendingEncounter);
  assert.equal(battle.sides.near.length,2);assert.equal(battle.sides.far.length,2);
  for(let turn=0;turn<120&&!battle.finished;turn++){
   const pick={...bot.pick(battle,battle.sides.near[0]),aiVersion:1};P.playPveRound(battle,pick);A.recordDecision(save,battle.lastDecision,battle);
   if(turn===0){
    const expected=battle.sides.near.map(u=>({id:u.id,hp:u.hp,charms:u.charms,wards:u.wards}));
    assert.ok(save.pendingEncounter.decisions[0].aiPicks[battle.sides.near[1].id]);
    roundtrip();battle=P.restorePveBattle(dataset,content,save.pendingEncounter);
    assert.deepEqual(battle.sides.near.map(u=>({id:u.id,hp:u.hp,charms:u.charms,wards:u.wards})),expected,'recorded companion AI survives a mid-battle cloud restore');
   }
  }
  assert.equal(battle.winner,'near',school+' owned-party 2v2');A.settleEncounter(save,content,battle,{now});roundtrip();
  assert.equal(save.dungeonChallengeRecords[next.id].clears,1);
  assert.equal(save.inventory[dungeonFirstReward(content,next.id,school).itemId],1);
  assert.equal(forestCommissionPhase(save),'done');
  save.position={x:content.worldMaps[next.id].portal.x,y:content.worldMaps[next.id].portal.y};
  const beforeEscort=structuredClone(save.inventory);
  applySparkRescue(save,content,{step:'start',method});roundtrip();
  const path=method==='lamp'?[16,17,12,7,2,3,4]:[16,15,10,5,0,1,2,3,4];
  for(const to of path.slice(1)){
   if(method==='lamp'&&to===7){applySparkRescue(save,content,{step:'wait'});roundtrip();}
   applySparkRescue(save,content,{step:'move',to});roundtrip();
  }
  if(promise==='signal'){
   applySparkRescue(save,content,{step:'signal-start'});roundtrip();
   for(const lit of [true,false,true]){applySparkRescue(save,content,{step:'signal-pulse',lit});roundtrip();}
  }else{applySparkRescue(save,content,{step:'finish',promise});roundtrip();}
  assert.equal(save.sparkRescue.status,'safe');assert.deepEqual(save.sparkRescue.path,path);
  assert.deepEqual(save.inventory,beforeEscort,'escort adds no duplicate equipment reward');
  const safeState=structuredClone(save);
  assert.equal(applySparkRescue(save,content,{step:'start',method}).changed,false);
  assert.deepEqual(save,safeState,'reopening a completed escort preserves its ending');
  leaveDungeon(save,content);roundtrip();
  assert.equal(save.forestCommission.mystery.route,plan);
  assert.equal(save.sparkRescue.promise,promise);
  assert.equal(save.forestCommission.mystery.ending,ending);
  assert.equal(save.forestCommission.mystery.promise.status,'done');
  assert.deepEqual(save.forestCommission.exchangePractice.map(p=>[p.word,p.language]),[['boots',language],['note',language]]);
 }
});
