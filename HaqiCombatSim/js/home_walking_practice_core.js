import {HOME_WALK_SPEED} from './home_walk_core.js';
import {footprint} from './home_core.js';
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function homeWalkBinding(object,catalog){
 if(!object||object.parentId||!catalog.some(i=>i.id===object.itemId&&!i.building))return null;
 const b=footprint(object,catalog);return {id:object.id,itemId:object.itemId,x:b.x,y:b.y,w:b.w,h:b.h};
}
export function homeWalkCurrent(binding,objects,catalog){
 const current=homeWalkBinding(objects.find(o=>o.id===binding?.id),catalog);
 return !!current&&['id','itemId','x','y','w','h'].every(k=>current[k]===binding[k]);
}
export function homeWalkNear(binding,hero){
 if(!binding||!point(hero))return false;
 const dx=Math.max(0,binding.x-hero.x,hero.x-binding.x-binding.w),dy=Math.max(0,binding.y-hero.y,hero.y-binding.y-binding.h);
 return Math.hypot(dx,dy)<=1.25&&!(hero.x>binding.x&&hero.x<binding.x+binding.w&&hero.y>binding.y&&hero.y<binding.y+binding.h);
}
export function beginHomeWalk(hero){return point(hero)?{last:{x:hero.x,y:hero.y},distance:0,arrived:false}:null;}
// Match stepHomeWalk: four tiles/s by default, six only for the running wrapper,
// with dt capped at .05.
// No elapsed-time credit, teleport credit, duplicate segment credit or saved trace.
export function advanceHomeWalk(trace,before,after,dt,binding,speed=HOME_WALK_SPEED){
 if(!trace||!point(before)||!point(after)||!Number.isFinite(dt)||dt<0)return null;
 if(distance(trace.last,after)<1e-8)return trace;
 const moved=distance(before,after);
 if(distance(trace.last,before)>1e-6||moved>Math.min(dt,.05)*speed+1e-6)return beginHomeWalk(after);
 const total=trace.distance+moved;
 return {last:{x:after.x,y:after.y},distance:total,arrived:total>=1.5&&homeWalkNear(binding,after)};
}
