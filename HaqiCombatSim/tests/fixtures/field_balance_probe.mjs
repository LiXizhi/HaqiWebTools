import fs from 'node:fs';
import {installExpansion} from '../../js/adventure_expansion_core.js';
import {installIslandEncounters} from '../../js/adventure_island_encounters_core.js';
import {fieldTacticsProfile} from '../../js/adventure_field_tactics_core.js';
import * as A from '../../js/adventure_core.js';
import {restorePveBattle,playPveRound} from '../../js/combat_pve_core.js';
import {tacticalEnemyIntents} from '../../js/tactical_encounter_core.js';
import {ReasoningBot} from '../../js/battle_ai/policy_core.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../../data/'+f,import.meta.url)));
const {content,dataset}=installExpansion(...['adventure/chapter.json','adventure/combat.json','adventure/pets.json','adventure/shop-candidates.json','kids/cards.json','kids/charms.json'].map(read));
installIslandEncounters(content,dataset,read('adventure/island-encounters.json'),read('kids/cards.json'));
export const fieldElites=content.encounters.filter(e=>fieldTacticsProfile(e,content)).map(e=>({id:e.id,...Object.fromEntries(['name','level','hp'].map(k=>[k,content.monsters[e.monsterId||e.monsterIds[0]][k]]))}));

// Fixed-seed policy comparison with a legal same-level recommended deck, no pet,
// no equipment and no guaranteed hunt aid. This is not a human win-rate estimate.
export function fieldProbe({id=fieldElites[0].id,school='fire',seed=17,tactical=true,ruleOverrides={},hpScale=1}={}){
 const encounter=content.encounters.find(e=>e.id===id),monster=content.monsters[encounter.monsterId||encounter.monsterIds[0]];
 const save=A.createAdventure(content,{school,seed});save.xp=content.progression.xpThresholds[monster.level-1];A.syncProgression(save,content);
 save.zone=encounter.zone;save.deck=A.recommendedDeck(save,content);
 const {checkpoint}=A.beginEncounter(save,content,id);
 if(tactical)Object.assign(checkpoint.tacticalEncounter,ruleOverrides);
 if(!tactical){delete checkpoint.tacticalEncounter;delete checkpoint.fieldTacticsVersion;}
 const runtimeContent=hpScale===1?content:{...content,monsters:{...content.monsters,[monster.id]:{...monster,hp:Math.round(monster.hp*hpScale)}}};
 const a=restorePveBattle(dataset,runtimeContent,checkpoint),bot=new ReasoningBot({difficulty:'advanced',mode:'best',config:{branches:3,candidateCount:3}}),trace=[];
 while(!a.finished&&a.turn<35){
  const hero=a.sides.near[0],intent=tacticalEnemyIntents(a)[0],decision=bot.pick(a,hero);
  trace.push({turn:a.turn,intent:intent?.effect,key:decision.key,hp:hero.hp,mob:a.sides.far[0].hp});
  playPveRound(a,decision);
 }
 return {id,name:monster.name,school,seed,tactical,winner:a.winner,turn:a.turn,hp:a.sides.near[0].hp,trace};
}
