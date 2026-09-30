import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createDungeonStory} from '../js/adventure_dungeon_story.js';
const d=JSON.parse(fs.readFileSync(new URL('../data/adventure/dungeon-journeys.json',import.meta.url))).entries[0];
function harness(voice={},owner='test'){
 let clock=0,actions,awards=[],updates=[],completed=0;
 const save={zone:d.id,languageLearning:{enabled:true,target:'en'},dungeonLanguageBuff:{dungeonId:d.id,lines:[]}};
 const controller=createDungeonStory({root:{},getState:()=>({save,owner,role:'test-role',assets:{content:{dungeons:[d]}}}),now:()=>clock,voice:{start:async()=>{},finish:async()=>d.story[2].en,cancel:async()=>{},speak:async()=>{},...voice},award:id=>{awards.push(id);save.dungeonLanguageBuff.lines.push(id);},onDone:()=>completed++,viewFactory:(_,cb)=>{actions=cb;return {open(){},line(){},update(s){updates.push(s);},close(){}};}});
 controller.open(d);actions.next();actions.next();
 return {controller,actions,save,awards,updates,setClock:v=>clock=v,completed:()=>completed};
}
test('late ASR after skip cannot award or reopen a closed cinematic',async()=>{
 let resolve;const h=harness({finish:()=>new Promise(r=>resolve=r)});
 try{await h.actions.start();const pending=h.actions.finish();h.actions.skip();resolve(d.story[2].en);await pending;assert.equal(h.awards.length,0);assert.equal(h.completed(),1);assert.equal(h.controller.active,false);}finally{h.controller.close();}
});
test('waiting beyond five seconds still allows speech and awards exactly once',async()=>{
 const h=harness();try{h.setClock(60000);await h.actions.start();await h.actions.finish();await h.actions.finish();assert.equal(h.awards.length,1);assert.ok(h.awards[0].endsWith(':'+d.story[2].id));}finally{h.controller.close();}
});
test('hidden page and canceled recordings cannot award',async()=>{
 for(const mode of ['hidden','cancel']){
  let resolve;const h=harness({finish:()=>new Promise(r=>resolve=r)});
  try{{await h.actions.start();if(mode==='cancel')await h.actions.cancel();else{const pending=h.actions.finish();h.controller.suspend();resolve(d.story[2].en);await pending;}}
   assert.equal(h.awards.length,0,mode);
  }finally{h.controller.close();}
 }
});
test('closing while microphone connects invalidates the request',async()=>{
 let resolve;const h=harness({start:()=>new Promise(r=>resolve=r)});
 const pending=h.actions.start();h.controller.close();resolve(true);await pending;assert.equal(h.controller.active,false);assert.equal(h.awards.length,0);
});
test('invalidated role or zone releases the fullscreen UI instead of leaving it paused',()=>{
 const h=harness();try{h.save.zone='camp';h.controller.tick();assert.equal(h.controller.active,false);assert.equal(h.completed(),1);assert.equal(h.awards.length,0);}finally{h.controller.close();}
});

test('NPC text and completed demonstration never schedule automatic progression',async(t)=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});
 const h=harness();try{
  h.actions.next();const count=h.updates.length;await h.actions.read();
  const after=h.updates.length;t.mock.timers.tick(60000);
  assert.equal(h.updates.length,after);assert.ok(after>count);assert.equal(h.completed(),0);
 }finally{h.controller.close();}
});
test('completed recording advances once, cancellation allows another attempt',async(t)=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});
 const h=harness();try{
  await h.actions.start();await h.actions.cancel();await h.actions.start();await h.actions.finish();
  assert.equal(h.awards.length,1);t.mock.timers.tick(1800);const after=h.updates.length;t.mock.timers.tick(60000);
  assert.equal(h.updates.length,after);assert.equal(h.completed(),0);
 }finally{h.controller.close();}
});

test('offline story blocks microphone and TTS but keeps reading and login available',async()=>{
 let calls=0;const h=harness({start:async()=>calls++,speak:async()=>calls++},null);
 try{assert.equal(h.updates.at(-1).loginRequired,true);await h.actions.start();await h.actions.read();assert.equal(calls,0);assert.equal(h.awards.length,0);h.actions.next();assert.equal(h.controller.active,true);}finally{h.controller.close();}
});
