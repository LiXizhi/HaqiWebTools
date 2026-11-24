import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAdventure,parseSave} from '../js/adventure_core.js';
import {persistReward} from '../js/adventure_reward_persistence.js';
import {applyForestCommission,validateForestCommission,forestCommissionPouch,forestCommissionGoal} from '../js/forest_commission_core.js';
import {forestExchangeLines,forestExchangeMatches,forestExchangeId} from '../js/forest_exchange_core.js';
import {forestCommissionStory} from '../js/forest_commission_story_core.js';
import {flushForestCommissionPractice} from '../js/learning/forest_commission_learning.js';
import {createForestExchangeRecorder} from '../js/forest_exchange_recorder.js';
const content=JSON.parse(fs.readFileSync(new URL('../data/adventure/chapter.json',import.meta.url)));
const fresh=(language='en',phase='delivery')=>({...createAdventure(content,{school:'fire',seed:23}),languageLearning:{target:language},forestCommission:{version:1,phase}});
const access=save=>({forestTarget:{id:36200,kind:'npc',...save.position}});
const request=(save,word='boots',extra={})=>({type:'forest-commission',step:'exchange',word,language:save.languageLearning.target,input:'text',text:forestExchangeLines(save,word)[0],learning:{at:1234,attempts:1,assisted:false},...extra});

for(const language of ['en','ja','ko','zh-CN'])test(`${language}: short handovers advance the real commission and retain honest evidence`,async()=>{
 const save=fresh(language);const action=request(save);applyForestCommission(save,content,action,access(save));
 assert.equal(save.forestCommission.phase,'note');assert.equal(save.inventory[1260],1);validateForestCommission(save);
 assert.throws(()=>applyForestCommission(save,content,action,access(save)),/已经交付/);
 const events=[];await flushForestCommissionPractice(save,{valid:()=>true,persist:()=>true,record:async e=>{events.push(e);return {persisted:true};}});
 assert.deepEqual(events.map(e=>[e.language,e.input,e.attempts,e.assisted]),[[language==='zh-CN'?'zh':language,'text',1,false]]);
 assert.equal(new Set(events.map(e=>e.id)).size,1);assert.equal(save.forestCommission.exchangePractice.length,0);
});
for(const language of ['en','ja','ko','zh-CN'])test(`${language}: each supported note handover can continue into the existing briefing without another reward`,()=>{
 for(const text of forestExchangeLines(fresh(language),'note')){
  const save=fresh(language,'briefing'),before=structuredClone(save);
  assert.equal(forestCommissionGoal(save).label,'把路线便签拿给茜茜');
  const result=applyForestCommission(save,content,request(save,'note',{text,input:'speech'}),access(save));
  assert.equal(save.forestCommission.phase,'briefing');assert.equal(result.rewards,undefined);
  assert.deepEqual(save.inventory,before.inventory);assert.equal(save.xp,before.xp);assert.equal(save.level,before.level);
  assert.deepEqual(save.forestCommission.exchangeCompleted,['note']);
  assert.deepEqual(save.forestCommission.exchangePractice,[{id:forestExchangeId('note',language),word:'note',language,input:'speech',at:1234,attempts:1,assisted:false}]);
  assert.match(forestCommissionPouch(save)[0].description,/茜茜保管/);
  const restored=parseSave(JSON.stringify(save),content);validateForestCommission(restored);
  assert.equal(forestCommissionGoal(restored).label,'和茜茜确认巡逻路线');
  applyForestCommission(restored,content,{step:'brief',tactic:'focus',recalled:'boots',learning:{at:1235,attempts:1,assisted:false}},access(restored));
  assert.equal(restored.forestCommission.phase,'patrol');validateForestCommission(restored);
 }
});
test('note handover rejects wrong context, intent and evidence before changing the saved state',()=>{
 const cases=[
  save=>{save.forestCommission.phase='note';},
  save=>{save.forestCommission.phase='delivery';},
  save=>{save.zone='forest';},
  save=>{save.pendingEncounter={};},
 ];
 for(const change of cases){const save=fresh('en','briefing');change(save);const before=structuredClone(save);assert.throws(()=>applyForestCommission(save,content,request(save,'note'),access(save)));assert.deepEqual(save,before);}
 for(const patch of [{word:'hat'},{text:'note'},{text:'Here are the boots.'},{text:'I did not find the note.'},{text:'Here is the note?'},{language:'ja'},{input:'read'},{learning:{at:NaN,attempts:1,assisted:false}},{learning:{at:1,attempts:1000,assisted:false}},{learning:{at:1,attempts:1,assisted:'false'}}]){
  const save=fresh('en','briefing'),before=structuredClone(save);assert.throws(()=>applyForestCommission(save,content,request(save,'note',patch),access(save)));assert.deepEqual(save,before);
 }
 const save=fresh('en','briefing'),before=structuredClone(save),where=access(save);where.forestTarget.x+=111;
 assert.throws(()=>applyForestCommission(save,content,request(save,'note'),where));assert.deepEqual(save,before);
});
test('legacy saves remain valid; a completed note stays completed after receipt draining and a language switch',async()=>{
 const save=fresh('en','briefing');assert.ok(parseSave(JSON.stringify(save),content));
 applyForestCommission(save,content,request(save,'note'),access(save));
 await flushForestCommissionPractice(save,{valid:()=>true,persist:()=>true,record:async()=>({persisted:true})});
 const restored=parseSave(JSON.stringify(save),content);restored.languageLearning.target='ja';const before=structuredClone(restored);
 assert.throws(()=>applyForestCommission(restored,content,request(restored,'note'),access(restored)));assert.deepEqual(restored,before);
 assert.deepEqual(restored.forestCommission.exchangeCompleted,['note']);assert.deepEqual(restored.forestCommission.exchangePractice,[]);
});
test('note completion and pending receipts reject malformed or impossible save states',()=>{
 const good=fresh('en','briefing');applyForestCommission(good,content,request(good,'note'),access(good));
 for(const marker of [true,{},['boots'],['note','note'],['note','boots'],Array(1)]){
  const save=structuredClone(good);save.forestCommission.exchangeCompleted=marker;assert.throws(()=>validateForestCommission(save));
 }
 for(const patch of [{exchangeCompleted:undefined},{phase:'note'},{phase:'delivery'},{exchangePractice:Array(1)},{exchangePractice:[good.forestCommission.exchangePractice[0],good.forestCommission.exchangePractice[0]]}]){
  const save=structuredClone(good);Object.assign(save.forestCommission,patch);assert.throws(()=>validateForestCommission(save));
 }
 const empty=fresh('en','briefing');empty.forestCommission.exchangeCompleted=[];validateForestCommission(empty);
});
test('boots and note receipts drain in order with their original language and input evidence',async()=>{
 const save=fresh('ja');applyForestCommission(save,content,request(save),access(save));
 save.forestCommission.phase='briefing';save.languageLearning.target='ko';applyForestCommission(save,content,request(save,'note',{input:'speech',learning:{at:2345,attempts:2,assisted:true}}),access(save));
 validateForestCommission(save);const events=[];
 await flushForestCommissionPractice(save,{valid:()=>true,persist:()=>true,record:async event=>{events.push(event);return {persisted:true};}});
 assert.deepEqual(events.map(event=>[event.id,event.language,event.input,event.at,event.attempts,event.assisted]),[[forestExchangeId('boots','ja'),'ja','text',1234,1,false],[forestExchangeId('note','ko'),'ko','speech',2345,2,true]]);
 assert.deepEqual(events.map(event=>event.words),[['ブーツ'],['메모']]);assert.deepEqual(save.forestCommission.exchangePractice,[]);assert.deepEqual(save.forestCommission.exchangeCompleted,['note']);
});
test('note save failure leaves the live role unchanged and a retry commits one receipt',()=>{
 const save=fresh('en','briefing'),action=request(save,'note'),before=structuredClone(save);let fail=true,stored;
 const storage={getItem:()=>null,setItem(_key,value){if(fail)throw Error('quota');stored=value;}};
 assert.throws(()=>persistReward(save,content,action,access(save),storage));assert.deepEqual(save,before);
 fail=false;const committed=persistReward(save,content,action,access(save),storage).save;
 assert.ok(stored);assert.deepEqual(committed.forestCommission.exchangeCompleted,['note']);assert.equal(committed.forestCommission.exchangePractice.length,1);
 assert.throws(()=>persistReward(committed,content,action,access(committed),storage));assert.equal(committed.forestCommission.exchangePractice.length,1);
});
test('an interrupted note learning write retains its receipt without inventing another exchange',async()=>{
 const save=fresh('en','briefing');applyForestCommission(save,content,request(save,'note'),access(save));const event=save.forestCommission.exchangePractice[0];let active=true;
 assert.equal(await flushForestCommissionPractice(save,{valid:()=>active,persist:()=>true,record:async()=>{active=false;return {persisted:true};}}),false);
 assert.equal(save.forestCommission.exchangePractice[0],event);active=true;
 await assert.rejects(flushForestCommissionPractice(save,{valid:()=>active,persist:()=>{throw Error('quota');},record:async()=>({persisted:true})}),/quota/);
 assert.equal(save.forestCommission.exchangePractice[0],event);validateForestCommission(save);
});
test('intent matching rejects negatives, questions, wrong objects, bare labels and missing target',()=>{
 const save=fresh();for(const text of ['boots','I did not find the boots.','Where are the boots?','Here are the boots?','Here is the note.','Here are the boots, but not for you.'])assert.equal(forestExchangeMatches(save,'boots',text),false,text);
 assert.equal(forestExchangeMatches(save,'boots','  HERE ARE THE BOOTS！ '),true);
 assert.equal(forestExchangeMatches(fresh('ja'),'boots','ﾌﾞｰﾂをどうぞ。'),true);
 const missing=fresh();delete missing.languageLearning;assert.equal(forestExchangeLines(missing,'boots'),null);
});
test('distance, language switches and invalid evidence leave handover and reward untouched',()=>{
 const save=fresh(),before=JSON.stringify(save),action=request(save);
 for(const [change,where] of [[{language:'ja'},access(save)],[{input:'read'},access(save)],[{learning:{at:0,attempts:0,assisted:false}},access(save)],[{}, {forestTarget:{...access(save).forestTarget,x:save.position.x+500}}]]){
  assert.throws(()=>applyForestCommission(save,content,{...action,...change},where));assert.equal(JSON.stringify(save),before);
 }
});
test('failed local save preserves the object; retry commits one reward and one stable receipt',()=>{
 const save=fresh(),action=request(save),before=JSON.stringify(save);let fail=true,stored;
 const storage={getItem:()=>null,setItem(_key,value){if(fail)throw Error('quota');stored=value;}};
 assert.throws(()=>persistReward(save,content,action,access(save),storage));assert.equal(JSON.stringify(save),before);
 fail=false;const committed=persistReward(save,content,action,access(save),storage).save;
 assert.ok(stored);assert.equal(committed.inventory[1260],1);assert.equal(committed.forestCommission.exchangePractice[0].id,forestExchangeId('boots','en'));
 assert.throws(()=>persistReward(committed,content,action,access(save),storage));
});
test('failed practice persistence retries the same receipt and preserves its original language',async()=>{
 const save=fresh('ja');applyForestCommission(save,content,request(save),access(save));save.languageLearning.target='ko';
 const events=[],options={valid:()=>true,persist:()=>false,record:async e=>{events.push(e);return {persisted:true};}};
 assert.equal(await flushForestCommissionPractice(save,options),false);assert.equal(save.forestCommission.exchangePractice.length,1);
 await flushForestCommissionPractice(save,{...options,persist:()=>true});assert.equal(events[0].id,events[1].id);assert.equal(events[1].language,'ja');
});
test('proposals are optional, nearby, saved and remembered without inventing dungeon modifiers',()=>{
 const save=fresh('en','briefing');validateForestCommission(save);const before=structuredClone(save);
 applyForestCommission(save,content,{step:'plan',plan:'tracks'},access(save));validateForestCommission(save);
 assert.match(forestCommissionStory(save,'patrol'),/惦记着脚印/);assert.match(forestCommissionStory(save,'report'),/脚印/);
 assert.deepEqual({...save,forestCommission:before.forestCommission},before);
 assert.throws(()=>applyForestCommission(save,content,{step:'plan',plan:'solo'},access(save)));
 save.forestCommission.phase='delivery';assert.throws(()=>validateForestCommission(save),/提议/);
});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function recorderHarness(){
 const states=[],texts=[],errors=[],start=deferred(),finish=deferred();let active=true,stops=0,signal;
 const recorder=createForestExchangeRecorder({voice:{start:s=>{signal=s;return start.promise;},finish:()=>finish.promise,cancel:()=>{stops++;}},valid:()=>active,onState:s=>states.push(s),onText:t=>texts.push(t),onError:e=>errors.push(e)});
 return {recorder,states,texts,errors,start,finish,active:v=>{active=v;},signal:()=>signal,stops:()=>stops};
}
test('recording is deliberate, transcript is returned for confirmation, never a quest action',async()=>{
 const h=recorderHarness();assert.deepEqual(h.states,[]);const p=h.recorder.start();h.start.resolve();await p;
 assert.equal(h.states.at(-1),'recording');const q=h.recorder.finish();h.finish.resolve('Here are the boots.');await q;
 assert.deepEqual(h.texts,['Here are the boots.']);assert.equal(h.states.at(-1),'idle');h.recorder.dispose();
});
for(const reason of ['close','language','cancel'])test(`late ASR is discarded after ${reason}`,async()=>{
 const h=recorderHarness(),p=h.recorder.start();h.start.resolve();await p;const q=h.recorder.finish();
 if(reason==='close')h.recorder.dispose();else if(reason==='language')h.active(false);else h.recorder.cancel();
 h.finish.resolve('Here are the boots.');await q;assert.deepEqual(h.texts,[]);assert.ok(h.stops()>0);h.recorder.dispose();
});
test('closing during microphone startup aborts the request; errors restore typing',async()=>{
 const h=recorderHarness(),p=h.recorder.start();h.recorder.dispose();assert.equal(h.signal().aborted,true);h.start.resolve();await p;assert.deepEqual(h.texts,[]);
 const e=recorderHarness(),q=e.recorder.start();e.start.reject(Error('permission denied'));await q;assert.equal(e.states.at(-1),'idle');assert.equal(e.errors.length,1);e.recorder.dispose();
});
