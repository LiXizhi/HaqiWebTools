import test from 'node:test';
import assert from 'node:assert/strict';
import {buildingFloorAO} from '../js/home_building_ao_core.js';
const catalog=['floor','wall','window','door'].map(type=>({id:type,size:[1,1],building:{type}}));
const floor={id:'f',itemId:'floor',x:32,y:0},wall={id:'w',itemId:'wall',x:31.9,y:0,rotation:1};
test('AO crosses chunk boundaries and follows visual geometry independently of obstruction',()=>{
 const lookup=buildingFloorAO([floor,{...wall,properties:{enabled:false,width:8,offsetX:7}}],catalog);
 assert.equal(lookup.get('f').length,1);assert.equal(lookup.get('f')[0].w,.18);
 assert.equal(buildingFloorAO([floor,{...wall,x:30}],catalog).get('f').length,0);
 assert.equal(buildingFloorAO([floor,wall],catalog,'w').get('f').length,0);
});
test('opening doors removes contact shadows; rotation and scaling retain nearby contacts',()=>{
 const door={...wall,itemId:'door'};
 assert.equal(buildingFloorAO([floor,door],catalog).get('f').length,1);
 assert.equal(buildingFloorAO([floor,{...door,doorOpen:true}],catalog).get('f').length,0);
 const rotated={...wall,x:31,y:0,rotation:0,sizeScale:2};
 assert.equal(buildingFloorAO([floor,rotated],catalog).get('f')[0].w,2);
 assert.equal(buildingFloorAO([floor,{...wall,properties:{surface:'roof'}}],catalog).get('f').length,0);
});
test('adjacent floors share the same wall geometry without duplicate spatial bucket entries',()=>{
 const floors=Array.from({length:4},(_,i)=>({...floor,id:'f'+i,x:32+i}));
 const lookup=buildingFloorAO([...floors,{...wall,x:32,rotation:0,sizeScale:4}],catalog);
 for(const f of floors)assert.equal(lookup.get(f.id).length,1);
 assert.deepEqual(lookup.get('f0'),lookup.get('f3'));
});
