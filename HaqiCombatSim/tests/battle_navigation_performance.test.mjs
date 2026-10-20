import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {findPath,findPathSteps,clearSegment,invalidateWorldObjects} from '../js/adventure_world_core.js';
import {onLargeIsland,riverBlocks,insidePolygon,segmentDistance} from '../js/adventure_island_layout_core.js';
import {onBridge} from '../js/adventure_bridge_core.js';

const world=()=>({w:1000,h:1000,layout:{coast:[[0,0],[1000,0],[1000,1000],[0,1000]],rivers:[],bridges:[],lakes:[]},paths:[],trees:[],buildings:[],npcs:[],encounters:[]});
function verify(w,start,target){
 const path=findPath(w,start,target);assert.ok(path.length);
 let from=start;for(const to of path){assert.ok(clearSegment(w,from,to));from=to;}
 assert.ok(Math.hypot(from.x-target.x,from.y-target.y)<.5);
 const steps=findPathSteps(w,start,target);let result;do{result=steps.next();}while(!result.done);
 assert.deepEqual(result.value,path,'sliced and synchronous searches agree');
 return path;
}
test('nearby detours bypass the road graph and pick up changed obstacles',()=>{
 const w=world(),start={x:400,y:400},target={x:520,y:400};
 w.trees=[{x:460,y:400}];
 Object.defineProperty(w,'paths',{get(){throw Error('local route must not scan roads');}});
 const path=verify(w,start,target);assert.ok(path.length>1);
 w.trees=[];invalidateWorldObjects(w);
 assert.deepEqual(verify(w,start,target),[target]);
});
test('a local search that cannot detour falls back to roads around a long barrier',()=>{
 const w=world(),start={x:400,y:400},target={x:600,y:400};
 w.trees=Array.from({length:29},(_,i)=>({x:500,y:100+i*25}));
 w.paths=[{a:{x:400,y:850},b:{x:600,y:850},width:60}];
 const path=verify(w,start,target);
 assert.ok(path.some(p=>p.y>=820||p.y<=80),'goes around the barrier');
});
test('Earth grid detours retain loaded terrain and boating rules across searches',()=>{
 const w={isEarth:true,w:1000,h:1000,paths:[],buildings:[],earthRules:{navigationRadius:500,maxPathNodes:4000},
  terrainAt:(x,y)=>x<0||x>1000||y<0||y>1000?null:x>440&&x<480&&y>200&&y<600?'water':'land'};
 const start={x:400,y:400},target={x:520,y:400};
 assert.ok(verify(w,start,target).length>1);
 w.earthBoating=true;assert.deepEqual(verify(w,start,target),[target]);
});
test('coast and river broad-phase rejection preserves the original six-island geometry',()=>{
 for(const zone of ['camp','town','fire','ice','desert','dark']){
  const layout=JSON.parse(fs.readFileSync(new URL(`../data/adventure/maps/${zone}.json`,import.meta.url))),w={layout};
  const points=[];
  for(let x=0;x<=layout.w;x+=97)for(let y=0;y<=layout.h;y+=113)points.push([x,y]);
  for(const p of layout.coast)for(const d of [-26,0,26])points.push([p[0]+d,p[1]]);
  for(const r of layout.rivers)for(const p of r.points)for(const d of [-r.width/2-12,0,r.width/2+12])points.push([p[0]+d,p[1]]);
  for(const [x,y] of points){
   const coast=insidePolygon(x,y,layout.coast)&&layout.coast.every(([ax,ay],i)=>{
    const [bx,by]=layout.coast[(i+1)%layout.coast.length];
    return segmentDistance({x,y},{x:ax,y:ay},{x:bx,y:by})>=26;
   });
   const river=layout.lakes?.some(l=>((x-l.x)/(l.rx+12))**2+((y-l.y)/(l.ry+12))**2<1)||
    !layout.bridges.some(b=>onBridge(b,x,y,7))&&layout.rivers.some(r=>r.points.slice(1).some(([bx,by],i)=>segmentDistance({x,y},{x:r.points[i][0],y:r.points[i][1]},{x:bx,y:by})<r.width/2+12));
   assert.equal(onLargeIsland(w,x,y,26),coast,`${zone} coast ${x},${y}`);
   assert.equal(riverBlocks(w,x,y),!!river,`${zone} river ${x},${y}`);
  }
 }
});
