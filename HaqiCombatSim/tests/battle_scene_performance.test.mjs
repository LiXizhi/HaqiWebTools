import test from 'node:test';
import assert from 'node:assert/strict';
import {createFrameMeter} from '../js/frame_meter_core.js';
import {createWorldViewQuery,nearbyWorldObjects,invalidateWorldObjects} from '../js/adventure_world_core.js';
import {mergeSceneObjects} from '../js/scene_order_core.js';

test('frame meter counts rendered cadence, includes hitches and resets pauses',()=>{
    const meter=createFrameMeter();for(let i=0;i<=60;i++)meter.sample(i*1000/60);
    assert.equal(meter.value.fps,60);assert.equal(meter.value.ms,16.7);
    meter.sample(1100,false);assert.equal(meter.value,null);
    meter.sample(1200);for(let i=1;i<=15;i++)meter.sample(1200+i*1000/30);
    assert.equal(meter.value.fps,30);meter.sample(10000);assert.equal(meter.value,null);
    meter.sample(10500);assert.equal(meter.value.fps,2);
});
test('moving camera reuses scenery order but refreshes edges, stream changes and worlds',()=>{
    const world={trees:Array.from({length:200},(_,i)=>({id:i,x:i*32,y:i%5*40})),npcs:[],encounters:[]};
    const query=createWorldViewQuery(),rect={x:0,y:0,w:800,h:300},first=query.query(world,rect);
    for(let i=0;i<120;i++)assert.equal(query.query(world,{...rect,x:i}),first);
    const moved={...rect,x:300},second=query.query(world,moved);assert.notEqual(second,first);
    for(const row of nearbyWorldObjects(world,moved))assert.ok(second.some(o=>o.id===row.id));
    world.trees.push({id:'new',x:400,y:0});invalidateWorldObjects(world);
    assert.ok(query.query(world,moved).some(o=>o.id==='new'));
    assert.deepEqual(query.query({trees:[],npcs:[],encounters:[]},rect),[]);
    query.clear();assert.notEqual(query.query(world,moved),second);
});
test('static scenery and moving actors retain Y occlusion with stable ties',()=>{
    const scenery=[{id:'a',y:0},{id:'b',y:10},{id:'c',y:30,sortY:15}];
    const actors=[{id:'hero',y:12},{id:'pet',y:10},{id:'npc',y:40,sortY:-5}];
    assert.deepEqual(mergeSceneObjects(scenery,actors).map(o=>o.id),['npc','a','b','pet','hero','c']);
    assert.deepEqual(scenery.map(o=>o.id),['a','b','c']);
});
