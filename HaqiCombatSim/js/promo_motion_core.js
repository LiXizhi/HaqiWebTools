import {followPath,WALK_SPEED} from './adventure_world_core.js';

export function samplePromoMotion(world,origin,path,elapsed,{facing=0,mountId=null,balanceParams}={}) {
    const speed=WALK_SPEED*(mountId?balanceParams?.adventure?.mountSpeed||1.35:1);
    let position={...origin},remaining=[...path],time=Math.max(0,elapsed),moving=false;
    while(time>0&&remaining.length){
        const step=Math.min(time,1/60),next=followPath(world,position,remaining,speed*step);
        const dx=next.position.x-position.x,dy=next.position.y-position.y;
        moving=Math.hypot(dx,dy)>.01;
        if(moving)facing=Math.abs(dx)>Math.abs(dy)?(dx<0?1:2):(dy<0?3:0);
        position=next.position;remaining=next.path;time-=step;
        if(next.blocked)break;
    }
    return {position,facing,moving:moving&&remaining.length>0};
}