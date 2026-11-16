import {STARTERS} from './adventure_pets_core.js';

// Only untouched camp arrivals need the first step; never replay it for established roles.
export function campArrivalPet(save){
 if(save.zone!=='camp'||save.pendingEncounter||save.tips?.campArrivalSeen||save.level!==1||Object.keys(save.quests||{}).length)return null;
 if(save.openingJourney&&save.openingJourney.phase!=='offer')return null;
 return Object.entries(save.pets||{}).find(([,pet])=>STARTERS.includes(pet.speciesId))?.[0]||null;
}

// The reward may have been saved just before a reload or role switch.
export function pendingCompanionWelcome(save){
 const id=save.tips?.pendingCompanionWelcome,pet=save.pets?.[id];
 return pet&&!STARTERS.includes(pet.speciesId)?id:null;
}
