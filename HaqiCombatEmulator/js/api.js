// Shared browser / Worker / Node API; no UI or scheduling dependencies.
export {compileCharacter} from './rules/character.js';
export {createBattle,getObservation,getLegalActions,stepBattle,replayBattle,exportReplay} from './engine/battle.js';
export {runBattle,runBatch,createReport,matchAt} from './simulation/runner.js';
export {applyPatch} from './ai/patch.js';
