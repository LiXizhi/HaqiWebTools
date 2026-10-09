import {distance,findPath,followPath,WALK_SPEED,walkable,clearSegment} from './adventure_world_core.js';

const length=(start,path)=>path.reduce((sum,p,i)=>sum+distance(p,path[i-1]||start),0);
// Connect two real destinations through the loaded road graph, including endpoint spurs.
export function planPromoRoadLeg(world,start,end){
    const nodes=[],edges=[],ids=new Map();
    const node=p=>{const key=`${p.x.toFixed(2)},${p.y.toFixed(2)}`;if(!ids.has(key)){ids.set(key,nodes.length);nodes.push({x:p.x,y:p.y});edges.push([]);}return ids.get(key);};
    const link=(a,b)=>{const cost=distance(nodes[a],nodes[b]);edges[a].push({id:b,cost});edges[b].push({id:a,cost});};
    const roads=(world.paths||[]).map(r=>({...r,ia:node(r.a),ib:node(r.b)}));
    for(const r of roads)link(r.ia,r.ib);
    // Surface road meshes include T junctions and crossings between segment endpoints.
    for(let i=0;i<roads.length;i++)for(let j=i+1;j<roads.length;j++){
        const a=roads[i],b=roads[j],dx=a.b.x-a.a.x,dy=a.b.y-a.a.y,ex=b.b.x-b.a.x,ey=b.b.y-b.a.y,den=dx*ey-dy*ex;
        if(Math.abs(den)<.001)continue;
        const ox=b.a.x-a.a.x,oy=b.a.y-a.a.y,t=(ox*ey-oy*ex)/den,u=(ox*dy-oy*dx)/den;
        if(t>=0&&t<=1&&u>=0&&u<=1){const at=node({x:a.a.x+t*dx,y:a.a.y+t*dy});for(const end of [a.ia,a.ib,b.ia,b.ib])link(at,end);}
    }
    // Short, walkable gaps between road ends are allowed, but cost more than staying on roads.
    for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++)if(distance(nodes[i],nodes[j])<360&&(clearSegment(world,nodes[i],nodes[j])||findPath(world,nodes[i],nodes[j]).length>0)){
        const cost=distance(nodes[i],nodes[j])*4;edges[i].push({id:j,cost});edges[j].push({id:i,cost});
    }
    const attach=p=>{const id=node(p);const nearest=roads.map(r=>{const dx=r.b.x-r.a.x,dy=r.b.y-r.a.y,t=Math.max(0,Math.min(1,((p.x-r.a.x)*dx+(p.y-r.a.y)*dy)/(dx*dx+dy*dy||1)));const q={x:r.a.x+t*dx,y:r.a.y+t*dy};return {r,q,gap:distance(p,q)};}).sort((a,b)=>a.gap-b.gap)[0];if(!nearest)throw Error('沿途道路未加载');const join=node(nearest.q);link(id,join);link(join,nearest.r.ia);link(join,nearest.r.ib);return id;};
    const from=attach(start),to=attach(end),costs=new Map([[from,0]]),previous=new Map(),todo=new Set([from]),done=new Set();
    while(todo.size){const id=[...todo].sort((a,b)=>costs.get(a)-costs.get(b))[0];todo.delete(id);if(id===to)break;done.add(id);for(const edge of edges[id]){const cost=costs.get(id)+edge.cost;if(!done.has(edge.id)&&cost<(costs.get(edge.id)??Infinity)){costs.set(edge.id,cost);previous.set(edge.id,id);todo.add(edge.id);}}}
    if(!costs.has(to))throw Error('城市之间的已加载道路尚未连通');
    const targets=[];for(let id=to;id!==from;id=previous.get(id))targets.unshift(nodes[id]);
    let p=start;const path=[];for(const target of targets){if(distance(p,target)<.01)continue;const leg=findPath(world,p,target);if(!leg.length)throw Error('城市道路存在不可通行路段');path.push(...leg);p=target;}
    return {start:{...start},path,seconds:length(start,path)/WALK_SPEED};
}
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
    for(const target of route.path){
        // followPath treats motion below .001 world units as blocked. Timeline
        // subtraction at a cue boundary can leave a positive floating-point
        // residue; hold this sample until there is meaningful travel instead.
        if(budget<.001)break;
        const gap=distance(position,target),spend=Math.min(gap,budget),dx=target.x-position.x,dy=target.y-position.y;
        if(spend>0){const moved=followPath(world,position,[target],spend);position=moved.position;facing=Math.abs(dx)>Math.abs(dy)?dx<0?1:2:dy<0?3:0;if(moved.blocked)throw Error('城市演示路线发生碰撞');}
        budget-=spend;if(budget<=0)break;
    }
    return {position,facing,moving:elapsed>0&&elapsed<route.seconds};
}
