// Comprehension requires a real choice. Every matching object is an answer;
// another instance of the same item is not a distractor.
import {COLORS} from './home_core.js';
import {HOME_BODY_PARTS,HOME_BODY_ITEM} from './home_body_parts_core.js';
export function homeComprehensionChoices(itemIds,objects,actions,colors=null,bodyPart=null){
 const selectable=objects.filter(o=>actions.some(a=>a.kind==='find'&&a.objectId===o.id));
 if(bodyPart){
  if(colors||!HOME_BODY_PARTS.includes(bodyPart)||itemIds.length!==1||itemIds[0]!==HOME_BODY_ITEM)return null;
  const pictures=selectable.filter(o=>o.itemId===HOME_BODY_ITEM);
  const snapshot=(o,part)=>({id:o.id,itemId:o.itemId,part});
  return pictures.length?{type:'body',targets:pictures.map(o=>snapshot(o,bodyPart)),decoys:pictures.flatMap(o=>HOME_BODY_PARTS.filter(p=>p!==bodyPart).map(p=>snapshot(o,p)))}:null;
 }
 if(colors){
  const marked=selectable.filter(o=>itemIds.includes(o.itemId)&&Object.hasOwn(COLORS,o.color));
  const targets=marked.filter(o=>colors.includes(o.color));
  // The same item in another colour is required, so shape alone cannot answer.
  const decoys=marked.filter(o=>!colors.includes(o.color)&&targets.some(t=>t.itemId===o.itemId));
  const snapshot=o=>({id:o.id,itemId:o.itemId,color:o.color});
  return targets.length&&decoys.length?{targets:targets.map(snapshot),decoys:decoys.map(snapshot)}:null;
 }
 const targets=selectable.filter(o=>itemIds.includes(o.itemId));
 const decoys=selectable.filter(o=>!itemIds.includes(o.itemId));
 return targets.length&&decoys.length?{targets:targets.map(o=>({id:o.id,itemId:o.itemId})),decoys:decoys.map(o=>({id:o.id,itemId:o.itemId}))}:null;
}
const exists=(o,objects)=>objects.some(now=>now.id===o.id&&now.itemId===o.itemId&&(!Object.hasOwn(o,'color')||now.color===o.color));
export function homeComprehensionCurrent(choices,objects){
 return !!choices&&choices.targets.some(o=>exists(o,objects))&&choices.decoys.some(o=>exists(o,objects));
}
export function homeComprehensionAnswer(choices,event,objects){
 return homeComprehensionCurrent(choices,objects)&&event?.kind==='find'&&choices.targets.some(o=>o.id===event.objectId&&(!o.part||o.part===event.part)&&exists(o,objects));
}
