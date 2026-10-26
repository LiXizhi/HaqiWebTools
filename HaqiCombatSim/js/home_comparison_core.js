import {COLORS} from './home_core.js';
export const HOME_COMPARISON_WORDS=['same','different','big','small','long','short'];
export const HOME_LENGTH_ITEMS=['pencil','pen'];
const lengthKind=kind=>['long','short'].includes(kind);
const sizeKind=kind=>['big','small','long','short'].includes(kind);
const scale=o=>o.sizeScale??1;
const rotation=o=>(o.rotation||0)%4;
const snapshot=(o,size)=>size?{id:o.id,itemId:o.itemId,sizeScale:scale(o),rotation:rotation(o)}:{id:o.id,itemId:o.itemId,color:o.color};
export function homeComparisonBinding(spec,objects,actions){
 if(!spec||!HOME_COMPARISON_WORDS.includes(spec.kind))return null;
 const size=sizeKind(spec.kind);
 const usable=objects.filter(o=>(!lengthKind(spec.kind)||HOME_LENGTH_ITEMS.includes(o.itemId))&&(size?Number.isFinite(scale(o))&&scale(o)>=.5&&scale(o)<=2:Object.hasOwn(COLORS,o.color))&&actions.some(a=>a.kind==='find'&&a.objectId===o.id));
 for(const anchor of usable.filter(o=>spec.anchorItemIds.includes(o.itemId))){
  const options=usable.filter(o=>o.id!==anchor.id&&spec.itemIds.includes(o.itemId)&&(!size||(o.itemId===anchor.itemId&&rotation(o)===rotation(anchor))));
  // Same model and orientation: sizeScale changes the actual rendered footprint.
  // Require a clear 1.5x contrast; tiny differences are not a beginner puzzle.
  const larger=['big','long'].includes(spec.kind);
  const matches=o=>size?(larger?scale(o)>=scale(anchor)*1.5:scale(o)<=scale(anchor)/1.5):spec.kind==='same'?o.color===anchor.color:o.color!==anchor.color;
  const targets=options.filter(matches),decoys=options.filter(o=>!matches(o)&&(!size||(larger?scale(o)<=scale(anchor):scale(o)>=scale(anchor))));
  if(targets.length&&decoys.length)return {kind:spec.kind,anchor:snapshot(anchor,size),targets:targets.map(o=>snapshot(o,size)),decoys:decoys.map(o=>snapshot(o,size))};
 }
 return null;
}
export function homeComparisonCurrent(binding,objects){
 return !!binding&&[binding.anchor,...binding.targets,...binding.decoys].every(s=>objects.some(o=>o.id===s.id&&o.itemId===s.itemId&&(sizeKind(binding.kind)?scale(o)===s.sizeScale&&rotation(o)===s.rotation:o.color===s.color)));
}
