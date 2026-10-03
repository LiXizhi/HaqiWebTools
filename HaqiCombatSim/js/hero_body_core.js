import {createRng,hashSeed} from './rng_core.js';
// Stable cosmetic identifiers; old saves resolve to their original body.
export function validHeroBodyId(id,appearance){return typeof id==='string'&&id.length<=64&&new RegExp(`^${appearance==='girl'?'female':'male'}(?:[2-9]|1[0-3]|-ref|-urban-[a-z0-9]+(?:-[a-z0-9]+)*)?$`).test(id);}
export function resolvedBodyId(save){return validHeroBodyId(save.bodyId,save.appearance)?save.bodyId:save.appearance==='girl'?'female':'male';}

// Separate cosmetic stream: refreshes keep outfits stable without consuming gameplay RNG.
export function randomHeroBodyId(manifest,appearance,seed){
 const gender=appearance==='girl'?'female':'male';
 const pool=[gender,...Object.keys(manifest?.bodyVariants||{}).filter(id=>manifest.bodyVariants[id].gender===gender&&validHeroBodyId(id,appearance)).sort()];
 return createRng(hashSeed(`${seed}:body-costume`)).pick(pool);
}

// 新建角色的默认头部不使用非洲肤色家族（onyx/cocoa），避免开局形象是黑人；
// 这些头仍然保留在自选列表里，玩家可以手动翻到。
export const DEFAULT_HEAD_EXCLUDE=/^(?:onyx|cocoa)-/;
export function randomHeroHeadId(manifest,appearance,seed){
 const gender=appearance==='girl'?'female':'male';
 const fallback=gender==='female'?'elf-girl':'elf-boy';
 const pool=Object.keys(manifest?.heads||{}).filter(id=>manifest.heads[id].gender===gender&&!DEFAULT_HEAD_EXCLUDE.test(id)).sort();
 if(!pool.length)return fallback;
 return createRng(hashSeed(`${seed}:head-look`)).pick(pool);
}

// 第一步「起名字」的初始草稿：男主角与女主角两张卡各自随机搭配头部和服装，
// 并让当前选中的性别直接带上那一套随机外观，省去玩家先翻一遍。
export function createHeroDraft(manifest,seed=Date.now()){
 const appearance=createRng(hashSeed(`${seed}:hero-appearance`)).pick(['boy','girl']);
 const headChoices={},bodyChoices={};
 for(const value of ['boy','girl']){
  headChoices[value]=randomHeroHeadId(manifest,value,`${seed}:${value}`);
  const recommended=manifest?.heads?.[headChoices[value]]?.recommendedBodyId;
  // Generated urban bodies include their own exposed skin. Keep the first
  // draft anatomically matched; the picker still allows independent changes.
  if(recommended&&manifest?.bodyVariants?.[recommended]?.gender===(value==='girl'?'female':'male')&&validHeroBodyId(recommended,value))bodyChoices[value]=recommended;
  else{
   const classicVariants=Object.fromEntries(Object.entries(manifest?.bodyVariants||{}).filter(([,body])=>!body.recommendedHeadId));
   bodyChoices[value]=randomHeroBodyId({...manifest,bodyVariants:classicVariants},value,`${seed}:${value}`);
  }
 }
 return {name:'',school:'fire',appearance,starter:'dragon_green',step:1,
  headId:headChoices[appearance],bodyId:bodyChoices[appearance],headChoices,bodyChoices};
}
