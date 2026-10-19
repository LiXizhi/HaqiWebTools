import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createDictionary} from '../js/adventure_dictionary.js';
import {emptyDictionary} from '../js/dictionary_core.js';
const data=JSON.parse(fs.readFileSync(new URL('../data/adventure/dictionary/en.json',import.meta.url)));
const now=new Date(2026,9,16,12).getTime();
function harness({viewExtras={},clock=()=>now,beforeLoad=async()=>{},dictionaries=null,beforeUpdate=async()=>{},afterUpdate=async()=>{},voiceExtras={},speak=async()=>{throw Error('offline');},dictionary=data,persisted=true,owner=null,judge=async()=>{throw Error('offline');}}={}){
    let row=emptyDictionary(),cb,ui,awards=[],messages=[],tutors=[],speechStates=[];const state={owner,role:'a',stage:'world',save:{seed:1,languageLearning:{}},content:{}};
    const controller=createDictionary({root:{},getState:()=>state,now:clock,load:async lang=>{await beforeLoad(lang);return dictionaries?.[lang]||dictionary;},onClose:()=>controller.close(),onRewards:()=>{},onLegacy:()=>{},onBuff:(b,r)=>{state.save.dailyLanguageBuff=structuredClone(b);if(r)awards.push(r);},storage:{async update(key,reduce){await beforeUpdate();const result=reduce(row),snapshot={state:structuredClone(row),result,persisted:typeof persisted==='function'?persisted():persisted};await afterUpdate(snapshot);return snapshot;}},voice:{cancel:async()=>{},judge,speak,...voiceExtras},viewFactory:(root,callbacks)=>{cb=callbacks;return {speechState:(active,text)=>speechStates.push({active,text}),tutorInterrupted:q=>messages.push('tutorInterrupted:'+q),meaningAccepted:()=>messages.push('meaningAccepted'),contextFeedback:m=>messages.push(m),tutorPreview:v=>messages.push('preview:'+v),tutorPending:v=>tutors.push(v),tutorReply:v=>tutors.push(v),home:v=>ui=v,entry:v=>ui=v,context:v=>ui=v,message:m=>messages.push(m),success:m=>messages.push(m),close(){},suspend(){},...viewExtras};}});
    return {controller,state,get cb(){return cb;},get ui(){return ui;},awards,messages,tutors,speechStates,get row(){return row;}};
}
test('controller checks answers, writes only real page visits, retries without double reward',async()=>{
    const h=harness();await h.controller.open('en');assert.equal(h.row.languages.en.entries.hello,undefined);
    await h.cb.task('fresh');assert.equal(h.row.languages.en.entries.hello.views,1);await h.cb.recall();await h.cb.choice('错误');assert.equal(h.awards.length,0);await h.cb.recall();await h.cb.choice('你好');await h.cb.recall();await h.cb.choice('你好');assert.equal(h.awards.length,1);assert.equal(h.row.languages.en.entries.hello.lastResult.errors,1);
});
test('no persistent database means no game rewards, audio failure leaves practice usable',async()=>{
    const h=harness({persisted:false});await h.controller.open('en','hello');await h.cb.speak();await h.cb.recall();await h.cb.choice('你好');assert.equal(h.awards.length,0);assert.match(h.messages.at(-1),/未能保存/);
});

test('dictionary listening speed applies to words, authored phrases and restored teacher examples',async()=>{
 const heard=[],h=harness({speak:async(...args)=>heard.push(args)});await h.controller.open('en','hello');assert.equal(h.ui.speechRate,1);h.cb.speechRate(0.8);await h.cb.speak();await h.cb.speakExample();await h.cb.tutorSpeak(data.entries[0].exampleChunks[0].text);await h.cb.tutor('举例');await h.cb.tutorSpeak(data.entries[0].example);
 assert.equal(heard.length,4);assert.ok(heard.every(args=>args[4].playbackRate===0.8));await h.cb.home();await h.cb.entry('goodbye');assert.equal(h.ui.speechRate,0.8);h.cb.speechRate(99);await h.cb.speak();assert.equal(heard.at(-1)[4].playbackRate,1);assert.equal(h.awards.length,0);
});

test('listening speed cannot change while audio is pending or after the owner changes',async()=>{
 let finish;const h=harness({speak:()=>new Promise(r=>finish=r)});await h.controller.open('en','hello');const playing=h.cb.speak();await new Promise(r=>setTimeout(r,0));h.cb.speechRate(0.8);finish();await playing;await h.cb.home();await h.cb.entry('hello');assert.equal(h.ui.speechRate,1);
 h.state.owner='different';h.cb.speechRate(0.8);h.state.owner=null;await h.cb.home();await h.cb.entry('hello');assert.equal(h.ui.speechRate,1);
});

test('a correct unsaved answer retries persistence without re-answering or duplicating rewards',async()=>{
 let available=false;const h=harness({persisted:()=>available});await h.controller.open('en','hello');await h.cb.recall();const durable=structuredClone(h.row);await h.cb.choice('你好');assert.equal(h.awards.length,0);assert.match(h.messages.at(-1),/重试保存/);await h.cb.retrySave();assert.equal(h.awards.length,0);
 // Model the store's successful recovery reading its durable row, not its fallback memory.
 Object.assign(h.row,durable);available=true;await h.cb.retrySave();assert.equal(h.awards.length,1);assert.equal(h.row.languages.en.entries.hello.reviews,1);await h.cb.retrySave();await h.cb.choice('你好');assert.equal(h.awards.length,1);
});

test('save retry rejects yesterday answers and repeats no semantic model call',async()=>{
 let time=now,available=false,calls=0;const h=harness({clock:()=>time,persisted:()=>available,owner:'test',judge:async()=>++calls===1?{entryId:'hello',question:'请用 hello 和朋友打招呼。'}:{entryId:'hello',correct:true,evidence:'Hello',feedback:'问好正确。'}});
 await h.controller.open('en');await h.cb.task('context');await h.cb.contextAnswer('Hello!');await h.cb.retrySave();assert.equal(calls,2);assert.equal(h.awards.length,0);time+=86400000;available=true;await h.cb.retrySave();assert.match(h.messages.at(-1),/日期已变化/);assert.equal(h.awards.length,0);assert.equal(calls,2);
});

test('a delayed save retry checks the date again inside the transaction',async()=>{
 let time=now,hold=false,release,entered;const started=new Promise(r=>entered=r),h=harness({clock:()=>time,persisted:false,beforeUpdate:async()=>{if(hold){hold=false;entered();await new Promise(r=>release=r);}}});
 await h.controller.open('en','hello');await h.cb.recall();await h.cb.choice('你好');hold=true;const pending=h.cb.retrySave();await started;await h.cb.retrySave();time+=86400000;release();await pending;
 assert.equal(h.awards.length,0);assert.match(h.messages.at(-1),/日期已变化/);assert.equal(h.row.languages.en.plan.day,'2026-10-16');
});
test('AI timeout/invalid output switches to local context without granting anything',async()=>{
    const h=harness({owner:'test',judge:async()=>({entryId:'hello',question:'wrong target'})});await h.controller.open('en');await h.cb.task('context');assert.equal(h.ui.online,false);assert.equal(h.awards.length,0);await h.cb.contextChoice(data.entries[0].context.answer);assert.equal(h.awards.length,1);
});
test('late AI generation after account switch or close cannot update UI or award',async()=>{
    let resolve;const h=harness({owner:'test',judge:()=>new Promise(r=>resolve=r)});await h.controller.open('en');const pending=h.cb.task('context');await new Promise(r=>setTimeout(r,0));h.state.owner='other';resolve({entryId:'hello',question:'请用 hello 和朋友打招呼。'});await pending;assert.equal(h.row.languages.en.plan.question,undefined);assert.equal(h.awards.length,0);
});
test('AI answer evidence is checked, correct context rewards once',async()=>{
    let call=0;const h=harness({owner:'test',judge:async()=>++call===1?{entryId:'hello',question:'请用 hello 和朋友打招呼。'}:{entryId:'hello',correct:true,evidence:'Hello',feedback:'很友好。'}});await h.controller.open('en');await h.cb.task('context');assert.equal(h.ui.online,true);await h.cb.contextAnswer('Hello, friend.');await h.cb.contextAnswer('Hello, friend.');assert.equal(h.awards.length,1);assert.ok(h.messages.includes('很友好。'));
});

test('offline tutor provides authored help without completing practice or awarding',async()=>{
    const h=harness();await h.controller.open('en','hello');await h.cb.tutor('怎么记？');assert.equal(h.tutors.at(-1).local,true);assert.equal(h.awards.length,0);assert.equal(h.row.languages.en.entries.hello.learned,undefined);await h.cb.recall();await h.cb.choice('你好');assert.equal(h.row.languages.en.entries.hello.lastResult.hinted,true);
});

test('streamed teaching stays provisional until validated and ignores chunks after completion',async()=>{
 let finish,preview;const h=harness({owner:'test',judge:async(messages,signal,options)=>{preview=options.onReply;preview('先说 Hello');return new Promise(r=>finish=r);}});await h.controller.open('en','hello');const pending=h.cb.tutor('怎么问好？');await new Promise(r=>setTimeout(r,0));assert.ok(h.messages.includes('preview:先说 Hello'));assert.equal(h.tutors.filter(x=>typeof x==='object').length,0);assert.doesNotMatch(JSON.stringify(h.row),/先说 Hello/);assert.equal(h.awards.length,0);
 finish({entryId:'hello',reply:'先说 Hello。',example:'Hello!',translation:'你好！',question:''});await pending;assert.equal(h.tutors.at(-1).reply,'先说 Hello。');const count=h.messages.length;preview('不应再显示');assert.equal(h.messages.length,count);await h.cb.home();await h.cb.entry('hello');assert.equal(h.ui.tutorHistory.length,2);
});

test('invalid, interrupted or abandoned streams never become saved teaching turns',async()=>{
 for(const action of ['invalid','fallback','navigate','answer']){
  let finish,preview,calls=0;const h=harness({owner:'test',judge:async(messages,signal,options)=>{if(++calls>1)return {entryId:'wrong'};preview=options.onReply;preview('还没有校验的内容');return new Promise(r=>finish=r);}});await h.controller.open('en','hello');await h.cb.recall();const pending=h.cb.tutor('解释一下');await new Promise(r=>setTimeout(r,0));
  if(action==='fallback')h.cb.tutorFallback();if(action==='navigate')await h.cb.home();if(action==='answer')await h.cb.choice('错误');
  finish({entryId:'wrong',reply:'不应保留',example:'',translation:'',question:''});await pending;const count=h.messages.length;preview('迟到文字');assert.equal(h.messages.length,count);await h.cb.home();await h.cb.entry('hello');assert.ok(h.ui.tutorHistory.every(turn=>!String(turn.reply||turn.text).includes('不应保留')));assert.equal(h.ui.tutorHistory.length,action==='invalid'||action==='fallback'?2:0);assert.equal(h.awards.length,0);
 }
});

test('returning to a word restores teaching context and audio but not old practice evidence',async()=>{
 const requests=[],spoken=[];const h=harness({owner:'test',speak:async text=>spoken.push(text),judge:async messages=>{const p=JSON.parse(messages[1].content);requests.push(p);return {entryId:p.entryId,reply:'可以向朋友问好。',example:'Hello, friend.',translation:'你好，朋友。',question:'你想向谁问好？'};}});
 await h.controller.open('en','hello');await h.cb.recall();await h.cb.choice('错误');await h.cb.tutor('陪我练习造句','practice');
 await h.cb.home();await h.cb.entry('goodbye');assert.deepEqual(h.ui.tutorHistory,[]);await h.cb.home();await h.cb.entry('hello');
 assert.equal(h.ui.tutorHistory.length,2);assert.equal(h.ui.tutorMode,'practice');assert.equal(h.ui.tutorHistory[1].translation,'你好，朋友。');await h.cb.tutorSpeak('Hello, friend.');assert.deepEqual(spoken,['Hello, friend.']);
 await h.cb.tutor('向老师问好可以吗？');assert.equal(requests.at(-1).conversation.length,2);assert.equal(requests.at(-1).practice.lastAttempt,null);assert.equal(requests.at(-1).practice.errors,0);assert.equal(requests.at(-1).practice.completed,false);assert.equal(h.awards.length,0);
 assert.doesNotMatch(JSON.stringify(h.row),/tutorTranscript|tutorHistory|向老师/);
});

test('a late teaching answer cannot replace the conversation saved before navigation',async()=>{
 let resolve,calls=0;const h=harness({owner:'test',judge:async()=>++calls===1?{entryId:'hello',reply:'已完成讲解',example:'',translation:'',question:''}:new Promise(r=>resolve=r)});
 await h.controller.open('en','hello');await h.cb.tutor('怎么问好？');const pending=h.cb.tutor('还想知道更多');await new Promise(r=>setTimeout(r,0));await h.cb.home();await h.cb.entry('hello');resolve({entryId:'hello',reply:'迟到讲解',example:'',translation:'',question:''});await pending;
 assert.equal(h.ui.tutorHistory.length,2);assert.equal(h.ui.tutorHistory[1].reply,'已完成讲解');await h.cb.home();await h.cb.entry('hello');assert.equal(h.ui.tutorHistory.length,2);assert.equal(h.awards.length,0);
});

test('conversation memory separates language IDs and keeps the existing twelve-pair limit',async()=>{
 const zh=JSON.parse(fs.readFileSync(new URL('../data/adventure/dictionary/zh.json',import.meta.url)));
 // Deliberately collide stable IDs across languages to exercise the memory key.
 zh.entries[0].id='hello';const h=harness({dictionaries:{en:data,zh}});
 await h.controller.open('en','hello');for(let i=0;i<14;i++)await h.cb.tutor('英文问题 '+i);
 await h.cb.language('zh');await h.cb.entry('hello');assert.deepEqual(h.ui.tutorHistory,[]);await h.cb.tutor('中文问题');
 await h.cb.language('en');await h.cb.entry('hello');assert.equal(h.ui.tutorHistory.length,24);assert.equal(h.ui.tutorHistory[0].text,'英文问题 2');assert.equal(h.ui.tutorHistory.at(-2).text,'英文问题 13');
 await h.cb.language('zh');await h.cb.entry('hello');assert.equal(h.ui.tutorHistory.length,2);assert.equal(h.ui.tutorHistory[0].text,'中文问题');assert.equal(h.awards.length,0);
});

test('Chinese stroke count help uses local data and cannot award or claim a submitted stroke',async()=>{
 const zh=JSON.parse(fs.readFileSync(new URL('../data/adventure/dictionary/zh.json',import.meta.url))),h=harness({dictionary:zh});await h.controller.open('zh','kou');await h.cb.tutor('口有几笔？');
 assert.match(h.tutors.at(-1).reply,/“口”有 3 笔/);assert.doesNotMatch(h.tutors.at(-1).reply,/你.*写了/);assert.equal(h.awards.length,0);assert.equal(h.row.languages.zh.entries.kou.learned,undefined);assert.equal(h.row.languages.zh.entries.kou.hints,1);
});

test('online tutor receives the current Chinese pronunciation, words and standard count',async()=>{
 const zh=JSON.parse(fs.readFileSync(new URL('../data/adventure/dictionary/zh.json',import.meta.url)));let payload;
 const h=harness({dictionary:zh,owner:'test',judge:async messages=>{payload=JSON.parse(messages[1].content);return {entryId:'kou',reply:'口有三笔。',example:'',translation:'',question:''};}});await h.controller.open('zh','kou');await h.cb.tutor('口有几笔？');
 const e=zh.entries.find(e=>e.id==='kou');assert.equal(payload.reference.strokeCount,3);assert.equal(payload.reference.pronunciation,e.pronunciation);assert.deepEqual(payload.reference.words,e.words);assert.equal(payload.practice.lastAttempt,null);assert.equal(h.awards.length,0);
});

test('the online teacher receives the explicitly compared character from the current dictionary',async()=>{
 const zh=JSON.parse(fs.readFileSync(new URL('../data/adventure/dictionary/zh.json',import.meta.url)));let payload;const h=harness({dictionary:zh,owner:'test',judge:async messages=>{payload=JSON.parse(messages[1].content);return {entryId:'mu',reply:'木和目读音相同，意思不同。',example:'',translation:'',question:''};}});
 await h.controller.open('zh','mu');await h.cb.tutor('木和目怎么分清？');assert.equal(payload.reference.comparisons[0].id,'mu-eye');assert.equal(h.awards.length,0);assert.equal(h.row.languages.zh.entries['mu-eye'],undefined);
});

test('a stuck practice learner receives an example without a repeated local assignment',async()=>{
 const h=harness();await h.controller.open('en','hello');await h.cb.tutor('陪我练习造句','practice');assert.ok(h.tutors.at(-1).question);
 await h.cb.tutor('I don’t know.');assert.equal(h.tutors.at(-1).question,'');assert.equal(h.tutors.at(-1).example,data.entries[0].example);assert.equal(h.awards.length,0);
 await h.cb.tutor('陪我练习造句','practice');assert.ok(h.tutors.at(-1).question);
});

test('local context holds its submission lock through wrong-answer persistence and permits retry',async()=>{
 let hold=false,release,entered;const started=new Promise(r=>entered=r);
 const h=harness({afterUpdate:async()=>{if(hold){hold=false;entered();await new Promise(r=>release=r);}}});await h.controller.open('en');await h.cb.task('context');
 const e=data.entries[0];hold=true;const pending=h.cb.contextChoice(e.context.distractors[0].text);await started;await h.cb.contextChoice(e.context.answer);assert.equal(h.awards.length,0);
 release();await pending;assert.ok(h.messages.includes(e.context.distractors[0].feedback));await h.cb.contextChoice(e.context.answer);assert.equal(h.awards.length,1);
});

test('local context ignores extra choices while its error record is saving',async()=>{
 let updates=0,release,entered;const started=new Promise(r=>entered=r);
 const h=harness({afterUpdate:async()=>{if(updates&&++updates===3){entered();await new Promise(r=>release=r);}}});await h.controller.open('en');await h.cb.task('context');
 const e=data.entries[0];updates=1;const pending=h.cb.contextChoice(e.context.distractors[0].text);await started;await h.cb.contextChoice(e.context.answer);assert.equal(h.awards.length,0);release();await pending;
 await h.cb.contextChoice(e.context.answer);assert.equal(h.awards.length,1);
});

test('offline coaching follows the current spelling attempt and clears it on another entry',async()=>{
 const h=harness();await h.controller.open('en');h.row.languages.en.entries.hello={learned:true,stage:2,reviews:3,nextReviewAt:now,completedDay:'2026-10-15'};await h.cb.home();await h.cb.entry('hello');
 await h.cb.spell('hllo!');await h.cb.tutor('哪里错了？');assert.match(h.tutors.at(-1).reply,/第 2 个位置少了一个字母/);assert.equal(h.awards.length,0);
 await h.cb.spell('Hello!');await h.cb.tutor('现在呢？');assert.match(h.tutors.at(-1).reply,/这次拼写正确/);assert.doesNotMatch(h.tutors.at(-1).reply,/少了一个字母/);assert.equal(h.awards.length,1);
 await h.cb.home();await h.cb.entry('goodbye');await h.cb.tutor('怎么记？');assert.equal(h.tutors.at(-1).reply,data.entries.find(e=>e.id==='goodbye').coaching.tip);assert.doesNotMatch(JSON.stringify(h.row),/hllo|Hello!/);
});

test('explicit local coaching during a pending request uses the actual meaning answer',async()=>{
 let resolve;const h=harness({owner:'test',judge:()=>new Promise(r=>resolve=r)});await h.controller.open('en','hello');await h.cb.recall();await h.cb.choice('再见');
 const pending=h.cb.tutor('为什么？');await new Promise(r=>setTimeout(r,0));h.cb.tutorFallback();assert.match(h.tutors.at(-1).reply,/hello 在这道题里的意思是“你好”/);assert.equal(h.tutors.at(-1).requested,true);assert.equal(h.awards.length,0);
 resolve({entryId:'hello',reply:'迟到回复',example:'',translation:'',question:''});await pending;assert.doesNotMatch(h.tutors.at(-1).reply,/迟到/);
});
test('tutor retains conversation, validates target and ignores late response after close',async()=>{
    const calls=[];let resolve;const h=harness({owner:'test',judge:async messages=>{calls.push(messages);if(calls.length===3)return new Promise(r=>resolve=r);return {entryId:'hello',reply:'向朋友问好。',example:'Hello!',translation:'你好！',question:'你想向谁问好？'};}});
    await h.controller.open('en','hello');await h.cb.tutor('怎么用？');await h.cb.tutor('向朋友');assert.equal(JSON.parse(calls[1][1].content).conversation.length,2);const pending=h.cb.tutor('再来一次');await new Promise(r=>setTimeout(r,0));await h.cb.tutor('重复点击');assert.equal(calls.length,3);const count=h.tutors.length;h.controller.close();resolve({entryId:'hello',reply:'迟到',example:'',translation:'',question:''});await pending;assert.equal(h.tutors.length,count);assert.equal(h.awards.length,0);
});

test('first English exposure cannot award until deliberate recall, and flipping is not another view',async()=>{
 const h=harness();await h.controller.open('en','hello');assert.equal(h.ui.phase,'learn');await h.cb.choice('你好');assert.equal(h.awards.length,0);await h.cb.recall();assert.equal(h.ui.phase,'recall');assert.equal(h.row.languages.en.entries.hello.views,1);await h.cb.choice('你好');assert.equal(h.awards.length,1);
});

test('tutor answer from introduction does not reveal answers after entering recall',async()=>{
 let resolve;const h=harness({owner:'test',judge:()=>new Promise(r=>resolve=r)});await h.controller.open('en','hello');const pending=h.cb.tutor('怎么记？');await new Promise(r=>setTimeout(r,0));await h.cb.recall();const count=h.tutors.length;resolve({entryId:'hello',reply:'你好',example:'',translation:'',question:''});await pending;assert.equal(h.tutors.length,count);assert.equal(h.awards.length,0);assert.equal(h.ui.phase,'recall');
});

test('Chinese stroke feedback identifies the reversed stroke and retry preserves reward rules',async()=>{
 const zh=JSON.parse(fs.readFileSync(new URL('../data/adventure/dictionary/zh.json',import.meta.url))),h=harness({dictionary:zh});await h.controller.open('zh','ri');
 const points=zh.entries.find(e=>e.id==='ri').strokes.medians.map(row=>row.map(([x,y])=>[x/1024,(900-y)/1024]));
 const wrong=structuredClone(points);wrong[2].reverse();await h.cb.write(wrong);assert.match(h.messages.at(-1),/第 3 笔/);assert.equal(h.awards.length,0);await h.cb.write(points);assert.equal(h.awards.length,1);assert.equal(h.row.languages.zh.entries.ri.lastResult.errors,1);
});

test('tutor receives the actual local mistake rather than guessing learning difficulty',async()=>{
 let prompt;const h=harness({owner:'test',judge:async messages=>{prompt=JSON.parse(messages[1].content);return {entryId:'hello',reply:'再看一看问候的意思。',example:'',translation:'',question:''};}});await h.controller.open('en','hello');await h.cb.recall();await h.cb.choice('错误');await h.cb.tutor('哪里不对？');assert.equal(prompt.practice.errors,1);assert.equal(prompt.practice.completed,false);assert.match(prompt.practice.lastFeedback,/意思还不太合适/);assert.equal(h.awards.length,0);
});

test('failed online judgement retains the submitted draft and never auto-awards',async()=>{
 let calls=0;const h=harness({owner:'test',judge:async()=>{if(++calls===1)return {entryId:'hello',question:'请用 hello 向朋友打招呼。'};throw Error('timeout');}});await h.controller.open('en');await h.cb.task('context');await h.cb.contextAnswer('Hello, my friend.');assert.equal(h.ui.online,false);assert.equal(h.ui.draft,'Hello, my friend.');assert.equal(h.awards.length,0);await h.cb.contextChoice(data.entries[0].context.answer);assert.equal(h.awards.length,1);
});
test('manual fallback retains typed draft and discards a late model verdict',async()=>{
 let calls=0,resolve;const h=harness({owner:'test',judge:async()=>++calls===1?{entryId:'hello',question:'请用 hello 向朋友打招呼。'}:new Promise(r=>resolve=r)});await h.controller.open('en');await h.cb.task('context');h.cb.contextDraft('Hello!');const pending=h.cb.contextAnswer('Hello!');await new Promise(r=>setTimeout(r,0));await h.cb.fallback();assert.equal(h.ui.draft,'Hello!');resolve({entryId:'hello',correct:true,evidence:'Hello',feedback:'很好。'});await pending;assert.equal(h.awards.length,0);assert.equal(h.ui.online,false);
});

test('offline context explains the selected misconception and then the correct usage',async()=>{
 const h=harness();await h.controller.open('en');await h.cb.task('context');const e=data.entries[0],wrong=e.context.distractors[0];await h.cb.contextChoice(wrong.text);assert.equal(h.awards.length,0);assert.ok(h.messages.includes(wrong.feedback));await h.cb.contextChoice(e.context.answer);assert.ok(h.messages.includes(e.context.explanation));assert.equal(h.awards.length,1);
});

test('example audio uses the authored sentence and counts assistance only during recall',async()=>{
 const calls=[];const h=harness({speak:async(text,locale)=>calls.push({text,locale})});await h.controller.open('en','hello');await h.cb.speakExample();assert.equal(calls[0].text,data.entries[0].example);assert.equal(calls[0].locale,'en');assert.equal(h.row.languages.en.entries.hello.hints,undefined);await h.cb.recall();await h.cb.speakExample();assert.equal(h.row.languages.en.entries.hello.hints,1);assert.equal(h.awards.length,0);await h.cb.choice('你好');assert.equal(h.row.languages.en.entries.hello.lastResult.hinted,true);
});
test('stopped audio errors cannot overwrite feedback for a new request',async()=>{
 let reject,calls=0;const h=harness({speak:()=>{calls++;return new Promise((resolve,r)=>reject=r);}});await h.controller.open('en','hello');const pending=h.cb.speak();await h.cb.speak();assert.equal(calls,1);await h.cb.stopSpeech();reject(Error('late'));await pending;assert.equal(h.messages.length,0);
});

test('phrase listening accepts only authored chunks and uses the existing assistance rules',async()=>{
 const calls=[],h=harness({speak:async(text,locale)=>calls.push({text,locale})});await h.controller.open('en','hello');
 await h.cb.tutorSpeak('not an authored phrase');assert.equal(calls.length,0);await h.cb.tutorSpeak('my friend.');assert.deepEqual(calls,[{text:'my friend.',locale:'en'}]);assert.equal(h.row.languages.en.entries.hello.hints,undefined);
 await h.cb.recall();await h.cb.tutorSpeak('my friend.');assert.equal(h.row.languages.en.entries.hello.hints,1);assert.equal(h.awards.length,0);
 await h.cb.home();await h.cb.entry('goodbye');await h.cb.tutorSpeak('my friend.');assert.equal(calls.length,2);
});

test('delayed stop cleanup cannot reset the UI of a newly started utterance',async()=>{
 let hold=false,release;const endings=[];const h=harness({speak:()=>new Promise(r=>endings.push(r)),voiceExtras:{cancel:async()=>{if(hold){hold=false;await new Promise(r=>release=r);}}}});await h.controller.open('en','hello');
 const first=h.cb.speak();hold=true;const stopped=h.cb.stopSpeech();const second=h.cb.tutorSpeak('my friend.');assert.equal(h.speechStates.at(-1).active,true);
 release();await stopped;assert.equal(h.speechStates.at(-1).active,true);assert.equal(h.speechStates.at(-1).text,'my friend.');endings[0]();await first;assert.equal(h.speechStates.at(-1).active,true);endings[1]();await second;assert.equal(h.speechStates.at(-1).active,false);
});

test('daily learning continues across categories and never reopens the completed context',async()=>{
 const h=harness();await h.controller.open('en');await h.cb.task('fresh');for(let i=0;i<3;i++){assert.equal(h.ui.entry.id,data.entries[i].id);await h.cb.recall();await h.cb.choice(data.entries[i].meaning);await h.cb.next();}
 assert.equal(h.ui.online,false);assert.equal(h.ui.progress.remaining,1);await h.cb.contextChoice(data.entries[0].context.answer);await h.cb.next();assert.ok(h.ui.row.plan.contextDone);assert.equal(h.ui.row.plan.completed.length,3);assert.equal(h.awards.length,4);
 await h.cb.task('context');assert.ok(h.ui.row.plan.contextDone);assert.equal(h.awards.length,4);
});
test('doing context first continues into unfinished word tasks',async()=>{
 const h=harness();await h.controller.open('en');await h.cb.task('context');await h.cb.contextChoice(data.entries[0].context.answer);await h.cb.next();assert.equal(h.ui.entry.id,'hello');assert.equal(h.ui.progress.completed,1);
});

test('a fabricated quoted target falls back without rewarding or marking the answer wrong',async()=>{
 let call=0;const h=harness({owner:'test',judge:async()=>++call===1?{entryId:'hello',question:'请用 hello 向朋友问好。'}:{entryId:'hello',correct:true,evidence:'hello',feedback:'通过'}});await h.controller.open('en');await h.cb.task('context');await h.cb.contextAnswer('shelloworld');assert.equal(h.ui.online,false);assert.equal(h.ui.draft,'shelloworld');assert.equal(h.awards.length,0);assert.equal(h.row.languages.en.entries.hello?.errors,undefined);
});

test('learner can replace a pending tutor response with local help without a late overwrite',async()=>{
 let resolve,signal;const h=harness({owner:'test',judge:(messages,s)=>{signal=s;return new Promise(r=>resolve=r);}});await h.controller.open('en','hello');const pending=h.cb.tutor('帮我记住它');await new Promise(r=>setTimeout(r,0));h.cb.tutorFallback();assert.equal(signal.aborted,true);assert.equal(h.tutors.at(-1).requested,true);const count=h.tutors.length;resolve({entryId:'hello',reply:'迟到',example:'',translation:'',question:''});await pending;assert.equal(h.tutors.length,count);assert.equal(h.awards.length,0);
});

test('reopening a word after a hint still schedules a next-day revisit',async()=>{
 const h=harness();await h.controller.open('en');h.row.languages.en.entries.hello={learned:true,stage:2,reviews:2,completedDay:'2026-10-15',nextReviewAt:now};await h.cb.entry('hello');await h.cb.hint();await h.cb.home();await h.cb.entry('hello');await h.cb.choice('你好');assert.equal(h.row.languages.en.entries.hello.stage,0);assert.equal(h.row.languages.en.entries.hello.lastResult.hinted,true);
});

test('repeat practice can request earlier review while the daily reward remains single',async()=>{
 const h=harness();await h.controller.open('en');h.row.languages.en.entries.hello={learned:true,stage:2,reviews:2,completedDay:'2026-10-15',nextReviewAt:now};await h.cb.home();await h.cb.entry('hello');await h.cb.choice('你好');assert.equal(h.row.languages.en.entries.hello.stage,3);await h.cb.home();await h.cb.entry('hello');await h.cb.hint();await h.cb.spell('hello');assert.equal(h.row.languages.en.entries.hello.stage,0);assert.equal(h.awards.length,1);
});

test('voice input appends to the draft and finishing does not submit or reward',async()=>{
 let partial,starts=0,finishes=0;const h=harness({owner:'test',judge:async()=>({entryId:'hello',question:'请用 hello 向朋友打招呼。'}),voiceExtras:{start:async(signal,options)=>{starts++;partial=options.onPartial;},finish:async()=>{finishes++;return 'my friend.';}}});await h.controller.open('en');await h.cb.task('context');h.cb.contextDraft('Hello,');let text;const accept=value=>{text=value;h.cb.contextDraft(value);};await h.cb.finishRecording();assert.equal(finishes,0);await h.cb.record(accept);await h.cb.record(accept);assert.equal(starts,1);partial('my');assert.equal(text,'Hello, my');await h.cb.finishRecording();assert.equal(text,'Hello, my friend.');assert.equal(finishes,1);assert.equal(h.awards.length,0);
});
test('switching to text invalidates late microphone startup and partial results',async()=>{
 let ready,partial;const h=harness({owner:'test',judge:async()=>({entryId:'hello',question:'请用 hello 向朋友打招呼。'}),voiceExtras:{start:(signal,options)=>{partial=options.onPartial;return new Promise(r=>ready=r);}}});await h.controller.open('en');await h.cb.task('context');let text='original';const pending=h.cb.record(value=>text=value);await new Promise(r=>setTimeout(r,0));await h.cb.cancelRecording();partial('late');ready();await pending;assert.equal(text,'original');assert.equal(h.awards.length,0);assert.match(h.messages.at(-1),/继续输入文字/);
});

test('suspending recording ignores late partials and allows a fresh recording',async()=>{
 const partials=[];let starts=0;const h=harness({owner:'test',judge:async()=>({entryId:'hello',question:'请用 hello 向朋友打招呼。'}),voiceExtras:{start:async(signal,options)=>{starts++;partials.push(options.onPartial);}}});await h.controller.open('en');await h.cb.task('context');let text='';await h.cb.record(value=>text=value);h.controller.suspend();partials[0]('late');assert.equal(text,'');await h.cb.record(value=>text=value);assert.equal(starts,2);partials[1]('Hello');assert.equal(text,'Hello');assert.equal(h.awards.length,0);
});
test('suspending playback allows replay and ignores the old playback failure',async()=>{
 const requests=[];const h=harness({speak:()=>new Promise((resolve,reject)=>requests.push({resolve,reject}))});await h.controller.open('en','hello');const first=h.cb.speak();h.controller.suspend();const second=h.cb.speak();assert.equal(requests.length,2);requests[0].reject(Error('old playback'));requests[1].resolve();await Promise.all([first,second]);assert.equal(h.messages.some(m=>m.includes('发音暂不可用')),false);assert.equal(h.awards.length,0);
});

test('invalid generated question gets one correction before fallback, never an award',async()=>{
 let calls=0;const h=harness({owner:'test',judge:async()=>++calls===1?{entryId:'hello',question:'请用目标字词向朋友问好。'}:{entryId:'hello',question:'请用 Hello 向朋友问好。'}});
 await h.controller.open('en');await h.cb.task('context');assert.equal(calls,2);assert.equal(h.ui.online,true);assert.equal(h.row.languages.en.plan.question,'请用 Hello 向朋友问好。');assert.equal(h.awards.length,0);
 await h.cb.home();await h.cb.task('context');assert.equal(calls,2);
 const failed=harness({owner:'test',judge:async()=>{calls++;return {entryId:'wrong',question:'请用 hello 问好。'};}});await failed.controller.open('en');await failed.cb.task('context');assert.equal(calls,4);assert.equal(failed.ui.online,false);assert.equal(failed.awards.length,0);
});

test('closing during a question correction ignores its late result',async()=>{
 let calls=0,resolve;const h=harness({owner:'test',judge:async()=>++calls===1?{entryId:'hello',question:'请用目标字词问好。'}:new Promise(r=>resolve=r)});
 await h.controller.open('en');const pending=h.cb.task('context');await new Promise(r=>setTimeout(r,0));assert.equal(calls,2);h.controller.close();resolve({entryId:'hello',question:'请用 hello 向朋友问好。'});await pending;assert.equal(h.row.languages.en.plan.question,undefined);assert.equal(h.awards.length,0);
});

test('answering the visible choice question cancels generation and preserves retries across reopening',async()=>{
 let resolve,signal,calls=0;const h=harness({owner:'test',judge:(_messages,s)=>{calls++;signal=s;return new Promise(r=>resolve=r);}});
 await h.controller.open('en');const pending=h.cb.task('context');await new Promise(r=>setTimeout(r,0));
 const initial=h.ui;await h.cb.contextChoice(data.entries[0].context.distractors[0].text);assert.equal(signal.aborted,true);assert.equal(h.awards.length,0);
 resolve({entryId:'hello',question:'请用 hello 向朋友问好。'});await pending;assert.equal(h.ui,initial);assert.equal(h.row.languages.en.plan.question,undefined);assert.equal(h.row.languages.en.plan.contextMode,'local');
 await h.cb.home();await h.cb.task('context');assert.equal(calls,1);assert.equal(h.ui.online,false);await h.cb.contextChoice(data.entries[0].context.answer);assert.equal(h.awards.length,1);
});

test('a correct visible choice cannot be replaced by a late generated question',async()=>{
 let resolve;const h=harness({owner:'test',judge:()=>new Promise(r=>resolve=r)});await h.controller.open('en');const pending=h.cb.task('context');await new Promise(r=>setTimeout(r,0));await h.cb.contextChoice(data.entries[0].context.answer);assert.equal(h.awards.length,1);resolve({entryId:'hello',question:'请用 hello 向朋友问好。'});await pending;assert.equal(h.row.languages.en.plan.question,undefined);assert.equal(h.row.languages.en.plan.contextDone,true);assert.equal(h.awards.length,1);
});

test('another tab choosing the local task wins over pending generation',async()=>{
 let resolve;const h=harness({owner:'test',judge:()=>new Promise(r=>resolve=r)});await h.controller.open('en');const pending=h.cb.task('context');await new Promise(r=>setTimeout(r,0));h.row.languages.en.plan.contextMode='local';resolve({entryId:'hello',question:'请用 hello 向朋友问好。'});await pending;assert.equal(h.row.languages.en.plan.question,undefined);assert.equal(h.ui.online,false);assert.equal(h.awards.length,0);
});

test('tutor reads only validated examples from this entry and never grants a reward',async()=>{
 const spoken=[];const h=harness({owner:'test',speak:async(...args)=>spoken.push(args),judge:async()=>({entryId:'hello',reply:'向朋友打招呼。',example:'Hello, Sam!',translation:'你好，山姆！',question:''})});
 await h.controller.open('en','hello');await h.cb.tutorSpeak('Hello, Sam!');assert.equal(spoken.length,0);await h.cb.tutor('举个例子');await h.cb.tutorSpeak('Hello, Sam!');assert.equal(spoken.length,1);assert.equal(spoken[0][0],'Hello, Sam!');assert.equal(spoken[0][1],'en');await h.cb.tutorSpeak('arbitrary text');assert.equal(spoken.length,1);assert.equal(h.awards.length,0);
 await h.cb.entry('goodbye');await h.cb.tutorSpeak('Hello, Sam!');assert.equal(spoken.length,1);
});

test('tutor example playback can stop and a late failure does not overwrite the next playback',async()=>{
 const requests=[];const h=harness({speak:()=>new Promise((resolve,reject)=>requests.push({resolve,reject}))});await h.controller.open('en','hello');await h.cb.tutor('举例');const example=data.entries[0].example;
 const first=h.cb.tutorSpeak(example);await h.cb.stopSpeech();const second=h.cb.tutorSpeak(example);assert.equal(requests.length,2);requests[0].reject(Error('old'));requests[1].resolve();await Promise.all([first,second]);assert.equal(h.messages.some(m=>m.includes('发音暂不可用')),false);assert.equal(h.awards.length,0);
});

test('Chinese tutor examples use Chinese speech without granting practice credit',async()=>{
 const zh=JSON.parse(fs.readFileSync(new URL('../data/adventure/dictionary/zh.json',import.meta.url))),spoken=[];
 const h=harness({dictionary:zh,speak:async(...args)=>spoken.push(args)});await h.controller.open('zh','ri');await h.cb.tutor('举例');await h.cb.tutorSpeak(zh.entries.find(e=>e.id==='ri').example);assert.equal(spoken.length,1);assert.equal(spoken[0][1],'zh-CN');assert.equal(h.awards.length,0);assert.equal(h.row.languages.zh.entries.ri.learned,undefined);
});

test('tutor practice is deliberate and can return to explanations without losing dialogue',async()=>{
 const requests=[];const h=harness({owner:'test',judge:async messages=>{requests.push(JSON.parse(messages[1].content));return {entryId:'hello',reply:'hello表示问好。',example:'Hello!',translation:'你好！',question:'请向朋友问好。'};}});
 await h.controller.open('en','hello');await h.cb.tutor('什么意思？');assert.equal(h.tutors.at(-1).question,'');assert.equal(requests.at(-1).interaction,'explain');
 await h.cb.tutor('陪我练习造句','practice');assert.equal(h.tutors.at(-1).question,'请向朋友问好。');await h.cb.tutor('Hello, friend.');assert.equal(requests.at(-1).interaction,'practice');assert.ok(requests.at(-1).conversation.length>0);
 await h.cb.tutor('别再让我自己造句了，先解释一下');assert.equal(requests.at(-1).interaction,'explain');assert.equal(h.tutors.at(-1).question,'');assert.equal(h.awards.length,0);
 await h.cb.tutor('考考我');assert.equal(requests.at(-1).interaction,'practice');await h.cb.tutor('举个生活中的例子','explain');assert.equal(h.tutors.at(-1).question,'');
});

test('Chinese review completes meaning once, then requires writing without regrading disabled choices',async()=>{
 const zh=JSON.parse(fs.readFileSync(new URL('../data/adventure/dictionary/zh.json',import.meta.url))),e=zh.entries.find(e=>e.id==='ri'),h=harness({dictionary:zh});await h.controller.open('zh');h.row.languages.zh.entries.ri={learned:true,stage:0,reviews:1};await h.cb.home();await h.cb.entry('ri');assert.equal(h.ui.mode,'meaning-write');
 const points=e.strokes.medians.map(stroke=>stroke.map(([x,y])=>[x/1024,(900-y)/1024]));await h.cb.write(points);assert.equal(h.awards.length,0);assert.match(h.messages.at(-1),/先选出正确词义/);
 await h.cb.choice(e.meaning);assert.ok(h.messages.includes('meaningAccepted'));assert.equal(h.awards.length,0);await h.cb.choice('错误');assert.equal(h.row.languages.zh.entries.ri.errors||0,0);await h.cb.write(points);assert.equal(h.awards.length,1);assert.equal(h.row.languages.zh.entries.ri.lastResult.errors,0);
});

test('online tutor retry keeps the original question and mode without granting progress',async()=>{
 const requests=[];let calls=0;const h=harness({owner:'test',judge:async messages=>{requests.push(JSON.parse(messages[1].content));if(++calls===1)throw Error('temporary failure');return {entryId:'hello',reply:'试着问好。',example:'Hello!',translation:'你好！',question:'向朋友问好吧。'};}});
 await h.controller.open('en','hello');await h.cb.tutor('陪我练习造句','practice');assert.equal(h.tutors.at(-1).canRetry,true);assert.equal(h.tutors.at(-1).local,true);await h.cb.tutorRetry();assert.equal(requests[1].question,requests[0].question);assert.equal(requests[1].interaction,'practice');assert.equal(h.tutors.at(-1).local,false);assert.equal(h.tutors.at(-1).canRetry,false);await h.cb.tutorRetry();assert.equal(calls,2);assert.equal(h.awards.length,0);
});

test('guest tutor fallback cannot retry online and retry requests cannot run twice or survive close',async()=>{
 const guest=harness();await guest.controller.open('en','hello');await guest.cb.tutor('怎么用');assert.equal(guest.tutors.at(-1).canRetry,false);await guest.cb.tutorRetry();assert.equal(guest.awards.length,0);
 let calls=0,resolve;const h=harness({owner:'test',judge:async()=>{if(++calls===1)throw Error('offline');return new Promise(r=>resolve=r);}});await h.controller.open('en','hello');await h.cb.tutor('怎么用');const pending=h.cb.tutorRetry();await new Promise(r=>setTimeout(r,0));await h.cb.tutorRetry();assert.equal(calls,2);const count=h.tutors.length;h.controller.close();resolve({entryId:'hello',reply:'迟到回复',example:'',translation:'',question:''});await pending;assert.equal(h.tutors.length,count);assert.equal(h.awards.length,0);
});


test('completed tutor discussion survives recall with the same model context and entry isolation',async()=>{
 const requests=[];const h=harness({owner:'test',judge:async messages=>{requests.push(JSON.parse(messages[1].content));return {entryId:'hello',reply:'见面时可以这样问好。',example:'Hello, friend.',translation:'你好，朋友。',question:'试着向朋友问好？'};}});
 await h.controller.open('en','hello');await h.cb.tutor('陪我练习造句','practice');await h.cb.recall();
 assert.equal(h.ui.tutorHistory.length,2);assert.equal(h.ui.tutorHistory[1].translation,'你好，朋友。');assert.equal(h.ui.tutorMode,'practice');
 await h.cb.tutor('Hello, friend.');assert.match(JSON.stringify(requests[1]),/陪我练习造句/);assert.equal(h.awards.length,0);assert.equal(h.row.languages.en.entries.hello.views,1);
 await h.cb.home();await h.cb.entry('goodbye');assert.equal(h.ui.tutorHistory.length,0);
});


test('empty spelling submissions do not become memory failures or change the review plan',async()=>{
 const h=harness();await h.controller.open('en');h.row.languages.en.entries.hello={learned:true,stage:2,reviews:3,nextReviewAt:now,completedDay:'2026-10-15'};await h.cb.home();await h.cb.entry('hello');assert.equal(h.ui.mode,'spell');
 const before=structuredClone(h.row);for(const input of ['', '   ', '　', '！？'])await h.cb.spell(input);
 assert.deepEqual(h.row,before);assert.equal(h.awards.length,0);assert.match(h.messages.at(-1),/先输入/);
 await h.cb.spell('hello');assert.equal(h.row.languages.en.entries.hello.stage,3);assert.equal(h.row.languages.en.entries.hello.lastResult.errors,0);assert.equal(h.awards.length,1);
});

test('empty handwriting asks for a first stroke without recording an error or hint',async()=>{
 const zh=JSON.parse(fs.readFileSync(new URL('../data/adventure/dictionary/zh.json',import.meta.url)));const h=harness({dictionary:zh});await h.controller.open('zh','ri');const before=structuredClone(h.row);
 await h.cb.write([]);assert.deepEqual(h.row,before);assert.equal(h.awards.length,0);assert.match(h.messages.at(-1),/先在写字区/);
 await h.cb.write([[[0,0],[0.01,0.01]]]);assert.equal(h.row.languages.zh.entries.ri.errors,1);assert.equal(h.awards.length,0);
});


test('localized spelling correction remains a wrong attempt until the learner fixes it',async()=>{
 const h=harness();await h.controller.open('en');h.row.languages.en.entries.hello={learned:true,stage:2,reviews:3,nextReviewAt:now,completedDay:'2026-10-15'};await h.cb.home();await h.cb.entry('hello');
 await h.cb.spell('hllo!');assert.match(h.messages.at(-1),/第 2 个位置少了一个字母/);assert.equal(h.awards.length,0);assert.equal(h.row.languages.en.entries.hello.errors,1);
 await h.cb.spell('hello');assert.equal(h.awards.length,1);assert.equal(h.row.languages.en.entries.hello.stage,0);assert.equal(h.row.languages.en.entries.hello.lastResult.errors,1);
});


test('tutor sees the last submitted spelling, then the correction, without persisting typed answers',async()=>{
 const prompts=[];const h=harness({owner:'test',judge:async messages=>{const p=JSON.parse(messages[1].content);prompts.push(p);return {entryId:p.entryId,reply:'我们看一下刚才的拼写。',example:'',translation:'',question:''};}});
 await h.controller.open('en');h.row.languages.en.entries.hello={learned:true,stage:2,reviews:3,nextReviewAt:now,completedDay:'2026-10-15'};await h.cb.home();await h.cb.entry('hello');
 await h.cb.spell('hllo!');await h.cb.tutor('哪里错了？');assert.deepEqual(prompts.at(-1).practice.lastAttempt,{kind:'spelling',text:'hllo!',correct:false});assert.equal(h.awards.length,0);
 await h.cb.spell('   ');await h.cb.tutor('还有什么建议？');assert.equal(prompts.at(-1).practice.lastAttempt.text,'hllo!');
 await h.cb.spell('Hello!');await h.cb.tutor('现在对了吗？');assert.deepEqual(prompts.at(-1).practice.lastAttempt,{kind:'spelling',text:'Hello!',correct:true});assert.equal(prompts.at(-1).practice.lastFeedback,'');assert.equal(prompts.at(-1).practice.completed,true);assert.equal(h.awards.length,1);
 assert.doesNotMatch(JSON.stringify(h.row),/hllo|"lastAttempt":|Hello!/);
 await h.cb.home();await h.cb.entry('goodbye');await h.cb.tutor('怎么学？');assert.equal(prompts.at(-1).practice.lastAttempt,null);
});

test('tutor receives meaning choices and handwriting summaries, never raw writing coordinates',async()=>{
 let prompt;const zh=JSON.parse(fs.readFileSync(new URL('../data/adventure/dictionary/zh.json',import.meta.url))),h=harness({dictionary:zh,owner:'test',judge:async messages=>{prompt=JSON.parse(messages[1].content);return {entryId:'ri',reply:'先看看这一笔。',example:'',translation:'',question:''};}});
 await h.controller.open('zh','ri');await h.cb.write([[[0,0],[0.01,0.01]]]);await h.cb.tutor('哪里错了？');assert.deepEqual(prompt.practice.lastAttempt,{kind:'writing',correct:false,strokeCount:1,totalStrokes:4});assert.doesNotMatch(JSON.stringify(prompt.practice),/0.01/);
 const en=harness({owner:'test',judge:async messages=>{prompt=JSON.parse(messages[1].content);return {entryId:'hello',reply:'看看见面与告别的区别。',example:'',translation:'',question:''};}});await en.controller.open('en','hello');await en.cb.recall();await en.cb.choice('再见');await en.cb.tutor('为什么？');assert.deepEqual(prompt.practice.lastAttempt,{kind:'meaning',text:'再见',correct:false});
});


test('a bare negative tutor answer falls back to useful authored coaching without rewards',async()=>{
 const h=harness({owner:'test',judge:async()=>({entryId:'hello',reply:'不对哦。',example:'',translation:'',question:''})});await h.controller.open('en','hello');await h.cb.tutor('我哪里错了？');
 assert.equal(h.tutors.at(-1).local,true);assert.equal(h.tutors.at(-1).reply,data.entries[0].coaching.tip);assert.equal(h.tutors.at(-1).canRetry,true);assert.equal(h.awards.length,0);
});


test('tutor display and follow-up context share the cleaned correction',async()=>{
 let prompt;const h=harness({owner:'test',judge:async messages=>{prompt=JSON.parse(messages[1].content);return {entryId:'hello',reply:'不对哦，hello 用在见面时。',example:'Hello!',translation:'你好！',question:''};}});
 await h.controller.open('en','hello');await h.cb.tutor('hello 用在告别时吗？');assert.equal(h.tutors.at(-1).reply,'hello 用在见面时。');assert.equal(h.tutors.at(-1).local,false);
 await h.cb.tutor('明白了');assert.equal(prompt.conversation[1].text,'hello 用在见面时。');assert.equal(h.awards.length,0);
});


test('a new submitted answer cancels stale teaching, ignores its late result and lets the next question use current evidence',async()=>{
 let resolve,signal,calls=0,prompt;const h=harness({owner:'test',judge:async(messages,abort)=>{calls++;prompt=JSON.parse(messages[1].content);if(calls===1){signal=abort;return new Promise(r=>resolve=r);}return {entryId:'hello',reply:'现在拼写正确。',example:'',translation:'',question:''};}});
 await h.controller.open('en');h.row.languages.en.entries.hello={views:0,learned:true,stage:1,reviews:3,nextReviewAt:now};await h.cb.home();await h.cb.entry('hello');await h.cb.spell('hllo');
 const pending=h.cb.tutor('哪里错了？');await new Promise(r=>setTimeout(r,0));await h.cb.spell('   ');assert.equal(signal.aborted,false);await h.cb.spell('hello');assert.equal(signal.aborted,true);assert.ok(h.messages.includes('tutorInterrupted:哪里错了？'));assert.equal(h.awards.length,1);
 resolve({entryId:'hello',reply:'旧答案仍缺字母。',example:'',translation:'',question:''});await pending;assert.equal(h.tutors.some(r=>r?.reply==='旧答案仍缺字母。'),false);assert.equal(calls,1);
 await h.cb.tutor('现在呢？');assert.equal(prompt.practice.lastAttempt.correct,true);assert.equal(h.tutors.at(-1).reply,'现在拼写正确。');assert.equal(h.awards.length,1);
});


test('late wrong-meaning feedback cannot replace the newer Chinese writing step',async()=>{
 let release,delay=false;const zh=JSON.parse(fs.readFileSync(new URL('../data/adventure/dictionary/zh.json',import.meta.url))),e=zh.entries.find(e=>e.id==='ri');
 const h=harness({dictionary:zh,afterUpdate:async()=>{if(delay){delay=false;await new Promise(r=>release=r);}}});await h.controller.open('zh','ri');h.row.languages.zh.entries.ri.learned=true;await h.cb.home();await h.cb.entry('ri');
 delay=true;const pending=h.cb.choice('错误');await new Promise(r=>setTimeout(r,0));await h.cb.choice(e.meaning);const before=[...h.messages];assert.ok(before.includes('meaningAccepted'));release();await pending;
 assert.deepEqual(h.messages,before);assert.equal(h.row.languages.zh.entries.ri.errors,1);assert.equal(h.awards.length,0);
});

test('submissions while a correct answer is saving cannot replace its evidence or add mistakes',async()=>{
 let release,delay=false,prompt;const h=harness({owner:'test',afterUpdate:async()=>{if(delay){delay=false;await new Promise(r=>release=r);}},judge:async messages=>{prompt=JSON.parse(messages[1].content);return {entryId:'hello',reply:'这次作答正确。',example:'',translation:'',question:''};}});
 await h.controller.open('en','hello');await h.cb.recall();delay=true;const pending=h.cb.choice('你好');await new Promise(r=>setTimeout(r,0));await h.cb.choice('错误');await h.cb.spell('hllo');release();await pending;
 await h.cb.tutor('现在对了吗？');assert.deepEqual(prompt.practice.lastAttempt,{kind:'meaning',text:'你好',correct:true});assert.equal(h.row.languages.en.entries.hello.errors,undefined);assert.equal(h.awards.length,1);
});


test('dictionary tick waits safely for the first daily plan to load',async()=>{
 let release,entered;const started=new Promise(r=>entered=r);
 const h=harness({beforeUpdate:async()=>{entered();await new Promise(r=>release=r);}});
 assert.doesNotThrow(()=>h.controller.tick());
 const pending=h.controller.open('en');await started;
 try{assert.doesNotThrow(()=>h.controller.tick());assert.equal(h.ui,undefined);}
 finally{release();await pending;}
 assert.equal(h.ui.row.plan.day,'2026-10-16');assert.doesNotThrow(()=>h.controller.tick());assert.equal(h.awards.length,0);
});

test('dictionary tick tolerates null or missing plans while switching languages',async()=>{
 const zh=JSON.parse(fs.readFileSync(new URL('../data/adventure/dictionary/zh.json',import.meta.url)));
 for(const [from,to] of [['en','zh'],['zh','en']]){
  let delay=false,release,entered,updates=0;const started=new Promise(r=>entered=r);
  const h=harness({dictionaries:{en:data,zh},beforeUpdate:async()=>{updates++;if(delay){entered();await new Promise(r=>release=r);}}});
  await h.controller.open(from);assert.equal(h.row.languages[to]?.plan??null,null);
  delay=true;const pending=h.cb.language(to);await started;
  try{for(let i=0;i<3;i++)assert.doesNotThrow(()=>h.controller.tick());assert.equal(updates,2);}
  finally{delay=false;release();await pending;}
  assert.equal(h.ui.data.language,to);assert.equal(h.ui.row.plan.day,'2026-10-16');
  assert.doesNotThrow(()=>h.controller.tick());assert.equal(h.awards.length,0);assert.deepEqual(h.messages,[]);
 }
});

test('dictionary tick refreshes an expired daily plan once and still closes on role changes',async()=>{
 let time=now,delay=false,release,entered,refreshed,loads=0;
 const started=new Promise(r=>entered=r),shown=new Promise(r=>refreshed=r);
 const h=harness({clock:()=>time,beforeLoad:async()=>{loads++;},beforeUpdate:async()=>{if(delay){entered();await new Promise(r=>release=r);}},viewExtras:{home:value=>{if(value.row.plan.day==='2026-10-17')refreshed(value);}}});
 await h.controller.open('en');h.controller.tick();assert.equal(loads,1);
 time+=86400000;delay=true;h.controller.tick();await started;
 try{for(let i=0;i<3;i++)h.controller.tick();assert.equal(loads,2);}
 finally{delay=false;release();}
 const home=await shown;assert.equal(home.row.plan.day,'2026-10-17');assert.equal(h.awards.length,0);
 h.state.role='other';h.controller.tick();assert.equal(h.controller.active,false);assert.doesNotThrow(()=>h.controller.tick());
});

test('a delayed entry write stays with the language where the page was opened',async()=>{
 let release,delay=false;const zh=JSON.parse(fs.readFileSync(new URL('../data/adventure/dictionary/zh.json',import.meta.url)));const h=harness({dictionaries:{en:data,zh},beforeUpdate:async()=>{if(delay){delay=false;await new Promise(r=>release=r);}}});
 await h.controller.open('en');delay=true;const pending=h.cb.entry('hello');await new Promise(r=>setTimeout(r,0));await h.cb.language('zh');release();await pending;
 assert.equal(h.row.languages.en.entries.hello.views,1);assert.equal(h.row.languages.zh.entries.hello,undefined);assert.equal(h.ui.data.language,'zh');assert.equal(h.ui.entry,undefined);
});

test('a delayed daily task cannot open a word after switching languages',async()=>{
 let release,delay=false;const zh=JSON.parse(fs.readFileSync(new URL('../data/adventure/dictionary/zh.json',import.meta.url)));const h=harness({dictionaries:{en:data,zh},beforeUpdate:async()=>{if(delay){delay=false;await new Promise(r=>release=r);}}});
 await h.controller.open('en');delay=true;const pending=h.cb.task('fresh');await new Promise(r=>setTimeout(r,0));await h.cb.language('zh');release();await pending;
 assert.equal(h.ui.data.language,'zh');assert.equal(h.ui.entry,undefined);assert.equal(Object.keys(h.row.languages.zh.entries).length,0);
});

test('an old completion cannot unlock submissions while the new word is saving',async()=>{
 const releases=[];let delay=false;const h=harness({afterUpdate:async()=>{if(delay){delay=false;await new Promise(r=>releases.push(r));}}});
 await h.controller.open('en','hello');await h.cb.recall();delay=true;const old=h.cb.choice('你好');await new Promise(r=>setTimeout(r,0));
 await h.cb.home();await h.cb.entry('goodbye');await h.cb.recall();delay=true;const current=h.cb.choice(data.entries.find(e=>e.id==='goodbye').meaning);await new Promise(r=>setTimeout(r,0));
 releases[0]();await old;await h.cb.choice('错误');assert.equal(h.row.languages.en.entries.goodbye.errors,undefined);releases[1]();await current;assert.equal(h.awards.length,1);
});


test('clicking the still-visible word while another language loads keeps matching content and language',async()=>{
 let release;const zh=JSON.parse(fs.readFileSync(new URL('../data/adventure/dictionary/zh.json',import.meta.url)));const h=harness({dictionaries:{en:data,zh},beforeLoad:async lang=>{if(lang==='zh')await new Promise(r=>release=r);}});
 await h.controller.open('en');const pending=h.cb.language('zh');await new Promise(r=>setTimeout(r,0));await h.cb.entry('hello');release();await pending;
 assert.equal(h.ui.data.language,'en');assert.equal(h.ui.entry.id,'hello');assert.equal(h.row.languages.en.entries.hello.views,1);assert.equal(h.row.languages.zh.entries.hello,undefined);
});


test('dictionary home shares actual attribute allocations and existing milestone claims',async()=>{
 const h=harness();h.state.save.dailyLanguageBuff={day:'2026-10-16',counts:{hp:2,attack:2,defense:1,powerPip:0},events:['speech:1','speech:2','speech:3','speech:4','speech:5']};await h.controller.open('en');
 assert.deepEqual(h.ui.bonuses,{hp:2,attack:2,defense:1,powerPip:0});assert.equal(h.ui.rewardStatus.count,5);assert.equal(h.ui.rewardStatus.rewards[0].ready,true);assert.equal(h.ui.rewardStatus.rewards[1].target,10);assert.equal(h.awards.length,0);
 h.state.save.languageSpeechClaims={day:'2026-10-16',claimed:[0]};await h.cb.home();assert.equal(h.ui.rewardStatus.rewards[0].claimed,true);assert.equal(h.ui.rewardStatus.rewards[0].ready,false);assert.equal(h.ui.rewardStatus.rewards.find(r=>!r.claimed).target,10);
});


test('meaning and spelling corrections are shown beside the exercise without repeating in the top notice',async()=>{
 const feedback=[],h=harness({viewExtras:{practiceFeedback:text=>feedback.push(text)}});
 await h.controller.open('en','hello');await h.cb.recall();await h.cb.choice('再见');
 assert.match(feedback.at(-1),/再看看/);assert.equal(h.messages.at(-1),'');assert.equal(h.awards.length,0);
 await h.cb.choice('你好');assert.equal(feedback.at(-1),'');assert.equal(h.awards.length,1);
 await h.cb.home();await h.cb.entry('hello');await h.cb.spell('hllo');
 assert.match(feedback.at(-1),/第 2 个位置/);assert.equal(h.messages.at(-1),'');
 await h.cb.spell('hello');assert.equal(feedback.at(-1),'');assert.equal(h.awards.length,1);
});


test('one-click mistake explanation uses the actual confusing entries and never completes practice',async()=>{
 const prompts=[],h=harness({owner:'test',judge:async messages=>{const prompt=JSON.parse(messages[1].content);prompts.push(prompt);return {entryId:'hello',reply:'见面用 hello，告别用 goodbye。',example:'',translation:'',question:''};}});
 await h.controller.open('en','hello');await h.cb.explainAttempt();assert.equal(prompts.length,0);
 await h.cb.recall();await h.cb.choice('再见');await h.cb.explainAttempt();
 assert.equal(prompts.length,1);assert.equal(prompts[0].practice.lastAttempt.text,'再见');assert.match(JSON.stringify(prompts[0].reference.comparisons),/goodbye/);assert.equal(prompts[0].interaction,'explain');assert.equal(h.awards.length,0);
 await h.cb.choice('你好');assert.equal(h.row.languages.en.entries.hello.lastResult.hinted,true);await h.cb.explainAttempt();assert.equal(prompts.length,1);
 await h.cb.home();await h.cb.entry('hello');await h.cb.spell('hllo');await h.cb.explainAttempt();assert.equal(prompts[1].practice.lastAttempt.text,'hllo');assert.equal(h.awards.length,1);
});


test('Chinese mistaken meanings can ask for a comparison without completing handwriting',async()=>{
 const zh=JSON.parse(fs.readFileSync(new URL('../data/adventure/dictionary/zh.json',import.meta.url))),entry=zh.entries.find(e=>e.id==='ri'),other=zh.entries.find(e=>e.id==='yue');let prompt;
 const h=harness({dictionary:zh,owner:'test',judge:async messages=>{prompt=JSON.parse(messages[1].content);return {entryId:'ri',reply:'日是太阳，月是月亮。',example:'',translation:'',question:''};}});
 await h.controller.open('zh');h.row.languages.zh.entries.ri={learned:true,stage:0,reviews:1};await h.cb.entry('ri');await h.cb.choice(other.meaning);await h.cb.explainAttempt();
 assert.equal(prompt.practice.lastAttempt.text,other.meaning);assert.match(JSON.stringify(prompt.reference.comparisons),/月/);assert.equal(h.awards.length,0);await h.cb.choice(entry.meaning);assert.equal(h.awards.length,0);assert.ok(h.messages.includes('meaningAccepted'));
});


test('retry replaces the local fallback in restored conversation rather than duplicating the question',async()=>{
 let calls=0;const h=harness({owner:'test',judge:async()=>{if(++calls<=2)throw Error('offline');return {entryId:'hello',reply:'最新在线解释',example:'Hello!',translation:'你好！',question:''};}});
 await h.controller.open('en','hello');await h.cb.tutor('怎么问好');await h.cb.tutorRetry();await h.cb.tutorRetry();
 await h.cb.home();await h.cb.entry('hello');assert.equal(h.ui.tutorHistory.length,2);assert.equal(h.ui.tutorHistory[0].text,'怎么问好');assert.equal(h.ui.tutorHistory[1].reply,'最新在线解释');assert.equal(h.awards.length,0);
});


test('malformed teaching output gets one format correction without duplicate questions, hints or rewards',async()=>{
 const requests=[],repairs=[];let calls=0;
 const h=harness({owner:'test',viewExtras:{tutorRepairing:()=>repairs.push(true)},judge:async messages=>{requests.push(structuredClone(messages));return ++calls===1?'broken JSON':JSON.stringify({entryId:'hello',reply:'完整讲解',example:'Hello!',translation:'你好！',question:''});}});
 await h.controller.open('en','hello');await h.cb.recall();await h.cb.tutor('怎么用');assert.equal(calls,2);assert.equal(repairs.length,1);assert.equal(h.tutors.at(-1).local,false);assert.equal(h.row.languages.en.entries.hello.hints,1);assert.equal(h.awards.length,0);assert.equal(requests[1].length,requests[0].length+1);assert.ok(!JSON.stringify(requests[1]).includes('broken JSON'));
 await h.cb.home();await h.cb.entry('hello');assert.equal(h.ui.tutorHistory.length,2);assert.equal(h.ui.tutorHistory[1].reply,'完整讲解');
});

test('repair stops after a second invalid response and does not retry network failures',async()=>{
 for(const network of [true,false]){let calls=0;const h=harness({owner:'test',judge:async()=>{calls++;if(network)throw Error('network');return {};}});await h.controller.open('en','hello');await h.cb.tutor('怎么用');assert.equal(calls,network?1:2);assert.equal(h.tutors.at(-1).local,true);assert.equal(h.awards.length,0);}
});


test('leaving, answering or choosing local explanation during format repair discards late replies',async()=>{
 for(const action of ['home','answer','local']){
  let finish,calls=0,oldPreview;const h=harness({owner:'test',judge:async(messages,signal,options)=>{if(++calls===1){oldPreview=options.onReply;return 'bad JSON';}return new Promise(r=>finish=r);}});
  await h.controller.open('en','hello');await h.cb.recall();const pending=h.cb.tutor('怎么用');await new Promise(r=>setTimeout(r,0));assert.equal(calls,2);const before=h.messages.length;oldPreview('旧请求预览');assert.equal(h.messages.length,before);
  if(action==='home')await h.cb.home();else if(action==='answer')await h.cb.choice('错误');else h.cb.tutorFallback();
  finish({entryId:'hello',reply:'迟到修复',example:'',translation:'',question:''});await pending;assert.ok(!h.tutors.some(v=>v?.reply==='迟到修复'));assert.equal(h.awards.length,0);
 }
});


test('closing as repair is announced prevents even starting its second request',async()=>{
 let calls=0,h;h=harness({owner:'test',viewExtras:{tutorRepairing:()=>h.controller.close()},judge:async()=>{calls++;return {};}});await h.controller.open('en','hello');await h.cb.tutor('怎么用');assert.equal(calls,1);assert.equal(h.tutors.filter(v=>typeof v==='object').length,0);
});

test('explicit example explanation survives offline and online paths without completing practice',async()=>{
 const {exampleTutorQuestion}=await import('../js/dictionary_tutor_core.js');const entry=data.entries[0],question=exampleTutorQuestion(entry);
 for(const online of [false,true]){
  let request;const h=harness({owner:online?'owner':null,judge:async messages=>{request=JSON.parse(messages[1].content);return {entryId:entry.id,reply:'先说 Hello，向朋友打招呼。',example:entry.example,translation:entry.translation,question:''};}});
  await h.controller.open('en',entry.id);await h.cb.tutor(question,'explain');
  const reply=h.tutors.at(-1);assert.equal(reply.local,!online);assert.equal(reply.question,'');assert.equal(h.awards.length,0);
  if(online){assert.equal(request.question,question);assert.deepEqual(request.reference.exampleChunks,entry.exampleChunks);}else assert.match(reply.reply,/Hello/);
  await h.cb.home();await h.cb.entry(entry.id);assert.equal(h.ui.tutorHistory.at(-1).reply,reply.reply);assert.equal(h.ui.phase,'learn');
 }
});

test('writing feedback stays by the canvas while persistence warnings remain separate',async()=>{
 const zh=JSON.parse(fs.readFileSync(new URL('../data/adventure/dictionary/zh.json',import.meta.url))),e=zh.entries.find(e=>e.id==='ri');
 for(const persisted of [true,false]){
  const feedback=[],h=harness({dictionary:zh,persisted,viewExtras:{writingFeedback:value=>feedback.push(value)}});await h.controller.open('zh','ri');
  const before=structuredClone(h.row);await h.cb.write([]);assert.deepEqual(h.row,before);assert.match(feedback.at(-1).message,/先在写字区/);assert.equal(feedback.at(-1).fromStroke,null);
  const points=e.strokes.medians.map(row=>row.map(([x,y])=>[x/1024,(900-y)/1024]));points[2].reverse();await h.cb.write(points);
  assert.equal(feedback.at(-1).fromStroke,2);assert.match(feedback.at(-1).message,/第 3 笔/);assert.doesNotMatch(h.messages.at(-1),/第 3 笔|先在写字区/);
  if(persisted)assert.equal(h.messages.at(-1),'');else assert.match(h.messages.at(-1),/本地记录未能保存/);
  assert.equal(h.awards.length,0);
 }
});

test('offline and failed online comparisons retain the explicitly requested second word',async()=>{
 for(const owner of [null,'owner']){
  const h=harness({owner});await h.controller.open('en','home');await h.cb.tutor('home 和 family 有什么区别？');const answer=h.tutors.at(-1);assert.equal(answer.local,true);assert.ok(answer.comparisonExamples.some(item=>item.example===data.entries.find(e=>e.id==='family').example));assert.equal(answer.question,'');assert.equal(h.awards.length,0);
  await h.cb.home();await h.cb.entry('home');assert.equal(h.ui.tutorHistory.at(-1).reply,answer.reply);
 }
});

test('comparison examples can be spoken before and after return, without admitting arbitrary text',async()=>{
 const heard=[],h=harness({speak:async text=>heard.push(text)});await h.controller.open('en','home');await h.cb.tutor('home 和 family 有什么区别？');
 const examples=h.tutors.at(-1).comparisonExamples;assert.equal(examples.length,2);
 for(const sample of examples)await h.cb.tutorSpeak(sample.example);assert.deepEqual(heard,examples.map(item=>item.example));
 await h.cb.tutorSpeak('This text was never shown.');assert.equal(heard.length,2);
 await h.cb.home();await h.cb.entry('home');for(const sample of examples)await h.cb.tutorSpeak(sample.example);assert.equal(heard.length,4);assert.equal(h.awards.length,0);
});

test('brief help in practice becomes explanation for offline and online teachers',async()=>{
 for(const owner of [null,'owner']){
  const prompts=[],h=harness({owner,judge:async messages=>{const p=JSON.parse(messages[1].content);prompts.push(p);return {entryId:'hello',reply:'可以先说 Hello，向朋友问好。',example:'Hello!',translation:'你好！',question:'你也试试？'};}});
  await h.controller.open('en','hello');await h.cb.tutor('陪我练习造句');assert.ok(h.tutors.at(-1).question);
  await h.cb.tutor('不知道');assert.equal(h.tutors.at(-1).question,'');if(owner)assert.equal(prompts.at(-1).practice.interaction,'explain');assert.equal(h.awards.length,0);
  await h.cb.home();await h.cb.entry('hello');assert.equal(h.ui.tutorMode,'explain');await h.cb.tutor('我想练习');assert.ok(h.tutors.at(-1).question);
 }
});

test('speech preparation switches only on playback notification and stale callbacks cannot revive it',async()=>{
 const events=[],requests=[],h=harness({viewExtras:{speechState:(active,text,phase)=>events.push({active,text,phase})},speak:(text,locale,signal,character,options)=>new Promise(resolve=>requests.push({options,resolve}))});
 await h.controller.open('en','hello');const first=h.cb.speak();await new Promise(resolve=>setImmediate(resolve));assert.equal(events.at(-1).phase,'preparing');requests[0].options.onPlaying();assert.equal(events.at(-1).phase,'playing');await h.cb.stopSpeech();const count=events.length;requests[0].options.onPlaying();assert.equal(events.length,count);requests[0].resolve();await first;
 const next=h.cb.speakExample();await new Promise(resolve=>setImmediate(resolve));await h.cb.home();const before=events.length;requests[1].options.onPlaying();assert.equal(events.length,before);requests[1].resolve();await next;assert.equal(h.awards.length,0);
});


test('Chinese spelling answers need learner correction before any reward',async()=>{
 const feedback=[];const h=harness({viewExtras:{practiceFeedback:text=>feedback.push(text)}});await h.controller.open('en');h.row.languages.en.entries.hello={learned:true,stage:2,reviews:3,nextReviewAt:now,completedDay:'2026-10-15'};await h.cb.home();await h.cb.entry('hello');
 await h.cb.spell('你好');assert.match(feedback.at(-1),/英文单词，不是中文意思/);assert.equal(h.awards.length,0);
 await h.cb.spell('he好');assert.match(feedback.at(-1),/混入了汉字/);assert.equal(h.awards.length,0);
 await h.cb.spell('hello');assert.equal(h.awards.length,1);assert.equal(h.row.languages.en.entries.hello.lastResult.errors,2);assert.equal(h.row.languages.en.entries.hello.stage,0);
});


test('editing handwriting suppresses a delayed verdict without erasing the submitted mistake',async()=>{
 let release,delay=false;const feedback=[],zh=JSON.parse(fs.readFileSync(new URL('../data/adventure/dictionary/zh.json',import.meta.url)));
 const h=harness({dictionary:zh,viewExtras:{writingFeedback:value=>feedback.push(value)},afterUpdate:async()=>{if(delay){delay=false;await new Promise(r=>release=r);}}});await h.controller.open('zh','ri');delay=true;const pending=h.cb.write([[[0,0],[0.01,0.01]]]);await new Promise(r=>setTimeout(r,0));h.cb.writeDraftChanged?.();release();await pending;
 assert.equal(feedback.length,0);assert.equal(h.row.languages.zh.entries.ri.errors,1);assert.equal(h.awards.length,0);
 await h.cb.write([[[0,0],[0.01,0.01]]]);assert.equal(feedback.length,1);assert.equal(h.row.languages.zh.entries.ri.errors,2);
});


test('editing spelling suppresses late correction while retaining errors and requiring submission',async()=>{
 let release,delay=false;const feedback=[];const h=harness({viewExtras:{practiceFeedback:text=>feedback.push(text)},afterUpdate:async()=>{if(delay){delay=false;await new Promise(r=>release=r);}}});await h.controller.open('en');h.row.languages.en.entries.hello={learned:true,stage:2,reviews:3,nextReviewAt:now,completedDay:'2026-10-15'};await h.cb.entry('hello');
 delay=true;const pending=h.cb.spell('hllo');await new Promise(r=>setTimeout(r,0));h.cb.spellDraftChanged?.();release();await pending;assert.deepEqual(feedback,['']);assert.equal(h.row.languages.en.entries.hello.errors,1);assert.equal(h.awards.length,0);
 await h.cb.spell('hello');assert.equal(h.awards.length,1);assert.equal(h.row.languages.en.entries.hello.lastResult.errors,1);
});


test('missing example translation is repaired once and falls back when still missing',async()=>{
 for(const repaired of [true,false]){let calls=0;const h=harness({owner:'test',judge:async messages=>{calls++;if(calls===2)assert.match(messages.at(-1).content,/中文/);return {entryId:'hello',reply:'见面可以这样说。',example:'Hello, Tom.',translation:repaired&&calls===2?'你好，汤姆。':'',question:''};}});await h.controller.open('en','hello');await h.cb.tutor('给个例子');assert.equal(calls,2);assert.equal(h.tutors.at(-1).local,!repaired);assert.ok(h.tutors.at(-1).translation);assert.equal(h.awards.length,0);}
});


test('teacher audio failure is routed after controls reset and old failures remain silent',async()=>{
 const events=[];let reject,pending=false;const h=harness({viewExtras:{speechState:active=>events.push(['state',active]),tutorSpeechError:(text,message)=>{events.push(['error',text,message]);return true;}},speak:async()=>{if(pending)return new Promise((resolve,r)=>reject=r);throw Error('offline');}});await h.controller.open('en','hello');await h.cb.tutor('举个例子');await h.cb.tutorSpeak('Hello, my friend.');assert.deepEqual(events.at(-2),['state',false]);assert.equal(events.at(-1)[0],'error');assert.equal(events.at(-1)[1],'Hello, my friend.');assert.ok(!h.messages.some(m=>m.includes('发音暂不可用')));assert.equal(h.awards.length,0);
 pending=true;const request=h.cb.tutorSpeak('Hello, my friend.');await new Promise(r=>setTimeout(r,0));await h.cb.stopSpeech();const count=events.length;reject(Error('late'));await request;assert.equal(events.length,count);
});

test('authored word-form examples can be spoken separately after their explanation is shown',async()=>{
 const {formTutorQuestion}=await import('../js/dictionary_tutor_core.js');
 for(const [id,form] of [['child','children'],['write','wrote']]){
  const entry=data.entries.find(e=>e.id===id),sample=entry.formNotes[form],spoken=[],h=harness({speak:async(text,locale)=>spoken.push({text,locale})});
  await h.controller.open('en',id);await h.cb.tutorSpeak(sample.example);assert.equal(spoken.length,0);
  await h.cb.tutor(formTutorQuestion(entry,form),'explain');await h.cb.tutorSpeak(sample.example);assert.deepEqual(spoken,[{text:sample.example,locale:'en'}]);assert.equal(h.awards.length,0);
  await h.cb.home();await h.cb.entry(id);await h.cb.tutorSpeak(sample.example);assert.equal(spoken.length,2);assert.equal(spoken[1].text,sample.example);assert.equal(h.awards.length,0);
 }
});

test('valid English inflections require the requested base form before rewarding',async()=>{
 const feedback=[],h=harness({viewExtras:{practiceFeedback:text=>feedback.push(text)}});await h.controller.open('en');
 h.row.languages.en.entries.child={learned:true,stage:2,reviews:3,nextReviewAt:now,completedDay:'2026-10-15'};await h.cb.entry('child');
 await h.cb.spell('children');assert.match(feedback.at(-1),/另一种词形/);assert.equal(h.awards.length,0);
 await h.cb.tutor('哪里错了？');assert.match(h.tutors.at(-1).reply,/基本形式/);assert.equal(h.awards.length,0);
 await h.cb.spell('child');assert.equal(h.awards.length,1);assert.equal(h.row.languages.en.entries.child.lastResult.errors,1);
});

test('one-click form correction explains the submitted form with an authored example',async()=>{
 for(const [id,form] of [['child','children'],['write','WROTE!']]){
  const heard=[],h=harness({speak:async(...args)=>heard.push(args)}),entry=data.entries.find(e=>e.id===id),key=form.toLowerCase().replace('!','');
  await h.controller.open('en');h.row.languages.en.entries[id]={learned:true,stage:2,reviews:3,nextReviewAt:now};await h.cb.entry(id);
  await h.cb.spell(form);await h.cb.explainAttempt();const reply=h.tutors.at(-1);
  assert.equal(reply.reply,entry.formNotes[key].explanation);assert.equal(reply.example,entry.formNotes[key].example);assert.equal(reply.translation,entry.formNotes[key].translation);assert.equal(reply.question,'');
  await h.cb.tutorSpeak(reply.example);assert.equal(heard.at(-1)[0],reply.example);assert.equal(h.awards.length,0);
  await h.cb.spell(entry.text);assert.equal(h.awards.length,1);assert.equal(h.row.languages.en.entries[id].lastResult.hinted,true);
 }
});

test('online mistake teaching receives the precise form question and actual attempt',async()=>{
 let prompt;const h=harness({owner:'test',judge:async messages=>{prompt=JSON.parse(messages[1].content);return {entryId:'child',reply:'child是单数，children是复数。',example:'Two children.',translation:'两个孩子。',question:''};}});
 await h.controller.open('en');h.row.languages.en.entries.child={learned:true,stage:2,reviews:3,nextReviewAt:now};await h.cb.entry('child');await h.cb.spell('children');await h.cb.explainAttempt();
 assert.match(JSON.stringify(prompt),/我查到.*children.*child.*什么关系/);assert.equal(prompt.practice.lastAttempt.text,'children');assert.equal(prompt.interaction,'explain');assert.equal(h.awards.length,0);
});

test('a valid greeting alternative still needs the reviewed word before a reward',async()=>{
 const feedback=[],h=harness({viewExtras:{practiceFeedback:text=>feedback.push(text)}});await h.controller.open('en');h.row.languages.en.entries.hello={learned:true,stage:2,reviews:3,nextReviewAt:now};await h.cb.entry('hello');
 await h.cb.spell('hi');assert.match(feedback.at(-1),/打招呼/);assert.equal(h.awards.length,0);await h.cb.explainAttempt();assert.match(h.tutors.at(-1).reply,/这次请回忆词页上的单词/);assert.equal(h.awards.length,0);
 await h.cb.spell('hello');assert.equal(h.awards.length,1);assert.equal(h.row.languages.en.entries.hello.lastResult.errors,1);
});

test('Chinese teacher repairs an English translation before publishing or allowing audio',async()=>{
 const zh=JSON.parse(fs.readFileSync(new URL('../data/adventure/dictionary/zh.json',import.meta.url)));let calls=0;const heard=[],h=harness({dictionary:zh,owner:'test',speak:async text=>heard.push(text),judge:async()=>{calls++;return {entryId:'yue',reply:'这里的月表示月份。',example:'一月一日是新年。',translation:calls===1?'January 1st is New Year.':'',question:''};}});
 await h.controller.open('zh','yue');await h.cb.tutor('月份是什么意思？');assert.equal(calls,2);assert.equal(h.tutors.filter(r=>r?.reply).length,1);assert.equal(h.tutors.at(-1).translation,'');await h.cb.tutorSpeak('一月一日是新年。');assert.deepEqual(heard,['一月一日是新年。']);assert.equal(h.awards.length,0);
});

test('requested English examples use English audio on Chinese pages including after returning',async()=>{
 const zh=JSON.parse(fs.readFileSync(new URL('../data/adventure/dictionary/zh.json',import.meta.url)));const heard=[],h=harness({dictionary:zh,owner:'test',speak:async(...args)=>heard.push(args),judge:async()=>({entryId:'yue',reply:'月份可以说month。',example:'a month',translation:'一个月',question:''})});await h.controller.open('zh','yue');await h.cb.tutor('月份英文怎么说？');assert.equal(h.tutors.at(-1).exampleLanguage,'en');await h.cb.tutorSpeak('a month');assert.equal(heard.at(-1)[1],'en');await h.cb.speak();assert.equal(heard.at(-1)[1],'zh-CN');await h.cb.home();await h.cb.entry('yue');await h.cb.tutorSpeak('a month');assert.equal(heard.at(-1)[1],'en');assert.equal(h.awards.length,0);
});

test('English followup on a Chinese entry does not retry or fall back and does not leak into another entry',async()=>{
 const zh=JSON.parse(fs.readFileSync(new URL('../data/adventure/dictionary/zh.json',import.meta.url)));let calls=0;const prompts=[],h=harness({dictionary:zh,owner:'test',judge:async messages=>{calls++;const p=JSON.parse(messages[1].content);prompts.push(p);return {entryId:p.entryId,reply:'月份可以说month。',example:'a month',translation:'一个月',question:''};}});
 await h.controller.open('zh','yue');await h.cb.tutor('月份英文怎么说？');await h.cb.tutor('再简单一点');assert.equal(calls,2);assert.equal(h.tutors.at(-1).local,false);assert.equal(prompts.at(-1).allowEnglishExample,true);
 await h.cb.home();await h.cb.entry('yue');await h.cb.tutor('再举个例子');assert.equal(calls,3);assert.equal(h.tutors.at(-1).exampleLanguage,'en');
 await h.cb.entry('ri');await h.cb.tutor('再举个例子');assert.equal(calls,5);assert.equal(h.tutors.at(-1).local,true);assert.equal(prompts.at(-1).allowEnglishExample,false);assert.equal(h.awards.length,0);
});

test('entry audio failures stay beside audio controls without replacing general notices',async()=>{
 const errors=[],h=harness({viewExtras:{speechError:message=>{errors.push(message);return true;}}});await h.controller.open('en','hello');const before=[...h.messages];await h.cb.speak();assert.match(errors.at(-1),/发音暂不可用/);assert.deepEqual(h.messages,before);await h.cb.speakExample();assert.equal(errors.length,2);assert.equal(h.awards.length,0);
});
