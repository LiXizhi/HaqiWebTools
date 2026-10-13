import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHanziIsland} from '../js/adventure_hanzi.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../data/adventure/hanzi/'+p,import.meta.url)));
const data=read('content.json'),strokes=read('strokes.json');
function harness(){
 let cb,finish,fail=false,updates=[],rewards=[];
 const state={save:{},role:'one',owner:'alice',stage:'world',assets:{dataset:{cards:{}},effects:{cards:{}}}};
 const voice={start:async()=>{},finish:()=>new Promise(r=>finish=r),cancel:async()=>{},speak:async()=>{}};
 const island=createHanziIsland({root:{},data,strokes,getState:()=>state,commit:p=>{if(fail)throw Error('disk full');state.save.hanzi=p;},award:id=>rewards.push(id),onClose:()=>island.close(),onLogin:()=>{},voice,now:()=>1000,
  viewFactory:(_,d,s,callbacks)=>{cb=callbacks;return {open(){},close(){},update:v=>updates.push(v)};}});
 island.open();const char=data.characters.find(c=>c.id==='tu');const points=strokes.characters[char.glyph].medians.map(s=>s.map(([x,y])=>[x/1024,(900-y)/1024]));
 return {state,island,char,points,cb,updates,rewards,resolve:text=>finish(text),fail:()=>fail=true};
}
test('double writing submit commits once and awards only after durable commit',()=>{
 const h=harness();h.cb.begin(h.char,{stage:0});h.cb.write(h.points,false);h.cb.write(h.points,false);assert.equal(h.state.save.hanzi.entries.tu.attempts.length,1);assert.deepEqual(h.rewards,['hanzi:tu']);
 const f=harness();f.fail();f.cb.begin(f.char,{stage:0});f.cb.write(f.points,false);assert.equal(f.state.save.hanzi,undefined);assert.equal(f.rewards.length,0);assert.equal(f.updates.at(-1).message,'disk full');
});
test('late speech result after cancel, close or account change cannot mint cards',async()=>{
 for(const action of ['cancel','close','account']){const h=harness();h.cb.begin(h.char,{stage:0});await h.cb.speak(false);const result=h.cb.finish();if(action==='cancel')h.cb.cancel();else if(action==='close')h.island.close();else h.state.owner='bob';h.resolve('土');await result;assert.equal(h.state.save.hanzi,undefined);assert.equal(h.rewards.length,0);}
});
test('all-speech and mixed paths complete the same card without saving transcript',async()=>{
 for(const methods of [['speak','speak','speak'],['write','speak','write']]){
  const h=harness();for(let stage=0;stage<3;stage++){h.cb.begin(h.char,{stage});if(methods[stage]==='write')h.cb.write(h.points,true);else{await h.cb.speak(false);const done=h.cb.finish();h.resolve('泥土');await done;}}
  assert.equal(h.state.save.hanzi.entries.tu.attempts.length,3);assert.equal(JSON.stringify(h.state.save).includes('泥土'),false);
 }
});
test('guest voice does not start service; writing remains available',async()=>{
 const h=harness();h.state.owner=null;h.island.open();h.cb.begin(h.char,{stage:0});await h.cb.speak(false);assert.equal(h.state.save.hanzi,undefined);h.cb.write(h.points,true);assert.equal(h.state.save.hanzi.entries.tu.attempts.length,1);
});
