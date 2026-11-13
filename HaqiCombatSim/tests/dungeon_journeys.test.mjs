import {directCacheStore} from './helpers/direct_cache_store.js';
import {forestCommissionPhase,forestCommissionPouch,FOREST_NPCS,FOREST_SITES} from '../js/forest_commission_core.js';
import {dungeonTacticsMonsters,dungeonEnemyIntentInfo,dungeonTacticsPreparation} from '../js/dungeon_tactics_core.js';
import {SimpleBot} from '../js/combat_policy_core.js';
import {tickCare,STARTERS,addPet,petParams,partySpecs,petXpLevel,petMaxHp,recommendedPetDeck} from '../js/adventure_pets_core.js';
import {initializePetWorld} from '../js/adventure_pet_world_core.js';
import {recordTacticsRound} from '../js/battle_tactics_journal_core.js';
import {dungeonFirstReward,grantDungeonFirstReward,dungeonFirstRewardSources} from '../js/dungeon_first_rewards_core.js';
import {previewEquipment} from '../js/adventure_equipment_core.js';
import {awardDailySpeech,dailyBuffs} from '../js/language_daily_buff_core.js';
import {installNpcCatalog} from '../js/adventure_npc_core.js';
import {installIslandEncounters} from '../js/adventure_island_encounters_core.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {installDungeonIndex,installDungeons,enterDungeon,leaveDungeon} from '../js/adventure_dungeons_core.js';
import {claimTowerReward,towerRecord,journeyParty,dungeonEnemyIntel} from '../js/adventure_dungeon_journeys_core.js';
import {startCoopRun} from '../js/adventure_coop_core.js';
import {makeSocialSnapshot} from '../js/adventure_social_core.js';
import {presetDeck} from '../js/combat_presets_core.js';
import {splitRoleSave,joinRoleSave} from '../js/adventure_storage_core.js';
import {checkedProgress,makeCloudSnapshot,parseCloudSnapshot} from '../js/adventure_cloud_core.js';
import * as A from '../js/adventure_core.js';
import * as P from '../js/combat_pve_core.js';
import * as W from '../js/adventure_world_core.js';
import {createCloudClient} from '../js/adventure_cloud.js';
import {addRole,emptyRoles} from '../js/adventure_roles_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p+'.json',import.meta.url)));
const {content,dataset}=installExpansion(read('adventure/chapter'),read('adventure/combat'),read('adventure/pets'),read('adventure/shop-candidates'),read('kids/cards'),read('kids/charms'));
content.worldMaps=Object.fromEntries(Object.entries(content.worldMapIndex.islands).map(([id,row])=>[id,JSON.parse(fs.readFileSync(new URL('../'+row.file,import.meta.url)))]));
installIslandEncounters(content,dataset,read('adventure/island-encounters'),read('kids/cards'));
installNpcCatalog(content,read('adventure/npc-catalog'));
content.dungeonJourneys=read('adventure/dungeon-journeys');
installDungeonIndex(content,read('adventure/dungeon-index'));
const index=structuredClone(content.dungeons.filter(d=>d.kind));
installDungeons(content,dataset,read('adventure/dungeons'),read('kids/cards'));
const tower=content.dungeons.find(d=>d.id==='journey:tower-camp');

test('elite preparation reports actual selected waves without changing enemies or save data',()=>{
 const before=JSON.stringify(content.monsters);
 for(const dungeon of content.dungeons.filter(d=>d.kind==='elite')){
  const intel=dungeonEnemyIntel(dungeon,content.monsters);
  const units=dungeon.arenas.flatMap(a=>a.monsterIds.map(id=>content.monsters[id]));
  assert.equal(intel.maxLevel,Math.max(...units.map(u=>u.level)),dungeon.id);
  assert.equal(intel.maxHp,Math.max(...units.map(u=>u.hp)),dungeon.id);
  assert.equal(intel.waves,dungeon.arenas.length);
  assert.equal(intel.maxEnemies,dungeon.partySize);
  assert.equal(dungeon.recommendedLevel,index.find(d=>d.id===dungeon.id).recommendedLevel);
  assert.ok(dungeon.recommendedLevel>=intel.maxLevel,dungeon.id);
 }
 assert.equal(JSON.stringify(content.monsters),before);
 const elite=content.dungeons.find(d=>d.kind==='elite');
 assert.equal(dungeonEnemyIntel({...elite,loaded:false},content.monsters),null);
 assert.equal(dungeonEnemyIntel(elite,{}),null);
 assert.equal(dungeonEnemyIntel(tower,content.monsters),null);
});

test('tactical entry advice distinguishes borrowed, learned and equipped cards',()=>{
 const dungeon=content.dungeons.find(d=>d.id==='journey:first-watch'),save=A.createAdventure(content,{school:'fire'});
 assert.equal(dungeon.recommendedLevel,5);assert.equal(index.find(d=>d.id===dungeon.id).recommendedLevel,5);
 const before=JSON.stringify(save),missing=dungeonTacticsPreparation(save,content,dungeon);
 assert.equal(missing.missing,true);assert.ok(missing.lines.some(line=>line.includes('4 级解锁')));
 assert.ok(missing.lines.some(line=>line.includes('借用')));assert.equal(JSON.stringify(save),before);
 save.xp=content.progression.xpThresholds[4];A.syncProgression(save,content);
 const learned=dungeonTacticsPreparation(save,content,dungeon);assert.ok(learned.lines.some(line=>line.includes('尚未装入')));
 save.deck=A.recommendedDeck(save,content);save.heroHp=7;
 const ready=dungeonTacticsPreparation(save,content,dungeon);assert.equal(ready.missing,false);
 assert.ok(ready.lines.some(line=>line.includes('当前主角生命 7')));
 assert.ok(ready.lines.some(line=>line.includes('离开副本')&&line.includes('继续已有进度')));
 assert.equal(ready.lines.some(line=>line.includes('食物恢复生命')),false);
 assert.equal(dungeonTacticsPreparation(save,content,tower),null);
});

test('real tactical clear can rest outside, resume progress and earn the first-clear item',()=>{
 const dungeon=content.dungeons.find(d=>d.id==='journey:first-watch'),save=A.createAdventure(content,{school:'fire',seed:23}),bot=new SimpleBot();
 save.xp=content.progression.xpThresholds[4];A.syncProgression(save,content);save.deck=A.recommendedDeck(save,content);
 let now=1000;save.careAt=now;enterDungeon(save,content,dungeon.id);
 for(const [index,arena]of dungeon.arenas.entries()){
  A.beginEncounter(save,content,arena.id);
  const battle=P.restorePveBattle(dataset,content,save.pendingEncounter);
  for(let turn=0;turn<60&&!battle.finished;turn++){
   const playback=P.playPveRound(battle,bot.pick(battle,battle.sides.near[0]));
   save.pendingEncounter.decisions.push(battle.lastDecision);
   recordTacticsRound(save.pendingEncounter,battle,playback);
  }
  assert.equal(battle.winner,'near',arena.id);
  assert.deepEqual(checkedProgress(save,content,dataset).battle.sides.near.map(unit=>unit.hp),battle.sides.near.map(unit=>unit.hp));
  A.settleEncounter(save,content,battle);assert.ok(A.parseSave(save,content));
  if(index<dungeon.arenas.length-1){
   const lowHp=save.heroHp;now+=60000;tickCare(save,content,A.playerSpec(save,content),now);
   assert.equal(save.heroHp,lowHp,'waiting inside a dungeon cannot refill health');
   const cleared=[...save.dungeonRuns[dungeon.id].cleared],turns=save.dungeonRuns[dungeon.id].challenge.turns;
   leaveDungeon(save,content);now+=60000;tickCare(save,content,A.playerSpec(save,content),now);
   assert.ok(save.heroHp>lowHp,'island rest must actually recover hero HP');
   enterDungeon(save,content,dungeon.id);
   assert.deepEqual(save.dungeonRuns[dungeon.id].cleared,cleared);
   assert.equal(save.dungeonRuns[dungeon.id].challenge.turns,turns);
  }
 }
 assert.equal(save.dungeonChallengeRecords[dungeon.id].clears,1);
 assert.equal(save.inventory[24002],1);assert.equal(save.dungeonChallengeRecords[dungeon.id].firstRewarded,true);
 assert.ok(A.parseSave(save,content));
 save.tacticsTraining={version:1,completed:{focus:{runs:1,plain:20,actual:40}}};
 const cloud=makeCloudSnapshot(save,content,dataset,'2026-11-13T04:00:00.000Z','12345678-1234-1234-1234-123456789abc');
 const restored=parseCloudSnapshot(JSON.stringify(cloud),content,dataset).save;
 for(const key of ['tacticsTraining','tacticsRecord','dungeonChallengeRecords'])assert.deepEqual(restored[key],save[key],key+' survives cloud roundtrip');
 assert.equal(grantDungeonFirstReward(restored,content,dungeon.id,{complete:true,rewarded:true}),null,'cloud restore cannot claim a first-clear item twice');
 assert.equal(restored.inventory[24002],1);
 assert.ok(A.parseSave(restored,content));
});

test('first tactical challenge has a winning baseline at its advised level for every school',()=>{
 const dungeon=content.dungeons.find(d=>d.id==='journey:first-watch');
 // Each arena starts healthy. Adventure health persists, so entry advice
 // explicitly calls for healing between encounters rather than free resets.
 for(const school of Object.keys(content.learn))for(const arena of dungeon.arenas)for(const seed of [18,23,42]){
  const save=A.createAdventure(content,{school});save.xp=content.progression.xpThresholds[dungeon.recommendedLevel-1];A.syncProgression(save,content);save.deck=A.recommendedDeck(save,content);
  const player={...A.playerSpec(save,content),slot:0},monsters=dungeonTacticsMonsters(arena.monsterIds.map(id=>content.monsters[id]),{dungeonTacticsVersion:1,dungeonTacticsId:dungeon.id});
  const battle=P.createPveBattle({dataset,player,party:[player],monsters,seed,threatRulesVersion:5}),bot=new SimpleBot();
  for(let turn=0;turn<60&&!battle.finished;turn++)P.playPveRound(battle,bot.pick(battle,battle.sides.near[0]));
  assert.equal(battle.winner,'near',`${school} ${arena.id} seed ${seed}`);
 }
});
test('personal challenge survives save parsing, completes once and resets on restart',()=>{
 const dungeon=content.dungeons.find(d=>d.id==='journey:first-watch'),save=A.createAdventure(content);
 enterDungeon(save,content,dungeon.id);
 assert.equal(save.dungeonRuns[dungeon.id].challenge.wins,0);
 for(const arena of dungeon.arenas){
  A.beginEncounter(save,content,arena.id);
  const battle=P.restorePveBattle(dataset,content,save.pendingEncounter);
  battle.finished=true;battle.winner='near';battle.turn=3;
  A.settleEncounter(save,content,battle);
  assert.ok(A.parseSave(save,content).dungeonRuns[dungeon.id].challenge);
 }
 const record=save.dungeonChallengeRecords[dungeon.id];
 assert.equal(record.clears,1);assert.equal(record.bestTurns,dungeon.arenas.length*3);
 assert.equal(save.inventory[24002],1);assert.equal(record.firstRewarded,true);
 leaveDungeon(save,content);enterDungeon(save,content,dungeon.id,{restart:true});
 assert.equal(save.dungeonRuns[dungeon.id].challenge.turns,0);
 assert.equal(save.dungeonChallengeRecords[dungeon.id].clears,1);
 for(const arena of dungeon.arenas)victory(save);
 assert.equal(save.inventory[24002],1,'restarting and clearing cannot duplicate the guaranteed item');
 assert.equal(save.dungeonChallengeRecords[dungeon.id].firstRewarded,true);
});

test('guaranteed rewards support every school and produce real equipment benefits',()=>{
 for(const school of ['fire','ice','storm','death','life']){
  const save=A.createAdventure(content,{school});save.xp=content.progression.xpThresholds[49];A.syncProgression(save,content);
  for(const id of ['journey:first-watch','journey:lost-spark','journey:ember-night']){
   const reward=dungeonFirstReward(content,id,school);
   assert.ok(reward?.item);assert.ok(dungeonFirstRewardSources(content,reward.itemId,school).length);
   save.dungeonChallengeRecords??={};save.dungeonChallengeRecords[id]={version:1,clears:1,bestTurns:3,bestDefeats:0,lastTurns:3,lastDefeats:0};
   assert.equal(grantDungeonFirstReward(save,content,id,{complete:true,rewarded:false}),null);
   assert.equal(grantDungeonFirstReward(save,content,id,{complete:false,rewarded:true}),null);
   assert.ok(grantDungeonFirstReward(save,content,id,{complete:true,rewarded:true}));
   const preview=previewEquipment(save,content,{type:'equip',itemId:reward.itemId});
   assert.ok(preview.rows.some(row=>row.delta>0),'the item must change actual character or deck attributes');
   A.applyAction(save,content,{type:'equip',itemId:reward.itemId});
   assert.equal(save.equipment[reward.item.slot],reward.itemId);
   assert.ok(A.parseSave(save,content));
   assert.equal(grantDungeonFirstReward(save,content,id,{complete:true,rewarded:true}),null);
  }
 }
});

test('exhausted final win keeps the first-clear gear claim available for a rewarded retry',()=>{
 const dungeon=content.dungeons.find(d=>d.id==='journey:first-watch'),save=A.createAdventure(content);
 const isolated=structuredClone(content);for(const row of isolated.encounters)if(dungeon.arenas.some(a=>a.id===row.id))row.staminaCost=1;
 enterDungeon(save,isolated,dungeon.id);save.stamina=0;
 for(const arena of dungeon.arenas){
  A.beginEncounter(save,isolated,arena.id);const b=P.restorePveBattle(dataset,isolated,save.pendingEncounter);
  b.finished=true;b.winner='near';A.settleEncounter(save,isolated,b);
 }
 assert.equal(save.inventory[24002],undefined);assert.equal(save.dungeonChallengeRecords[dungeon.id].firstRewarded,undefined);
 leaveDungeon(save,isolated);enterDungeon(save,isolated,dungeon.id,{restart:true});save.stamina=100;
 for(const arena of dungeon.arenas){
  A.beginEncounter(save,isolated,arena.id);const b=P.restorePveBattle(dataset,isolated,save.pendingEncounter);
  b.finished=true;b.winner='near';A.settleEncounter(save,isolated,b);
 }
 assert.equal(save.inventory[24002],1);assert.equal(save.dungeonChallengeRecords[dungeon.id].firstRewarded,true);
 assert.ok(A.parseSave(save,isolated));
});
test('new tactical dungeon checkpoint replays while legacy checkpoints keep exported AI',()=>{
 const d=content.dungeons.find(d=>d.id==='journey:first-watch'),s=A.createAdventure(content);
 enterDungeon(s,content,d.id);A.beginEncounter(s,content,d.arenas[0].id);
 assert.equal(s.pendingEncounter.dungeonTacticsVersion,1);
 const b=P.restorePveBattle(dataset,content,s.pendingEncounter);
 assert.match(dungeonEnemyIntentInfo(b).label,/强化/);
 const legacy=structuredClone(s.pendingEncounter);delete legacy.dungeonTacticsVersion;delete legacy.dungeonTacticsId;
 assert.equal(P.restorePveBattle(dataset,content,legacy).sides.far[0].template.dungeonTactic,undefined);
 P.playPveRound(b,{pass:true});s.pendingEncounter.decisions.push(b.lastDecision);
 assert.ok(b.sides.far[0].charms.length>0,'preparation must install a real blade');
 const restored=checkedProgress(s,content,dataset).battle;
 assert.deepEqual(restored.sides.far.map(u=>[u.hp,u.charms,u.wards]),b.sides.far.map(u=>[u.hp,u.charms,u.wards]));
 assert.match(dungeonEnemyIntentInfo(restored).label,/攻击/);
 const forged=structuredClone(s);forged.pendingEncounter.dungeonTacticsId='journey:lost-spark';
 assert.throws(()=>A.parseSave(forged,content),/副本战术/);
});
test('every tactical wave finishes with actual pet formations, including gene-only DOT attackers',()=>{
 for(const id of ['journey:first-watch','journey:lost-spark','journey:ember-night']){
  const d=content.dungeons.find(row=>row.id===id),s=A.createAdventure(content,{school:'fire',seed:23});
  s.xp=content.progression.xpThresholds[d.recommendedLevel-1];A.syncProgression(s,content);s.deck=A.recommendedDeck(s,content);
  for(let i=1;i<d.partySize;i++){
   const xp=petParams(content).petXpStep*s.level*(s.level-1)/2,pet=addPet(s,content,STARTERS[i-1],xp);
   // The green starter already exists; duplicate acquisition adds experience
   // instead of replacing it with the requested fixture level.
   pet.xp=xp;pet.level=petXpLevel(xp,content);pet.hp=petMaxHp(pet,content);pet.deck=recommendedPetDeck(pet,content);
   s.formation[i]=s.petInstanceVersion===1?pet.id:pet.speciesId;
  }
  const party=partySpecs(s,content,A.playerSpec(s,content));assert.equal(party.length,d.partySize);
  for(const arena of d.arenas){
   const monsters=dungeonTacticsMonsters(arena.monsterIds.map(key=>content.monsters[key]),{dungeonTacticsVersion:1,dungeonTacticsId:id});
   const b=P.createPveBattle({dataset,player:party[0],party,monsters,seed:23,threatRulesVersion:5}),bot=new SimpleBot();
   assert.ok(dungeonEnemyIntentInfo(b));
   let rounds=0;while(!b.finished&&rounds++<100){P.playPveRound(b,bot.pick(b,b.sides.near[0]));if(!b.finished)assert.ok(dungeonEnemyIntentInfo(b));}
   assert.equal(b.finished,true,id+' '+arena.id+' must settle without an AI exception');
  }
 }
});

test('later challenge recommendations and equipment match the exported enemy progression',()=>{
 const s=A.createAdventure(content,{school:'fire'});
 for(const [id,level]of [['journey:lost-spark',6],['journey:ember-night',50]]){
  const dungeon=content.dungeons.find(d=>d.id===id);
  assert.equal(dungeon.recommendedLevel,level);assert.equal(index.find(d=>d.id===id).recommendedLevel,level);
  assert.equal(dungeonTacticsPreparation(s,content,dungeon).recommendedLevel,level);
 }
 const late=content.dungeons.find(d=>d.id==='journey:ember-night');
 assert.ok(dungeonTacticsPreparation(s,content,late).lines.some(line=>line.includes('末波包含 50 级')));
 for(const school of ['fire','ice','storm','death','life']){
  const reward=dungeonFirstReward(content,late.id,school);
  assert.equal(reward.level,50);assert.equal(reward.item.stats[101],600);assert.equal(reward.item.stats[111],10);
  assert.equal(reward.item.stats[137],content.schools[school]);
 }
});

test('four-role enemy preparation installs real buffs, traps, shields and weakness before attacking',()=>{
 const d=content.dungeons.find(d=>d.id==='journey:ember-night');
 const templates=d.arenas[0].monsterIds.map(id=>content.monsters[id]);
 const monsters=dungeonTacticsMonsters(templates,{dungeonTacticsVersion:1,dungeonTacticsId:d.id});
 const s=A.createAdventure(content),player=A.playerSpec(s,content);
 const party=Array.from({length:4},(_,i)=>({...player,id:i?'ally-'+i:'hero',slot:i,deck:[]}));
 const b=P.createPveBattle({dataset,player:party[0],party,monsters,seed:18,threatRulesVersion:5});
 b.resolved.fairPlay={...b.resolved.fairPlay,forceAccuracy:100};
 for(const u of b.sides.near){u.hp=u.maxHp=10000;u.deckMap={};u.hand=[];}
 P.playPveRound(b,{pass:true});
 assert.ok(b.sides.far[0].charms.length>0,'blade on enemy attacker');
 assert.ok(b.sides.far.some(u=>u.wards.length>0),'shield on an enemy');
 assert.ok(b.sides.near.some(u=>u.wards.length>0),'trap on a player unit');
 assert.ok(b.sides.near.some(u=>u.charms.length>0),'weakness on player units');
 const before=b.sides.near.reduce((n,u)=>n+u.hp,0);
 P.playPveRound(b,{pass:true});
 assert.ok(b.sides.near.reduce((n,u)=>n+u.hp,0)<before,'next round must deal damage');
 assert.equal(b.sides.far[0].charms.filter(Boolean).length,0,'the attack consumed the blade');
});
function victory(s){
    const d=content.dungeons.find(d=>d.id===s.zone),run=(s.coopRun?.runs||s.dungeonRuns)[s.zone];
    const a=d.arenas.find(a=>!run.cleared.includes(a.id));A.beginEncounter(s,content,a.id);
    const b=P.restorePveBattle(dataset,content,s.pendingEncounter);
    assert.deepEqual(checkedProgress(s,content,dataset).battle.sides.far.map(u=>u.maxHp),b.sides.far.map(u=>u.maxHp));
    b.finished=true;b.winner='near';A.settleEncounter(s,content,b);return b;
}
test('six islands each have two reachable story entrances and a capped tower',()=>{
    assert.equal(index.length,18);
    for(const zone of ['camp','town','fire','ice','desert','dark']){
        const save=A.createAdventure(content);save.zone=zone;save.position={...content.worldMaps[zone].spawn};
        const world=W.createWorld(zone,content,save),entries=world.landmarks.filter(e=>e.dungeonId);
        assert.equal(entries.length,3,zone);
        for(const e of entries){assert.ok(W.walkable(world,e.x,e.y),e.name);assert.ok(W.findPath(world,save.position,e).length,e.name);}
    }
    for(const light of index){
        const d=content.dungeons.find(d=>d.id===light.id);
        assert.deepEqual(light.arenas.map(a=>a.id),d.arenas.map(a=>a.id));
        if(d.kind==='tower'){
            assert.ok(d.floors>=10&&d.floors<=100);let last=0;
            for(const a of d.arenas){const hp=content.monsters[a.monsterIds[0]].hp;assert.ok(hp>last);last=hp;}
            assert.equal(content.worldMaps[d.id].h,light.mapInfo.h);
        }else assert.ok(d.story.length>=3&&d.arenas.every(a=>a.monsterIds.length===d.partySize));
    }
});
test('solo and cooperative wins advance one shared tower; resume and rewards survive split storage',()=>{
    const s=A.createAdventure(content);s.dungeonMode=1;enterDungeon(s,content,tower.id);
    assert.equal(victory(s).sides.far.length,1);assert.equal(towerRecord(s,tower.id).floor,1);leaveDungeon(s,content);
    const profile={id:'tower-ally',name:'同行伙伴',kind:'companion',school:'life',level:1,appearance:'girl',snapshot:makeSocialSnapshot({id:'tower-ally',name:'同行伙伴',school:'life',level:1,isBot:true,deck:presetDeck(dataset,'life',{maxLevel:1}),stats:{}},dataset)};
    startCoopRun(s,[profile],dataset,tower,A.playerSpec(s,content));s.dungeonMode=2;enterDungeon(s,content,tower.id);
    assert.equal(s.coopRun.runs[tower.id].cleared.length,1);
    assert.equal(victory(s).sides.far.length,2);assert.equal(towerRecord(s,tower.id).floor,2);
    leaveDungeon(s,content);s.dungeonMode=1;enterDungeon(s,content,tower.id,{restart:true});
    assert.equal(s.dungeonRuns[tower.id].cleared.length,2);
    while(towerRecord(s,tower.id).floor<10)victory(s);
    assert.throws(()=>claimTowerReward(s,content,tower.id,20));
    const before=s.inventory[100],reward=claimTowerReward(s,content,tower.id,10);
    assert.equal(s.inventory[100],before+reward);assert.equal(reward,1500);
    assert.throws(()=>claimTowerReward(s,content,tower.id,10));
    const parts=splitRoleSave(s);assert.equal(parts.state.towerRecords,undefined);assert.equal(parts.records.towerRecords,undefined);
    assert.deepEqual(parts.towers.towerRecords,s.towerRecords);
    const restored=A.parseSave(joinRoleSave(parts.state,parts,content),content);
    assert.deepEqual(restored.towerRecords,s.towerRecords);
    assert.throws(()=>A.parseSave({...restored,towerRecords:{[tower.id]:{floor:11,claimed:[]}}},content));
    assert.throws(()=>A.parseSave({...restored,towerRecords:{[tower.id]:{floor:9,claimed:[10]}}},content));
});
test('tower lineup size follows the arranged party instead of a separate headcount',()=>{
    assert.equal(journeyParty({dungeonMode:1},tower,[{id:'hero'},{id:'pet1'},{id:'pet2'}]).length,3);
    assert.equal(journeyParty({dungeonMode:4},tower,[{id:'hero'}]).length,1);
});
test('elite party sizes are enforced and larger parties use the selected seats',()=>{
    const d=content.dungeons.find(d=>d.kind==='elite'&&d.partySize===2);
    assert.throws(()=>journeyParty({},d,[{id:'hero'}]),/2/);
    assert.equal(journeyParty({},d,[{id:'hero'},{id:'pet1'},{id:'pet2'}]).length,2);
});

test('each tower has an independent verified workspace file; unchanged towers reuse their reference',async()=>{
    const remote=new Map(),writes=[];let serial=100,failTower=false;
    const uuid=()=>`12345678-1234-1234-1234-${String(++serial).padStart(12,'0')}`;
    const store={getUsername:()=> 'journey-test',isUseLocal:()=>false,getRemotePagePath:p=>'journey-test/edunotes/store/HaqiAdventure/'+p,
    };
    const sdk={token:'test-only',username:'journey-test',getUserProfile:async()=>({username:'journey-test'}),onAuthStateChange:()=>()=>{},personalPageStore:{withWorkspace:()=>store},
        loadPage:async opts=>{const key=opts.sitePath+'/'+opts.pagePath;if(!remote.has(key))throw Error('Page not found: '+key);return {success:true,content:remote.get(key)};},
        getFileByFullPath:async(p,_,cache)=>{assert.equal(cache,true);return remote.get(p)??null;}};
    sdk.editFileByFullPath=async(full,text,_,cache)=>{assert.equal(cache,true);const p=full.slice(store.getRemotePagePath('').length);if(failTower&&p.includes('/towers/'))return {success:false};writes.push(p);remote.set(full,text);return {success:true};};
    directCacheStore(store,sdk);
    const make=()=>createCloudClient({content,dataset,loadSDK:async()=>sdk,uuid});
    const c=make();await c.connect();const roleId=uuid(),catalog=addRole(emptyRoles(),roleId,A.createAdventure(content),1),s=catalog.roles[0].save;
    s.towerRecords={[tower.id]:{floor:1,claimed:[]},'journey:tower-town':{floor:2,claimed:[]}};
    let revision=await c.saveRoles(catalog,null);
    const path=store.getRemotePagePath('roles/index.json'),manifest=()=>JSON.parse(remote.get(path));
    const before=manifest().catalog.roles[0].files.towers;assert.equal(Object.keys(before).length,2);
    assert.match(before[tower.id],/\/towers\/tower-camp\//);
    writes.length=0;s.towerRecords[tower.id].floor=2;s.revision++;
    revision=await c.saveRoles(catalog,revision);
    const after=manifest().catalog.roles[0].files.towers;
    assert.equal(after['journey:tower-town'],before['journey:tower-town']);assert.notEqual(after[tower.id],before[tower.id]);
    assert.equal(writes.filter(p=>p.includes('/towers/')).length,1);
    const reader=make();await reader.connect();assert.deepEqual((await reader.roles()).catalog.roles[0].save.towerRecords,s.towerRecords);
    const prior=remote.get(path);failTower=true;s.towerRecords[tower.id].floor=3;s.revision++;
    await assert.rejects(c.saveRoles(catalog,revision));assert.equal(remote.get(path),prior);
    failTower=false;
    const broken=manifest();broken.catalog.roles[0].files.towers[tower.id]=after['journey:tower-town'];remote.set(path,JSON.stringify(broken));
    const badReader=make();await badReader.connect();await assert.rejects(badReader.roles(),/路径/);
});

// The award must survive deterministic replay without changing the underlying player/equipment snapshot.
test('language entry buff replays identically, settles to base health and clears on exit',()=>{
    const s=A.createAdventure(content);s.dungeonMode=1;enterDungeon(s,content,tower.id);
    s.dungeonLanguageBuff={dungeonId:tower.id,lines:tower.story.filter(l=>l.role==='player').map(l=>l.id)};
    A.beginEncounter(s,content,tower.arenas[0].id);
    const buffed=P.restorePveBattle(dataset,content,s.pendingEncounter),plain=P.restorePveBattle(dataset,content,{...s.pendingEncounter,languageBuff:null});
    assert.ok(buffed.unitsById.hero.maxHp>plain.unitsById.hero.maxHp);
    assert.equal(buffed.unitsById.hero.stats.damagePct.all,(plain.unitsById.hero.stats.damagePct.all||0)+1);
    assert.deepEqual(checkedProgress(s,content,dataset).battle.unitsById.hero.languageBuff,{hp:1,attack:1,defense:1});
    const forged=structuredClone(s);forged.pendingEncounter.languageBuff.hp=99;assert.throws(()=>A.parseSave(forged,content));
    buffed.finished=true;buffed.winner='near';A.settleEncounter(s,content,buffed);
    assert.equal(s.heroHp,plain.unitsById.hero.maxHp);leaveDungeon(s,content);assert.equal(s.dungeonLanguageBuff,undefined);
    enterDungeon(s,content,tower.id);assert.equal(s.dungeonLanguageBuff,undefined);
});

test('daily bonuses persist across dungeon exit and midnight does not invalidate a frozen battle',()=>{
 const s=A.createAdventure(content);for(let i=0;i<40;i++)awardDailySpeech(s,content,String(i));
 s.dungeonMode=1;enterDungeon(s,content,tower.id);assert.equal(dailyBuffs(s).hp,10);
 A.beginEncounter(s,content,tower.arenas[0].id);
 assert.equal(s.pendingEncounter.dailyLanguageVersion,1);
 const battle=P.restorePveBattle(dataset,content,s.pendingEncounter);
 assert.deepEqual(battle.unitsById.hero.languageBuff,{hp:10,attack:10,defense:10,powerPip:10});
 delete s.dailyLanguageBuff;
 assert.deepEqual(checkedProgress(s,content,dataset).battle.unitsById.hero.languageBuff,battle.unitsById.hero.languageBuff);
 const forged=structuredClone(s);forged.pendingEncounter.languageBuff.hp=11;assert.throws(()=>A.parseSave(forged,content));
 battle.finished=true;battle.winner='near';A.settleEncounter(s,content,battle);
 awardDailySpeech(s,content,'next-day');leaveDungeon(s,content);assert.equal(Object.values(dailyBuffs(s)).reduce((a,b)=>a+b),1);
});

for(const seed of [23,42,137,353])for(const opening of [false,true])for(const [school,gear]of Object.entries({ice:[1416,1256],death:[1418,1257],life:[1419,1258],storm:[1417,1259],fire:[1415,1260]}))test(`forest supplies lead into a real full patrol and cloud resumes for ${school}${opening?' after the English opening':''} (seed ${seed})`,()=>{
 let save=A.createAdventure(content,{school,seed});const bot=new SimpleBot();
 assert.equal(save.level,1);let now=1000;save.careAt=now;
 const roundtrip=()=>{save=parseCloudSnapshot(JSON.stringify(makeCloudSnapshot(save,content,dataset,'2026-11-13T05:40:00.000Z','12345678-1234-1234-1234-123456789abc')),content,dataset).save;};
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
  const id=step==='accept'?FOREST_NPCS.giver:['deliver','brief','report'].includes(step)?FOREST_NPCS.receiver:step==='take-boots'?FOREST_SITES.boots:FOREST_SITES.note;
  A.applyAction(save,content,{type:'forest-commission',step,...props},{forestTarget:{id,kind:typeof id==='number'?'npc':'landmark',...save.position}});
 };
 act('accept');act('take-boots',{object:'boots'});roundtrip();
 assert.equal(forestCommissionPouch(save)[0].id,'patrol-boots');
 act('deliver');A.applyAction(save,content,{type:'equip',itemId:gear[1]});
 act('take-note',{revealed:true});act('brief');roundtrip();
 assert.equal(forestCommissionPhase(save),'patrol');assert.equal(forestCommissionPouch(save)[0].id,'patrol-note');
 // Earn the entrance level through the actual first five mainline quests.
 // This also reproduces why another hat/robe would be a duplicate reward.
 for(const quest of content.quests.slice(0,5)){
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
    save.deck=A.recommendedDeck(save,content);A.beginEncounter(save,content,encounter.id);
    const battle=P.restorePveBattle(dataset,content,save.pendingEncounter);
    for(let turn=0;turn<120&&!battle.finished;turn++){
     const pick={...bot.pick(battle,battle.sides.near[0]),aiVersion:1};P.playPveRound(battle,pick);A.recordDecision(save,battle.lastDecision,battle);
    }
    assert.equal(battle.winner,'near',school+' mainline '+quest.id);A.settleEncounter(save,content,battle,{now});
   }
  }
  assert.equal(A.questReady(save,quest),true);A.applyAction(save,content,{type:'claim',questId:quest.id,npcId:quest.endNpc});roundtrip();
 }
 assert.ok(save.level>=5);assert.equal(forestCommissionPhase(save),'patrol','mainline fights cannot count as a patrol clear');
 save.deck=A.recommendedDeck(save,content);
 const dungeon=content.dungeons.find(d=>d.id==='journey:first-watch');
 now+=60000;tickCare(save,content,A.playerSpec(save,content),now);
 enterDungeon(save,content,dungeon.id);
 for(const [index,arena]of dungeon.arenas.entries()){
  A.beginEncounter(save,content,arena.id);const battle=P.restorePveBattle(dataset,content,save.pendingEncounter);
  for(let turn=0;turn<60&&!battle.finished;turn++){
   const playback=P.playPveRound(battle,{...bot.pick(battle,battle.sides.near[0]),aiVersion:1});
   save.pendingEncounter.decisions.push(battle.lastDecision);recordTacticsRound(save.pendingEncounter,battle,playback);
  }
  assert.equal(battle.winner,'near',arena.id);A.settleEncounter(save,content,battle);roundtrip();
  assert.equal(forestCommissionPhase(save),index===dungeon.arenas.length-1?'report':'patrol');
  assert.equal(forestCommissionPouch(save)[0].id,'patrol-note');
  if(index<dungeon.arenas.length-1){leaveDungeon(save,content);now+=60000;tickCare(save,content,A.playerSpec(save,content),now);enterDungeon(save,content,dungeon.id);}
 }
 leaveDungeon(save,content);act('report');roundtrip();
 assert.equal(forestCommissionPhase(save),'done');assert.deepEqual(forestCommissionPouch(save),[]);
 for(const id of gear)assert.equal(save.inventory[id],1);
 assert.equal(save.dungeonChallengeRecords[dungeon.id].clears,1);
 {
  // The first reward should lead to an attainable second challenge with owned
  // companions, not a fixture that invents levels, pets or combat stats.
  A.applyAction(save,content,{type:'equip',itemId:gear[0]});
  A.applyAction(save,content,{type:'equip',itemId:24002});
  const quest=content.quests[5];assert.equal(A.currentQuest(save,content).id,quest.id);
  A.applyAction(save,content,{type:'accept',questId:quest.id,npcId:quest.startNpc});
  for(const goal of quest.goals){
   assert.equal(goal.kind,'defeat');
   const encounter=content.encounters.find(e=>e.zone==='camp'&&content.monsters[e.monsterId]?.goalId===goal.id);assert.ok(encounter);
   now+=60000;tickCare(save,content,A.playerSpec(save,content),now);save.deck=A.recommendedDeck(save,content);
   A.beginEncounter(save,content,encounter.id);const battle=P.restorePveBattle(dataset,content,save.pendingEncounter);
   for(let turn=0;turn<120&&!battle.finished;turn++){
    const pick={...bot.pick(battle,battle.sides.near[0]),aiVersion:1};P.playPveRound(battle,pick);A.recordDecision(save,battle.lastDecision,battle);
   }
   assert.equal(battle.winner,'near',school+' next mainline');A.settleEncounter(save,content,battle,{now});
  }
  A.applyAction(save,content,{type:'claim',questId:quest.id,npcId:quest.endNpc});roundtrip();assert.ok(save.level>=6);
  if(!opening){
   const heroSlot=save.formation.findIndex(id=>!id);assert.ok(heroSlot>=0);
   A.applyAction(save,content,{type:'formation',slots:[...save.formation],heroSlot});roundtrip();
  }
  const next=content.dungeons.find(d=>d.id==='journey:lost-spark');
  now+=60000;tickCare(save,content,A.playerSpec(save,content),now);save.deck=A.recommendedDeck(save,content);
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
 }
});
