import {beginHomeWalk,advanceHomeWalk,homeWalkNear} from './home_walking_practice_core.js';

export function beginHomeStand(hero){const walk=beginHomeWalk(hero);return walk?{...walk,stood:false}:null;}
// Arrival while still walking is not standing. Reuse the real movement trace:
// beginning already near the furniture, a click or a teleport cannot complete it.
export function advanceHomeStand(trace,before,after,dt,binding){
 const walk=advanceHomeWalk(trace,before,after,dt,binding);
 if(!walk)return null;
 const stopped=after?.moving===false&&before?.x===after.x&&before?.y===after.y;
 return {...walk,stood:walk.distance>=1.5&&stopped&&homeWalkNear(binding,after)};
}
