// CPU-only benchmark; no browser, network, player state or timing assertions.
import fs from 'node:fs';
import {findPath,clearSegment,walkable} from '../js/adventure_world_core.js';
const iterations=Math.max(1,Number(process.argv[2])||3);
const results=[];
for(const zone of ['camp','town','fire','ice','desert','dark']){
 const layout=JSON.parse(fs.readFileSync(new URL(`../data/adventure/maps/${zone}.json`,import.meta.url)));
 const makeWorld=()=>({zone,layout,w:layout.w,h:layout.h,paths:layout.paths,trees:layout.trees,buildings:layout.buildings||[],npcs:[],encounters:[]});
 const world=makeWorld();
 // A short blocked trip near a real tree, plus the authored spawn-to-portal trip.
 let short=null;
 for(const tree of world.trees){
  const start={x:tree.x-60,y:tree.y},target={x:tree.x+60,y:tree.y};
  if(walkable(world,start.x,start.y)&&walkable(world,target.x,target.y)&&!clearSegment(world,start,target)){short={start,target};break;}
 }
 for(const [kind,trip] of [['tree',short],['portal',{start:layout.spawn,target:layout.portal}]]){
  if(!trip)continue;
  const times=[];let points=0;
  for(let i=0;i<iterations;i++){
   const scene=makeWorld(),begin=performance.now(),path=findPath(scene,trip.start,trip.target);
   times.push(performance.now()-begin);points=path.length;
   if(!points)throw Error(`${zone}/${kind}: no path`);
   let from=trip.start;
   for(const to of path){if(!clearSegment(scene,from,to))throw Error(`${zone}/${kind}: blocked segment`);from=to;}
  }
  results.push({zone,kind,points,medianMs:+times.sort((a,b)=>a-b)[Math.floor(times.length/2)].toFixed(2)});
 }
}
console.log(JSON.stringify(results,null,2));
