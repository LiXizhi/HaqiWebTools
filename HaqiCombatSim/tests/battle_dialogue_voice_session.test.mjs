import test from 'node:test';
import assert from 'node:assert/strict';
import {createDialogueVoiceSession} from '../js/dialogue_voice_session.js';
function harness(overrides={}){
 const events=[],received=[];const voice={start:async()=>{},finish:async()=>'hello',cancel:async()=>{},speak:async()=>{},...overrides};
 const audio=createDialogueVoiceSession(voice),options={valid:()=>true,maxMs:20000,onState:s=>events.push(s),onText:t=>received.push(t),onError:e=>events.push(e.message),onCancel:()=>events.push('cancelled'),onDone:()=>events.push('done')};
 return {audio,options,events,received};
}
test('release during connection finishes exactly once when microphone becomes ready',async()=>{
 let ready;const h=harness({start:()=>new Promise(r=>ready=r)});const pending=h.audio.start(h.options);
 await h.audio.finish();ready();await pending;await h.audio.finish();assert.deepEqual(h.received,['hello']);assert.deepEqual(h.events,['connecting','recording','judging']);
});
test('recording limit uses the shared finish path',async(t)=>{
 t.mock.timers.enable({apis:['setTimeout']});const h=harness();await h.audio.start(h.options);t.mock.timers.tick(20000);await Promise.resolve();assert.deepEqual(h.received,['hello']);await h.audio.dispose();
});
test('cancel and dispose invalidate late ASR and TTS callbacks',async()=>{
 let done;const h=harness({finish:()=>new Promise(r=>done=r)});await h.audio.start(h.options);const pending=h.audio.finish();await h.audio.cancel();done('late');await pending;assert.deepEqual(h.received,[]);
 let spoken;const t=harness({speak:()=>new Promise(r=>spoken=r)});const reading=t.audio.speak({...t.options,text:'hello',locale:'en'});await t.audio.dispose();spoken();await reading;assert.deepEqual(t.events,['speaking']);
});
test('failed authorization never opens microphone and can be retried',async()=>{
 let starts=0;const h=harness({start:async()=>starts++});await h.audio.start({...h.options,before:async()=>{throw Error('login');}});assert.equal(starts,0);await h.audio.start(h.options);assert.equal(starts,1);await h.audio.cancel();
});
