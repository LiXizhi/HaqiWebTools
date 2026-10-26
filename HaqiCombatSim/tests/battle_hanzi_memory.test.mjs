import {syncDictionaryQuestProgress} from '../js/word_cards_core.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {memoryParams,memoryCount,memoryQuest,chooseMemoryWord,createMemoryNodes,advanceMemoryChant,releaseMemoryNodes,completeMemory,validateMemoryProgress} from '../js/hanzi_memory_core.js';
import {createHanziProgress,validateHanziProgress} from '../js/hanzi_core.js';
import {ownsHanziCard} from '../js/hanzi_battle_core.js';
import {catalogGoalRows,catalogVisibleGoalRows,catalogQuestReady,claimCatalogQuest,catalogAcceptBlock} from '../js/adventure_catalog_quests_core.js';
import {durableSave,runtimeValues} from '../js/adventure_storage_core.js';
import {connectHanziAnimation} from '../js/hanzi_animation_bridge.js';
const pack=JSON.parse(fs.readFileSync(new URL('../data/adventure/island-packs/hanzi.json',import.meta.url)));
const cfg=pack.memory,params=memoryParams({}),quest=pack.quests.find(q=>q.id===cfg.stories[0].questId);
const state=()=>({languageLearning:{target:'zh-CN'},seed:77,zone:'hanzi',hanzi:createHanziProgress(),quests:{},inventory:{}});
const collect=(save,word,key='hanzi:0')=>{const cycle=save.hanzi.memories?.receipts[key]||0;const result=completeMemory(save.hanzi,{key,cycle,word},cfg,params,'write');save.hanzi=result.progress;return result;};
test('authored six stories cover exactly all 30 dictionary entries with per-character life feedback',()=>{
    const dictionary=JSON.parse(fs.readFileSync(new URL('../data/adventure/dictionary/zh.json',import.meta.url)));
    assert.deepEqual([...cfg.words].sort(),dictionary.entries.map(e=>e.id).sort());assert.equal(new Set(cfg.words).size,30);
    for(const story of cfg.stories){assert.equal(story.words.length,5);for(const word of story.words){assert.equal(story.memories[word].glimpses.length,3);assert.ok(story.memories[word].restored);}}
});
test('tracked quest wins over overdue review; review then uncollected then next due',()=>{
    const save=state(),review={ri:{nextReviewAt:1},yue:{nextReviewAt:2}};assert.equal(chooseMemoryWord(save,cfg,review,100),'ri');
    save.quests[quest.id]={accepted:true,claimed:false,progress:{}};save.trackedQuestIds=[quest.id];assert.equal(memoryQuest(save,cfg).questId,quest.id);assert.equal(chooseMemoryWord(save,cfg,review,100),'shan');
    for(let i=0;i<3;i++)collect(save,'shan');assert.equal(chooseMemoryWord(save,cfg,review,100),'shang');
    save.quests[quest.id].claimed=true;assert.equal(chooseMemoryWord(save,cfg,{},100),'shang');
    for(const word of cfg.words)for(let i=0;i<3;i++)collect(save,word);assert.equal(chooseMemoryWord(save,cfg,{ri:{nextReviewAt:500},yue:{nextReviewAt:400}},100),'yue');
});
test('three receipts collect one card without manufacturing legacy practice; duplicates and future cycles do not grant',()=>{
    const save=state(),pending={key:'hanzi:0',cycle:0,word:'huo'};
    save.hanzi=completeMemory(save.hanzi,pending,cfg,params,'animation').progress;
    assert.equal(completeMemory(save.hanzi,pending,cfg,params,'write').changed,false);
    assert.equal(completeMemory(save.hanzi,{...pending,cycle:9},cfg,params,'write').changed,false);
    collect(save,'huo');assert.equal(ownsHanziCard(save.hanzi,'huo'),false);assert.equal(collect(save,'huo').collected,true);
    assert.equal(ownsHanziCard(save.hanzi,'huo'),true);assert.equal(collect(save,'huo').collected,false);assert.deepEqual(save.hanzi.entries,{});assert.equal(memoryCount(save.hanzi,'huo'),3);validateHanziProgress(save.hanzi);
    assert.throws(()=>completeMemory(save.hanzi,{...pending,word:'unknown'},cfg,params,'write'));
    assert.throws(()=>validateMemoryProgress({version:1,fragments:{ri:-1},receipts:{}}));
});
test('legacy cards and valid partial practice carry forward, without changing original history',()=>{
    const save=state();save.hanzi.questCards=['huo'];save.hanzi.entries.ri={attempts:[{stage:0,method:'write',hinted:false,at:1}]};
    assert.equal(memoryCount(save.hanzi,'huo'),3);assert.equal(memoryCount(save.hanzi,'ri'),1);const old=structuredClone(save.hanzi.entries);collect(save,'ri');assert.equal(memoryCount(save.hanzi,'ri'),2);assert.deepEqual(save.hanzi.entries,old);
});
test('node selection is seeded and receipt cycles change only consumed nodes',()=>{
    const save=state(),candidates=Array.from({length:80},(_,i)=>({x:i*100,y:100}));const first=createMemoryNodes(save,cfg,candidates,params);
    assert.deepEqual(first,createMemoryNodes(save,cfg,candidates,params));assert.equal(new Set(first.map(n=>n.x)).size,12);save.hanziMemoryRuntime={cycles:{'hanzi:0':1}};const next=createMemoryNodes(save,cfg,candidates,params);assert.equal(next[0].cycle,1);assert.equal(next[1].cycle,0);
});
test('chant requires four stationary seconds and resets on movement, combat or hidden frame',()=>{
    const node={id:'one'},p={x:10,y:20};let chant=null;for(let i=0;i<41;i++)chant=advanceMemoryChant(chant,node,p,.1,true,params);assert.ok(chant.ready);
    assert.equal(advanceMemoryChant(chant,node,{x:11,y:20},.1,true,params).progress,0);assert.equal(advanceMemoryChant(chant,node,p,.1,false,params),null);assert.equal(advanceMemoryChant(chant,node,p,5,true,params),null);
});
test('victory moves every enclosed fragment outside all territories; unrelated nodes retain location',()=>{
    const a={x:0,y:0},b={x:300,y:0},nodes=[{id:1,x:10,y:10},{id:2,x:20,y:0},{id:3,x:800,y:0}];
    const moved=releaseMemoryNodes(nodes,a,[a,b],[{x:120,y:0},{x:300,y:0},{x:0,y:200}],100);
    assert.ok(moved[0].released&&moved[1].released);for(const n of moved.slice(0,2))for(const g of [a,b])assert.ok(Math.hypot(n.x-g.x,n.y-g.y)>124);assert.deepEqual(moved[2],nodes[2]);
});
test('new quest waits for complete cards and suppresses rewards already claimed in legacy story',()=>{
    const save=state(),content={catalogQuests:{quests:pack.quests,byId:Object.fromEntries(pack.quests.map(q=>[q.id,q]))},items:{}};save.quests[quest.id]={accepted:true,claimed:false,progress:{}};
    syncDictionaryQuestProgress(save,content,{languages:{zh:{entries:{shan:{learned:true}}}}});assert.equal(catalogGoalRows(save,content,quest)[0].value,1);assert.equal(catalogQuestReady(save,content,quest),false);
    syncDictionaryQuestProgress(save,content,{languages:{zh:{entries:Object.fromEntries(cfg.stories[0].words.map(id=>[id,{learned:true}]))}}});assert.equal(catalogQuestReady(save,content,quest),true);
    save.quests[quest.legacyRewardQuestId]={accepted:true,claimed:true,progress:{}};assert.deepEqual(claimCatalogQuest(save,content,quest.id,quest.endNpc).rewards,[]);assert.ok(catalogAcceptBlock(state(),content,pack.quests[0]));
});
test('animation bridge checks source/origin/session, supports written and subtitle/UI locales, and never treats translation or load as completion',()=>{
    const target=new EventTarget(),listeners={},sent=[],child={postMessage:(m,o)=>sent.push([m,o])},frame={src:'https://cdn.keepwork.com/hanzi/example.html',contentWindow:child,addEventListener:(k,f)=>listeners[k]=f,removeEventListener:k=>delete listeners[k]};let written=0,completed=0;
    const stop=connectHanziAnimation(frame,{entryId:'ri',sessionId:'one',locale:'zh-CN',subtitleLocale:'en',translate:(s,loc)=>loc==='en'&&s==='日'?'Sun':s,onWritten:()=>written++,onComplete:()=>completed++,eventTarget:target});
    const emit=(data,source=child,origin='https://cdn.keepwork.com')=>{const event=new Event('message');Object.assign(event,{data:{channel:'haqi-hanzi',version:1,sessionId:'one',entryId:'ri',...data},source,origin});target.dispatchEvent(event);};
    listeners.load();emit({type:'ready'});assert.equal(sent.at(-1)[0].locale,'zh-CN');assert.equal(sent.at(-1)[0].subtitleLocale,'en');
    emit({type:'translate',requestId:'a',texts:['日']});assert.equal(written,0);assert.equal(completed,0);assert.deepEqual(sent.at(-1)[0].translations,{'日':'Sun'});assert.deepEqual(sent.at(-1)[0].uiTranslations,{});
    emit({type:'written'},{});emit({type:'written'},child,'https://evil.test');emit({type:'written',sessionId:'old'});assert.equal(written,0);
    emit({type:'written'});emit({type:'written'});assert.equal(written,1);assert.equal(completed,0);
    emit({type:'completed'},{});emit({type:'completed'},child,'https://evil.test');emit({type:'completed',sessionId:'old'});assert.equal(completed,0);emit({type:'completed'});emit({type:'completed'});assert.equal(completed,1);stop();emit({type:'completed'});assert.equal(completed,1);
});

test('all eight hanzi story animations implement protocol v1 written, completed, bilingual subtitle, and UI translation hooks',()=>{
    for(const name of ['men','xiu','sen','guang','guo','yu','ming','wu']){
        const html=fs.readFileSync(new URL(`../hanzi/hanzi_${name}.html`,import.meta.url),'utf8');
        assert.match(html,/channel:'haqi-hanzi',version:1/,name);
        assert.match(html,/window\.haqiHanziWritten\s*=/,name);
        assert.match(html,/window\.haqiHanziComplete\s*=/,name);
        assert.match(html,/window\.haqiHanziUi\s*=/,name);
        assert.match(html,/window\.haqiHanziCaption\s*=/,name);
        assert.match(html,/\.haqi-sub-trans/,name);
        assert.match(html,/haqiHanziWritten\?\.\(\)/,name);
        const introMatch=html.match(/async function introPlay[\s\S]*?\n\}/);
        if(introMatch)assert.doesNotMatch(introMatch[0],/haqiHanziComplete/,`${name} introPlay should not fire completed`);
    }
});

test('quest memories rotate across the least complete story words',()=>{
    const save=state();save.quests[quest.id]={accepted:true,claimed:false};
    for(let start=0;start<5;start+=2)for(let round=0;round<3;round++)for(const word of cfg.stories[0].words.slice(start,start+2)){assert.equal(chooseMemoryWord(save,cfg),word);collect(save,word);}
    for(const word of cfg.stories[0].words)assert.equal(memoryCount(save.hanzi,word),3);
});

test('memory chant stays longer than the configured normal monster warning',()=>{
    assert.ok(memoryParams({}).chantSeconds>1.5);
    assert.ok(memoryParams({balanceParams:{monsterScene:{alertDelay:6}}}).chantSeconds>6);
});

test('visible practice goals advance after one success, while every story word remains required',()=>{
    const save=state(),content={catalogQuests:{quests:[quest]}};save.quests[quest.id]={accepted:true,claimed:false,progress:{}};
    assert.deepEqual(catalogVisibleGoalRows(save,content,quest).map(g=>g.id),['shan','shang']);
    syncDictionaryQuestProgress(save,content,{languages:{zh:{entries:{shan:{learned:true}}}}});
    assert.deepEqual(catalogVisibleGoalRows(save,content,quest).map(g=>g.id),['shang','xia']);
    assert.equal(catalogQuestReady(save,content,quest),false);assert.equal(catalogGoalRows(save,content,quest).length,5);
});
