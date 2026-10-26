// Comprehension requires a real choice. Every matching object is an answer;
// another instance of the same item is not a distractor.
export function homeComprehensionChoices(itemIds,objects,actions){
 const selectable=objects.filter(o=>actions.some(a=>a.kind==='find'&&a.objectId===o.id));
 const targets=selectable.filter(o=>itemIds.includes(o.itemId));
 const decoys=selectable.filter(o=>!itemIds.includes(o.itemId));
 return targets.length&&decoys.length?{targets:targets.map(o=>({id:o.id,itemId:o.itemId})),decoys:decoys.map(o=>({id:o.id,itemId:o.itemId}))}:null;
}
export function homeComprehensionCurrent(choices,objects){
 const exists=o=>objects.some(now=>now.id===o.id&&now.itemId===o.itemId);
 return !!choices&&choices.targets.some(exists)&&choices.decoys.some(exists);
}
export function homeComprehensionAnswer(choices,event,objects){
 return homeComprehensionCurrent(choices,objects)&&event?.kind==='find'&&choices.targets.some(o=>o.id===event.objectId&&objects.some(now=>now.id===o.id&&now.itemId===o.itemId));
}
