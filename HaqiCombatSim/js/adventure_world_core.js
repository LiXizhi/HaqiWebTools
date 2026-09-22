// Compact authored maps. The original NPC coordinates remain in AdventureContent for provenance.
import { islandFor } from './adventure_world_map_core.js';
import { onLargeIsland, riverBlocks } from './adventure_island_layout_core.js';
export const WALK_SPEED = 210;
export function createWorld(zone,content) {
    if(!islandFor(zone))throw new Error('目的地不存在');
    const layout=content.worldMaps?.[zone];
    if(!layout)throw Error('缺少岛屿地图：'+zone);
    const point=([x,y])=>({x,y});
    const originals=content.npcCatalog?.npcs.filter(n=>n.zone===zone&&n.enabled!=='0'&&n.artVisible!==false&&n.hidden!==true);
    const npcs=(originals||Object.values(content.npcs).filter(n=>n.zone===zone&&n.hidden!==true)).map(n=>({...content.npcs[n.id],...n,...point(layout.npcPositions[n.id]||[n.x,n.y])}));
    if(!originals)for(const row of layout.visitingNpcs||[]){const source=content.npcs[row.sourceId];if(!source)throw Error('缺少居民来源');if(source.hidden===true||row.hidden===true)continue;npcs.push({...source,zone,...point(row.position)});}
    const encounters=content.encounters.filter(e=>e.zone===zone).map(e=>({...e,...point(layout.encounterPositions[e.id]||[e.x,e.y])}));
    const world={zone,w:layout.w,h:layout.h,layout,npcs,encounters,portal:{id:'portal',...layout.portal,zone:zone==='camp'?'town':'camp',name:'查看世界地图'},
        landmarks:layout.landmarks,buildings:layout.buildings||[],paths:layout.paths,trees:layout.trees,decorations:[],center:{...(layout.center||layout.spawn)}};
    if(originals){
        // Original 3D coordinates are retained in the catalogue. Roadside positions are a 2D adaptation.
        const candidates=[];
        for(const path of layout.paths){
            const a=[path.a.x,path.a.y],b=[path.b.x,path.b.y],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
            for(let d=0;d<length;d+=80)for(const side of [-1,1]){
                const x=a[0]+(b[0]-a[0])*d/length-(b[1]-a[1])/length*48*side;
                const y=a[1]+(b[1]-a[1])*d/length+(b[0]-a[0])/length*48*side;
                if(walkable(world,x,y))candidates.push({x,y});
            }
        }
        const placed=npcs.filter(n=>Number.isFinite(n.x)&&Number.isFinite(n.y));
        for(const n of npcs.filter(n=>!Number.isFinite(n.x)||!Number.isFinite(n.y))){
            const index=(n.id*31)%Math.max(1,candidates.length);
            const ordered=[...candidates.slice(index),...candidates.slice(0,index)];
            const spot=ordered.find(p=>placed.every(other=>distance(p,other)>68));
            if(!spot)throw Error('居民道路位置不足：'+zone);
            Object.assign(n,spot);placed.push(n);
        }
    }
    objectIndices.delete(world);
    return world;
}
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function onIsland(x,y,padding=0) { return ((x-900)/(805-padding))**2+((y-800)/(715-padding))**2<1; }
function segmentDistance(p,a,b) {
    const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
    return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
export function walkable(world,x,y) {
    if(!Number.isFinite(x)||!Number.isFinite(y))return false;
    if(world.layout?!onLargeIsland(world,x,y,26)||riverBlocks(world,x,y):!onIsland(x,y,26))return false;
    return !nearbyWorldObjects(world,{x:x-160,y:y-160,w:320,h:320}).some(o=>
        o.kind==='building'?x>o.x-o.w*.3-10&&x<o.x+o.w*.3+10&&y>o.y-o.h*.42-10&&y<o.y+12:
        o.kind==='tree'&&Math.hypot(x-o.x,y-o.y)<20);
}
export function movePosition(world,position,dx,dy) {
    // Sweep small steps to prevent tunneling through trees during a delayed frame.
    const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/8));let {x,y}=position;
    for(let i=0;i<steps;i++) {if(walkable(world,x+dx/steps,y))x+=dx/steps;if(walkable(world,x,y+dy/steps))y+=dy/steps;}
    return {x,y};
}
function clearSegment(world,a,b) {
    const length=distance(a,b),steps=Math.max(1,Math.ceil(length/2));
    for(let i=0;i<=steps;i++){const t=i/steps;if(!walkable(world,a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t))return false;}
    return true;
}
export function followPath(world,position,path,budget) {
    const remaining=[...path];let p={...position};
    while(remaining.length&&budget>0){
        const target=remaining[0],length=distance(p,target);
        if(length<.01){remaining.shift();continue;}
        const step=Math.min(budget,length),next=movePosition(world,p,(target.x-p.x)*step/length,(target.y-p.y)*step/length);
        if(distance(p,next)<.001)return {position:p,path:[],blocked:true};
        p=next;budget-=step;if(distance(p,target)<.01)remaining.shift();
    }
    return {position:p,path:remaining,blocked:false};
}
export function findPath(world,start,destination) {
    // Start from the actual position, without a detour to the current grid center.
    if(clearSegment(world,start,destination))return [{x:destination.x,y:destination.y}];
    if(world.layout){const road=roadPath(world,start,destination);if(road.length)return road;}
    const size=24,cols=Math.ceil(world.w/size),rows=Math.ceil(world.h/size);
    const cell=p=>({x:Math.floor(p.x/size),y:Math.floor(p.y/size)}),point=p=>({x:p.x*size+size/2,y:p.y*size+size/2});
    let from=cell(start);const target=cell(destination),key=p=>p.y*cols+p.x;
    const starts=[];
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const p={x:from.x+dx,y:from.y+dy};if(clearSegment(world,start,point(p)))starts.push(p);}
    starts.sort((a,b)=>distance(start,point(a))-distance(start,point(b)));
    from=starts[0];if(!from)return [];
    // A blocked click resolves to the closest reachable neighboring tile.
    let goal=target;
    if(!walkable(world,point(goal).x,point(goal).y)) {
        const options=[];
        for(let y=-4;y<=4;y++)for(let x=-4;x<=4;x++) {
            const p={x:target.x+x,y:target.y+y},wp=point(p);
            if(walkable(world,wp.x,wp.y))options.push(p);
        }
        options.sort((a,b)=>distance(point(a),destination)-distance(point(b),destination));goal=options[0];
    }
    if(!goal)return [];
    const open=[from],cost=new Map([[key(from),0]]),parent=new Map(),closed=new Set();
    const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    while(open.length) {
        open.sort((a,b)=>(cost.get(key(a))+distance(a,goal))-(cost.get(key(b))+distance(b,goal)));
        const p=open.shift(),k=key(p);if(closed.has(k))continue;closed.add(k);
        if(k===key(goal)) {
            const out=[];let n=p;
            while(key(n)!==key(from)) {out.push(point(n));n=parent.get(key(n));if(!n)return [];}
            out.push(point(from));out.reverse();
            // Skip only grid waypoints reachable directly from the real starting position.
            while(out.length>1&&clearSegment(world,start,out[1]))out.shift();
            return out;
        }
        for(const [dx,dy] of dirs) {
            const n={x:p.x+dx,y:p.y+dy},v=point(n),nk=key(n);
            if(n.x<0||n.y<0||n.x>=cols||n.y>=rows||closed.has(nk)||!walkable(world,v.x,v.y)||!clearSegment(world,point(p),v))continue;
            if(dx&&dy&&(!walkable(world,point({x:p.x+dx,y:p.y}).x,point({x:p.x+dx,y:p.y}).y)||!walkable(world,point({x:p.x,y:p.y+dy}).x,point({x:p.x,y:p.y+dy}).y)))continue;
            const score=cost.get(k)+Math.hypot(dx,dy);
            if(score<(cost.get(nk)??Infinity)) {cost.set(nk,score);parent.set(nk,p);open.push(n);}
        }
    }
    return [];
}
export function nearestInteraction(world,p) {
    return [...world.npcs.map(n=>({...n,kind:'npc'})),...world.encounters.map(e=>({...e,kind:'encounter'})),...(world.landmarks||[]).map(e=>({...e,kind:'landmark'})),{...world.portal,kind:'portal'}]
        .filter(e=>distance(e,p)<90).sort((a,b)=>distance(a,p)-distance(b,p))[0]||null;
}

const roadGraphs=new WeakMap();
function roadPath(world,start,destination){
    if(!walkable(world,destination.x,destination.y))return [];
    let graph=roadGraphs.get(world);
    if(!graph){
        const nodes=[],links=[],ids=new Map(),add=p=>{const key=`${p.x},${p.y}`;if(!ids.has(key)){ids.set(key,nodes.length);nodes.push(p);links.push([]);}return ids.get(key);};
        for(const r of world.paths){const a=add(r.a),b=add(r.b);if(clearSegment(world,r.a,r.b)){const d=distance(r.a,r.b);links[a].push([b,d]);links[b].push([a,d]);}}
        // Spurs may join a road at its midpoint rather than at an existing end.
        for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
            const d=distance(nodes[i],nodes[j]);if(d<420&&clearSegment(world,nodes[i],nodes[j])){links[i].push([j,d]);links[j].push([i,d]);}
        }
        graph={nodes,links};roadGraphs.set(world,graph);
    }
    const {nodes,links}=graph,near=p=>nodes.map((n,i)=>({i,d:distance(n,p)})).sort((a,b)=>a.d-b.d).slice(0,10).filter(n=>clearSegment(world,p,nodes[n.i]));
    const starts=near(start),goals=new Map(near(destination).map(n=>[n.i,n.d]));
    const costs=new Map(starts.map(n=>[n.i,n.d])),parents=new Map(),open=starts.map(n=>n.i),closed=new Set();
    let goal=null,best=Infinity;
    while(open.length){
        open.sort((a,b)=>costs.get(a)-costs.get(b));const i=open.shift();if(closed.has(i))continue;closed.add(i);
        const cost=costs.get(i);if(cost>=best)continue;
        if(goals.has(i)&&cost+goals.get(i)<best){goal=i;best=cost+goals.get(i);}
        for(const [j,d] of links[i])if(cost+d<(costs.get(j)??Infinity)){costs.set(j,cost+d);parents.set(j,i);open.push(j);}
    }
    if(goal===null)return [];
    const result=[{...destination}];let i=goal;
    while(i!==undefined){result.unshift(nodes[i]);i=parents.get(i);}
    return result;
}

// Immutable world objects are indexed once; collision and drawing query local buckets.
const objectIndices=new WeakMap();
export function nearbyWorldObjects(world,rect) {
    let buckets=objectIndices.get(world);const cell=256;
    if(!buckets){
        buckets=new Map();
        for(const [group,kind] of [['trees','tree'],['buildings','building'],['npcs','npc'],['encounters','mob'],['landmarks','landmark']]){
            for(const row of world[group]||[]){const o={...row,kind},key=`${Math.floor(o.x/cell)},${Math.floor(o.y/cell)}`;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(o);}
        }
        objectIndices.set(world,buckets);
    }
    const out=[];
    for(let y=Math.floor(rect.y/cell);y<=Math.floor((rect.y+rect.h)/cell);y++)for(let x=Math.floor(rect.x/cell);x<=Math.floor((rect.x+rect.w)/cell);x++){
        for(const o of buckets.get(`${x},${y}`)||[])if(o.x>=rect.x&&o.x<=rect.x+rect.w&&o.y>=rect.y&&o.y<=rect.y+rect.h)out.push(o);
    }
    return out;
}
