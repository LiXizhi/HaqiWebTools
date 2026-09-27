import {createRng,hashSeed} from './rng_core.js';
// Stable cosmetic identifiers; old saves resolve to their original body.
export function validHeroBodyId(id,appearance){return typeof id==='string'&&new RegExp(`^${appearance==='girl'?'female':'male'}(?:[2-9]|1[01]|-ref)?$`).test(id);}
export function resolvedBodyId(save){return validHeroBodyId(save.bodyId,save.appearance)?save.bodyId:save.appearance==='girl'?'female':'male';}

// Separate cosmetic stream: refreshes keep outfits stable without consuming gameplay RNG.
export function randomHeroBodyId(manifest,appearance,seed){
 const gender=appearance==='girl'?'female':'male';
 const pool=[gender,...Object.keys(manifest?.bodyVariants||{}).filter(id=>manifest.bodyVariants[id].gender===gender&&validHeroBodyId(id,appearance)).sort()];
 return createRng(hashSeed(`${seed}:body-costume`)).pick(pool);
}
