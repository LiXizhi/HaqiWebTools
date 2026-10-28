import {homeWalkNear} from './home_walking_practice_core.js';

export const HOME_JUMP_DURATION=.65;
export function beginHomeJump(hero,binding){
 if(!homeWalkNear(binding,hero)||hero.moving)return null;
 return {x:hero.x,y:hero.y,elapsed:0,height:0,landed:false};
}
// A local presentation action, not world travel. Invalid movement or a stale
// destination cancels rather than fabricating a landing or saved evidence.
export function advanceHomeJump(trace,hero,dt,binding){
 if(!trace||!Number.isFinite(dt)||dt<0||hero?.moving||hero?.x!==trace.x||hero?.y!==trace.y||!homeWalkNear(binding,hero))return null;
 if(trace.landed)return trace;
 const elapsed=Math.min(HOME_JUMP_DURATION,trace.elapsed+Math.min(dt,.05));
 const landed=elapsed>=HOME_JUMP_DURATION;
 return {...trace,elapsed,landed,height:landed?0:Math.sin(Math.PI*elapsed/HOME_JUMP_DURATION)*.85};
}
