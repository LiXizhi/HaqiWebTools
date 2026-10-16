import test from 'node:test';
import assert from 'node:assert/strict';
import {writingHint,spellingHint,spellingScaffold,validateTutorReply,tutorMessages,tutorFallback,tutorComparisons,resolveTutorMode} from '../js/dictionary_tutor_core.js';

test('progressive spelling help reveals a prefix but always leaves a letter to recall',()=>{
 assert.deepEqual(spellingScaffold('hello'),{prefix:'h',remaining:4,exhausted:false});assert.deepEqual(spellingScaffold('hello',2),{prefix:'h · e',remaining:3,exhausted:false});assert.deepEqual(spellingScaffold('hello',99),{prefix:'h · e · l · l',remaining:1,exhausted:true});
 assert.deepEqual(spellingScaffold('ＮＯ！'),{prefix:'n',remaining:1,exhausted:true});assert.equal(spellingScaffold('a').prefix,'');assert.equal(spellingScaffold('hello',NaN).prefix,'h');assert.equal(spellingScaffold('hello',-1).prefix,'h');
});

test('explicit comparisons include the other authored entry without matching incidental characters',async()=>{
 const {readFile}=await import('node:fs/promises');const zh=JSON.parse(await readFile(new URL('../data/adventure/dictionary/zh.json',import.meta.url),'utf8')),en=JSON.parse(await readFile(new URL('../data/adventure/dictionary/en.json',import.meta.url),'utf8'));
 const wood=zh.entries.find(e=>e.id==='mu');
 for(const question of ['木和目都读 mu，怎么分清？','“目”与“木”有什么区别？','木 / 目']){const rows=tutorComparisons(zh,wood,question);assert.deepEqual(rows.map(e=>e.id),['mu-eye']);assert.equal(rows[0].pronunciation,'mù');assert.equal(rows[0].meaning,'眼睛');assert.equal(rows[0].strokes,undefined);}
 assert.deepEqual(tutorComparisons(zh,wood,'我不明白木怎么写'),[]);
 const home=en.entries.find(e=>e.id==='home');for(const q of ['HOME vs. family','family and home'])assert.deepEqual(tutorComparisons(en,home,q).map(e=>e.id),['family']);assert.deepEqual(tutorComparisons(en,home,'homes and family'),[]);
 const payload=JSON.parse(tutorMessages(wood,'zh',[],'木和目',{},tutorComparisons(zh,wood,'木和目'))[1].content);assert.equal(payload.reference.comparisons[0].id,'mu-eye');
});

test('all beginner English examples have faithful phrase explanations and reject broken splits',async()=>{
 const {readFile}=await import('node:fs/promises'),{validateDictionary}=await import('../js/dictionary_core.js');
 const data=validateDictionary(JSON.parse(await readFile(new URL('../data/adventure/dictionary/en.json',import.meta.url),'utf8')));
 for(const e of data.entries){assert.ok(e.exampleChunks.length>=2);assert.equal(e.exampleChunks.map(c=>c.text).join(' '),e.example);assert.ok(e.exampleChunks.every(c=>c.meaning.trim()));}
 for(const change of [e=>e.exampleChunks[0].text='other',e=>e.exampleChunks[0].meaning='',e=>e.exampleChunks=[null],e=>e.exampleChunks='invalid']){const bad=structuredClone(data);change(bad.entries[0]);assert.throws(()=>validateDictionary(bad),/例句拆解无效/);}
});

test('teacher receives verified reading materials without glyph paths or learner coordinates',async()=>{
 const {readFile}=await import('node:fs/promises');
 for(const language of ['zh','en']){
  const d=JSON.parse(await readFile(new URL(`../data/adventure/dictionary/${language}.json`,import.meta.url),'utf8'));
  for(const e of d.entries){const messages=tutorMessages(e,language,[],'请讲解'),payload=JSON.parse(messages[1].content);
   assert.equal(payload.reference.pronunciation,e.pronunciation);assert.deepEqual(payload.reference.words,e.words||[]);assert.deepEqual(payload.reference.exampleChunks,e.exampleChunks||[]);assert.equal(payload.reference.strokeCount,language==='zh'?e.strokes.medians.length:null);assert.doesNotMatch(messages[1].content,/"medians"|"strokes"/);
   if(language==='zh'){const reply=tutorFallback(e,language,{tutorQuestion:'这个字一共多少笔？'});assert.match(reply.reply,new RegExp(`有 ${e.strokes.medians.length} 笔`));assert.equal(reply.example,'');assert.equal(reply.question,'');assert.equal(reply.local,true);}
  }
 }
 const e={text:'口',meaning:'嘴巴',example:'张开口。',coaching:{tip:'口表示嘴巴。',prompt:'试着说说。'}};assert.equal(tutorFallback(e,'zh',{tutorQuestion:'几笔？'}).reply,e.coaching.tip);
});

test('local coaching describes only supplied attempts and preserves authored explanations',()=>{
 const e={id:'hello',text:'hello',meaning:'你好',example:'Hello!',coaching:{tip:'见面时打招呼。',prompt:'向朋友问好。'}};
 assert.equal(tutorFallback(e,'en').reply,e.coaching.tip);
 assert.equal(tutorFallback(e,'en',{lastAttempt:{kind:'spelling',text:' '}}).reply,e.coaching.tip);
 assert.match(tutorFallback(e,'en',{lastAttempt:{kind:'spelling',text:'ＨＥＬＬＯ！',correct:false}}).reply,/这次拼写正确/);
 assert.match(tutorFallback(e,'en',{lastAttempt:{kind:'meaning',correct:true}}).reply,/这次词义选对了/);
 const writing={lastAttempt:{kind:'writing',correct:false},lastFeedback:'已经写了 1 笔，还差 3 笔。继续写完再检查。'};
 assert.match(tutorFallback(e,'zh',writing).reply,/还差 3 笔/);
 assert.doesNotMatch(tutorFallback(e,'zh',{...writing,lastAttempt:{kind:'writing',correct:true}}).reply,/还差/);
 assert.equal(tutorFallback(e,'zh',{lastAttempt:{kind:'writing',correct:false}}).reply,e.coaching.tip);
});
test('spelling feedback identifies missing, extra and transposed letters',()=>{
 assert.match(spellingHint('hel','hello'),/还差 2/);assert.match(spellingHint('helloo','hello'),/多了 1/);assert.match(spellingHint('hlelo','hello'),/顺序反了/);assert.match(spellingHint('ＨＥＬ','hello'),/还差 2/);assert.match(spellingHint('','hello'),/先试着/);
});
test('tutor validates target and bounded structured output, history is bounded data',()=>{
 const e={id:'hello',text:'hello',meaning:'你好',example:'Hello!'};
 const good={entryId:'hello',reply:'向朋友问好。',example:'',translation:'',question:''};assert.equal(validateTutorReply(good,e).local,false);
 assert.throws(()=>validateTutorReply({...good,entryId:'bye'},e));assert.throws(()=>validateTutorReply({...good,reply:'x'.repeat(651)},e));assert.throws(()=>validateTutorReply({...good,question:null},e));
 assert.equal(JSON.parse(tutorMessages(e,'en',Array(30).fill({text:'hello'}),'how')[1].content).conversation.length,12);
});

test('handwriting coaching distinguishes unfinished, extra and localized stroke errors',()=>{
 assert.match(writingHint({reason:'count'},0,4).message,/第一笔/);assert.match(writingHint({reason:'count'},2,4).message,/还差 2/);assert.match(writingHint({reason:'count'},5,4).message,/多了 1/);
 assert.equal(writingHint({reason:'stroke',stroke:2},4,4).fromStroke,2);assert.equal(writingHint({reason:'shape'},4,4).fromStroke,null);assert.equal(writingHint({reason:'shape',stroke:99},4,4).fromStroke,null);
});

test('authored English coaching covers each entry and replaces the unsuitable person-swap fallback',async()=>{
 const {readFile}=await import('node:fs/promises');const {tutorFallback}=await import('../js/dictionary_tutor_core.js');const {validateDictionary}=await import('../js/dictionary_core.js');
 const d=validateDictionary(JSON.parse(await readFile(new URL('../data/adventure/dictionary/en.json',import.meta.url),'utf8')));
 for(const e of d.entries){assert.ok(e.coaching.tip.trim());assert.ok(e.coaching.prompt.trim());const reply=tutorFallback(e,'en');assert.ok(reply.reply.includes(e.coaching.tip));assert.equal(reply.question,e.coaching.prompt);assert.equal(reply.example,e.example);assert.equal(reply.local,true);assert.equal(JSON.parse(tutorMessages(e,'en',[],'怎么用')[1].content).coaching.tip,e.coaching.tip);}
 const water=tutorFallback(d.entries.find(e=>e.id==='water'),'en');assert.match(water.reply,/drink water/);assert.doesNotMatch(water.question,/人物换成/);
 const bad=structuredClone(d);bad.entries[0].coaching.prompt='';assert.throws(()=>validateDictionary(bad));
 const zh=tutorFallback({text:'日',meaning:'太阳',example:'我看到了日出。',context:{explanation:'太阳升起叫日出。'}},'zh');assert.match(zh.reply,/太阳升起叫日出/);assert.doesNotMatch(zh.reply,/我看到了日出/);
});

test('Chinese coaching covers modern uses, explicit visual mnemonics and real example words',async()=>{
 const {readFile}=await import('node:fs/promises');const {tutorFallback}=await import('../js/dictionary_tutor_core.js');const {validateDictionary}=await import('../js/dictionary_core.js');
 const d=validateDictionary(JSON.parse(await readFile(new URL('../data/adventure/dictionary/zh.json',import.meta.url),'utf8'))),entry=id=>d.entries.find(e=>e.id===id);
 for(const e of d.entries){assert.ok(e.coaching.tip.trim());assert.ok(e.coaching.prompt.trim());assert.equal(tutorFallback(e,'zh').reply,e.coaching.tip);assert.equal(tutorFallback(e,'zh').question,e.coaching.prompt);assert.ok(e.words.every(w=>w.includes(e.text)));}
 assert.deepEqual(entry('sen').words,['森林']);assert.deepEqual(entry('guang').words,['阳光','灯光']);assert.match(entry('xiu').coaching.tip,/从人依木/);assert.equal(entry('xiu').coaching.sourceUrl,'https://dict.variants.moe.edu.tw/dictView.jsp?ID=936');assert.equal(entry('kou').strokes.medians.length,3);assert.equal(entry('ren').strokes.medians.length,2);
});

test('tutor mode respects explicit practice, stopping and explanation requests',async()=>{
 const {resolveTutorMode,presentTutorReply}=await import('../js/dictionary_tutor_core.js');
 assert.equal(resolveTutorMode('我不会，请别再让我自己造句','practice'),'explain');assert.equal(resolveTutorMode('quiz me'),'practice');assert.equal(resolveTutorMode('stop quizzing me','practice'),'explain');assert.equal(resolveTutorMode('为什么这样说','practice'),'explain');assert.equal(resolveTutorMode('Hello!','practice'),'practice');
 const reply={reply:'解释',question:'再做题？'};assert.equal(presentTutorReply(reply,'explain').question,'');assert.equal(reply.question,'再做题？');assert.equal(presentTutorReply(reply,'practice').question,'再做题？');
});

test('a stuck beginner gets explanation instead of another quiz without losing explicit practice intent',async()=>{
 const {resolveTutorMode,presentTutorReply}=await import('../js/dictionary_tutor_core.js');
 for(const question of ['我还不会','我不知道怎么回答','我还是不明白','没听懂','先看一个示范','I don’t know.','I do not understand.','I am stuck.',"I'm confused."]){const mode=resolveTutorMode(question,'practice');assert.equal(mode,'explain',question);assert.equal(presentTutorReply({reply:'先看看这个例子。',question:'继续造句？'},mode).question,'');}
 assert.equal(resolveTutorMode('我不会，但我想练习','practice'),'practice');assert.equal(resolveTutorMode('I don’t know','practice','practice'),'practice');assert.equal(resolveTutorMode('I can help.','practice'),'practice');
});


test('spelling feedback locates a single internal omission or insertion without giving the answer',()=>{
 for(const [typed,pattern] of [['hllo',/第 2 个位置少了一个字母/],['helo',/第 4 个位置少了一个字母/],['heello',/第 3 个位置多了一个字符/],['h ello',/第 2 个位置多了一个字符/],['ＨＬＬＯ！',/第 2 个位置少了一个字母/]]){
  const hint=spellingHint(typed,'hello');assert.match(hint,pattern);assert.doesNotMatch(hint,/hello/);
 }
 assert.doesNotMatch(spellingHint('hxlo','hello'),/其余字母的顺序是对的/);
 assert.match(spellingHint('hel!','hello'),/前 3 个字母写对了，还差 2/);
 assert.match(spellingHint('hlelo。','hello'),/顺序反了/);
});


test('teacher feedback leads with the correction without rewriting meaningful negation or quotations',()=>{
 const entry={id:'ri'},base={entryId:'ri',example:'',translation:'',question:''};
 for(const opening of ['不对哦，','不对哦。','  不对哦！ '])assert.equal(validateTutorReply({...base,reply:opening+'早上太阳升起叫日出。'},entry).reply,'早上太阳升起叫日出。');
 for(const reply of ['不可以把横折拆成两笔。','“不对哦”是一种口语表达。','这里不是日落，而是日出。','你问的“不对哦”是什么意思？'])assert.equal(validateTutorReply({...base,reply},entry).reply,reply);
 for(const reply of ['不对哦','不对哦。','不对哦！  '])assert.throws(()=>validateTutorReply({...base,reply},entry),/缺少具体内容/);
});

test('example help uses the authored phrase meanings only for the explicit example request',async()=>{
 const {exampleTutorQuestion}=await import('../js/dictionary_tutor_core.js');
 const {readFile}=await import('node:fs/promises');
 const data=JSON.parse(await readFile(new URL('../data/adventure/dictionary/en.json',import.meta.url),'utf8'));
 for(const entry of data.entries){
  const reply=tutorFallback(entry,'en',{tutorQuestion:exampleTutorQuestion(entry)});
  for(const chunk of entry.exampleChunks)assert.ok(reply.reply.includes(`${chunk.text}：${chunk.meaning}`));
  assert.equal(reply.example,entry.example);assert.equal(reply.translation,entry.translation);assert.equal(reply.question,'');assert.equal(reply.local,true);
  assert.equal(tutorFallback(entry,'en',{tutorQuestion:'我自己的句子对吗？'}).reply,entry.coaching.tip);
 }
});

test('offline explicit comparison uses both authored meanings and examples without inventing distinctions',async()=>{
 const {readFile}=await import('node:fs/promises');const zh=JSON.parse(await readFile(new URL('../data/adventure/dictionary/zh.json',import.meta.url),'utf8')),en=JSON.parse(await readFile(new URL('../data/adventure/dictionary/en.json',import.meta.url),'utf8'));
 const wood=zh.entries.find(e=>e.id==='mu'),eye=zh.entries.find(e=>e.id==='mu-eye');
 const result=tutorFallback(wood,'zh',{},tutorComparisons(zh,wood,'木和目有什么区别？'));
 assert.match(result.reply,/这两个字都读 mù/);for(const entry of [wood,eye]){assert.ok(result.reply.includes(entry.meaning));for(const word of entry.words)assert.ok(result.reply.includes(word));}assert.equal(result.question,'');assert.equal(result.local,true);for(const entry of [wood,eye]){const sample=result.comparisonExamples?.find(item=>item.label===entry.text);assert.equal(sample?.example,entry.example);assert.equal(sample.translation,'');}
 const home=en.entries.find(e=>e.id==='home'),family=en.entries.find(e=>e.id==='family');const answer=tutorFallback(home,'en',{},tutorComparisons(en,home,'home vs family'));
 for(const entry of [home,family]){assert.ok(answer.reply.includes(entry.meaning));const sample=answer.comparisonExamples.find(item=>item.label===entry.text);assert.equal(sample.example,entry.example);assert.equal(sample.translation,entry.translation);}
 assert.doesNotMatch(answer.reply,/都读/);assert.equal(answer.example,'');assert.equal(answer.question,'');
 assert.equal(tutorFallback(home,'en',{},tutorComparisons(en,home,'怎么用 home')).reply,home.coaching.tip);
});

test('multiple spoken examples are confined to authored local replies',async()=>{
 const {tutorReplyExamples}=await import('../js/dictionary_tutor_core.js');const examples=[{example:'Let us go home.',translation:'我们回家吧。',label:'home'}];
 assert.deepEqual(tutorReplyExamples({local:false,comparisonExamples:examples}),[]);
 assert.deepEqual(tutorReplyExamples({local:true,comparisonExamples:examples}),examples);
 assert.deepEqual(tutorReplyExamples({example:'Hello!',translation:'你好！',comparisonExamples:examples}),[{example:'Hello!',translation:'你好！'}]);
 const clean=validateTutorReply({entryId:'home',reply:'讲解',example:'',translation:'',question:'',comparisonExamples:examples},{id:'home'});assert.deepEqual(tutorReplyExamples(clean),[]);
});

test('brief admissions of difficulty leave quiz mode without treating attempted sentences as requests',()=>{
 for(const question of ['不会','不会写。','还是不懂！','不知道','不知道怎么答','不明白','看不懂','听不懂','没懂','太难了','not sure',"I'm not sure.",'I am not sure yet.','Too difficult!'])assert.equal(resolveTutorMode(question,'practice'),'explain',question);
 for(const question of ['我不会，但我想练习','not sure, quiz me','I can help.','The water is too hot.','不知道是不是这样说'])assert.equal(resolveTutorMode(question,'practice'),'practice',question);
 assert.equal(resolveTutorMode('不会','practice','practice'),'practice');
});


test('Chinese spelling input receives actionable language guidance without revealing the answer',()=>{
 for(const text of ['你好','您好！','你 好']){const feedback=spellingHint(text,'hello');assert.match(feedback,/英文单词，不是中文意思/);assert.doesNotMatch(feedback,/hello|第 1 个字母/);}
 for(const text of ['he好','ＨＥ好！'])assert.match(spellingHint(text,'hello'),/混入了汉字/);
 assert.match(spellingHint('hllo','hello'),/第 2 个位置/);
 assert.doesNotMatch(spellingHint('123','hello'),/汉字|中文意思/);
 assert.doesNotMatch(spellingHint('bonjour','hello'),/汉字|中文意思/);
 const reply=tutorFallback({text:'hello',meaning:'你好',example:'Hello!',coaching:{tip:'见面时问好。'}},'en',{lastAttempt:{kind:'spelling',text:'你好',correct:false}});
 assert.match(reply.reply,/英文单词，不是中文意思/);
});


test('requests for a simpler explanation pause quizzes without hijacking learner sentences',()=>{
 for(const text of ['再简单一点','说简单点','请讲得简单一点。','能不能换个说法？','换一种说法','可以用简单的话说吗？','Simpler, please.','Please rephrase that.','Can you say that more simply?'])assert.equal(resolveTutorMode(text,'practice'),'explain',text);
 for(const text of ['换一道简单一点的题','我想练习简单一点的句子','I can say that more simply.','请翻译“换个说法”这句话'])assert.equal(resolveTutorMode(text,'practice'),'practice',text);
 assert.equal(resolveTutorMode('再简单一点','practice','practice'),'practice');
});


test('identical example translations are omitted without removing bilingual or distinct text',()=>{
 const entry={id:'xiu'},value={entryId:'xiu',reply:'走累了可以休息。',example:'走累了，我们休息一下。',translation:'走累了，我们休息一下。',question:''};
 assert.equal(validateTutorReply(value,entry).translation,'');assert.equal(validateTutorReply({...value,translation:'  '+value.example+'  '},entry).translation,'');assert.equal(validateTutorReply(value,entry).example,value.example);
 assert.equal(validateTutorReply({...value,example:'Let us rest.',translation:'我们休息一下。'},entry).translation,'我们休息一下。');
 assert.equal(validateTutorReply({...value,translation:'走累了，就坐下来休息。'},entry).translation,'走累了，就坐下来休息。');assert.equal(value.translation,value.example);
});


test('authored teaching sources require absolute HTTPS without embedded credentials',async()=>{
 const {readFile}=await import('node:fs/promises'),{validateDictionary}=await import('../js/dictionary_core.js');const data=JSON.parse(await readFile(new URL('../data/adventure/dictionary/zh.json',import.meta.url),'utf8'));
 assert.equal(validateDictionary(data),data);
 for(const url of ['javascript:alert(1)','http://example.com','/relative','https://user:secret@example.com',{},null]){const broken=structuredClone(data);broken.entries.find(e=>e.id==='xiu').coaching.sourceUrl=url;assert.throws(()=>validateDictionary(broken),/字源来源地址无效/);}
});


test('English model examples need a Chinese explanation but explanations without examples remain valid',()=>{
 const entry={id:'help',text:'help'},value={entryId:'help',reply:'可以这样请求帮助。',example:'Help me, please.',translation:'请帮帮我。',question:''};
 for(const translation of ['', '   ', 'Help me, please.'])assert.throws(()=>validateTutorReply({...value,translation},entry),/英文例句缺少中文解释/);
 assert.equal(validateTutorReply(value,entry).translation,'请帮帮我。');assert.equal(validateTutorReply({...value,example:'',translation:''},entry).example,'');
 assert.equal(validateTutorReply({...value,entryId:'xiu',example:'休息一下。',translation:''},{id:'xiu',text:'休'}).translation,'');
});

 test('one wrong spelling letter gets a precise correction without discarding correct letters',()=>{
  for(const [typed,position] of [['hallo',2],['jello',1],['hella',5],['ＨＡＬＬＯ！',2]]){
   const hint=spellingHint(typed,'hello');assert.match(hint,new RegExp(`第 ${position} 个字母需要调整，其余字母都写对了`));assert.doesNotMatch(hint,/hello|再听/);
  }
  assert.doesNotMatch(spellingHint('halla','hello'),/其余字母都写对了/);
  assert.match(spellingHint('hlelo','hello'),/顺序反了/);
  const e={id:'hello',text:'hello',meaning:'你好',example:'Hello!',coaching:{tip:'见面时用 hello 打招呼。'}};
  assert.match(tutorFallback(e,'en',{lastAttempt:{kind:'spelling',text:'hallo',correct:false}}).reply,/第 2 个字母需要调整，其余字母都写对了/);
 });

 test('direct requests for explanation leave practice while quoted sentences remain answers',()=>{
  for(const question of ['先不练了','不练了。','别考我了！','先讲讲怎么用','请讲解一下这个词','能不能讲讲这个例子？','Please explain this sentence.','Can you explain how to use help?','Stop practicing.','stop practice'])assert.equal(resolveTutorMode(question,'practice'),'explain',question);
  for(const question of ['他说“先讲讲怎么用”','Explain is a word.','He said please explain.','I can help.','我想练习，请讲解后出一道题'])assert.equal(resolveTutorMode(question,'practice'),'practice',question);
 });

test('authored word-form help reaches offline and online teaching without extra quiz',async()=>{
 const {formTutorQuestion}=await import('../js/dictionary_tutor_core.js'),{validateDictionary}=await import('../js/dictionary_core.js'),{readFile}=await import('node:fs/promises');
 const data=JSON.parse(await readFile(new URL('../data/adventure/dictionary/en.json',import.meta.url),'utf8'));validateDictionary(data);
 for(const entry of data.entries)for(const form of entry.forms||[]){
  assert.ok(entry.formNotes[form]);const question=formTutorQuestion(entry,form),reply=tutorFallback(entry,'en',{tutorQuestion:question});assert.equal(reply.reply,entry.formNotes[form].explanation);assert.equal(reply.question,'');assert.equal(reply.example,entry.formNotes[form].example);assert.equal(reply.translation,entry.formNotes[form].translation);
  const request=JSON.parse(tutorMessages(entry,'en',[],question)[1].content);assert.deepEqual(request.reference.formNotes[form],entry.formNotes[form]);
 }
 for(const notes of [null,[],{invented:'未收录的词形'},{children:''},{children:1}]){const broken=structuredClone(data);broken.entries.find(e=>e.id==='child').formNotes=notes;assert.throws(()=>validateDictionary(broken),/词形说明无效/);}
});

test('plain teacher prose remains invalid rather than bypassing the structured reply contract',async()=>{
 const {parseDialogueJson}=await import('../js/dialogue_json_core.js');
 const prose='两个孩子要说two children。\nexample: I see two children.\ntranslation: 我看见两个孩子。\nquestion:';
 assert.throws(()=>parseDialogueJson(prose),/格式不完整/);
 const parsed=parseDialogueJson(JSON.stringify({entryId:'child',reply:'两个孩子要说two children。',example:'I see two children.',translation:'我看见两个孩子。',question:''}));assert.equal(validateTutorReply(parsed,{id:'child',text:'child'}).example,'I see two children.');
});

test('valid inflections receive form guidance rather than misleading typo feedback',async()=>{
 const {readFile}=await import('node:fs/promises');const data=JSON.parse(await readFile(new URL('../data/adventure/dictionary/en.json',import.meta.url),'utf8'));
 for(const [id,typed] of [['child','children'],['write','wrote'],['help','HELPED!']]){
  const entry=data.entries.find(e=>e.id===id),hint=spellingHint(typed,entry.text,entry);
  assert.match(hint,/另一种词形/);assert.match(hint,/基本形式/);assert.doesNotMatch(hint,/多了|少了|顺序反了|字母需要调整/);
  assert.ok(tutorFallback(entry,'en',{lastAttempt:{kind:'spelling',text:typed,correct:false}}).reply.startsWith(hint));
 }
 const child=data.entries.find(e=>e.id==='child');assert.doesNotMatch(spellingHint('childs','child',child),/另一种词形/);
});

test('known everyday alternatives are explained without accepting them as the target spelling',async()=>{
 const {readFile}=await import('node:fs/promises'),{validateDictionary}=await import('../js/dictionary_core.js');const data=JSON.parse(await readFile(new URL('../data/adventure/dictionary/en.json',import.meta.url),'utf8'));
 for(const [id,text] of [['hello','HI!'],['goodbye','bye'],['mother','mom'],['mother','mum'],['father','dad'],['child','kid']]){
  const e=data.entries.find(e=>e.id===id),hint=spellingHint(text,e.text,e);assert.match(hint,/这次请回忆词页上的单词/);assert.doesNotMatch(hint,/检查第|字母需要调整|少了|多了/);assert.ok(tutorFallback(e,'en',{lastAttempt:{kind:'spelling',text,correct:false}}).reply.startsWith(hint));
  assert.deepEqual(JSON.parse(tutorMessages(e,'en',[],'为什么')[1].content).reference.spellingAlternatives,e.spellingAlternatives);
 }
 const e=data.entries[0];assert.doesNotMatch(spellingHint('hii',e.text,e),/这次请回忆词页上的单词/);
 for(const alternatives of [null,[{text:'hi',explanation:''}],[{text:'hello',explanation:'x'}],[{text:'hi',explanation:'x'},{text:'hi',explanation:'y'}]]){const broken=structuredClone(data);broken.entries[0].spellingAlternatives=alternatives;assert.throws(()=>validateDictionary(broken),/近义表达配置无效/);}
});

test('offline requests for simpler word explanations do not repeat the original coaching paragraph',async()=>{
 const {readFile}=await import('node:fs/promises');
 for(const language of ['en','zh']){const data=JSON.parse(await readFile(new URL('../data/adventure/dictionary/'+language+'.json',import.meta.url),'utf8'));
  for(const entry of data.entries){const first=tutorFallback(entry,language,{tutorQuestion:'帮我记住它'}),simpler=tutorFallback(entry,language,{tutorQuestion:'再简单一点'});assert.notEqual(simpler.reply,first.reply,entry.id);assert.ok(simpler.reply.includes(entry.meaning));assert.equal(simpler.example,entry.example);assert.equal(simpler.question,'');}
 }
});

test('simpler offline guidance keeps the actual correction and does not invent a new answer',()=>{
 const entry={text:'hello',meaning:'你好',example:'Hello!',translation:'你好！',coaching:{tip:'见面打招呼时可以先说hello。'}};
 const practice={tutorQuestion:'Simpler, please.',lastAttempt:{kind:'spelling',text:'hllo',correct:false}};
 assert.match(tutorFallback(entry,'en',practice).reply,/第 2 个位置少了一个字母/);assert.match(tutorFallback(entry,'en',practice).reply,/hello：你好/);
 assert.equal(tutorFallback(entry,'en',{tutorQuestion:'I want a simpler book.'}).reply,entry.coaching.tip);
});

test('Chinese teaching examples stay in the Chinese audio lane while requested English stays in prose',()=>{
 const entry={id:'yue',text:'月'},value={entryId:'yue',reply:'月份可以说 month。',example:'一月一日是新年。',translation:'',question:''};
 assert.equal(validateTutorReply(value,entry).reply,value.reply);
 assert.throws(()=>validateTutorReply({...value,translation:"January 1st is New Year's Day."},entry),/中文例句/);
 assert.throws(()=>validateTutorReply({...value,example:'January is a month.'},entry),/中文例句/);
 assert.equal(validateTutorReply({...value,translation:value.example},entry).translation,'');
});

test('explicit English requests on Chinese pages can carry a translated English example',async()=>{
 const {tutorReplyExamples,requestsEnglishExample}=await import('../js/dictionary_tutor_core.js');const entry={id:'yue',text:'月'},value={entryId:'yue',reply:'月份可以说month。',example:'a month',translation:'一个月',question:''};
 assert.equal(requestsEnglishExample('月份英文怎么说？'),true);assert.equal(requestsEnglishExample('月份是什么意思？'),false);
 const reply=validateTutorReply(value,entry,{allowEnglishExample:true});assert.deepEqual(tutorReplyExamples(reply),[{example:'a month',translation:'一个月',language:'en'}]);
 assert.throws(()=>validateTutorReply({...value,translation:''},entry,{allowEnglishExample:true}),/英文例句缺少中文/);
 assert.throws(()=>validateTutorReply({...value,exampleLanguage:'en'},entry),/中文例句/);
});

test('English teaching context survives short followups but stops at a new topic or explicit Chinese request',async()=>{
 const {requestsEnglishExample}=await import('../js/dictionary_tutor_core.js'),history=[{role:'learner',text:'月份用英文怎么说？'},{role:'teacher',text:'月份可以说month。'}];
 for(const q of ['再简单一点','再举个例子','换个例子','Another example, please.'])assert.equal(requestsEnglishExample(q,history),true,q);
 assert.equal(requestsEnglishExample('再简单一点',[...history,{role:'learner',text:'再举个例子'},{role:'teacher',text:'this month'}]),true);
 for(const q of ['不要英文，用中文说','不用英语','月有几笔？'])assert.equal(requestsEnglishExample(q,history),false,q);
 assert.equal(requestsEnglishExample('再简单一点',[...history,{role:'learner',text:'月有几笔？'},{role:'teacher',text:'4笔。'}]),false);
 assert.equal(requestsEnglishExample('再举个例子'),false);
});
