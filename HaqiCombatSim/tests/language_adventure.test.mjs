import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseLocaleFile,normalizeLocaleSave,localeIdsToLoad} from '../js/locale_core.js';
import {configureLocale,displayLocale} from '../js/locale.js';
import {renderLearningTemplate,selectLesson,triggerAllowed,learningParams,matchesSpeech,evaluateEvidence,rewardStatus,recordLearningCompletion,validateLearningSave} from '../js/language_adventure_core.js';
import {loadLearningCatalog,createLanguageAdventure,learningSlots} from '../js/language_adventure.js';
import {createAdventure,applyAction,parseSave} from '../js/adventure_core.js';
import {persistReward} from '../js/adventure_reward_persistence.js';
import {pcm16,createLearningVoice} from '../js/language_adventure_voice.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const content=JSON.parse(read('data/adventure/chapter.json'));
const catalog=JSON.parse(read('data/adventure/language-courses.json'));
catalog.dictionaries=Object.fromEntries(['zh-CN','en'].map(l=>[l,parseLocaleFile(read(`data/adventure/locale/learning.${l}.txt`))]));
const course=catalog.courses[0],now=Date.parse('2026-09-25T10:00:00Z');
function save(){const s=createAdventure(content);s.languageLearning={enabled:true,target:'en',native:'zh-CN'};return s;}
function claim(s,{mode='basic',locale=s.languageLearning.target,at=now,id=crypto.randomUUID(),c=course}={}){
 const completion={course:c,mode,locale,attemptId:id,now:at,score:100,spoken:true};
 return recordLearningCompletion(s,content,completion,{learningCompletion:completion});
}
test('bilingual 20-group content covers every real camp NPC and landmark, with resolvable goals',()=>{
 assert.equal(catalog.courses.length,20);assert.equal(catalog.courses.reduce((n,c)=>n+c.pairs.length*2,0),120);
 const npcs=JSON.parse(read('data/adventure/npc-catalog.json')).npcs.filter(n=>n.zone==='camp');
 assert.deepEqual(Object.keys(catalog.npcs),npcs.map(n=>n.instanceId));
 const landmarks=JSON.parse(read('data/adventure/maps/camp.json')).landmarks;
 assert.deepEqual(Object.keys(catalog.locations),landmarks.map(l=>l.id));
 for(const c of catalog.courses){
  assert.equal(c.goals.reduce((n,g)=>n+g.weight,0),100);
  for(const locale of ['en','zh-CN'])for(const source of [...c.pairs.flatMap(p=>[p.question,p.answer]),c.scenario,...c.goals.map(g=>g.text)])assert.ok(renderLearningTemplate(source,locale,catalog.dictionaries,{item:locale==='en'?'a hat':'一顶帽子',count:2,measure:'顶'}),`${c.id} ${source}`);
 }
 for(const ids of [...Object.values(catalog.npcs),...Object.values(catalog.locations)])for(const id of ids)assert.ok(catalog.courses.some(c=>c.id===id));
});
test('teaching translates templates before filling slots and never falls back to Chinese',()=>{
 const source='这是{item}。';
 assert.equal(renderLearningTemplate(source,'en',catalog.dictionaries,{item:'a hat'}),'This is a hat.');
 assert.equal(renderLearningTemplate(source,'zh-CN',catalog.dictionaries,{item:'一顶帽子'}),'这是一顶帽子。');
 assert.equal(renderLearningTemplate(source,'ja',catalog.dictionaries,{item:'a hat'}),null);
 assert.equal(renderLearningTemplate(source,'en',catalog.dictionaries,{}),null);
});
test('interface language remains independent and all necessary UI dictionaries load',()=>{
 const s=normalizeLocaleSave({locale:'ja',languageLearning:{enabled:true,native:'en',target:'zh-CN'}});
 assert.deepEqual(localeIdsToLoad(s),['ja','en']);configureLocale(s);assert.equal(displayLocale(),'ja');
 assert.equal(normalizeLocaleSave({languageLearning:{native:'en',target:'en'}}).languageLearning.target,'zh-CN');
});
test('ASR normalization is language specific, accepts contractions/numbers, rejects wrong answers',()=>{
 assert.ok(matchesSpeech("I'm ready!",['I am ready.'],'en'));
 assert.ok(matchesSpeech('I have 2',['I have two.'],'en'));
 assert.ok(matchesSpeech('I have twenty-one',['I have 21.'],'en'));
 assert.ok(matchesSpeech('我有两顶',['我有2顶。'],'zh-CN'));
 assert.ok(matchesSpeech('数量是十二',['数量是12。'],'zh-CN'));
 assert.ok(matchesSpeech('我有2个！',['我有二个。'],'zh-CN'));
 assert.ok(!matchesSpeech('I am not ready',['I am ready'],'en'));
 assert.ok(!matchesSpeech('你好',['Hello'],'en'));
 assert.ok(!matchesSpeech('你好',['你好'],'ja'));
});
test('seeded selection filters context, locale, and binding without global randomness',()=>{
 const options={event:'npc',source:'camp:5:36205',locale:'en',seed:42};
 assert.deepEqual(selectLesson(catalog,options),selectLesson(catalog,options));
 assert.ok(['location','directions'].includes(selectLesson(catalog,options).course.id));
 assert.equal(selectLesson(catalog,{...options,locale:'ja'}),null);
 for(let serial=0;serial<20;serial++)assert.notEqual(selectLesson(catalog,{...options,event:'inventory',source:'inventory',serial,slots:{}})?.course.id,'ownership');
});
test('automatic trigger cooldown, animation guard and camp-only boundary',()=>{
 const p=learningParams(),s={lastAt:now,sources:{npc:now}};
 const event={zone:'camp',enabled:true,busy:false,source:'npc',now:now+90001};
 assert.equal(triggerAllowed(s,event,p),false);assert.equal(triggerAllowed(s,{...event,source:'bag'},p),true);
 assert.equal(triggerAllowed(s,{...event,now:now+300001},p),true);
 assert.equal(triggerAllowed(s,{...event,now:now+300001,busy:true},p),false);
 assert.equal(triggerAllowed({}, {...event,zone:'town'},p),false);
});
test('challenge only accepts exact target-language evidence and confirmed game actions',()=>{
 let r=evaluateEvidence(course,{}, {reply:'Hi!',completed:[{id:'greet',quote:'Hello'}]},'Hello!','en');assert.equal(r.score,30);
 r=evaluateEvidence(course,r.completed,{reply:'Hi',completed:[{id:'greet',quote:'Hello'},{id:'interest',quote:'I like fish'}]},'Hello','en');assert.equal(r.score,30);
 assert.equal(evaluateEvidence(course,{}, {reply:'Hi',completed:[{id:'greet',quote:'你好'}]},'你好','en').score,0);
 assert.equal(evaluateEvidence(course,{}, {reply:'你好',completed:[{id:'greet',quote:'你好'}]},'你好，Alex','zh-CN').score,30);
 assert.equal(evaluateEvidence(course,{}, {reply:'Hi',completed:[{id:'greet',quote:'Hello 青龙'}]},'Hello 青龙','en',[],['青龙']).score,30);
 const actionCourse={goals:[{id:'feed',event:'fed',weight:100}]};
 assert.equal(evaluateEvidence(actionCourse,{}, {reply:'Thanks',completed:[{id:'feed',quote:'I fed you'}]},'I fed you','en').score,0);
 assert.equal(evaluateEvidence(actionCourse,{}, {reply:'Thanks',completed:[{id:'feed',quote:'I fed you'}]},'I fed you','en',['fed']).score,100);
 assert.throws(()=>evaluateEvidence(course,{}, {completed:[]},'Hello','en'));
});
test('daily course limits shared across languages; progress stays separate',()=>{
 const s=save();assert.equal(claim(s).amount,10);
 s.languageLearning.target='zh-CN';assert.equal(claim(s).amount,10);assert.equal(claim(s).amount,0);
 assert.equal(s.inventory[100],20);assert.equal(s.languageAdventure.progress.en.greeting.basic,1);assert.equal(s.languageAdventure.progress['zh-CN'].greeting.basic,2);
 assert.equal(rewardStatus(s,content,course,'basic',now).count,2);
});
test('caps, partial final reward, replay, Beijing midnight, clock rollback and old-save validation',()=>{
 const s=save(),id='same';claim(s,{id});assert.equal(claim(s,{id}).duplicate,true);
 for(const c of catalog.courses)claim(s,{c});assert.equal(s.inventory[100],100);
 for(const c of catalog.courses)claim(s,{c,mode:'challenge'});assert.equal(s.inventory[17213],200);
 assert.equal(claim(s,{at:now-86400000}).amount,0);
 assert.equal(claim(s,{at:Date.parse('2026-09-25T16:00:00Z')}).amount,10);
 validateLearningSave(s);assert.equal(parseSave(JSON.stringify(s),content).languageAdventure.version,1);
 const old=save();delete old.languageAdventure;validateLearningSave(old);assert.deepEqual(old.languageAdventure,{version:1,progress:{}});
 old.languageAdventure.ledger={day:1,totals:{100:-2},courses:{},attempts:[]};assert.throws(()=>validateLearningSave(old));
});
test('no direct grant without ephemeral completion; failed persistence leaves inventory and progress intact',()=>{
 const s=save(),completion={course,mode:'basic',locale:'en',attemptId:'attempt',now,score:100,spoken:true};
 assert.throws(()=>recordLearningCompletion(s,content,completion,{}));
 const before=JSON.stringify(s);
 assert.throws(()=>persistReward(s,content,{type:'language-complete',completion},{learningCompletion:completion},{getItem:()=>null,setItem:()=>{throw Error('quota');}}),/quota/);
 assert.equal(JSON.stringify(s),before);
 assert.throws(()=>applyAction(s,content,{type:'buy',paidByTest:true}),/限额奖励/);
});
test('PCM conversion has the expected 16kHz sample count and clamps amplitude',()=>{
 const data=pcm16(Float32Array.from([2,-2,1,-1,0,0]),48000);assert.equal(data.length,2);assert.equal(data[0],32767);assert.equal(data[1],-32768);
});

function harness(){
 const state={save:save(),content,stage:'world',role:'r1',identity:'guest'};let callbacks,rendered,transcript='';
 const voice={start:async()=>{},finish:async()=>transcript,cancel:async()=>{},speak:async()=>{},judge:async()=>({reply:'Hello!',completed:[]})};
 const controller=createLanguageAdventure({getState:()=>state,load:async()=>catalog,voice,notify:()=>{},commit:completion=>recordLearningCompletion(state.save,content,completion,{learningCompletion:completion}),viewFactory:cb=>{callbacks=cb;return{render:s=>{rendered=s;},close(){},visibility(){},invite(){}};}});
 const flush=()=>new Promise(r=>setTimeout(r,0));
 return {state,voice,controller,get cb(){return callbacks;},get ui(){return rendered;},async say(text){transcript=text;callbacks.record();await flush();callbacks.record();await flush();},flush};
}
test('controller completes two live voice turns, unlocks challenge and respects locale change cancellation',async()=>{
 const h=harness();await h.controller.open();h.cb.course('greeting');
 await h.say('Hello, nice to meet you.');await h.say('I am fine, thank you.');
 assert.equal(h.state.save.inventory[100],10);assert.equal(h.ui.unlocked,true);
 h.cb.challenge();assert.equal(h.ui.mode,'challenge');
 h.state.save.languageLearning.target='zh-CN';h.controller.tick(1000);assert.equal(h.controller.active,false);
});
test('model completion after close does not grant reward',async()=>{
 const h=harness();await h.controller.open();h.cb.course('greeting');
 await h.say('Hello, nice to meet you.');await h.say('I am fine, thank you.');h.cb.challenge();
 let resolve;h.voice.judge=()=>new Promise(r=>{resolve=r;});
 await h.say('Hello. I like exploring. Let us explore together.');h.controller.close();
 resolve({reply:'Great!',completed:course.goals.map(g=>({id:g.id,quote:'Hello'}))});await h.flush();
 assert.equal(h.state.save.inventory[17213]||0,0);
});
test('missing language files produce unavailable teaching rather than a source-language fallback',async()=>{
 const c=await loadLearningCatalog(async()=>catalog,async()=>({ok:false}));assert.deepEqual(c.dictionaries.en,{});
 assert.equal(selectLesson(c,{event:'npc',locale:'en',source:'companion',seed:1}),null);
});

test('Keepwork TTS waits for actual playback and cancellation settles the pending utterance',async()=>{
 const original=globalThis.Audio;let audio,options,stops=0;
 globalThis.Audio=class {constructor(url){assert.equal(url,'blob:fixture');audio=this;}play(){return Promise.resolve();}pause(){stops++;}};
 const stream={synthesize:async()=>({audioUrl:'blob:fixture'}),stop:async()=>{}};
 const voice=createLearningVoice({load:async()=>({speechRTC:{createSession:o=>{options=o;return stream;}}})});
 try{
  let ended=false;const utterance=voice.speak('Hello','en',new AbortController().signal).then(()=>{ended=true;});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(options.autoPlay,false);assert.equal(options.audioFormat,'mp3');assert.equal(ended,false);
  audio.onended();await utterance;assert.equal(ended,true);
  const next=voice.speak('你好','zh-CN',new AbortController().signal);
  await new Promise(resolve=>setImmediate(resolve));await voice.cancel();await next;
  assert.ok(stops>=2);
 }finally{globalThis.Audio=original;await voice.cancel();}
});

test('listening assessment requires completed playback and a correct meaning, never grants currency or speaking credit',async()=>{
 const h=harness();await h.controller.open();h.cb.course('greeting');h.cb.listening();
 assert.equal(h.ui.mode,'listening');h.cb.choose('greeting.1');assert.equal(h.state.save.languageAdventure.progress.en,undefined);
 h.cb.listen();await h.flush();h.cb.choose('greeting.2');assert.equal(h.ui.heard,false);
 h.cb.listen();await h.flush();h.cb.choose('greeting.1');
 const progress=h.state.save.languageAdventure.progress.en.greeting;
 assert.equal(progress.listening,1);assert.equal(progress.basic,0);assert.equal(progress.challenge,0);
 assert.equal(h.state.save.inventory[100]||0,0);assert.equal(h.state.save.inventory[17213]||0,0);
 h.cb.choose('greeting.1');assert.equal(progress.listening,1);
});
test('invite bubble is dots near an eligible NPC and disappears when the player walks away',async()=>{
 const stories=JSON.parse(read('data/adventure/camp-conversations.json'));
 const full={...catalog,profiles:stories.profiles};
 const state={save:save(),content,stage:'world',role:'r1',identity:'guest'};
 state.save.zone='camp';state.save.position={x:900,y:800};
 state.near={kind:'npc',id:36205,instanceId:'camp:5:36205',name:'法斯特船长',x:920,y:800};
 const voice={start:async()=>{},finish:async()=>'',cancel:async()=>{},speak:async()=>{},judge:async()=>({reply:'Hello!',completed:[]})};
 const controller=createLanguageAdventure({getState:()=>state,load:async()=>full,voice,notify:()=>{},commit:()=>({amount:0}),viewFactory:()=>({render(){},close(){},visibility(){},invite(){}})});
 controller.tick(1000);await new Promise(r=>setTimeout(r,0));
 controller.tick(1600);
 assert.equal(controller.bubble,'…');
 assert.deepEqual(controller.invitation,{npcId:36205,instanceId:'camp:5:36205',name:'法斯特船长',position:{x:920,y:800}});
 state.near=null;state.save.position={x:1300,y:800};
 controller.tick(2200);
 assert.equal(controller.invitation,null);
 assert.equal(controller.bubble,null);
 assert.equal(controller.active,false);
});
