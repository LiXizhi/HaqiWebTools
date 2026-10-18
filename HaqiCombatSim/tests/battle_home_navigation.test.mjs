import test from 'node:test';
import assert from 'node:assert/strict';
import {findHomePath,isHomePassable,stepHomeWalk} from '../js/home_walk_core.js';
import {homeRiverCenterY} from '../js/home_core.js';
const catalog=[{id:'wall',layer:'solid',size:[2,3]}];
function verify(start,target,objects=[],seed=null){
 const path=findHomePath(start,target,objects,catalog,seed);
 assert.ok(path.length,'a route exists');
 let hero={...start};
 for(const point of path){
  for(let i=0;i<2000&&Math.hypot(hero.x-point.x,hero.y-point.y)>=.08;i++){
   hero=stepHomeWalk(hero,point,.025,objects,catalog,seed);
   assert.ok(isHomePassable(hero.x,hero.y,objects,catalog,seed));
  }
  assert.ok(Math.hypot(hero.x-point.x,hero.y-point.y)<.08,'waypoint reached');
 }
 assert.ok(Math.hypot(hero.x-target.x,hero.y-target.y)<.08,'destination reached');
 return path;
}
test('home click takes the direct route across empty ground',()=>{
 assert.deepEqual(verify({x:-2,y:0},{x:4,y:0}),[{x:4,y:0}]);
});
test('home click walks around furniture and rotated furniture deterministically',()=>{
 for(const rotation of [0,1]){
  const objects=[{id:'a',itemId:'wall',x:0,y:-1,rotation}],start={x:-2,y:0},target={x:5,y:0};
  const path=verify(start,target,objects);
  assert.ok(path.length>1);assert.deepEqual(path,findHomePath(start,target,objects,catalog));
 }
});
test('home click crosses the river using a bridge',()=>{
 const seed=42,y=homeRiverCenterY(seed,5);
 const path=verify({x:5,y:y+3},{x:5,y:y-3},[],seed);
 assert.ok(path.some(p=>Math.abs(p.x)<1.2),'detours toward the bridge');
});
test('blocked clicks stop nearby and enclosed destinations do not cross walls',()=>{
 const objects=[{id:'a',itemId:'wall',x:0,y:0}];
 const path=findHomePath({x:-2,y:1},{x:0,y:1},objects,catalog);
 assert.ok(path.length);assert.ok(isHomePassable(path.at(-1).x,path.at(-1).y,objects,catalog));
 const walls=[[-2,-2],[0,-2],[-2,2],[0,2],[-2,0],[2,0]].map(([x,y],i)=>({id:String(i),itemId:'wall',x,y}));
 assert.deepEqual(findHomePath({x:-5,y:0},{x:1,y:1},walls,catalog),[]);
});
test('home route stays in loaded chunks and rejects invalid or very distant input',()=>{
 assert.deepEqual(findHomePath({x:0,y:0},{x:5,y:0},[],catalog,null,p=>p.x<2),[]);
 assert.deepEqual(findHomePath({x:0,y:0},{x:Infinity,y:0},[],catalog),[]);
 assert.deepEqual(findHomePath({x:0,y:0},{x:10000,y:0},[],catalog),[]);
});
