import test from 'node:test';
import assert from 'node:assert/strict';
import {buildingConnectionMask,buildingWallFeet,homeDoorIsOpen} from '../js/home_building_core.js';
import {buildingFloorAO} from '../js/home_building_ao_core.js';
import {drawBuilding} from '../js/view_home_building.js';
const catalog=['floor','wall','window','door'].map(type=>({id:type,size:[1,1],building:{type,style:'stone'}}));
const floors=Array.from({length:9},(_,i)=>({id:`f${i}`,itemId:'floor',x:i%3,y:Math.floor(i/3)}));
const feet=(o,objects=floors)=>buildingWallFeet(o,buildingConnectionMask(o,[...objects,o],catalog));
test('both side walls are thin and flush with the floor perimeter regardless of stored rotation',()=>{
 for(const itemId of ['wall','window','door'])for(const rotation of [0,1]){
  assert.deepEqual(feet({id:'w',itemId,x:0,y:1,rotation}),[{x:0,y:1,w:.18,h:1,vertical:true}]);
  assert.deepEqual(feet({id:'w',itemId,x:2,y:1,rotation}),[{x:2.82,y:1,w:.18,h:1,vertical:true}]);
 }
});
test('corners follow exposed floor edges and adjacent external walls touch the floor',()=>{
 const corner=feet({id:'w',itemId:'wall',x:0,y:0});
 assert.deepEqual(corner,[{x:0,y:0,w:1,h:.18,vertical:false},{x:0,y:0,w:.18,h:1,vertical:true}]);
 const left=feet({id:'w',itemId:'wall',x:-1,y:1})[0],right=feet({id:'w',itemId:'wall',x:3,y:1})[0];
 assert.ok(Math.abs(left.x+left.w)<1e-9);
 assert.equal(right.x,3);
});
test('contact shadows use the same snapped feet as the painter',()=>{
 const wall={id:'w',itemId:'wall',x:2,y:1,rotation:0};
 const shadows=buildingFloorAO([...floors,wall],catalog).get('f5');
 assert.deepEqual(shadows,feet(wall));
});
test('side wall top spans the full cell and no facade is drawn wider than the thin wall',()=>{
 const wall={id:'w',itemId:'wall',x:2,y:1},calls=[];
 const c={save(){},restore(){},fillRect(...rect){calls.push({color:this.fillStyle,rect});}};
 drawBuilding(c,catalog[1],wall,null,buildingConnectionMask(wall,[...floors,wall],catalog));
 const top=calls.find(r=>r.color==='#a3aab3');
 assert.ok(Math.abs(top.rect[0]-112.8)<1e-9);
 assert.equal(top.rect[3],40);
 assert.ok(calls.filter(r=>r.color==='#858c95').every(r=>r.rect[2]<=7.2));
});
test('an open right-side door swings inward and remains inside the cached cell bounds',()=>{
 const wall={id:'w',itemId:'door',x:2,y:1,doorOpen:true},rects=[];
 const c={save(){},restore(){},fillRect(...rect){rects.push(rect);}};
 drawBuilding(c,catalog[3],wall,null,buildingConnectionMask(wall,[...floors,wall],catalog));
 assert.ok(rects.every(([x,,w])=>x>=76&&x+w<=124));
});


test('walking and cached depth follow the visible front and side wall bases',async()=>{
 const {isHomePassable,stepHomeWalk}=await import('../js/home_walk_core.js');
 const {createHomeBuildingCache}=await import('../js/home_building_cache.js');
 const items=catalog.map(i=>({...i,layer:i.id==='floor'?'ground':'solid'}));
 for(const [x,y] of [[1,2],[2,1],[0,0]]){
  const wall={id:'w',itemId:'wall',x,y},objects=[...floors,wall];
  for(const b of feet(wall))assert.equal(isHomePassable(b.x+b.w/2,b.y+b.h/2,objects,items),false);
  const cache=createHomeBuildingCache({enabled:false});
  const groups=cache.prepare(objects,items,{x:-100,y:-100,w:400,h:400},1);
  assert.equal(groups.find(g=>g.rows.some(r=>r.o.id==='w')).depth,Math.max(...feet(wall).map(b=>b.y+b.h)));
  cache.dispose();
 }
 const wall={id:'w',itemId:'wall',x:1,y:2},objects=[...floors,wall];
 let hero={x:1.5,y:3.5};
 for(let i=0;i<30;i++)hero=stepHomeWalk(hero,{x:1.5,y:1},.05,objects,items);
 assert.ok(hero.y>=3.12,'feet stop outside the visible front wall');
 assert.equal(isHomePassable(1.5,2.4,objects,items),true,'old invisible obstruction is gone');
});

test('doors auto-open during passage in both directions and restore saved state without writes',async()=>{
 const {findHomePath,stepHomeWalk}=await import('../js/home_walk_core.js');
 const items=catalog.map(i=>({...i,layer:i.id==='floor'?'ground':'solid'}));
 for(const [x,y,from,to] of [[1,2,{x:1.5,y:3.7},{x:1.5,y:1.8}],[2,1,{x:3.7,y:1.5},{x:1.8,y:1.5}]])for(const doorOpen of [false,true]){
  const door=Object.freeze({id:'d',itemId:'door',x,y,doorOpen}),objects=[...floors,door];
  const before=JSON.stringify(objects),mask=buildingConnectionMask(door,objects,items);
  for(const [start,target] of [[from,to],[to,from]]){
   assert.deepEqual(findHomePath(start,target,objects,items),[target]);
   let hero={...start},opened=false;
   for(let i=0;i<100&&Math.hypot(hero.x-target.x,hero.y-target.y)>.08;i++){
    hero=stepHomeWalk(hero,target,.025,objects,items);
    opened ||= homeDoorIsOpen(door,[hero],mask);
   }
   assert.ok(opened);assert.ok(Math.hypot(hero.x-target.x,hero.y-target.y)<.08);
  }
  assert.equal(homeDoorIsOpen(door,[{x:20,y:20}],mask),doorOpen);
  assert.equal(homeDoorIsOpen(door,[null,{x:x+.5,y:y+.5}],mask),true);
  assert.equal(JSON.stringify(objects),before);
 }
});
