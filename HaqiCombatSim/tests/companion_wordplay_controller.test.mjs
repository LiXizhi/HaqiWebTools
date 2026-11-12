import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {wordplayGoal,wordplayAnswer,wordplayReaction,applyCompanionWordplay} from '../js/companion_wordplay_core.js';
const source=fs.readFileSync(new URL('../js/companion_wordplay.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export function','function');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function setup(){
 let save={zone:'camp',openingJourney:{phase:'done'}},active=true,cb,frame,commits=0,drains=0,done=0,closed=0,cancelled=0,failSave=false;
 const start=deferred(),finish=deferred(),speak=deferred();
 const voice={start:()=>start.promise,finish:()=>finish.promise,speak:()=>speak.promise,cancel:()=>{cancelled++;}};
 const context=vm.createContext({wordplayGoal,wordplayAnswer,wordplayReaction,AbortController,crypto,Date});vm.runInContext(source,context);
 const session=context.openCompanionWordplay({root:{},getState:()=>({save,active}),voice,
 viewFactory:(_root,callbacks)=>{cb=callbacks;return {render:m=>frame=m,dispose(){}};},
 commit:action=>{if(failSave)throw Error('storage failed');const next=structuredClone(save),result=applyCompanionWordplay(next,{},action);save=next;commits++;return result;},
 drain:()=>drains++,onDone:()=>done++,onClose:()=>closed++});
 return {cb,session,start,finish,speak,get save(){return save;},get frame(){return frame;},get commits(){return commits;},get drains(){return drains;},get done(){return done;},set active(v){active=v;},set failSave(v){failSave=v;}};
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
