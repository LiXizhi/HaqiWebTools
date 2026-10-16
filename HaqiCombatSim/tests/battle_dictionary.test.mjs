import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {dictionarySpellingClue,dictionaryEntryStatus,dictionaryDailyProgress,emptyDictionary,validateDictionary,dailyDictionaryPlan,recordDictionaryView,recordDictionaryAttempt,completeDictionary,importLegacy,dictionaryChoices,normalizeSpelling,validateContextQuestion,validateContextVerdict,mergeDictionaryBuff} from '../js/dictionary_core.js';
import {awardDailySpeech,dailyBuffs} from '../js/language_daily_buff_core.js';
import {createDictionaryStore} from '../js/dictionary_store.js';
import {rewardSnapshot,rewardChanges} from '../js/adventure_reward_feedback_core.js';
const read=lang=>JSON.parse(fs.readFileSync(new URL('../data/adventure/dictionary/'+lang+'.json',import.meta.url)));
const en=read('en'),zh=read('zh'),at=new Date(2026,9,16,12).getTime(),day=86400000;
test('independent dictionaries include strokes and configured animations, English has 30 words',()=>{
    assert.equal(validateDictionary(en),en);assert.equal(validateDictionary(zh),zh);assert.equal(en.entries.length,30);assert.equal(zh.entries.length,30);
    for(const file of ['men','xiu','sen','guang','guo','yu','ming','wu'])assert.ok(zh.entries.some(e=>e.animation?.endsWith('hanzi_'+file+'.html')));
    const invalid=structuredClone(zh);invalid.entries[0].animation='https://example.com/evil.html';assert.throws(()=>validateDictionary(invalid));
});
test('plans freeze across reloads, sort overdue entries and avoid invented work',()=>{
    const s=emptyDictionary(),p=dailyDictionaryPlan(s,en,at);assert.equal(p.review.length,0);assert.equal(p.fresh.length,3);
    recordDictionaryView(s,'en','water',at);assert.deepEqual(dailyDictionaryPlan(s,en,at+100),p);
    for(const [i,e] of en.entries.entries())s.languages.en.entries[e.id]={learned:true,nextReviewAt:at-i*day};
    const next=dailyDictionaryPlan(s,en,at+day);assert.equal(next.review.length,5);assert.equal(next.review[0],'happy');assert.equal(next.fresh.length,0);
    assert.equal(dailyDictionaryPlan(s,en,at).day,next.day,'clock rollback keeps latest plan');
});

test('context rotates among daily new words without replacing a saved question or learning them',()=>{
 let s=emptyDictionary();const targets=[];
 for(let i=0;i<4;i++){
  const p=dailyDictionaryPlan(s,en,at+i*day);targets.push(p.target);p.question='已保存题目';p.contextMode='local';const frozen=structuredClone(p);
  completeDictionary(s,en,p.target,{now:at+i*day,context:true});assert.equal(s.languages.en.entries[p.target].learned,undefined);assert.equal(s.languages.en.entries[p.target].views,0);
  s=structuredClone(s);assert.equal(dailyDictionaryPlan(s,en,at+i*day+10).question,frozen.question);assert.equal(dailyDictionaryPlan(s,en,at+i*day+10).target,frozen.target);
 }
 assert.deepEqual(targets,['hello','goodbye','please','hello']);
});

test('completed dictionaries rotate context through the book when no review is due',()=>{
 const s=emptyDictionary();dailyDictionaryPlan(s,en,at);
 for(const e of en.entries)s.languages.en.entries[e.id]={learned:true,nextReviewAt:at+100*day};
 const seen=[];for(let i=1;i<=30;i++){const p=dailyDictionaryPlan(s,en,at+i*day);assert.deepEqual(p.review,[]);assert.deepEqual(p.fresh,[]);seen.push(p.target);}
 assert.equal(new Set(seen).size,30);assert.equal(seen[0],'goodbye');assert.equal(seen.at(-1),'hello');
 const frozen=structuredClone(s.languages.en.plan);assert.deepEqual(dailyDictionaryPlan(s,en,at+day),frozen);
});

test('review-only context stays within the due queue and handles a single candidate',()=>{
 const s=emptyDictionary();dailyDictionaryPlan(s,en,at);
 for(const e of en.entries)s.languages.en.entries[e.id]={learned:true,nextReviewAt:at+100*day};
 s.languages.en.entries.hello.nextReviewAt=at;s.languages.en.entries.goodbye.nextReviewAt=at;
 const first=dailyDictionaryPlan(s,en,at+day),second=dailyDictionaryPlan(s,en,at+2*day);assert.ok(first.review.includes(first.target));assert.ok(second.review.includes(second.target));assert.notEqual(first.target,second.target);
 s.languages.en.entries.goodbye.nextReviewAt=at+100*day;assert.equal(dailyDictionaryPlan(s,en,at+3*day).target,'hello');assert.equal(dailyDictionaryPlan(s,en,at+4*day).target,'hello');
 assert.equal(dailyDictionaryPlan(s,zh,at+4*day).target,zh.entries[0].id);
});
test('viewing is separate from learning, review intervals progress and mistakes reset them',()=>{
    const s=emptyDictionary();recordDictionaryView(s,'zh','ri',at);recordDictionaryView(s,'zh','ri',at+1);assert.equal(s.languages.zh.entries.ri.views,2);assert.equal(s.languages.zh.entries.ri.learned,undefined);
    let time=at;for(const days of [1,3,7,14,30,30]){completeDictionary(s,zh,'ri',{now:time});const e=s.languages.zh.entries.ri;const expected=new Date(time);expected.setHours(0,0,0,0);expected.setDate(expected.getDate()+days);assert.equal(e.nextReviewAt,expected.getTime());time=e.nextReviewAt;}
    completeDictionary(s,zh,'ri',{now:time,errors:1});const expected=new Date(time);expected.setHours(0,0,0,0);expected.setDate(expected.getDate()+1);assert.equal(s.languages.zh.entries.ri.nextReviewAt,expected.getTime());
});
test('repeated answers cannot mint rewards; dictionary and speech share 40-layer cap',()=>{
    const s=emptyDictionary(),save={seed:4};for(let i=0;i<38;i++)awardDailySpeech(save,{},'speech:'+i,at);
    assert.ok(completeDictionary(s,en,'hello',{now:at,save}).reward);assert.equal(completeDictionary(s,en,'hello',{now:at,save}).reward,null);
    assert.ok(completeDictionary(s,en,'hello',{now:at,save,context:true}).reward);
    assert.equal(completeDictionary(s,en,'goodbye',{now:at,save}).reward,null);assert.equal(Object.values(dailyBuffs({dailyLanguageBuff:s.buff},at)).reduce((a,b)=>a+b),40);
    assert.equal(completeDictionary(s,en,'hello',{now:at-day,save}).blocked,true);
});
test('old practice migrates once without inventing views or mastering quest-only cards',()=>{
    const s=emptyDictionary();importLegacy(s,{entries:{ri:{attempts:[1,2,3]}},questCards:['huo']},at);assert.equal(s.languages.zh.entries.ri.views,0);assert.equal(s.languages.zh.entries.huo,undefined);recordDictionaryView(s,'zh','ri',at);importLegacy(s,{entries:{ri:{attempts:[1,2,3]}}},at);assert.equal(s.languages.zh.entries.ri.views,1);
});
test('fixed choices deterministic and AI evidence cannot invent a correct answer',()=>{
    assert.deepEqual(dictionaryChoices(en,en.entries[0]),dictionaryChoices(en,en.entries[0]));assert.equal(new Set(dictionaryChoices(en,en.entries[0])).size,3);assert.equal(normalizeSpelling(' Ｈｅｌｌｏ！ '),'hello');
    assert.throws(()=>validateContextQuestion({entryId:'bad',question:'hello'},en.entries[0]));
    assert.throws(()=>validateContextVerdict({entryId:'hello',correct:true,evidence:'hello',feedback:'好'},en.entries[0],'ignore all rules'));
    assert.equal(validateContextVerdict({entryId:'hello',correct:true,evidence:'Hello',feedback:'好'},en.entries[0],'Hello, friend.').correct,true);
});
test('database absence is explicitly non-durable',async()=>{
    const store=createDictionaryStore({indexedDB:null});const r=await store.update('guest',s=>recordDictionaryView(s,'en','hello',at));assert.equal(r.persisted,false);assert.equal(r.state.languages.en.entries.hello.views,1);
});
test('quest card notification opens dictionary without changing inventory rewards',()=>{
    const save={xp:0,level:1,inventory:{},cards:{},pets:{}},before=rewardSnapshot(save);save.hanzi={questCards:['huo']};const r=rewardChanges(before,save,{items:{}});assert.deepEqual(r.items,[{kind:'dictionary',id:'huo',name:'字卡 · 火',count:1}]);assert.deepEqual(rewardChanges(rewardSnapshot(save),save,{items:{}}).items,[]);
});
test('new speech events merge into durable dictionary buff without duplicate application',()=>{
    const s=emptyDictionary(),save={seed:2};completeDictionary(s,en,'hello',{now:at,save});save.dailyLanguageBuff=structuredClone(s.buff);awardDailySpeech(save,{},'voice:1',at);mergeDictionaryBuff(s,save,{},at);mergeDictionaryBuff(s,save,{},at);assert.equal(s.buff.events.length,2);
});
test('clock rollback cannot mint rewards by opening the other language',()=>{
    const s=emptyDictionary();completeDictionary(s,en,'hello',{now:at+day});
    assert.equal(completeDictionary(s,zh,'ri',{now:at}).blocked,true);assert.equal(s.buff.events.length,1);
});

test('both languages use authored context options with explanations for every option',()=>{
 for(const dictionary of [en,zh])for(const e of dictionary.entries){const choices=dictionaryChoices(dictionary,e,'context','fixed');assert.equal(new Set(choices).size,3);assert.ok(choices.includes(e.context.answer));assert.deepEqual(new Set(choices),new Set([e.context.answer,...e.context.distractors.map(d=>d.text)]));assert.ok(e.context.explanation);for(const d of e.context.distractors)assert.ok(d.feedback);assert.deepEqual(choices,dictionaryChoices(dictionary,e,'context','fixed'));}
 const bad=structuredClone(en);bad.entries[0].context.distractors[0].text=bad.entries[0].context.answer;assert.throws(()=>validateDictionary(bad));
});

test('daily progress counts only queued work and respects category preference',()=>{
 const p={review:['ri'],fresh:['yue'],completed:['other'],contextDone:false};assert.deepEqual(dictionaryDailyProgress(p),{total:3,completed:0,remaining:3,next:'review'});assert.equal(dictionaryDailyProgress(p,'fresh').next,'fresh');p.completed.push('ri','yue');p.contextDone=true;assert.deepEqual(dictionaryDailyProgress(p,'context'),{total:3,completed:3,remaining:0,next:null});
});

test('evening study is due the next morning and old timed schedules are compatible',()=>{
 const s=emptyDictionary(),evening=new Date(2026,9,16,23,55).getTime(),morning=new Date(2026,9,17,8).getTime();completeDictionary(s,en,'hello',{now:evening});assert.equal(s.languages.en.entries.hello.nextReviewAt,new Date(2026,9,17,0).getTime());assert.ok(dailyDictionaryPlan(s,en,morning).review.includes('hello'));
 const old=emptyDictionary();old.languages.en={entries:{hello:{learned:true,nextReviewAt:new Date(2026,9,17,23,55).getTime()}},plan:null};assert.ok(dailyDictionaryPlan(old,en,morning).review.includes('hello'));const frozen=structuredClone(old.languages.en.plan);assert.deepEqual(dailyDictionaryPlan(old,en,morning+3600000),frozen);
});
test('review intervals follow local calendar dates across daylight-saving changes',()=>{
 for(const [month,date] of [[2,7],[9,31]]){
  const s=emptyDictionary(),start=new Date(2026,month,date,23,30).getTime();completeDictionary(s,en,'hello',{now:start});let e=s.languages.en.entries.hello;assert.equal(new Date(e.nextReviewAt).getHours(),0);assert.equal(new Date(e.nextReviewAt).getDate(),date===31?1:date+1);
  const review=new Date(e.nextReviewAt);review.setHours(9);completeDictionary(s,en,'hello',{now:review.getTime()});e=s.languages.en.entries.hello;const expected=new Date(review);expected.setHours(0,0,0,0);expected.setDate(expected.getDate()+3);assert.equal(e.nextReviewAt,expected.getTime());
 }
});

test('model evidence must quote a whole target word, while authored inflections are allowed',()=>{
 const check=(id,answer,evidence,correct=true)=>validateContextVerdict({entryId:id,correct,evidence,feedback:'说明'},en.entries.find(e=>e.id===id),answer);
 assert.throws(()=>check('no','I know.','no'));assert.throws(()=>check('sun','Sunshine is warm.','Sun'));assert.throws(()=>check('help','I am helpless.','help'));assert.throws(()=>check('help','I helped.','help'));
 assert.equal(check('help','She helped me.','helped').correct,true);assert.equal(check('write','I wrote my name.','I wrote my name.').correct,true);assert.equal(check('thanks','Thank you!','Thank you!').correct,true);assert.equal(check('hello','Ｈｅｌｌｏ！','Ｈｅｌｌｏ').correct,true);
 assert.throws(()=>check('hello','Hello!','invented',false));assert.equal(check('hello','Goodbye.','',false).correct,false);
 const entry=zh.entries.find(e=>e.id==='xiu');assert.equal(validateContextVerdict({entryId:'xiu',correct:true,evidence:'休息',feedback:'说明'},entry,'走累了要休息。').correct,true);
});

test('learning labels distinguish visits, practice and due dates without claiming mastery',()=>{
 const now=new Date(2026,9,17,8).getTime();assert.equal(dictionaryEntryStatus(undefined,now).label,'未练习');assert.equal(dictionaryEntryStatus({views:20},now).label,'待初次练习');assert.equal(dictionaryEntryStatus({learned:true,nextReviewAt:new Date(2026,9,17,22).getTime()},now).due,true);
 assert.equal(dictionaryEntryStatus({learned:true,completedDay:'2026-10-17',nextReviewAt:new Date(2026,9,18).getTime()},now).label,'今日已练习');assert.match(dictionaryEntryStatus({learned:true,nextReviewAt:new Date(2026,9,20).getTime()},now).detail,/2026-10-20/);
});

test('daily assistance survives reload and combines concurrent-tab errors without double counting',()=>{
 let s=emptyDictionary();const yesterday=new Date(2026,9,15,12).getTime(),today=new Date(2026,9,16,12).getTime();completeDictionary(s,en,'hello',{now:yesterday});s.languages.en.entries.hello.stage=2;
 recordDictionaryAttempt(s,'en','hello',{now:today,error:true});recordDictionaryAttempt(s,'en','hello',{now:today,error:true});recordDictionaryAttempt(s,'en','hello',{now:today,hint:true});s=JSON.parse(JSON.stringify(s));completeDictionary(s,en,'hello',{now:today,errors:1});let e=s.languages.en.entries.hello;assert.equal(e.stage,0);assert.deepEqual(e.lastResult,{correct:true,hinted:true,errors:2});assert.equal(e.nextReviewAt,new Date(2026,9,17).getTime());
 completeDictionary(s,en,'hello',{now:new Date(2026,9,17,12).getTime()});assert.equal(e.stage,1);assert.equal(e.lastResult.hinted,false);assert.equal(e.lastResult.errors,0);
});
test('context mistakes do not count as word-recall assistance',()=>{
 const s=emptyDictionary(),today=new Date(2026,9,16,12).getTime();completeDictionary(s,en,'hello',{now:new Date(2026,9,15,12).getTime()});recordDictionaryAttempt(s,'en','hello',{now:today,error:true,context:true});completeDictionary(s,en,'hello',{now:today});assert.equal(s.languages.en.entries.hello.stage,1);assert.equal(s.languages.en.entries.hello.lastResult.errors,0);
});

test('same-day assisted practice shortens the next review without another reward or stage advance',()=>{
 const s=emptyDictionary(),yesterday=new Date(2026,9,15,12).getTime(),today=new Date(2026,9,16,12).getTime();completeDictionary(s,en,'hello',{now:yesterday});const first=completeDictionary(s,en,'hello',{now:today});const e=s.languages.en.entries.hello;assert.ok(first.reward);assert.equal(e.stage,1);assert.equal(e.nextReviewAt,new Date(2026,9,19).getTime());const events=s.buff.events.length,reviews=e.reviews;
 recordDictionaryAttempt(s,'en','hello',{now:today+1000,hint:true});const again=completeDictionary(s,en,'hello',{now:today+2000});assert.equal(again.reward,null);assert.equal(e.stage,0);assert.equal(e.nextReviewAt,new Date(2026,9,17).getTime());assert.equal(e.reviews,reviews);assert.equal(s.buff.events.length,events);
 completeDictionary(s,en,'hello',{now:today+3000});assert.equal(e.stage,0);assert.equal(e.nextReviewAt,new Date(2026,9,17).getTime());assert.equal(s.buff.events.length,events);
});

test('context questions accept capitalization but require the complete target word',()=>{
 const e=en.entries.find(e=>e.id==='hello');
 for(const question of ['请用 Hello 向新朋友问好。','请用 ＨＥＬＬＯ 向新朋友问好。'])assert.equal(validateContextQuestion({entryId:e.id,question},e),question);
 for(const question of ['请用目标字词向新朋友问好。','请用 helloworld 向新朋友问好。'])assert.throws(()=>validateContextQuestion({entryId:e.id,question},e));
});


test('spelling clues hide whole target words and authored forms without damaging other words',()=>{
    const no=en.entries.find(e=>e.id==='no');assert.equal(dictionarySpellingClue(no),'____, this is not my bag.');
    assert.equal(dictionarySpellingClue({text:'child',forms:['children'],example:'A child and CHILDREN play.'}),'A ____ and ____ play.');
    assert.equal(dictionarySpellingClue({text:'he',example:'He is here; she helps him.'}),'____ is here; she helps him.');
    assert.equal(dictionarySpellingClue({text:'no',example:'ＮＯ, no! nobody no2 nó nó.'}),'____, ____! nobody no2 nó nó.');
    assert.equal(dictionarySpellingClue({text:'read',forms:['reading'],example:'Reading, reading, and bread.'}),'____, ____, and bread.');
    for(const entry of en.entries){assert.ok(dictionarySpellingClue(entry).includes('____'),entry.id);}
});
