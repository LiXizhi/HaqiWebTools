import test from 'node:test';
import assert from 'node:assert/strict';
import {buildingConnectionMask,buildingWallFeet} from '../js/home_building_core.js';
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
