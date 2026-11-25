import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpeningController} from '../js/adventure/opening_controller.js';

function harness(phase='showcase',failure='warning'){
 const state={stage:'world',panel:'opening-journey',roleEpoch:1,roleStore:{owner:'guest',catalog:{activeId:'first'}},save:{openingJourney:{version:1,phase,petId:'gulu'}}};
 const calls=[];let callbacks,blocked=true;
 const controller=createOpeningController({
  nodes:{overlay:{}},getContext:()=>state,model:()=>({save:state.save}),
  persist:()=>{calls.push('persist');if(blocked&&failure==='throw')throw Error('storage unavailable');state.storageWarning=blocked;},
  queueCloudSave:()=>calls.push('cloud'),close:()=>calls.push('close'),track:()=>calls.push('track'),
  openPanel:panel=>calls.push(panel),onTrackOpeningJourney:()=>calls.push('route'),
  performAction:action=>{calls.push(action.step);if(blocked)return false;state.save.openingJourney.celebrated=true;return true;},
  renderOpeningJourneyView:(_root,_model,cb)=>{callbacks=cb;},playOpeningPetWelcomeFn:()=>false,
 });
 controller.paintOpeningJourney();
 return {state,calls,invoke:key=>callbacks[key](),retry:()=>{blocked=false;}};
}

for(const failure of ['warning','throw'])for(const action of ['close','go','pets','continue','wordplay','explore'])test(`${failure}: ${action} stays in the welcome panel when its first save fails`,()=>{
 const h=harness('showcase',failure);
 assert.equal(h.invoke(action),false);
 assert.equal(h.state.save.openingJourney.welcomeSeen,undefined);
 assert.deepEqual(h.calls,['persist']);
});

for(const [action,destination]of [['close',null],['go','route'],['pets','pet'],['continue','track']])test(`${action} can retry a failed welcome save and leaves only after saving`,()=>{
 const h=harness();h.invoke(action);h.calls.length=0;h.retry();h.invoke(action);
 assert.equal(h.state.save.openingJourney.welcomeSeen,true);
 assert.deepEqual(h.calls,['persist','cloud','close',...(destination?[destination]:[])]);
});

for(const action of ['close','go','pets','continue','wordplay','explore'])test(`${action} cannot leave the closing celebration while its reward save fails`,()=>{
 const h=harness('done');assert.equal(h.invoke(action),false);
 assert.deepEqual(h.calls,['continue']);
 assert.equal(h.state.save.openingJourney.celebrated,undefined);
});

test('retrying the closing celebration completes it once before routing onward',()=>{
 const h=harness('done');h.invoke('go');h.calls.length=0;h.retry();h.invoke('go');
 assert.equal(h.state.save.openingJourney.celebrated,true);
 assert.deepEqual(h.calls,['continue','close','route']);
 h.calls.length=0;h.invoke('go');assert.deepEqual(h.calls,['close','route']);
});
