import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpeningController} from '../js/adventure/opening_controller.js';

function harness(language='en'){
 const state={stage:'world',panel:'opening-journey',roleEpoch:1,roleStore:{owner:'guest',catalog:{activeId:'first'}},save:{languageLearning:{target:language},openingJourney:{version:1,phase:'explain'}}};
 const requests=[];let callbacks;
 const controller=createOpeningController({nodes:{overlay:{}},getContext:()=>state,model:()=>({save:state.save}),
  dialogueVoice:()=>({speak:(text,locale,signal,_character,options)=>new Promise((resolve,reject)=>requests.push({text,locale,signal,options,resolve,reject}))}),
  renderOpeningJourneyView:(_root,_model,cb)=>{callbacks=cb;}
 });
 controller.paintOpeningJourney();return {state,requests,controller,listen:options=>callbacks.listen(options)};
}
for(const [language,phrase]of [['en','We are friends.'],['ja','私たちは友達です。'],['ko','우리는 친구예요.']])test(language+': first example announces only actual audio playback',async()=>{
 const h=harness(language),events=[];const result=h.listen({onPlaying:()=>events.push('playing')});
 const request=h.requests[0];assert.equal(request.text,phrase);assert.equal(request.locale,language);assert.deepEqual(events,[]);
 request.options.onPlaying();assert.deepEqual(events,['playing']);request.resolve();assert.equal(await result,true);
});
test('closing the conversation aborts its example and ignores delayed playback',async()=>{
 const h=harness(),events=[];const result=h.listen({onPlaying:()=>events.push('playing')});const request=h.requests[0];
 h.controller.closeAll();assert.equal(request.signal.aborted,true);request.options.onPlaying();request.reject(Error('aborted'));
 assert.equal(await result,false);assert.deepEqual(events,[]);
});
test('old audio cannot announce playback after a role, owner, panel or stage change',async()=>{
 for(const change of [s=>s.roleEpoch++,s=>s.roleStore.owner='account',s=>s.roleStore.catalog.activeId='second',s=>s.panel='pets',s=>s.stage='title']){
  const h=harness(),events=[];const result=h.listen({onPlaying:()=>events.push('playing')});change(h.state);
  h.requests[0].options.onPlaying();h.requests[0].resolve();assert.equal(await result,false);assert.deepEqual(events,[]);
 }
});
test('a replacement example cancels the previous one without letting its cleanup cancel the new request',async()=>{
 const h=harness(),events=[];const first=h.listen({onPlaying:()=>events.push('old')}),second=h.listen({onPlaying:()=>events.push('new')});
 const [old,current]=h.requests;assert.equal(old.signal.aborted,true);old.options.onPlaying();old.resolve();assert.equal(await first,false);
 current.options.onPlaying();assert.deepEqual(events,['new']);assert.equal(current.signal.aborted,false);current.resolve();assert.equal(await second,true);
});
