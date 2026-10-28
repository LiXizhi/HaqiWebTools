import test from 'node:test';
import assert from 'node:assert/strict';
import {beginHomeStand,advanceHomeStand} from '../js/home_standing_practice_core.js';
import {homeGameActionMatches} from '../js/home_language_game_core.js';
const binding={id:'chair',itemId:'chair',x:3,y:1,w:1,h:1};
test('standing requires real travel followed by a stopped frame near the destination',()=>{
 let trace=beginHomeStand({x:0,y:1,moving:false});
 for(let i=0;i<20;i++)trace=advanceHomeStand(trace,{x:0,y:1,moving:false},{x:0,y:1,moving:false},.05,binding);
 assert.equal(trace.stood,false);
 for(let i=1;i<=20;i++){
  trace=advanceHomeStand(trace,{x:(i-1)/10,y:1,moving:true},{x:i/10,y:1,moving:true},.05,binding);
  assert.equal(trace.stood,false);
 }
 trace=advanceHomeStand(trace,{x:2,y:1,moving:true},{x:2,y:1,moving:false},.05,binding);assert.ok(trace.stood);
 trace=advanceHomeStand(trace,{x:2,y:1,moving:false},{x:2.1,y:1,moving:true},.05,binding);assert.equal(trace.stood,false);
 assert.equal(homeGameActionMatches({action:{kind:'stand',objectId:'chair'}},{kind:'stand',objectId:'chair'}),false);
});
test('teleports, unknown motion states and stopping far away never prove standing at the requested place',()=>{
 let trace=beginHomeStand({x:0,y:1});
 trace=advanceHomeStand(trace,{x:0,y:1},{x:2,y:1,moving:false},.05,binding);
 assert.equal(trace.distance,0);assert.equal(trace.stood,false);
 trace={...trace,distance:2};
 assert.equal(advanceHomeStand(trace,{x:2,y:1},{x:2,y:1},.05,binding).stood,false);
 assert.equal(advanceHomeStand(trace,{x:2,y:1},{x:2,y:1,moving:false},-1,binding),null);
 const far={...beginHomeStand({x:-3,y:1}),distance:2};
 assert.equal(advanceHomeStand(far,{x:-3,y:1},{x:-3,y:1,moving:false},.05,binding).stood,false);
 const near=beginHomeStand({x:2,y:1,moving:false});
 assert.equal(advanceHomeStand(near,{x:2,y:1},{x:2,y:1,moving:false},.05,binding).stood,false);
});
