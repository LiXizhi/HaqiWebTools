import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {learningLanguage} from '../js/learning_language_core.js';
import {wordplayGoal,wordplayAnswer,wordplayReaction,applyCompanionWordplay} from '../js/companion_wordplay_core.js';
const source=fs.readFileSync(new URL('../js/learning/companion_wordplay.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export function','function');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function setup(language='en'){
 let save={zone:'camp',languageLearning:{target:language},openingJourney:{phase:'done'}},active=true,cb,frame,commits=0,drains=0,done=0,closed=0,cancelled=0,failSave=false;
 const start=deferred(),finish=deferred(),speak=deferred();
 const spoken=[];const voice={start:()=>start.promise,finish:()=>finish.promise,speak:(text,locale,signal,_character,options)=>{spoken.push({text,locale,signal,options});return speak.promise;},cancel:()=>{cancelled++;}};
 const context=vm.createContext({learningLanguage,wordplayGoal,wordplayAnswer,wordplayReaction,AbortController,crypto,Date});vm.runInContext(source,context);
 const session=context.openCompanionWordplay({root:{},getState:()=>({save,active}),voice,
 viewFactory:(_root,callbacks)=>{cb=callbacks;return {render:m=>frame=m,dispose(){}};},
 commit:action=>{if(failSave)throw Error('storage failed');const next=structuredClone(save),result=applyCompanionWordplay(next,{},action);save=next;commits++;return result;},
 drain:()=>drains++,onDone:()=>done++,onClose:()=>closed++});
 return {cb,session,start,finish,speak,spoken,get save(){return save;},get frame(){return frame;},get commits(){return commits;},get drains(){return drains;},get done(){return done;},set active(v){active=v;},set failSave(v){failSave=v;}};
}
test('wrong text and save failure cannot advance; retry commits one learning receipt',()=>{
 const t=setup();t.cb.submit('jump');assert.equal(t.commits,0);assert.equal(t.drains,0);
 t.failSave=true;t.cb.submit('hello');assert.equal(t.frame.phase,'ready');assert.equal(t.save.openingJourney.wordplay,undefined);
 t.failSave=false;t.cb.submit('hello');t.cb.submit('hello');assert.equal(t.commits,1);assert.equal(t.drains,1);assert.equal(t.save.openingJourney.wordplay.practices[0].word,'hello');
});
test('late demo rejection and microphone cancel cannot reset successful response',async()=>{
 const t=setup(),pending=t.cb.listen();t.cb.submit('hello');t.cb.cancelRecording();t.speak.reject(Error('late audio'));await pending;
 assert.equal(t.frame.phase,'success');assert.equal(t.commits,1);
});
test('cancelled or disposed recognition cannot record a delayed accepted answer',async()=>{
 for(const action of ['cancel','dispose','role']){
  const t=setup(),pending=t.cb.startRecording();t.start.resolve();await pending;
  const checking=t.cb.finishRecording();if(action==='cancel')t.cb.cancelRecording();else if(action==='dispose')t.session.dispose();else t.active=false;
  t.finish.resolve('hello');await checking;assert.equal(t.commits,0,action);assert.equal(t.drains,0,action);
 }
});
test('release during microphone connection is queued and accepted once',async()=>{
 const t=setup(),pending=t.cb.startRecording();await t.cb.finishRecording();t.start.resolve();await Promise.resolve();t.finish.resolve('hello');await pending;
 assert.equal(t.commits,1);assert.equal(t.save.openingJourney.wordplay.practices[0].input,'speech');
 await t.cb.finishRecording();assert.equal(t.commits,1);
});
test('third success exits on its first continue click and duplicate callbacks do not exit twice',()=>{
 const t=setup();for(const phrase of ['hello','Could you jump?','Come over here']){t.cb.submit(phrase);t.cb.next();}
 assert.equal(t.commits,3);assert.equal(t.done,1);t.cb.next();t.cb.done();assert.equal(t.done,1);
});

test('other valid commands animate without advancing or claiming practice',()=>{
 const t=setup();t.cb.submit('Jump!');assert.equal(t.frame.reaction,'jump');const id=t.frame.reactionId;assert.equal(t.frame.phase,'ready');assert.equal(t.commits,0);assert.equal(t.drains,0);
 t.cb.submit('Jump!');assert.ok(t.frame.reactionId>id);t.cb.submit('garbage');assert.equal(t.frame.reaction,null);assert.equal(t.commits,0);
 t.cb.submit('hello');assert.equal(t.commits,1);assert.equal(t.frame.reaction,null);
});

test('Japanese practice demo and accepted answers use the selected language',async()=>{
 const t=setup('ja'),demo=t.cb.listen();assert.deepEqual(t.spoken.map(({text,locale})=>({text,locale})),[{text:'こんにちは！',locale:'ja'}]);t.speak.resolve();await demo;
 t.cb.submit('Hello!');assert.equal(t.commits,0);t.cb.submit('こんにちは！');assert.equal(t.commits,1);
});
test('recognition timeout returns to ready and permits a typed answer without another recording',async()=>{
 const t=setup('ja'),starting=t.cb.startRecording();t.start.resolve();await starting;
 const finishing=t.cb.finishRecording();assert.equal(t.frame.phase,'checking');
 t.finish.reject(Error('语音服务超时，请重试'));await finishing;
 assert.equal(t.frame.phase,'ready');assert.match(t.frame.message,/超时/);assert.equal(t.commits,0);
 t.cb.submit('こんにちは！');assert.equal(t.commits,1);
});

test('speech correction retains the recognized words but never counts a rejected answer',async()=>{
 const t=setup(),starting=t.cb.startRecording();t.start.resolve();await starting;
 const finishing=t.cb.finishRecording();t.finish.resolve('goodbye');await finishing;
 assert.equal(t.frame.inputMode,'speech');assert.equal(t.frame.transcript,'goodbye');
 assert.equal(t.frame.phase,'ready');assert.equal(t.commits,0);assert.equal(t.drains,0);
 t.cb.submit('hello');assert.equal(t.frame.inputMode,'text');assert.equal(t.commits,1);
 t.cb.next();assert.equal(t.frame.transcript,'');assert.equal(t.frame.inputMode,null);
});


test('a recognized command for another round explains the remaining task and recovery clears that feedback',async()=>{
 const t=setup();t.cb.submit('Jump!');
 assert.deepEqual(Array.from(t.frame.messageParts),['它跳起来了！','跟抱抱龙打个招呼。']);
 assert.equal(t.commits,0);assert.equal(t.drains,0);
 const pending=t.cb.startRecording();assert.equal(t.frame.messageParts,null);
 t.start.reject(Error('microphone unavailable'));await pending;
 assert.equal(t.frame.messageParts,null);assert.match(t.frame.message,/microphone/);
 t.cb.submit('hello');t.cb.next();t.cb.submit('hello');
 assert.deepEqual(Array.from(t.frame.messageParts),['它也向你打招呼啦！','让抱抱龙跳一下。']);
 assert.equal(t.commits,1);t.cb.submit('Jump!');assert.equal(t.frame.messageParts,null);
});

test('demo waits for actual playback, blocks duplicate requests and clears its own status',async()=>{
 const t=setup(),pending=t.cb.listen();assert.equal(t.frame.demoState,'preparing');t.cb.listen();assert.equal(t.spoken.length,1);
 t.spoken[0].options.onPlaying();assert.equal(t.frame.demoState,'playing');assert.equal(t.commits,0);assert.equal(t.drains,0);
 t.speak.resolve();await pending;assert.equal(t.frame.demoState,'');assert.equal(t.frame.phase,'ready');
});

test('starting the microphone stops the demo before recording and ignores its late callbacks',async()=>{
 const t=setup(),demo=t.cb.listen(),spoken=t.spoken[0],starting=t.cb.startRecording();
 assert.equal(spoken.signal.aborted,true);assert.equal(t.frame.demoState,'');assert.equal(t.frame.phase,'connecting');
 spoken.options.onPlaying();assert.equal(t.frame.phase,'connecting');assert.equal(t.frame.demoState,'');
 t.speak.reject(Error('stopped demo'));await demo;t.start.resolve();await starting;assert.equal(t.frame.phase,'recording');assert.equal(t.frame.message,'');
 t.cb.cancelRecording();
});

test('typed answers stop demo playback and stale playback never overwrites the next round',async()=>{
 const t=setup(),demo=t.cb.listen(),spoken=t.spoken[0];t.cb.submit('hello');assert.equal(spoken.signal.aborted,true);assert.equal(t.frame.phase,'success');
 t.cb.next();assert.equal(t.frame.step,1);spoken.options.onPlaying();t.speak.resolve();await demo;
 assert.equal(t.frame.step,1);assert.equal(t.frame.demoState,'');assert.equal(t.frame.message,'');assert.equal(t.commits,1);
});

for(const action of ['dispose','role','language'])test('demo cannot repaint after '+action,async()=>{
 const t=setup(),pending=t.cb.listen(),previous=t.frame;
 if(action==='dispose')t.session.dispose();else if(action==='role')t.active=false;else t.save.languageLearning.target='ja';
 t.spoken[0].options.onPlaying();t.speak.reject(Error('late'));await pending;assert.equal(t.frame,previous);assert.equal(t.commits,0);
 if(action==='dispose')assert.equal(t.spoken[0].signal.aborted,true);
});

test('demo failure offers speaking and typing and permits another playback attempt',async()=>{
 const t=setup(),pending=t.cb.listen();t.speak.reject(Error('network'));await pending;
 assert.equal(t.frame.demoState,'');assert.equal(t.frame.phase,'ready');assert.equal(t.frame.message,'暂时听不到示范。可以直接说，或用打字告诉它。');
 await t.cb.listen();assert.equal(t.spoken.length,2);assert.equal(t.commits,0);t.cb.submit('hello');assert.equal(t.commits,1);
});
