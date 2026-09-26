import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {eligibleStories,selectStory,nearbyLearningNpc,storyReward,learningModeDraft} from '../js/language_encounter_core.js';
import {createLanguageAdventure} from '../js/language_adventure.js';
import {createStoryChat} from '../js/language_story.js';
import {recordLearningCompletion,learningParams} from '../js/language_adventure_core.js';
import {normalizeLocaleSave} from '../js/locale_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const profiles=read('data/adventure/camp-conversations.json').profiles;
const profile=profiles.find(p=>p.npcId===36211);
const save=()=>({locale:'zh-CN',zone:'camp',position:{x:0,y:0},quests:{},inventory:{},pets:{},languageLearning:{enabled:true,target:'en',native:'zh-CN',showChinese:true},languageAdventure:{version:1,progress:{}}});
const flush=()=>new Promise(r=>setImmediate(r));

test('new language defaults follow display, explicit choices and legacy preferences survive',()=>{
    for(const [locale,target] of [['en','zh-CN'],['zh-CN','en'],['ja','en']]){const s={locale};normalizeLocaleSave(s);assert.equal(learningModeDraft(s).target,target);}
    const s={locale:'en',languageLearning:{enabled:false,target:'ja',native:'zh-CN'}};normalizeLocaleSave(s);assert.equal(learningModeDraft(s).target,'ja');
    const legacy={locale:'en',languageLearning:{enabled:false,target:'en',native:'zh-CN'}};normalizeLocaleSave(legacy);assert.equal(learningModeDraft(legacy).target,'en');
    s.languageLearning={...s.languageLearning,target:'en',selectionConfirmed:true};assert.equal(learningModeDraft(s).target,'en');
});
test('stage-gated side stories have a universal fallback and do not write main quests',()=>{
    const s=save(),before=structuredClone(s.quests);
    assert.equal(eligibleStories(profile,s).length,1);assert.equal(selectStory(profile,s).id,profile.stories[0].id);
    assert.deepEqual(s.quests,before);
    s.quests[63000]={claimed:true};s.languageAdventure.stories={en:{[profile.stories[0].id]:{completed:1,lastAt:1}}};
    assert.equal(selectStory(profile,s).id,profile.stories[1].id);
    assert.equal(eligibleStories(profiles.find(p=>p.npcId===36202),s).length,1);
});
test('nearby invitation selects actual eligible instances within range and never falls back to Azure Dragon',()=>{
    const s=save(),npc={id:profile.npcId,instanceId:profile.id,x:151,y:0};
    assert.equal(nearbyLearningNpc([npc],profiles,s,{}),null);
    npc.x=150;assert.equal(nearbyLearningNpc([npc],profiles,s,{}),npc);
    assert.equal(nearbyLearningNpc([{...npc,hidden:true}],profiles,s,{}),null);
    assert.equal(nearbyLearningNpc([{...npc,instanceId:'wrong-instance'}],profiles,s,{}),null);
});
test('reward previews respect configurable food prices, shared limits and partial allowance',()=>{
    const s=save(),story=profile.stories[0],content={balanceParams:{adventure:{foodPrice:5}}};
    assert.match(storyReward(s,content,story,0).use,/2 份/);
    const completion={course:{id:story.rewardGroup},mode:'basic',locale:'en',attemptId:'one',now:0,score:100,spoken:true};
    for(const attemptId of ['one','two']){const c={...completion,attemptId};recordLearningCompletion(s,content,c,{learningCompletion:c});}
    const capped=storyReward(s,content,story,0);assert.equal(capped.amount,0);assert.match(capped.reason,/次数/);
    s.languageAdventure.ledger.courses={};s.languageAdventure.ledger.totals[100]=97;
    assert.equal(storyReward(s,content,story,0).amount,3);
});
function controllerHarness(load){
    const state={save:save(),content:{},role:'one',identity:'guest',stage:'world',npcs:[]};let ui,spoken=[];
    const voice={cancel:async()=>{},speak:async text=>spoken.push(text),start:async()=>{},finish:async()=>'',judge:async()=>{}};
    const controller=createLanguageAdventure({getState:()=>state,load:load||(async()=>({profiles,languages:{en:{content:true},'zh-CN':{content:true}},dictionaries:{en:{hello:'hello'},'zh-CN':{hello:'你好'}},courses:[]})),voice,notify:()=>{},commit:()=>{throw Error('No greeting may claim a reward');},viewFactory:()=>({close(){},render(){}}),chatViewFactory:()=>({close(){},render:s=>{ui=s;}})});
    const npc={id:profile.npcId,instanceId:profile.id,x:20,y:0};state.npcs=[npc];
    return {controller,state,npc,spoken,get ui(){return ui;}};
}
test('greeting uses the locked first question; opens once without duplicate speech or completion',async()=>{
    const h=controllerHarness();h.state.save.languageLearning.autoSpeak=true;
    const p=await h.controller.prepare(h.npc);h.controller.greet(p,100);
    assert.equal(h.controller.greeting.text,p.story.turns[0].question.en);assert.equal(h.controller.greeting.translation,p.story.turns[0].question['zh-CN']);
    await flush();h.controller.tick(100+learningParams({}).greetingMs);await flush();
    assert.equal(h.ui.story.id,p.story.id);assert.equal(h.ui.messages.length,1);assert.equal(h.ui.index,0);assert.equal(h.ui.proof.length,0);assert.equal(h.spoken.length,1);
    h.controller.tick(9999);await flush();assert.equal(h.ui.messages.length,1);
});
test('closing, role changes, language changes and panels cancel greeting; late loading stays cancelled',async()=>{
    for(const change of [h=>h.controller.close(),h=>h.state.role='two',h=>h.state.save.languageLearning.target='zh-CN',h=>h.state.busy=true]){
        const h=controllerHarness(),p=await h.controller.prepare(h.npc);h.controller.greet(p,100);change(h);h.controller.tick(3000);await flush();assert.equal(h.controller.greeting,null);assert.equal(h.ui,undefined);
    }
    let finish;const h=controllerHarness(()=>new Promise(r=>{finish=r;}));const pending=h.controller.prepare(h.npc);h.controller.close();finish({profiles,languages:{en:{content:true}}});assert.equal(await pending,null);
});
test('basic reward unlocks optional challenge; hints stay optional and challenge credits shared currency',async()=>{
    const state={save:save(),content:{},role:'test',identity:'guest'};let cb,ui,text;
    const chat=createStoryChat({getState:()=>state,voice:{cancel:async()=>{},start:async()=>{},finish:async()=>text},commit:c=>recordLearningCompletion(state.save,{},c,{learningCompletion:c}),viewFactory:actions=>{cb=actions;return{close(){},render:s=>{ui=s;}};}});
    chat.open(profile,profile.stories[0],null);
    for(const turn of profile.stories[0].turns){text=turn.answer.en;await cb.start();await cb.finish();}
    assert.equal(ui.done,true);assert.equal(ui.received,10);assert.equal(ui.reward.balance,10);
    cb.challenge();assert.equal(ui.hintLevel,0);assert.equal(ui.reward.currency,17213);assert.equal(ui.reward.amount,30);
    for(const turn of profile.stories[0].turns){text=turn.answer.en;await cb.start();await cb.finish();}
    assert.equal(ui.received,30);assert.equal(ui.memento.independent,true);assert.deepEqual(state.save.quests,{});
});
