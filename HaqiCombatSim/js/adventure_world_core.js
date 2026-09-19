// Compact authored maps. The original NPC coordinates remain in AdventureContent for provenance.
import { islandFor } from './adventure_world_map_core.js';
import { createRng, hashSeed } from './rng_core.js';
import { TOWN_LAYOUT, onLargeIsland, riverBlocks, regionAt } from './adventure_island_layout_core.js';
export const WALK_SPEED = 210;
export function createWorld(zone,content) {
    if(!islandFor(zone))throw new Error('目的地不存在');
    if(zone==='town')return createLargeTown(content);
    const town=zone!=='camp',remote=!['camp','town'].includes(zone),w=1800,h=1600;
    const npcs=Object.values(content.npcs).filter(n=>n.zone===zone);
    const encounters=content.encounters.filter(e=>e.zone===zone);
    const portal={id:'portal',x:town?900:1000,y:town?1310:1430,zone:town?'camp':'town',name:town?'返回魔法营地':'前往哈奇岛'};
    const buildings=town?[{x:800,y:535,tile:4,w:230,h:230},{x:505,y:740,tile:5,w:190,h:200},{x:1090,y:680,tile:6,w:220,h:210},
      {x:1180,y:390,tile:4,w:160,h:175},{x:475,y:440,tile:4,w:180,h:185}]:
      [{x:1110,y:585,tile:5,w:190,h:180},{x:1130,y:850,tile:4,w:175,h:165},{x:645,y:550,tile:6,w:175,h:170}];
    if(remote)buildings.splice(1);
    const center=town?{x:800,y:810}:{x:860,y:810};
    // Winding village lanes with short spurs: geography is authored, not a minimap texture.
    const routes=town?[
      [[350,830],[800,810],[1100,830],[1390,700]],
      [[550,410],[700,470],[660,720],[800,810],[870,1100],[900,1310]],
      [[800,810],[1110,1040],[1330,1100]],
      [[700,470],[1000,420],[1220,420]]
    ]:[
      [[360,880],[610,810],[860,810],[1120,760],[1380,850]],
      [[860,810],[800,600],[800,400],[430,400]],
      [[800,400],[1180,400],[1380,560],[1380,850],[1480,1170]],
      [[610,810],[550,1040],[390,1130]],
      [[860,810],[840,1110],[1000,1370],[1000,1430]],
      [[840,1110],[1120,1190],[1480,1170]]
    ];
    const paths=[];
    for(const route of routes)for(let i=1;i<route.length;i++)paths.push({a:{x:route[i-1][0],y:route[i-1][1]},b:{x:route[i][0],y:route[i][1]},width:66});
    const roads=[...paths];
    for(const p of [...npcs,...encounters,portal]){
        const nearest=roads.map(r=>{const dx=r.b.x-r.a.x,dy=r.b.y-r.a.y,t=Math.max(0,Math.min(1,((p.x-r.a.x)*dx+(p.y-r.a.y)*dy)/(dx*dx+dy*dy)));return{x:r.a.x+t*dx,y:r.a.y+t*dy};}).sort((a,b)=>distance(a,p)-distance(b,p))[0];
        paths.push({a:nearest,b:{x:p.x,y:p.y},width:40});
    }
    const trees=[],rng=createRng(remote?hashSeed(zone):town?818:530);
    for(let i=0;i<430;i++) {
        const p={x:rng.int(110,1690),y:rng.int(150,1490)};
        if(!onIsland(p.x,p.y,24))continue;
        if([...npcs,...encounters,portal].some(n=>distance(p,n)<95))continue;
        if(buildings.some(b=>Math.abs(p.x-b.x)<b.w*.7&&Math.abs(p.y-b.y)<b.h*.8))continue;
        if(paths.some(path=>segmentDistance(p,path.a,path.b)<path.width*.6+26))continue;
        if(trees.some(t=>distance(t,p)<45))continue;
        trees.push({...p,tile:town?rng.pick([0,0,2,1]):rng.pick([0,0,1,3]),size:rng.int(110,170)});
        if(trees.length>=120)break;
    }
    const decorations=Array.from({length:600},()=>({x:rng.int(80,1720),y:rng.int(100,1500),kind:rng.int(0,4),size:rng.int(2,6)}));
    return {zone,w,h,npcs,encounters,portal,buildings,paths,trees,decorations,center};
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

function createLargeTown(content) {
    const layout=TOWN_LAYOUT,rng=createRng(610920),point=([x,y])=>({x,y});
    const npcs=Object.values(content.npcs).filter(n=>n.zone==='town').map(n=>({...n,...point(layout.npcPositions[n.id]||[3500,3000])}));
    const encounters=content.encounters.filter(e=>e.zone==='town').map(e=>({...e,...point(layout.encounterPositions[e.id]||[2230,3520])}));
    const portal={id:'portal',x:3500,y:3540,zone:'camp',name:'返回魔法营地'};
    const landmarks=layout.regions.map(r=>({id:r.id,name:r.name,x:r.x+100,y:r.y+60,description:r.description}));
    const paths=[];
    for(const route of layout.routes)for(let i=1;i<route.length;i++)paths.push({a:point(route[i-1]),b:point(route[i]),width:82});
    const buildings=[{x:3500,y:2710,tile:4,w:240,h:250},{x:3050,y:3000,tile:5,w:210,h:220},{x:3880,y:2770,tile:6,w:240,h:240},
        {x:3760,y:3150,tile:4,w:190,h:200},{x:3330,y:3260,tile:4,w:190,h:190},{x:1540,y:2780,tile:5,w:170,h:175},
        {x:4650,y:2790,tile:6,w:200,h:210},{x:2110,y:1190,tile:5,w:160,h:175}];
    const world={zone:'town',w:layout.w,h:layout.h,layout,npcs,encounters,portal,landmarks,buildings,paths,trees:[],decorations:[],center:{...layout.spawn}};
    // Short side trails lead to authored content; principal roads remain safe and empty.
    const mainRoads=[...paths];
    for(const p of [...npcs,...encounters,...landmarks,portal]){
        let nearest=null,best=Infinity;
        for(const road of mainRoads){
            const dx=road.b.x-road.a.x,dy=road.b.y-road.a.y,t=Math.max(0,Math.min(1,((p.x-road.a.x)*dx+(p.y-road.a.y)*dy)/(dx*dx+dy*dy||1)));
            const q={x:road.a.x+t*dx,y:road.a.y+t*dy},d=distance(q,p);if(d<best){best=d;nearest=q;}
        }
        paths.push({a:nearest,b:{x:p.x,y:p.y},width:46});
    }
    const clearings=[...npcs,...encounters,...landmarks,portal,world.center];
    for(let i=0;i<6500&&world.trees.length<850;i++){
        const p={x:rng.int(550,5050),y:rng.int(700,3900)};
        if(!onLargeIsland(world,p.x,p.y,75)||riverBlocks(world,p.x,p.y))continue;
        const region=regionAt(world,p);
        if(['town','farm','beach','gold'].includes(region.id)&&rng.float()<.78)continue;
        if(clearings.some(n=>distance(p,n)<145)||buildings.some(b=>Math.abs(p.x-b.x)<b.w&&Math.abs(p.y-b.y)<b.h))continue;
        if(paths.some(r=>segmentDistance(p,r.a,r.b)<r.width/2+48)||world.trees.some(t=>distance(t,p)<65))continue;
        world.trees.push({...p,tile:region.id==='snow'?1:region.id==='beach'?3:region.id==='park'?2:rng.pick(region.id==='forest'?[0,0,1]:[0,0,1,2]),size:rng.int(115,180)});
    }
    return world;
}
