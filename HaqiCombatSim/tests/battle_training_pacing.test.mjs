import test from 'node:test';
import assert from 'node:assert/strict';
import {presentationEventDurationMs,samplePresentationClock} from '../js/battle_presentation_core.js';

test('brisk beginner playback shortens waiting but preserves hits, heals and failed casts',()=>{
 for(const type of ['pass','status','speak'])assert.ok(presentationEventDurationMs({type},{briskTraining:true})<presentationEventDurationMs({type}));
 for(const type of ['damage','dot','heal','hot','fizzle','movearrow','combat_end']){
  for(const hp of [0,40])assert.equal(presentationEventDurationMs({type},{hp,briskTraining:true}),presentationEventDurationMs({type},{hp}));
 }
});

test('shorter waits retain event order and the full final feedback frame',()=>{
 const events=['pass','speak','status','damage','heal'];
 const frames=events.map(type=>({type,duration:presentationEventDurationMs({type},{hp:50,briskTraining:true})}));
 let elapsed=0;
 for(let i=0;i<frames.length;i++){
  assert.equal(samplePresentationClock(frames,(elapsed+frames[i].duration/2)/1000).index,i);
  elapsed+=frames[i].duration;
 }
 assert.deepEqual(samplePresentationClock(frames,elapsed/1000),{index:frames.length-1,progress:1});
});
