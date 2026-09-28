import {followPath,findPath,WALK_SPEED} from './adventure_world_core.js';

// NPCs are intentionally traversable in the game. Filming keeps sprite space
// along the entire route, including the final standing pose.
export function planPromoPath(world,origin,clearance=110) {
    const actors=[...(world.npcs||[]),...(world.encounters||[])];
    let best=[],bestLength=0;
    for(const target of [...(world.layout?.paths||[]).map(p=>p.b),...actors,world.center].filter(Boolean)){
        const route=findPath(world,origin,target);let previous=origin,length=0,safe=[];
        outer:for(const end of route){
            const span=Math.hypot(end.x-previous.x,end.y-previous.y),steps=Math.max(1,Math.ceil(span/4));
            for(let i=1;i<=steps;i++){
                const p={x:previous.x+(end.x-previous.x)*i/steps,y:previous.y+(end.y-previous.y)*i/steps};
                if(actors.some(a=>Math.hypot(p.x-a.x,p.y-a.y)<clearance+4)||length+span*i/steps>900)break outer;
                safe.push(p);
            }
            length+=span;previous=end;
        }
        const distance=safe.reduce((sum,p,i)=>sum+Math.hypot(p.x-(safe[i-1]||origin).x,p.y-(safe[i-1]||origin).y),0);
        if(distance>bestLength){best=safe;bestLength=distance;}
    }
    return best;
}

export function samplePromoZoom(elapsed,duration,amount=0,reducedMotion=false){
    if(reducedMotion)return 1;
    const t=Math.max(0,Math.min(1,elapsed/Math.max(1,duration*.8)));
    return 1+amount*t*t*(3-2*t);
}

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
