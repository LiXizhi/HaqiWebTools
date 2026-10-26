import {footprint} from './home_core.js';
import {wordReadingMatches} from './word_cards_core.js';
export const HOME_COUNT_WORDS=['one','two','three','four','five','six','seven','eight','nine','ten'];
export function homeCountingArea({camera,scale,size}){
 if(!camera||![camera.x,camera.y,scale,size?.width,size?.height].every(Number.isFinite)||scale<=0)return null;
 // Leave room for the practice window below and navigation above. Coordinates
 // are frozen in world space, so moving the camera never changes the question.
 const left=32,top=100,right=size.width-32,bottom=size.height-310;
 if(right-left<80||bottom-top<80)return null;
 return {x:camera.x+(left-size.width/2)/scale,y:camera.y+(top-size.height/2)/scale,w:(right-left)/scale,h:(bottom-top)/scale};
}
export function homeCountObjects(itemIds,objects,area,catalog){
 if(!area||![area.x,area.y,area.w,area.h].every(Number.isFinite)||area.w<=0||area.h<=0)return [];
 return objects.filter(o=>{
  const item=catalog.find(i=>i.id===o.itemId);if(!item||item.building||!itemIds.includes(o.itemId))return false;
  const b=footprint(o,catalog);
  return Number.isFinite(o.x)&&Number.isFinite(o.y)&&o.x>=area.x&&o.y>=area.y&&o.x+b.w<=area.x+area.w&&o.y+b.h<=area.y+area.h;
 });
}
export function homeCountSnapshot(spec,objects,area,catalog){
 const targets=homeCountObjects(spec.itemIds,objects,area,catalog);
 if(!Number.isInteger(spec.amount)||spec.amount<1||spec.amount>10||targets.length!==spec.amount||new Set(targets.map(o=>o.id)).size!==targets.length)return null;
 return {area:{...area},itemIds:[...spec.itemIds],targets:targets.map(o=>({id:o.id,itemId:o.itemId})),options:homeCountObjects(catalog.filter(i=>!i.building).map(i=>i.id),objects,area,catalog).map(o=>o.id)};
}
export function homeCountCurrent(snapshot,objects,catalog){
 if(!snapshot)return false;
 const current=homeCountObjects(snapshot.itemIds,objects,snapshot.area,catalog);
 return current.length===snapshot.targets.length&&snapshot.targets.every(o=>current.some(c=>c.id===o.id&&c.itemId===o.itemId));
}
export function homeCountAnswer(game,text,input){
 // ASR may output a digit for a correctly spoken number. Typed digits do not
 // demonstrate the English spelling and are deliberately not accepted.
 const spoken=input==='speech'?String(text).replace(new RegExp(`\\b${game.count.amount}\\b`,'g'),HOME_COUNT_WORDS[game.count.amount-1]):text;
 return [game,...(game.alternatives||[])].some(row=>wordReadingMatches(spoken,row.answer));
}
