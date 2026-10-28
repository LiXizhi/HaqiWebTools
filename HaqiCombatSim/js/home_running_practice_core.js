import {HOME_RUN_SPEED} from './home_walk_core.js';
import {beginHomeWalk,advanceHomeWalk} from './home_walking_practice_core.js';

// Only displacement produced by the active running gait counts. Walking,
// teleporting, elapsed time and clicking the destination cannot satisfy run.
export function advanceHomeRun(trace,before,after,dt,binding){
 if(after?.gait!=='run')return beginHomeWalk(after);
 return advanceHomeWalk(trace,before,after,dt,binding,HOME_RUN_SPEED);
}
