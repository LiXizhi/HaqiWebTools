import {distance,findPath,followPath,WALK_SPEED,walkable} from './adventure_world_core.js';

const length=(start,path)=>path.reduce((sum,p,i)=>sum+distance(p,path[i-1]||start),0);
// Follow road segments to a real city entrance, never an arbitrary scenic destination.
export function planPromoCityApproach(world,entrance){
    const roads=(world.paths||[]).filter(r=>distance(r.a,entrance)<2600||distance(r.b,entrance)<2600);
    const candidates=[];
    for(const road of roads){
        const dx=road.b.x-road.a.x,dy=road.b.y-road.a.y,t=Math.max(0,Math.min(1,((entrance.x-road.a.x)*dx+(entrance.y-road.a.y)*dy)/(dx*dx+dy*dy||1)));
        const join={x:road.a.x+dx*t,y:road.a.y+dy*t};
        if(distance(join,entrance)>300)continue;
        for(const end of [road.a,road.b]){
            const route=[join,end];let travelled=distance(join,end),lastRoad=road;
            for(let step=0;travelled<1500&&step<16;step++){
                const tail=route.at(-1),next=roads.filter(r=>r!==lastRoad&&(distance(r.a,tail)<2||distance(r.b,tail)<2)).map(r=>({road:r,end:distance(r.a,tail)<2?r.b:r.a})).filter(r=>!route.some(p=>distance(p,r.end)<2)).sort((a,b)=>distance(b.end,entrance)-distance(a.end,entrance))[0];
                if(!next)break;travelled+=distance(tail,next.end);route.push(next.end);lastRoad=next.road;
            }
            const forward=[{...entrance},...route];let budget=1500,trimmed=[forward[0]];
            for(const p of forward.slice(1)){const prev=trimmed.at(-1),gap=distance(prev,p);if(gap>budget){trimmed.push({x:prev.x+(p.x-prev.x)*budget/gap,y:prev.y+(p.y-prev.y)*budget/gap});break;}trimmed.push({...p});budget-=gap;}
            const start=trimmed.pop(),targets=trimmed.reverse();let from=start,path=[],valid=true;
            for(const target of targets){const leg=findPath(world,from,target);if(!leg.length&&distance(from,target)>2){valid=false;break;}path.push(...leg);from=target;}
            const total=length(start,path);
            if(valid&&total>=WALK_SPEED*5&&total<=WALK_SPEED*10&&walkable(world,start.x,start.y))candidates.push({start,path,seconds:total/WALK_SPEED,roadDistance:travelled});
        }
    }
    candidates.sort((a,b)=>b.roadDistance-a.roadDistance);
    if(!candidates.length)throw Error('城市入口附近没有5至10秒的已加载道路路线');
    return candidates[0];
}
// Keep road corners: do not shortcut across subsequent legs when sampling a film time.
export function samplePromoRoad(world,route,elapsed){
    let position={...route.start},budget=Math.max(0,elapsed)*WALK_SPEED,facing=0;
    for(const target of route.path){const gap=distance(position,target),spend=Math.min(gap,budget),dx=target.x-position.x,dy=target.y-position.y;
        if(spend>0){const moved=followPath(world,position,[target],spend);position=moved.position;facing=Math.abs(dx)>Math.abs(dy)?dx<0?1:2:dy<0?3:0;if(moved.blocked)throw Error('城市演示路线发生碰撞');}
        budget-=spend;if(budget<=0)break;
    }
    return {position,facing,moving:elapsed>0&&elapsed<route.seconds};
}
