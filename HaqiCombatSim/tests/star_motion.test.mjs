import test from 'node:test';
import assert from 'node:assert/strict';
import {createStarFollower} from '../js/adventure_star_motion_core.js';
test('stationary star orbits on both depth layers without drifting away',()=>{
 const f=createStarFollower(),sides=new Set();for(let i=0;i<1200;i++){const s=f.step({x:100,y:100},i*16);sides.add(s.front);assert.ok(Math.hypot(s.x-100,s.y-100)<70);}
 assert.equal(sides.size,2);
});
test('owner movement leaves a brief lag and the star catches up after stopping',()=>{
 const f=createStarFollower();f.step({x:0,y:0},0);const a=f.step({x:80,y:0},16);assert.ok(a.x<90);
 for(let i=2;i<180;i++)f.step({x:80,y:0},i*16);
 assert.ok(Math.hypot(f.state.x-80,f.state.y)<65);
});
test('teleports, scene changes and hiding reset follow history',()=>{
 const f=createStarFollower();f.step({x:0,y:0},0);f.step({x:1000,y:1000},16);assert.equal(f.state.x,1034);
 f.step({x:100,y:100},32,{scope:'next'});assert.equal(f.state.x,134);
 f.step({x:0,y:0},48,{enabled:false});assert.equal(f.state.visible,false);
});
test('reduced motion uses a steady owner-relative position and results are deterministic',()=>{
 const f=createStarFollower();const a={...f.step({x:0,y:0},0,{reducedMotion:true})};f.step({x:20,y:30},16,{reducedMotion:true});assert.equal(f.state.x-a.x,20);assert.equal(f.state.y-a.y,30);assert.equal(f.state.roll,0);
 const run=()=>{const s=createStarFollower();for(let i=0;i<300;i++)s.step({x:i,y:0},i*16);return s.state;};assert.deepEqual(run(),run());
});
