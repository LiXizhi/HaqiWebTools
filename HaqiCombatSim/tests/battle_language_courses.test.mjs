import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {WORD_LANGUAGES,parseWordLexicon,buildWordIndex,seedWordLexicon,wordTreeKey} from '../js/word_lexicon_core.js';
import {validateLanguageCourses,courseWordCards,completeCourseStep,coursePosition,courseInteractionMatches} from '../js/language_course_core.js';
import {emptyLanguageTree} from '../js/language_tree_core.js';
import {learningQuestMatches} from '../js/learning_quest_core.js';
import {validateWordCards,makeWordCardSnapshot,syncDictionaryQuestProgress} from '../js/word_cards_core.js';
import {acceptCatalogQuest,catalogQuestReady,catalogQuestStatus,claimCatalogQuest,catalogTalksForNpc,trackedQuestIds,noteCatalogKills,noteCatalogSignal} from '../js/adventure_catalog_quests_core.js';
import {createQuestMarkerCache} from '../js/adventure_quest_marker_cache_core.js';
import {homePracticeWords,homeGameActions,homeGameMessages,validateHomeGame,homeGameAnswer,homeGameActionMatches} from '../js/home_language_game_core.js';
import {languageQuestRows,recommendedLanguageQuest,withLanguageQuest} from '../js/language_quest_core.js';
import {focusJournalQuest,filterJournalQuests,journalQuestStatus} from '../js/adventure_quest_journal_core.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'));
const indexes=Object.fromEntries(WORD_LANGUAGES.map(l=>[l,buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_'+l+'.txt',import.meta.url),'utf8'),l))]));
const data=read('data/adventure/island-language-courses.json'),cards=read('data/kids/cards.json'),rows=courseWordCards(data,indexes,'Life_SingleHeal_Level0');

test('language tasks join the island journal and reserve a tracker slot only in bilingual mode',()=>{
    const content={quests:[],catalogQuests:{quests:[],byId:{}}},save={zone:'town',quests:{},languageLearning:{enabled:true,target:'en'}},state=emptyLanguageTree();
    let tasks=languageQuestRows(data,state,'en'),recommended=recommendedLanguageQuest(save,content,tasks);
    assert.equal(recommended.id,'course:en-town-01');assert.equal(recommended.status,'可接取');
    const tracked=withLanguageQuest([{id:1},{id:2},{id:3}],recommended);assert.equal(tracked.length,3);assert.equal(tracked[0].id,recommended.id);
    assert.equal(withLanguageQuest(tracked,recommended).filter(q=>q.id===recommended.id).length,1);
    assert.deepEqual(filterJournalQuests(tasks,{region:'town'},save,content).map(q=>q.id),[recommended.id]);
    assert.equal(focusJournalQuest(tasks,{region:'fire'},recommended.id,20,save,content).filters.region,'town');
    state.courses={'en-town-01':{acceptedAt:10,next:0}};tasks=languageQuestRows(data,state,'en');assert.equal(journalQuestStatus(save,content,tasks.find(q=>q.id===recommended.id)),'进行中');
    state.courses['en-town-01'].scene={version:1,next:4};tasks=languageQuestRows(data,state,'en');assert.equal(tasks.find(q=>q.id===recommended.id).status,'已完成');assert.notEqual(recommendedLanguageQuest(save,content,tasks).id,recommended.id);
    save.zone='fire';assert.equal(recommendedLanguageQuest(save,content,tasks).id,'course:en-fire-01');
    save.languageLearning.enabled=false;assert.equal(recommendedLanguageQuest(save,content,tasks),null);
    save.languageLearning.enabled=true;save.languageLearning.target='ja';assert.equal(recommendedLanguageQuest(save,content,tasks),null);
    assert.equal(recommendedLanguageQuest(save,content,languageQuestRows(data,emptyLanguageTree(),'ja')).id,'course:ja-fire-01');
});

test('Chinese language tracking uses the original quest identity and completed local course states stay readable',()=>{
    const quest=structuredClone(read('data/adventure/island-packs/hanzi.json').quests.find(q=>q.id===873100));
    const content={quests:[],catalogQuests:{quests:[quest],byId:{[quest.id]:quest}}},save={zone:'hanzi',level:10,quests:{},languageLearning:{enabled:true,target:'zh-CN'}};
    const tasks=languageQuestRows(data,emptyLanguageTree(),'zh');assert.ok(!tasks.some(q=>q.region==='hanzi'));
    assert.equal(recommendedLanguageQuest(save,content,tasks).id,873100);
    save.quests[quest.id]={accepted:true,claimed:true};assert.notEqual(recommendedLanguageQuest(save,content,tasks).id,873100);
});
test('nine recommended islands have independently authored four-language stories and every target has a playable card',()=>{
    validateLanguageCourses(data,indexes);validateWordCards(rows,cards);
    assert.deepEqual(data.route.map(r=>r.island),['hanzi','town','fire','ice','desert','dark','tide','float','sail']);
    for(const l of WORD_LANGUAGES){assert.equal(data.courses.filter(c=>c.language===l).length,9);assert.ok(rows.some(r=>r.language===l));}
    assert.equal(data.courses.find(c=>c.id==='en-hanzi-01').steps.length,6);
    assert.equal(new Set(data.courses.filter(c=>!c.legacyQuestIds).map(c=>c.context)).size,35);
    const keys=indexes.zh.data.keys;for(const l of WORD_LANGUAGES)assert.deepEqual(new Set(indexes[l].data.keys),new Set(keys));
    const all=[...rows,...read('data/adventure/dictionary/word-cards.json').cards.filter(r=>!rows.some(x=>x.id===r.id))];assert.ok(all.length>60);validateWordCards(all,cards);
});
test('course answers are persisted once, wrong answers do not advance, and language progress remains independent',()=>{
    for(const language of WORD_LANGUAGES){const course=data.courses.find(c=>c.language===language&&!c.legacyQuestIds),index=indexes[language],state=emptyLanguageTree();seedWordLexicon(state,index);const step=course.steps[0],event={id:'one',at:10,input:'text',interaction:{...step.interaction,zone:course.island,distance:30}};
        assert.equal(completeCourseStep(state,course,step.id,'wrong',event,index),false);assert.equal(coursePosition(state,course),0);
        assert.ok(completeCourseStep(state,course,step.id,step.answer,event,index));assert.equal(coursePosition(state,course),1);
        assert.equal(completeCourseStep(state,course,step.id,step.answer,event,index),false);
        assert.equal(Object.keys(state.practiceReceipts).length,1);assert.ok(!state.masteryEarned);
    }
    assert.equal(new Set(WORD_LANGUAGES.map(l=>wordTreeKey('role',l))).size,4);
});
test('new snapshots select only the requested language and leave old mixed snapshots reproducible',()=>{
    const state={languages:Object.fromEntries(WORD_LANGUAGES.map(l=>[l,{entries:Object.fromEntries(rows.filter(r=>r.language===l).map((r,i)=>[r.entryId,{lastAttemptAt:i+1}]))}]))};
    for(const l of WORD_LANGUAGES){const a=makeWordCardSnapshot(state,rows,3,10,l);assert.ok(a.cards.length);assert.ok(a.cards.every(r=>r.language===l));assert.deepEqual(a,makeWordCardSnapshot(state,rows,3,10,l));}
    assert.deepEqual(makeWordCardSnapshot({languages:{}},rows,3,10,'ja').cards,[]);
    assert.deepEqual(makeWordCardSnapshot(state,rows,3),makeWordCardSnapshot(state,rows,3));
});
test('Chinese task switching blocks signals, direct claims and tracking while preserving records',()=>{
    const quest=structuredClone(read('data/adventure/island-packs/hanzi.json').quests.find(q=>q.id===873100));
    const content={quests:[],catalogQuests:{quests:[quest],byId:{[quest.id]:quest},paths:{monster:12}}},save={zone:'hanzi',level:10,quests:{},languageLearning:{target:'zh-CN'}};
    assert.ok(learningQuestMatches({...save,locale:'en'},quest));acceptCatalogQuest(save,content,quest.id,quest.startNpc);
    const previous=structuredClone(save.quests);save.languageLearning.target='en';
    assert.equal(catalogTalksForNpc(save,content,quest.startNpc).length,0);assert.deepEqual(trackedQuestIds(save,content),[]);
    noteCatalogSignal(save,content,'talk',quest.startNpc);noteCatalogKills(save,content,[{source:'monster'}]);
    const learned={languages:{zh:{entries:Object.fromEntries(quest.groups[0].items.map(i=>[i.id,{learned:true}]))}}};
    syncDictionaryQuestProgress(save,content,learned);assert.deepEqual(save.quests,previous);assert.throws(()=>claimCatalogQuest(save,content,quest.id,quest.endNpc));
    save.languageLearning.target='zh-CN';syncDictionaryQuestProgress(save,content,learned);assert.ok(catalogQuestReady(save,content,quest));
    const cache=createQuestMarkerCache(s=>learningQuestMatches(s,quest)?'!':null,()=>({}));assert.equal(cache.forState(save,content)(1),'!');save.languageLearning.target='ja';assert.equal(cache.forState(save,content)(1),null);
    save.quests[quest.id].claimed=true;assert.equal(catalogQuestStatus(save,content,quest),'已完成');
});
test('home AI cannot invent actions, use unlearned targets or count a spoken answer as a completed physical action',()=>{
    const objects=[{id:'chair1',itemId:'chair',x:1,y:2}],pets=[{id:'pet1'}],catalog=[{id:'chair',zh:'椅子',activity:'sit'}],index=indexes.en;
    const actions=homeGameActions('care',objects,pets,catalog);assert.equal(actions.length,1);
    const args={mode:'care',words:['chair'],actions,index,objects,catalog};
    const value={prompt:'Where can I sit?',answer:'Please use the chair.',reply:'Thank you.',words:['chair'],action:actions[0]};
    const game=validateHomeGame(value,args);assert.ok(homeGameAnswer(game,value.answer));assert.ok(!homeGameAnswer(game,'chair'));
    assert.ok(!homeGameActionMatches(game,{kind:'speech'}));assert.ok(!homeGameActionMatches(game,{...actions[0],petId:'other'}));assert.ok(homeGameActionMatches(game,actions[0]));
    assert.throws(()=>validateHomeGame({...value,words:['water']},args));assert.throws(()=>validateHomeGame({...value,action:{kind:'create',objectId:'castle'}},args));
    assert.deepEqual(homeGameActions('care',objects,[],catalog),[]);assert.equal(homeGameActions('find',objects,pets,catalog)[0].kind,'find');assert.equal(homeGameActions('arrange',objects,pets,catalog)[0].kind,'move');
    const state={words:{chair:{lastPractice:{at:3}},water:{count:100},friend:{mark:'know',lastPractice:{at:9}}}};assert.deepEqual(homePracticeWords(state,index),['chair','friend']);
    assert.match(homeGameMessages({...args,mode:'turn',turn:1})[0].content,/second turn/);
});

test('scene tasks require real matching nearby interactions or victory, keeping old worksheet records separate',()=>{
 const c=data.courses.find(c=>c.id==='en-hanzi-01'),state=emptyLanguageTree(),index=indexes.en;seedWordLexicon(state,index);
 state.courses={[c.id]:{next:6,acceptedAt:1}};assert.equal(coursePosition(state,c),0);
 const step=c.steps[0],event={id:'scene-proof',at:100,input:'text'};
 assert.equal(completeCourseStep(state,c,step.id,step.answer,event,index),false);
 for(const interaction of [{...step.interaction,zone:'town',distance:10},{...step.interaction,zone:'hanzi',distance:101},{kind:'npc',id:863003,zone:'hanzi',distance:10}])assert.equal(completeCourseStep(state,c,step.id,step.answer,{...event,interaction},index),false);
 assert.ok(completeCourseStep(state,c,step.id,step.answer,{...event,interaction:{...step.interaction,zone:'hanzi',distance:40}},index));assert.equal(state.courses[c.id].next,6);assert.equal(coursePosition(state,c),1);
 const combat=c.steps.find(s=>s.interaction.kind==='encounter');assert.equal(courseInteractionMatches(c,combat,{interaction:{...combat.interaction,zone:'hanzi',won:false}}),false);assert.ok(courseInteractionMatches(c,combat,{interaction:{...combat.interaction,zone:'hanzi',won:true}}));
});
