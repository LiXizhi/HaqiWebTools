import test from 'node:test';
import assert from 'node:assert/strict';
import {stepHomeWalk,HOME_WALK_SPEED,HOME_RUN_SPEED} from '../js/home_walk_core.js';
import {beginHomeWalk} from '../js/home_walking_practice_core.js';
import {advanceHomeRun} from '../js/home_running_practice_core.js';
import {homeGameActionMatches} from '../js/home_language_game_core.js';
import {homeDuoStep} from '../js/home_local_core.js';
const binding={id:'chair',itemId:'chair',x:3,y:1,w:1,h:1};
test('run requires continuous running displacement; ordinary walking, idle, clicks and teleports do not count',()=>{
 let hero={x:0,y:1},trace=beginHomeWalk(hero);
 assert.equal(advanceHomeRun(trace,hero,{...hero,gait:'run'},.05,binding).arrived,false);
 const walked=stepHomeWalk(hero,{x:2,y:1},.05,[],[]);
 assert.equal(walked.x,HOME_WALK_SPEED*.05);
 assert.equal(advanceHomeRun(trace,hero,walked,.05,binding).distance,0);
 assert.equal(advanceHomeRun(trace,hero,{x:2,y:1,gait:'run'},.05,binding).distance,0);
 for(let i=0;i<6;i++){
  const next=stepHomeWalk(hero,{x:2,y:1},.05,[],[],null,'run');
  assert.ok(Math.abs(next.x-hero.x-HOME_RUN_SPEED*.05)<1e-6);
  trace=advanceHomeRun(trace,hero,next,.05,binding);
  assert.equal(advanceHomeRun(trace,hero,next,.05,binding),trace);
  hero=next;
 }
 assert.ok(trace.arrived);assert.ok(trace.distance>=1.5);
 assert.equal(homeGameActionMatches({action:{kind:'run',objectId:'chair'}},{kind:'run',objectId:'chair'}),false);
 assert.equal(advanceHomeRun(trace,hero,{...hero,gait:'walk'},.05,binding).distance,0);
});
test('running retains collision checks and speeds only the active player in a shared home',()=>{
 const catalog=[{id:'block',size:[1,1],layer:'solid'}],objects=[{id:'block',itemId:'block',x:1,y:0}];
 let hero={x:0,y:.5};
 for(let i=0;i<30;i++)hero=stepHomeWalk(hero,{x:3,y:.5},.05,objects,catalog,null,'run');
 assert.ok(hero.x<1,'cannot run through furniture');
 const pair=homeDuoStep([{x:0,y:0},{x:0,y:2}],[{x:3,y:0},{x:3,y:2}],.05,[],[],null,{width:1280,height:900,scale:40,running:true});
 assert.ok(Math.abs(pair[0].x-.3)<1e-6);assert.ok(Math.abs(pair[1].x-.2)<1e-6);
 assert.equal(stepHomeWalk(pair[0],{x:3,y:0},.05,[],[]).gait,'walk');
});
