import {defaultParams} from './combat_params_core.js';
const DEFAULTS=defaultParams('kids').fieldTactics;
// Curated wild elites only. Native boss genes and old in-progress battles keep
// their original policy; new battles persist this version before any input.
const ELITES=new Set([
 'config/Aries/Mob/FireLand/MobTemplate_RedCrabLower.xml',
 'config/Aries/Mob/FireLand/MobTemplate_GhostOctopus.xml',
 'config/Aries/Mob/FireLand/MobTemplate_IronBee_Boss_Fuben.xml',
 'config/Aries/Mob/FireLand/MobTemplate_IcePangolin_Fuben.xml',
]);
export function fieldTacticsProfile(encounter,content){
 if(!encounter||encounter.legacyOnly||encounter.blocked?.length||encounter.zone!=='fire')return null;
 const ids=encounter.monsterIds||[encounter.monsterId];
 if(!ids.length||!ELITES.has(ids[0]))return null;
 // Never replace authored native genes/sequences, including in a formation.
 if(ids.some(id=>!content.monsters[id]||content.monsters[id].genes?.length||content.monsters[id].sequences?.length))return null;
 const rules=content.balanceParams?.fieldTactics||DEFAULTS;
 return {version:1,id:'elite',handSize:6,focusFreeAttack:false,preparationBoost:rules.preparationBoost,counterBoost:rules.counterBoost};
}
export function validateFieldTactics(checkpoint,content){
 if(checkpoint?.fieldTacticsVersion===undefined)return;
 const encounter=content.encounters.find(row=>row.id===checkpoint.encounterId);
 const expected=fieldTacticsProfile(encounter,content);
 if(checkpoint.fieldTacticsVersion!==1||!expected||JSON.stringify(checkpoint.tacticalEncounter)!==JSON.stringify(expected))throw Error('野外精英战术快照无效');
}
