import test from 'node:test';
import assert from 'node:assert/strict';
import {beginHomeJump,advanceHomeJump,HOME_JUMP_DURATION} from '../js/home_jumping_practice_core.js';
import {homeGameActionMatches} from '../js/home_language_game_core.js';
const binding={id:'chair',itemId:'chair',x:3,y:1,w:1,h:1},hero={x:2,y:1,moving:false};
test('jump requires a nearby stationary start and an actual takeoff and landing sequence',()=>{
 assert.equal(beginHomeJump({x:0,y:0},binding),null);
 assert.equal(beginHomeJump({...hero,moving:true},binding),null);
 let trace=beginHomeJump(hero,binding);assert.equal(trace.height,0);assert.equal(trace.landed,false);
 trace=advanceHomeJump(trace,hero,10,binding);assert.equal(trace.elapsed,.05);assert.equal(trace.landed,false);
 for(let i=0;i<5;i++)trace=advanceHomeJump(trace,hero,.05,binding);
 assert.ok(trace.height>.8);assert.equal(trace.landed,false);
 for(let i=0;i<8;i++)trace=advanceHomeJump(trace,hero,.05,binding);
 assert.equal(trace.elapsed,HOME_JUMP_DURATION);assert.equal(trace.height,0);assert.equal(trace.landed,true);
 assert.equal(advanceHomeJump(trace,hero,.05,binding),trace);
 assert.equal(homeGameActionMatches({action:{kind:'jump',objectId:'chair'}},{kind:'jump',objectId:'chair'}),false);
});
test('movement, teleport, changed vicinity and invalid frame times invalidate a jump',()=>{
 const trace=beginHomeJump(hero,binding);
 for(const changed of [{...hero,x:2.1},{...hero,moving:true},{x:NaN,y:1}])assert.equal(advanceHomeJump(trace,changed,.05,binding),null);
 assert.equal(advanceHomeJump(trace,hero,.05,{...binding,x:10}),null);
 for(const dt of [-1,NaN,Infinity])assert.equal(advanceHomeJump(trace,hero,dt,binding),null);
 assert.equal(advanceHomeJump(trace,hero,0,binding).elapsed,0);
});
