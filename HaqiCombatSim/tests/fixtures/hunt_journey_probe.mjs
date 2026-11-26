// Headless economy journey through real combat and public adventure actions.
// Simulated decisions are diagnostic evidence, not a human playability rating.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {installExpansion} from '../../js/adventure_expansion_core.js';
import * as A from '../../js/adventure_core.js';
import {tickCare,specMaxHp} from '../../js/adventure_pets_core.js';
import {restorePveBattle,playPveRound} from '../../js/combat_pve_core.js';
import {selectableCards,canCast} from '../../js/combat_unit_core.js';
import {validTargets} from '../../js/combat_arena_core.js';
import {tacticalEnemyIntents} from '../../js/tactical_encounter_core.js';
import {ReasoningBot} from '../../js/battle_ai/policy_core.js';
import {HUNT_ID,HUNT_MARK,HUNT_EQUIPMENT,HUNT_COMMON_EQUIPMENT,EQUIPMENT_ESSENCE,salvageQuote} from '../../js/adventure_hunt_core.js';
import {equipmentInstances} from '../../js/adventure_equipment_instances_core.js';
import {createWorld} from '../../js/adventure_world_core.js';
import {forgeLesson} from '../../js/forge_commission_language_core.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../../data/'+f,import.meta.url)));
const {content:c,dataset:d}=installExpansion(...['adventure/chapter.json','adventure/combat.json','adventure/pets.json','adventure/shop-candidates.json','kids/cards.json','kids/charms.json'].map(read));
c.worldMaps={camp:read('adventure/maps/camp.json')};
const snapshot=b=>({turn:b.turn,winner:b.winner,finished:b.finished,near:b.sides.near.map(u=>({hp:u.hp,pips:u.pips,deck:u.deckSeq})),far:b.sides.far.map(u=>({hp:u.hp,pips:u.pips})),intents:tacticalEnemyIntents(b)});
export function huntJourney({school='fire',seed=17,targetWins=40,maxAttempts=120,tea=false,commission=false,salvageCommon=false,reserveFoodCoins=tea?40:0,startingCoins,trace=false}={}){
 let s=A.createAdventure(c,{school,seed}),now=new Date(2026,10,26,12).getTime(),replays=0,foodShortages=0;
 if(startingCoins!==undefined){assert.ok(Number.isSafeInteger(startingCoins)&&startingCoins>=0);s.inventory[100]=startingCoins;}
 s.xp=c.progression.xpThresholds[7];A.syncProgression(s,c);s.deck=A.recommendedDeck(s,c);
 const initialCoins=s.inventory[100]||0,log=[],actions=[];
 const act=(props,access={})=>{A.applyAction(s,c,props,access);actions.push(props);s=A.parseSave(JSON.stringify(s),c);};
 if(commission){
  act({type:'forge-commission',step:'accept',now});
  const site=createWorld(s.zone,c,s).landmarks.find(row=>row.forgeSite);
  assert.ok(site,'repair letter must have a reachable world site');s.position={x:site.x,y:site.y};
  act({type:'forge-commission',step:'gather',choice:'herb',language:forgeLesson(s).language,now},{forgeTarget:{...site,kind:'landmark'}});
 }
 const bot=new ReasoningBot({difficulty:'advanced',mode:'best',config:{branches:3,candidateCount:3}});
 for(let attempt=1;(s.hunt?.wins||0)<targetWins&&attempt<=maxAttempts;attempt++){
  // Advance the same free island recovery used by the game, with injected time.
  tickCare(s,c,A.playerSpec(s,c),now);now+=60000;tickCare(s,c,A.playerSpec(s,c),now);
  assert.equal(s.heroHp,specMaxHp(A.playerSpec(s,c)));
  if(tea&&!s.campfireBuff?.remainingBattles){
   if((s.gatherPantry?.herb||0)+(s.gatherPantry?.flower||0)>=3||(s.inventory[100]||0)>=40)act({type:'campfire-cook',recipeId:'herbal-dew-tea',now});
   else foodShortages++;
  }
  const {checkpoint}=A.beginEncounter(s,c,HUNT_ID);let b=restorePveBattle(d,c,checkpoint);const rounds=[];
  while(!b.finished&&b.turn<40){
   const hero=b.sides.near[0],intent=tacticalEnemyIntents(b)[0];
   const heavy=intent?.kind==='attack'&&Number(b.resolved.cards[intent.key]?.pipcost)>=2;
   const analysis=bot.analyze(b,hero);bot.remember(b,hero.id,analysis.memory);
   const suggested=analysis.evaluated[0]?.action||{pass:true};
   // Reserve shields for telegraphed heavy attacks without turning a useful
   // alternative into a forced pass. This is probe policy, not player AI.
   let decision=structuredClone((heavy?analysis.evaluated[0]:analysis.evaluated.find(row=>row.action.key!=='Ice_GlobalShield'))?.action||{pass:true});
   if(decision.discardSeqs)decision={...decision,discardSeqs:decision.discardSeqs.filter(seq=>hero.deckSeq[seq]!=='Ice_GlobalShield')};
   if(heavy){const shield=selectableCards(hero).find(h=>h.key==='Ice_GlobalShield'&&canCast(hero,b.resolved.cards[h.key],b.resolved));
    if(shield&&validTargets(b,hero,b.resolved.cards[shield.key]).includes(hero))decision={seq:shield.seq,key:shield.key,targetId:hero.id};}
   if(trace)rounds.push({turn:b.turn,hp:hero.hp,pips:structuredClone(hero.pips),enemyHp:b.sides.far[0].hp,intent,suggested,decision,hand:selectableCards(hero).map(h=>h.key)});
   playPveRound(b,decision);A.recordDecision(s,decision,b);
   if(b.turn%3===0){const before=snapshot(b);s=A.parseSave(JSON.stringify(s),c);b=restorePveBattle(d,c,s.pendingEncounter);assert.deepEqual(snapshot(b),before);replays++;}
  }
  assert.ok(b.finished,'diagnostic turn limit reached');
  const result=A.settleEncounter(s,c,b,{now});
  log.push({attempt,winner:b.winner,turns:b.turn,level:s.level,marks:s.inventory[HUNT_MARK]||0,direct:result.huntReward?.dropped||false,hp:b.sides.near[0].hp,...(trace?{rounds}: {})});
  s=A.parseSave(JSON.stringify(s),c);
  if(s.forgeCommission?.phase==='report')act({type:'forge-commission',step:'report',now});
  if((s.inventory[HUNT_MARK]||0)>=40)act({type:'hunt-forge',op:'exchange',itemId:HUNT_EQUIPMENT[0]});
  const rows=equipmentInstances(s,c).rows.filter(row=>row.gsid===HUNT_EQUIPMENT[0]);
  if(rows.length&&!s.equipmentGuids?.[2])act({type:'equip',itemId:HUNT_EQUIPMENT[0],guid:rows[0].guid});
  for(const row of rows)if(salvageQuote(s,c,row.guid).allowed)act({type:'hunt-forge',op:'salvage',guid:row.guid});
  if(salvageCommon)for(const row of equipmentInstances(s,c).rows.filter(row=>row.gsid===HUNT_COMMON_EQUIPMENT)){
   if(salvageQuote(s,c,row.guid).allowed)act({type:'hunt-forge',op:'salvage',guid:row.guid});
  }
  // Exercise both sinks as real duplicates are earned; do not inject materials.
  const recipe=actions.some(a=>a.recipeId==='beans')?'pearl':'beans';
  const cost=recipe==='beans'?3:6,coins=recipe==='beans'?150:200;
  if((s.inventory[EQUIPMENT_ESSENCE]||0)>=cost&&(s.inventory[100]||0)>=coins+reserveFoodCoins)act({type:'hunt-forge',op:'craft',recipeId:recipe});
  log.at(-1).economy={coins:s.inventory[100]||0,essence:s.inventory[EQUIPMENT_ESSENCE]||0,mealVictories:s.campfireBuff?.remainingBattles||0,coinTotals:structuredClone(s.economyLedger?.totals['100']||{})};
 }
 assert.equal(s.hunt?.wins,targetWins);
 assert.ok(s.equipmentGuids[2]);
 return {school,seed,tea,commission,initialCoins,reserveFoodCoins,foodShortages,wins:s.hunt.wins,attempts:log.length,replays,level:s.level,coinsEarnedNet:(s.inventory[100]||0)-initialCoins,marks:s.inventory[HUNT_MARK]||0,essence:s.inventory[EQUIPMENT_ESSENCE]||0,equipped:s.equipment[2],ledger:s.economyLedger,actions,log};
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/hunt_journey_probe.mjs'))console.log(JSON.stringify(huntJourney()));
