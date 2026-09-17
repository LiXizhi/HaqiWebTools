// Compact authored maps. The original NPC coordinates remain in AdventureContent for provenance.
import { createRng } from './rng_core.js';
export const WALK_SPEED = 210;
export function createWorld(zone,content) {
    const town=zone==='town',w=1800,h=1600;
    const npcs=Object.values(content.npcs).filter(n=>n.zone===zone);
    const encounters=content.encounters.filter(e=>e.zone===zone);
    const portal={id:'portal',x:town?900:1000,y:town?1310:1430,zone:town?'camp':'town',name:town?'返回魔法营地':'前往哈奇小镇'};
    const buildings=town?[{x:800,y:535,tile:4,w:230,h:230},{x:505,y:740,tile:5,w:190,h:200},{x:1090,y:680,tile:6,w:220,h:210},
      {x:1180,y:390,tile:4,w:160,h:175},{x:475,y:440,tile:4,w:180,h:185}]:
      [{x:1110,y:585,tile:5,w:190,h:180},{x:1130,y:850,tile:4,w:175,h:165},{x:645,y:550,tile:6,w:175,h:170}];
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
    const trees=[],rng=createRng(town?818:530);
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
    if(!onIsland(x,y,26))return false;
    if(world.buildings.some(b=>x>b.x-b.w*.3-10&&x<b.x+b.w*.3+10&&y>b.y-b.h*.42-10&&y<b.y+12))return false;
    return !world.trees.some(t=>Math.hypot(x-t.x,y-t.y)<20);
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
    return [...world.npcs.map(n=>({...n,kind:'npc'})),...world.encounters.map(e=>({...e,kind:'encounter'})),{...world.portal,kind:'portal'}]
        .filter(e=>distance(e,p)<90).sort((a,b)=>distance(a,p)-distance(b,p))[0]||null;
}
