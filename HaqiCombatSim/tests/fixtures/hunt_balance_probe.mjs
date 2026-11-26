import fs from 'node:fs';
import {installExpansion} from '../../js/adventure_expansion_core.js';
import * as A from '../../js/adventure_core.js';
import {restorePveBattle,playPveRound} from '../../js/combat_pve_core.js';
import {selectableCards,canCast} from '../../js/combat_unit_core.js';
import {validTargets} from '../../js/combat_arena_core.js';
import {tacticalEnemyIntents} from '../../js/tactical_encounter_core.js';
import {ReasoningBot} from '../../js/battle_ai/policy_core.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../../data/'+f,import.meta.url)));
const {content,dataset}=installExpansion(...['adventure/chapter.json','adventure/combat.json','adventure/pets.json','adventure/shop-candidates.json','kids/cards.json','kids/charms.json'].map(read));
export function huntProbe({school='fire',seed=17,level=8,prepared=true,boost=50,hp=900,policy='tactical'}={}){
 const save=A.createAdventure(content,{school,seed});save.xp=content.progression.xpThresholds[level-1];A.syncProgression(save,content);
 save.deck=A.recommendedDeck(save,content);
 const params=content.balanceParams.hunt,previous={...params};params.preparationBoost=boost;params.hp=hp;
 const {checkpoint}=A.beginEncounter(save,content,'hunt:ember');Object.assign(params,previous);
 const a=restorePveBattle(dataset,content,checkpoint),bot=new ReasoningBot({difficulty:'advanced',mode:'best',config:{branches:3,candidateCount:3}}),trace=[];
 while(!a.finished&&a.turn<30){
  const hero=a.sides.near[0],intent=tacticalEnemyIntents(a)[0];
  let decision=bot.pick(a,hero);
  if(prepared&&policy==='tactical'){
   // The comparison policy conserves both aid shields for announced heavy hits.
   // A generic search bot may otherwise discard them before the next heavy.
   if(decision.discardSeqs)decision={...decision,discardSeqs:decision.discardSeqs.filter(seq=>hero.deckSeq[seq]!=='Ice_GlobalShield')};
   if(decision.key==='Ice_GlobalShield'&&!(intent?.kind==='attack'&&Number(a.resolved.cards[intent.key]?.pipcost)>=2))decision={pass:true};
  }
  if(prepared&&policy==='tactical'&&intent?.kind==='attack'&&Number(a.resolved.cards[intent.key]?.pipcost)>=2){
   const hand=selectableCards(hero),shield=hand.find(h=>h.key==='Ice_GlobalShield'&&canCast(hero,a.resolved.cards[h.key],a.resolved));
   if(shield&&validTargets(a,hero,a.resolved.cards[shield.key]).some(u=>u.id===hero.id))decision={seq:shield.seq,key:shield.key,targetId:hero.id};
  }
  if(!prepared&&decision.key==='Ice_GlobalShield'){
   const attack=selectableCards(hero).find(h=>Number(a.resolved.cards[h.key]?.pipcost)>0&&canCast(hero,a.resolved.cards[h.key],a.resolved)&&validTargets(a,hero,a.resolved.cards[h.key]).some(u=>a.sides.far.includes(u)));
   decision=attack?{seq:attack.seq,key:attack.key,targetId:validTargets(a,hero,a.resolved.cards[attack.key]).find(u=>a.sides.far.includes(u)).id}:{pass:true};
  }
  if(policy==='pass')decision={pass:true};
  trace.push({turn:a.turn,intent:intent?.effect,key:decision.key,discards:decision.discardSeqs||[],hp:hero.hp,mob:a.sides.far[0].hp});
  playPveRound(a,decision);
 }
 return {school,seed,prepared,boost,hp,policy,winner:a.winner,turn:a.turn,heroHp:a.sides.near[0].hp,trace};
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/hunt_balance_probe.mjs')){
 const rows=[];
 for(const boost of [50,65,75])for(const school of ['fire','ice','storm','life','death'])for(const prepared of [false,true])for(const seed of [17,1009,1010])rows.push(huntProbe({boost,school,prepared,seed}));
 const summary=[];
 for(const boost of [50,65,75])for(const school of ['fire','ice','storm','life','death']){
  const group=rows.filter(r=>r.boost===boost&&r.school===school);
  summary.push({boost,school,unprepared:group.filter(r=>!r.prepared&&r.winner==='near').length,prepared:group.filter(r=>r.prepared&&r.winner==='near').length,turns:group.filter(r=>r.prepared).map(r=>r.turn)});
 }
 console.log(JSON.stringify({method:'90 seeded level-8 fights; recommended real deck and two encounter aid shields; native accuracy and stats; compare public-intent shield response vs ignoring aid',summary}));
}
