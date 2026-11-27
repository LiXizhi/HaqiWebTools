import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as A from '../js/adventure_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {restorePveBattle} from '../js/combat_pve_core.js';
import {FORGE_SITE,forgeCommissionPhase,forgeGatherAvailable,validateForgeCommission} from '../js/forge_commission_core.js';
import {FORGE_LANGUAGES,forgeLesson} from '../js/forge_commission_language_core.js';
import {HUNT_ID,HUNT_MARK,HUNT_COMMON_EQUIPMENT,EQUIPMENT_ESSENCE,salvageQuote} from '../js/adventure_hunt_core.js';
import {equipmentInstances,syncEquipmentInstances} from '../js/adventure_equipment_instances_core.js';
import {createWorld,canResumeWorld,walkable,findPath} from '../js/adventure_world_core.js';
import {economySnapshot,recordEconomyChange,validateEconomyLedger} from '../js/adventure_economy_ledger_core.js';
import {persistReward} from '../js/adventure_reward_persistence.js';
import {splitRoleSave,joinRoleSave} from '../js/adventure_storage_core.js';
import {makeCloudSnapshot,parseCloudSnapshot} from '../js/adventure_cloud_core.js';

const read=f=>JSON.parse(fs.readFileSync(new URL('../data/'+f,import.meta.url)));
const {content:c,dataset:d}=installExpansion(...['adventure/chapter.json','adventure/combat.json','adventure/pets.json','adventure/shop-candidates.json','kids/cards.json','kids/charms.json'].map(read));
c.worldMaps={camp:read('adventure/maps/camp.json')};
const now=new Date(2026,10,26,12).getTime(),tomorrow=now+86400000;
const target={id:FORGE_SITE,kind:'landmark',forgeSite:true,x:500,y:500};
function hero(){const s=A.createAdventure(c);s.xp=c.progression.xpThresholds[7];A.syncProgression(s,c);s.position={x:500,y:500};return s;}
const act=(s,step,props={},access={forgeTarget:target})=>A.applyAction(s,c,{type:'forge-commission',step,now,...props},access);
const gather=s=>act(s,'gather',{choice:'herb',language:forgeLesson(s).language});
test('tea labels are optional, persist real attempts and grant neither rewards nor repeat practice',()=>{
 for(const [language,answer] of [['en',' TEA! '],['ja','おちゃ'],['ko','차'],['zh-CN','茶']]){
  const s=hero();s.languageLearning={target:language};
  assert.throws(()=>act(s,'practice-tea',{language,answer}),/先在草圃/);
  act(s,'accept');gather(s);const inventory=JSON.stringify(s.inventory),pantry=JSON.stringify(s.gatherPantry);
  act(s,'practice-tea',{language,answer:'wrong'});
  assert.deepEqual(s.forgeCommission.teaPractice[language],{attempts:1,completed:false});
  assert.equal(s.forgeCommission.practice,undefined);
  assert.throws(()=>act(s,'practice-tea',{language:'stale',answer}),/语言已切换/);
  act(s,'practice-tea',{language,answer});validateForgeCommission(s);
  assert.equal(s.forgeCommission.practice.length,1);assert.equal(s.forgeCommission.practice[0].attempts,2);
  assert.equal(s.forgeCommission.practice[0].assisted,true);
  act(s,'practice-tea',{language,answer});assert.equal(s.forgeCommission.practice.length,1);
  assert.equal(s.forgeCommission.teaPractice[language].attempts,2);
  assert.equal(forgeCommissionPhase(s),'cook');assert.equal(JSON.stringify(s.inventory),inventory);assert.equal(JSON.stringify(s.gatherPantry),pantry);
  const {state,...parts}=splitRoleSave(s),loaded=joinRoleSave(state,parts,c);
  assert.deepEqual(loaded.forgeCommission,s.forgeCommission);
  const bad=structuredClone(s);bad.forgeCommission.practice[0].assisted=false;
  assert.throws(()=>validateForgeCommission(bad),/待存记录无效/);
 }
});
function cook(s){return A.applyAction(s,c,{type:'campfire-cook',recipeId:'herbal-dew-tea',now});}
function fight(s,won=true){const {checkpoint}=A.beginEncounter(s,c,HUNT_ID),b=restorePveBattle(d,c,checkpoint);b.finished=true;b.winner=won?'near':'far';return A.settleEncounter(s,c,b);}

test('repair letter connects free gathering, cooking, a real hunt and one-time reporting',()=>{
 const s=hero(),coins=s.inventory[100]||0;
 act(s,'accept');assert.equal(forgeCommissionPhase(s),'gather');
 gather(s);assert.equal(s.gatherPantry.herb,3);assert.equal(s.inventory[100]||0,coins);
 assert.equal(forgeCommissionPhase(s),'cook');cook(s);
 assert.equal(s.gatherPantry.herb,0);assert.equal(forgeCommissionPhase(s),'challenge');
 fight(s);assert.equal(forgeCommissionPhase(s),'report');assert.equal(s.inventory[HUNT_MARK],2);
 assert.equal(s.inventory[HUNT_COMMON_EQUIPMENT],1);
 const before=s.inventory[100];act(s,'report');assert.equal(s.inventory[100],before+80);
 assert.equal(s.inventory[EQUIPMENT_ESSENCE],2);assert.equal(forgeCommissionPhase(s),'done');
 assert.throws(()=>act(s,'report'),/先带着/);assert.equal(s.inventory[EQUIPMENT_ESSENCE],2);
 validateForgeCommission(s);validateEconomyLedger(s,c);
 const coinTotals=s.economyLedger.totals['100'];
 assert.equal(coinTotals.firstGained,80);assert.equal(coinTotals.gained-coinTotals.firstGained,c.balanceParams.hunt.coins);
 assert.equal(s.economyLedger.totals['pantry:herb'].gained,3);assert.equal(s.economyLedger.totals['pantry:herb'].spent,3);
});

test('each language has a written fallback; a wrong answer or stale language grants nothing',()=>{
 for(const language of FORGE_LANGUAGES){
  const s=hero();s.languageLearning={...s.languageLearning,target:language};act(s,'accept');
  const lesson=forgeLesson(s);assert.equal(lesson.language,language);assert.ok(lesson.clue&&lesson.hint);
  const snapshot=structuredClone(s);const wrong=act(s,'gather',{choice:'stone',language});
  assert.equal(wrong.changed,false);assert.deepEqual(s,snapshot);
  assert.throws(()=>act(s,'gather',{choice:'herb',language:language==='en'?'ja':'en'}),/语言已切换/);
  assert.deepEqual(s,snapshot);gather(s);assert.equal(s.gatherPantry.herb,3);
 }
});

test('gathering requires the actual nearby site and cannot repeat for more materials',()=>{
 const s=hero();act(s,'accept');
 assert.throws(()=>act(s,'gather',{choice:'herb',language:'en'},{}),/走到/);
 s.position.x=1000;assert.throws(()=>gather(s),/走到/);s.position.x=500;
 gather(s);const before=structuredClone(s);assert.throws(()=>gather(s),/已经采过/);assert.deepEqual(s,before);
 s.forgeCommission.phase='done';assert.equal(forgeGatherAvailable(s,now),false);
 act(s,'gather',{choice:'herb',language:'en',now:tomorrow});assert.equal(s.gatherPantry.herb,6);
 assert.equal(s.economyLedger.entries.at(-1).firstTime,false);
 assert.throws(()=>act(s,'gather',{choice:'herb',language:'en',now:tomorrow}),/已经采过/);
});

test('defeat retains the meal and progress; winning without the tea does not complete the letter',()=>{
 const s=hero();act(s,'accept');gather(s);cook(s);const remaining=s.campfireBuff.remainingBattles;
 fight(s,false);assert.equal(forgeCommissionPhase(s),'challenge');assert.equal(s.campfireBuff.remainingBattles,remaining);
 delete s.campfireBuff;fight(s);assert.equal(forgeCommissionPhase(s),'challenge');
 s.gatherPantry.herb=3;cook(s);fight(s);assert.equal(forgeCommissionPhase(s),'report');
});

test('old wins do not finish a new letter and pending fights cannot gather or report',()=>{
 const s=hero();fight(s);act(s,'accept');assert.equal(forgeCommissionPhase(s),'gather');
 A.beginEncounter(s,c,HUNT_ID);assert.throws(()=>gather(s),/战斗/);assert.throws(()=>act(s,'report'),/战斗/);
});

test('free herbs are located on a reachable camp tile and remain available after completion',()=>{
 for(const phase of [undefined,'gather','done']){
  const s=hero();if(phase)s.forgeCommission={version:1,phase,...(phase==='done'?{gatherDay:'2026-11-25'}:{})};
  const world=createWorld('camp',c,s),site=world.landmarks.find(row=>row.forgeSite);
  assert.ok(site,'camp must expose the herb bed');assert.ok(walkable(world,site.x,site.y));
  const path=findPath(world,world.layout.spawn,site);assert.ok(path?.length,'spawn has a path to the herb bed');
 }
});

test('ordinary duplicate rewards have an outlet without dismantling a last copy or unique equipment',()=>{
 const s=hero();fight(s);fight(s);syncEquipmentInstances(s,c);
 const rows=equipmentInstances(s,c).rows.filter(row=>row.gsid===HUNT_COMMON_EQUIPMENT);
 assert.equal(rows.length,2);assert.equal(salvageQuote(s,c,rows[1].guid).essence,1);
 A.applyAction(s,c,{type:'hunt-forge',op:'salvage',guid:rows[1].guid});
 assert.equal(s.inventory[HUNT_COMMON_EQUIPMENT],1);assert.equal(s.inventory[EQUIPMENT_ESSENCE],1);
 assert.equal(salvageQuote(s,c,rows[0].guid).allowed,false);
 const unique=Object.values(c.items).find(item=>item.kind===1&&item.maxCount===1);
 s.inventory[unique.id]=2;syncEquipmentInstances(s,c);
 const row=equipmentInstances(s,c).rows.find(row=>row.gsid===unique.id);assert.equal(salvageQuote(s,c,row.guid).allowed,false);
});

test('ledger tracks net spending, excludes old stock and keeps totals after detail eviction',()=>{
 const s=hero();s.inventory[100]=1000;
 for(let i=0;i<65;i++){const before=economySnapshot(s);s.inventory[100]+=5;recordEconomyChange(s,before,'battle');}
 const before=economySnapshot(s);s.inventory[100]-=40;recordEconomyChange(s,before,'campfire-cook');
 assert.deepEqual(s.economyLedger.totals['100'],{gained:325,spent:40,firstGained:0});
 assert.equal(s.economyLedger.entries.length,60);assert.equal(s.economyLedger.serial,66);validateEconomyLedger(s,c);
 const outer=economySnapshot(s),inner=economySnapshot(s);s.inventory[100]+=80;recordEconomyChange(s,inner,'forge-commission');
 assert.equal(recordEconomyChange(s,outer,'adventure'),false);assert.equal(s.economyLedger.totals['100'].firstGained,80);
});

test('failed storage cannot grant materials, advance a letter or append a ledger entry',()=>{
 const s=hero();act(s,'accept');const before=structuredClone(s);
 assert.throws(()=>persistReward(s,c,{type:'forge-commission',step:'gather',choice:'herb',language:'en',now},{forgeTarget:target},{},()=>{throw Error('disk full');}),/disk full/);
 assert.deepEqual(s,before);
});

test('new optional state rejects malformed phases, missing gather history and negative ledger totals',()=>{
 const s=hero();s.forgeCommission={version:1,phase:'report'};assert.throws(()=>validateForgeCommission(s),/采集记录/);
 s.forgeCommission={version:1,phase:'reward-all'};assert.throws(()=>validateForgeCommission(s),/无效/);
 delete s.forgeCommission;const before=economySnapshot(s);s.inventory[100]=(s.inventory[100]||0)+1;recordEconomyChange(s,before,'battle');
 s.economyLedger.totals['100'].spent=-1;assert.throws(()=>validateEconomyLedger(s,c),/汇总无效/);
});

test('daily free herbs remain reachable during every accepted stage without advancing it',()=>{
 for(const phase of ['cook','challenge','report','done']){
  const s=hero();act(s,'accept');gather(s);s.forgeCommission.phase=phase;
  const coins=s.inventory[100]||0;
  assert.equal(forgeGatherAvailable(s,now),false);
  assert.equal(forgeGatherAvailable(s,tomorrow),true);
  act(s,'gather',{choice:'herb',language:'en',now:tomorrow});
  assert.equal(s.gatherPantry.herb,6);assert.equal(forgeCommissionPhase(s),phase);
  assert.equal(s.inventory[100]||0,coins);
  assert.throws(()=>act(s,'gather',{choice:'herb',language:'en',now}),/已经采过/);
  assert.equal(s.gatherPantry.herb,6);validateForgeCommission(s);
 }
 const novice=A.createAdventure(c);
 assert.equal(createWorld('camp',c,novice).landmarks.some(row=>row.forgeSite),false);
});

test('level eight and opening completion rebuild the camp before resuming after combat',()=>{
 for(const unlock of ['level','opening']){
  const s=hero();
  if(unlock==='level')s.level=7;
  else s.openingJourney={phase:'battle'};
  const before=createWorld('camp',c,s);
  assert.equal(before.landmarks.some(row=>row.forgeSite),false);
  assert.equal(canResumeWorld(before,s,s,c),true);
  if(unlock==='level')s.level=8;
  else s.openingJourney.phase='done';
  assert.equal(canResumeWorld(before,s,s,c),false,'the same mutated save must not retain an outdated camp');
  const after=createWorld('camp',c,s);
  assert.equal(after.landmarks.some(row=>row.forgeSite),true);
  assert.equal(canResumeWorld(after,s,s,c),true,'ordinary later victories keep their existing scene');
 }
});

test('each commission stage and its accounting survive split storage and cloud restoration',()=>{
 const s=hero();
 const check=()=>{
  const parsed=A.parseSave(JSON.stringify(s),c);
  const {state,...parts}=splitRoleSave(parsed);
  const local=A.parseSave(JSON.stringify(joinRoleSave(state,parts,c)),c);
  const snapshot=makeCloudSnapshot(parsed,c,d,'2026-11-26T04:30:00.000Z','12345678-1234-1234-1234-123456789abc');
  const cloud=parseCloudSnapshot(JSON.stringify(snapshot),c,d).save;
  for(const restored of [local,cloud]){
   assert.deepEqual(restored.forgeCommission,s.forgeCommission);
   assert.deepEqual(restored.economyLedger,s.economyLedger);
   assert.deepEqual(restored.gatherPantry,s.gatherPantry);
   assert.equal(restored.campfireBuff?.remainingBattles,s.campfireBuff?.remainingBattles);
   validateForgeCommission(restored);validateEconomyLedger(restored,c);
  }
 };
 act(s,'accept');check();gather(s);check();cook(s);check();fight(s);check();act(s,'report');check();
});

test('ledger rejects missing rows, serial gaps and inconsistent resource summaries',()=>{
 const original=hero();const before=economySnapshot(original);
 original.inventory[100]=(original.inventory[100]||0)+35;recordEconomyChange(original,before,'battle');
 const second=economySnapshot(original);original.inventory[100]-=10;recordEconomyChange(original,second,'shop-buy');
 const mutations=[
  s=>s.economyLedger.entries.shift(),
  s=>{s.economyLedger.entries[0].serial=0;},
  s=>{s.economyLedger.totals['100'].gained++;},
  s=>{s.economyLedger.entries[0].changes.push({key:'100',delta:1});},
  s=>{s.economyLedger.entries[0].changes[0].key='unknown';},
 ];
 for(const mutate of mutations){const s=structuredClone(original);mutate(s);assert.throws(()=>validateEconomyLedger(s,c),/资源/);}
});
