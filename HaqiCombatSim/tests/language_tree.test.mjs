import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyLanguageTree,recordTreeExposure,wordAliases,setTreeMark,treeWordStatus,treeReadiness,treeQuestionMessages,validateTreeQuestions,answerTreeQuestion,TREE_DAY} from '../js/language_tree_core.js';
import {observeTranslations,setTranslator,tr} from '../js/locale_runtime.js';
import {createLanguageTreeSession} from '../js/language_tree_session.js';
import {createLanguageTreeStore} from '../js/language_tree_store.js';
const now=Date.now(),event=(text,at=now,source='npc:one')=>({text,at,source,label:'游戏对白',zh:'测试原句',locale:'en'});
function state(){const s=emptyLanguageTree();recordTreeExposure(s,event('I read a book at home with my mother.'));recordTreeExposure(s,event('My father can open the door and help the child.',now+1,'npc:two'));for(const id of ['read','open','help'])setTreeMark(s,id,'basic');for(const id of ['book','door','child'])setTreeMark(s,id,'know');return s;}
const questions=()=>({questions:[{target:'book',sentence:'Read the book.',translation:'读这本书。',options:[{text:'读这本书。',explanation:'read表示阅读。'},{text:'开门',explanation:'没有提到门。'},{text:'喝水',explanation:'没有提到水。'}],answer:0,glosses:{}},{target:'door',sentence:'Open the door.',translation:'打开门。',options:[{text:'打开门。',explanation:'open表示打开。'},{text:'读书',explanation:'没有book。'},{text:'回家',explanation:'没有home。'}],answer:0,glosses:{}},{target:'child',sentence:'Help the child.',translation:'帮助孩子。',options:[{text:'帮助孩子',explanation:'child表示孩子。'},{text:'帮助爸爸',explanation:'father才是爸爸。'},{text:'打开门',explanation:'没有door。'}],answer:0,glosses:{}}]});
test('translation observations do not change translations or leak failures',()=>{const rows=[],stop=observeTranslations(row=>rows.push(row)),bad=observeTranslations(()=>{throw Error('observer');});setTranslator(s=>s==='你好'?'Hello':s,'en');assert.equal(tr('你好'),'Hello');assert.equal(rows[0].locale,'en');bad();stop();setTranslator(null);});
test('actual English only, 60-second dedup, repeated token and known forms',()=>{const s=emptyLanguageTree(),aliases=wordAliases([{text:'child',forms:['children']}]);assert.equal(recordTreeExposure(s,{...event('孩子'),locale:'zh-CN'},aliases),false);assert.equal(recordTreeExposure(s,event('Children help children.'),aliases),true);assert.equal(s.words.child.count,1);assert.equal(recordTreeExposure(s,event('Children help children.',now+59999),aliases),false);assert.equal(recordTreeExposure(s,event('Children help children.',now+60000),aliases),true);assert.equal(s.words.child.count,2);assert.equal(s.words.child.interval,60000);assert.ok(!s.words.children);});
test('bounded context, relation and evidence summaries preserve counts and placement',()=>{const s=emptyLanguageTree();for(let i=0;i<30;i++)recordTreeExposure(s,event(`Book read. Home mother father child help door open flower tree sun moon water rain happy yes no ${'extra'.repeat(i+1)}.`,now+i*60001));assert.equal(s.words.book.count,30);assert.equal(s.words.book.contexts.length,5);assert.ok(s.words.book.relations.length<=12);assert.equal(s.words.book.ordinal,0);assert.equal(s.words.book.relations.find(r=>r.id==='home').sentence,0);assert.equal(s.words.book.relations.find(r=>r.id==='read').sentence,30);});
test('two consecutive independent first answers master a word, otherwise basic',()=>{const s=state();s.questions=validateTreeQuestions(questions(),s);const q=s.questions[0];answerTreeQuestion(s,q.id,0,now);assert.equal(s.words.book.mark,'basic');assert.equal(s.words.book.selfMark,'know');assert.equal(treeWordStatus(s.words.book).verified,false);assert.throws(()=>answerTreeQuestion(s,q.id,0,now+1));
 const second={...q,id:'second',sentence:'Read my book.',attempts:0,completed:false};s.questions.push(second);answerTreeQuestion(s,second.id,0,now+1000);assert.equal(s.words.book.mark,'know');assert.equal(treeWordStatus(s.words.book).verified,true);assert.equal(treeWordStatus(s.words.book).kind,'mastered');assert.equal(treeWordStatus(s.words.book).showTranslation,false);
 const third={...second,id:'third',sentence:'My book is open.',attempts:0,completed:false};s.questions.push(third);answerTreeQuestion(s,third.id,1,now+2000);assert.equal(s.words.book.mark,'basic');assert.equal(treeWordStatus(s.words.book).verified,false);assert.equal(treeWordStatus(s.words.book).streak,0);assert.equal(treeWordStatus(s.words.book).kind,'basic');assert.equal(treeWordStatus(s.words.book).showTranslation,true);assert.equal(s.words.book.evidence.length,3);
 setTreeMark(s,'book','unknown');assert.equal(treeWordStatus(s.words.book).kind,'unknown');assert.equal(s.words.book.evidence.length,3);
});
test('question validation rejects novel content, duplicates, missing glosses and malformed choices',()=>{const s=state();assert.equal(validateTreeQuestions(questions(),s).length,3);for(const mutate of [q=>q.questions[0].sentence='Read the spaceship.',q=>q.questions[0].sentence='I read a book at home with my mother.',q=>q.questions[0].options[1].text=q.questions[0].options[0].text,q=>q.questions[0].answer=7,q=>q.questions[0].sentence='Read this book.']){const q=questions();mutate(q);assert.throws(()=>validateTreeQuestions(q,s));}s.questions=validateTreeQuestions(questions(),s);assert.throws(()=>validateTreeQuestions(questions(),s));});
test('late model results cannot cross role switch or clear generation',async()=>{let s=state(),key='one',resolve;const store={read:async()=>({state:structuredClone(s),persisted:true}),update:async(_,reduce)=>{const result=reduce(s);return {state:structuredClone(s),result,persisted:true};}},request=()=>new Promise(r=>resolve=r);const session=createLanguageTreeSession({key,getKey:()=>key,store,request,online:()=>true});await session.open();const pending=session.prepare();key='two';resolve(questions());await pending;assert.equal(s.questions.length,0);session.close();
    key='one';const second=createLanguageTreeSession({key,getKey:()=>key,store,request,online:()=>true});await second.open();const task=second.prepare();await second.clear();resolve(questions());await task;assert.equal(Object.keys(s.words).length,0);assert.equal(s.questions.length,0);second.close();});
test('store failure is explicit and remains isolated in memory',async()=>{const store=createLanguageTreeStore({indexedDB:null});let result=await store.update('one',s=>recordTreeExposure(s,event('Hello friend.')));assert.equal(result.persisted,false);assert.ok(result.state.words.hello);result=await store.read('two');assert.equal(Object.keys(result.state.words).length,0);assert.ok((await store.read('one')).state.words.hello);});

test('invalid model output repairs once, cached questions never request again',async()=>{
    const s=state();let calls=0;const store={read:async()=>({state:structuredClone(s),persisted:true}),update:async(_,reduce)=>({result:reduce(s),state:structuredClone(s),persisted:true})};
    const session=createLanguageTreeSession({key:'one',store,online:()=>true,request:async()=>{if(++calls===1)throw Error('对话回复格式不完整，请重试。');return '```json\n'+JSON.stringify(questions())+'\n```';}});await session.open();await session.prepare();assert.equal(calls,2);assert.equal(s.questions.length,3);await session.prepare();assert.equal(calls,2);await session.hint(s.questions[0].id);await session.answer(s.questions[0].id,0,now);assert.equal(s.words.book.evidence[0].hinted,true);assert.equal(treeWordStatus(s.words.book).verified,false);session.close();
});
test('question prompt specifies 3 questionTargets, allowedConnectors and quote constraints; glosses accept capitalized keys',()=>{
    const s=emptyLanguageTree();s.words.water={id:'water',ordinal:0,count:0,firstAt:0,lastAt:0,interval:0,mark:'basic',contexts:[],relations:[],evidence:[]};
    const messages=treeQuestionMessages(s),payload=JSON.parse(messages[1].content);
    assert.deepEqual(payload.questionTargets,['water','water','water']);assert.ok(payload.allowedConnectors.includes('is'));assert.match(messages[0].content,/严禁使用英文双引号/);
    const q=questions();q.questions[0].sentence='Is the book open?';q.questions[0].glosses={Is:'是'};
    assert.equal(validateTreeQuestions(q,state())[0].glosses.is,'是');
});
test('copying a sentence from a longer context is rejected',()=>{const s=state();recordTreeExposure(s,event('Read the book. Open the door.',now+2,'multi'));assert.throws(()=>validateTreeQuestions(questions(),s));});

test('fruit questions cannot test or use unrecognized content words',()=>{const s=state();setTreeMark(s,'read','unknown');assert.throws(()=>validateTreeQuestions(questions(),s));setTreeMark(s,'read','basic');assert.equal(validateTreeQuestions(questions(),s).length,3);setTreeMark(s,'book','unknown');assert.throws(()=>validateTreeQuestions(questions(),s));});

test('self-rated mastery still shows translation without verified evidence',()=>{const s=state();setTreeMark(s,'book','know');assert.equal(treeWordStatus(s.words.book).kind,'know');assert.equal(treeWordStatus(s.words.book).showTranslation,true);});


test('fragment choices from the reported fruit are rejected instead of graded',()=>{
 const s=state(),raw=questions();
 raw.questions[2].translation='这个孩子用水帮助我的朋友。';
 raw.questions[2].options=[{text:'一个用水帮助朋友的小孩',explanation:'片段'},{text:'被帮助的朋友',explanation:'片段'},{text:'用来帮忙的清水',explanation:'片段'}];
 assert.throws(()=>validateTreeQuestions(raw,s),/完整中文译文/);
});
test('I do not know completes once, breaks the streak and never earns mastery',()=>{
 const s=state();s.questions=validateTreeQuestions(questions(),s);const q=s.questions[0];
 s.words.book.evidence.push({sentence:'previous',correct:true,first:true,hinted:false});
 const result=answerTreeQuestion(s,q.id,-1,now);
 assert.equal(result.skipped,true);assert.equal(result.correct,false);assert.equal(q.completed,true);
 assert.equal(treeWordStatus(s.words.book).streak,0);assert.equal(s.words.book.mark,'basic');assert.equal(s.masteryEarned,undefined);
 assert.throws(()=>answerTreeQuestion(s,q.id,-1,now+1));
});
test('persisted fruits survive reopening and generation waits for empty fruits AND newly learned words',async()=>{
 const s=state();let calls=0;
 const store={read:async()=>({state:structuredClone(s),persisted:true}),update:async(_,reduce)=>({result:reduce(s),state:structuredClone(s),persisted:true})};
 const create=()=>createLanguageTreeSession({key:'cache',store,online:()=>true,request:async()=>{calls++;const raw=questions();if(calls>1)raw.questions.forEach((q,i)=>{q.sentence=['Read my book.','Open my door.','Help my child.'][i];q.translation=['读我的书。','打开我的门。','帮助我的孩子。'][i];q.options[q.answer].text=q.translation;});return raw;}});
 let session=create();await session.open();await session.prepare();assert.equal(calls,1);session.close();
 session=create();await session.open();await session.prepare();assert.equal(calls,1);assert.equal(session.state.questions.length,3);
 await session.mark('home','basic');await session.prepare();assert.equal(calls,1);
 for(const q of [...s.questions])await session.answer(q.id,-1,now);
 // The new word unlocks a request only after the last cached fruit is consumed.
 await session.prepare();assert.equal(calls,2);assert.equal(s.questions.filter(q=>!q.completed).length,3);
 for(const q of s.questions.filter(q=>!q.completed))await session.answer(q.id,-1,now+1);
 session.close();session=create();await session.open();await session.prepare();assert.equal(calls,2);
 await session.mark('book','know');await session.prepare();assert.equal(calls,2);session.close();
});
test('legacy inconsistent cached choices are discarded without grading or automatic regeneration',async()=>{
 const s=state();s.questions=validateTreeQuestions(questions(),s);s.questions[0].options[0].text='片段';let calls=0;
 const store={read:async()=>({state:structuredClone(s),persisted:true}),update:async(_,reduce)=>({result:reduce(s),state:structuredClone(s),persisted:true})};
 const session=createLanguageTreeSession({key:'old',store,online:()=>true,request:async()=>{calls++;return questions();}});
 await session.open();assert.equal(s.questions.length,2);assert.equal(s.words.book.evidence.length,0);await session.prepare();assert.equal(calls,0);session.close();
});
