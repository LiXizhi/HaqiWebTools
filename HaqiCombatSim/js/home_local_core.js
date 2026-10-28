import {stepHomeWalk} from './home_walk_core.js';

export function homeDuoCamera(heroes){
 return {x:(heroes[0].x+heroes[1].x)/2,y:(heroes[0].y+heroes[1].y)/2};
}

export function homeDuoScale(heroes,scale,{width,height}){
 const dx=Math.abs(heroes[0].x-heroes[1].x),dy=Math.abs(heroes[0].y-heroes[1].y);
 return Math.min(scale,Math.max(1,width-160)/Math.max(.01,dx),Math.max(1,height-300)/Math.max(.01,dy));
}

// Keep both actors inside the shared viewport, without teleporting through obstacles.
export function homeDuoStep(heroes,targets,dt,objects,catalog,seed,{width,height,scale,running=false}){
 const next=heroes.map((h,i)=>targets[i]?stepHomeWalk(h,targets[i],dt,objects,catalog,seed,i===0&&running?'run':'walk'):{...h,moving:false});
 const limitX=Math.max(2,(width-160)/scale),limitY=Math.max(2,(height-300)/scale);
 const fits=(a,b)=>Math.abs(a.x-b.x)<=limitX&&Math.abs(a.y-b.y)<=limitY;
 if(fits(...next))return next;
 // Allow either player to approach their partner at the boundary.
 for(let i=0;i<2;i++)if(!fits(next[i],heroes[1-i])&&Math.hypot(next[i].x-heroes[1-i].x,next[i].y-heroes[1-i].y)>=Math.hypot(heroes[i].x-heroes[1-i].x,heroes[i].y-heroes[1-i].y))next[i]={...heroes[i],moving:false};
 return next;
}
