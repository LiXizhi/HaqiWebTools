import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateWordCards,recentWordCards,makeWordCardSnapshot,installWordCards,activateWordCard,wordReadingMatches,syncDictionaryQuestProgress} from '../js/word_cards_core.js';
import {prepareCard,cardsInHand,markCardUsed,markCardFizzled,discardCard,validateDiscardedCards} from '../js/combat_unit_core.js';
import {createPveBattle,playPveRound,restorePveBattle} from '../js/combat_pve_core.js';
import {emptyDictionary,completeDictionary,recordDictionaryAttempt,recordDictionaryView} from '../js/dictionary_core.js';
import {catalogQuestReady,catalogGoalRows} from '../js/adventure_catalog_quests_core.js';
import {observeBattle,haqiRulesAdapter} from '../js/battle_ai/haqi_adapter_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
const rows=read('adventure/dictionary/word-cards.json').cards,cards=read('kids/cards.json'),en=read('adventure/dictionary/en.json'),zh=read('adventure/dictionary/zh.json');
const state=()=>({languages:{zh:{entries:Object.fromEntries(zh.entries.slice(0,8).map((e,i)=>[e.id,{lastAttemptAt:100+i}]))},en:{entries:Object.fromEntries(en.entries.slice(0,8).map((e,i)=>[e.id,{lastReviewAt:200+i}]))}}});
const unit=n=>{const u={deckSeq:Array(n).fill('Fire_SingleAttack_Level0_60'),deckMap:Array(n).fill(0)};installWordCards(u,makeWordCardSnapshot(state(),rows,12),cards);return u;};
test('all 60 authored word cards reference supported existing effects and exact dictionary entries',()=>{
    assert.equal(validateWordCards(rows,cards).length,60);
    const effects=read('adventure/spell-effects.json');
    for(const r of rows){const e=(r.language==='zh'?zh:en).entries.find(e=>e.id===r.entryId);assert.ok(e);assert.ok(typeof r.readTranslation==='string'&&r.readTranslation.trim(),'authored bilingual sentence');assert.ok(r.readText.toLowerCase().includes(e.text.toLowerCase()));assert.ok(effects.cards[r.baseCardKey]);assert.equal(r.damage,undefined);}
    assert.throws(()=>validateWordCards([...rows,rows[0]],cards));assert.throws(()=>validateWordCards([{...rows[0],baseCardKey:'missing'}],cards));
});
test('recent ten combine languages, ignore browsing and freeze an independent deterministic order',()=>{
    const s=state();s.languages.zh.entries.wu={lastViewedAt:99999};const selected=recentWordCards(s,rows);assert.equal(selected.length,10);assert.equal(selected[0].id,'en:family');assert.ok(!selected.some(r=>r.entryId==='wu'));
    const a=makeWordCardSnapshot(s,rows,12);assert.deepEqual(a,makeWordCardSnapshot(s,rows,12));s.languages.zh.entries.wu.lastAttemptAt=99999;assert.ok(!a.cards.some(r=>r.entryId==='wu'));assert.equal(recentWordCards({},rows).length,0);
});
test('normal-rich hands reserve one word; short decks fill with words; all ten are finite',()=>{
    const u=unit(20);prepareCard(u);let hand=cardsInHand(u);assert.equal(hand.length,8);assert.equal(hand.filter(h=>u.wordCards[h.seq]).length,1);
    const normal=hand.find(h=>!u.wordCards[h.seq]);markCardUsed(u,normal.seq);prepareCard(u);assert.equal(cardsInHand(u).filter(h=>u.wordCards[h.seq]).length,1);
    const small=unit(2);prepareCard(small);assert.equal(cardsInHand(small).filter(h=>small.wordCards[h.seq]).length,6);
    for(const h of cardsInHand(small)){discardCard(small,h.seq);}validateDiscardedCards(small);prepareCard(small);assert.equal(cardsInHand(small).length,4);
    for(const h of cardsInHand(small))markCardFizzled(small,h.seq);prepareCard(small);assert.equal(cardsInHand(small).length,0);assert.equal(small.deckSeq.length,12);
});
test('repeat practice updates recency without duplicate reward or accelerating review stage',()=>{
    const s=emptyDictionary(),now=new Date(2026,9,17,12).getTime();recordDictionaryView(s,'en','hello',now);assert.equal(recentWordCards(s,rows).length,0);
    const first=completeDictionary(s,en,'hello',{now});const due=s.languages.en.entries.hello.nextReviewAt;
    const second=completeDictionary(s,en,'hello',{now:now+100});assert.equal(first.eligible,true);assert.equal(second.eligible,false);assert.equal(s.languages.en.entries.hello.lastAttemptAt,now+100);assert.equal(s.languages.en.entries.hello.nextReviewAt,due);
    recordDictionaryAttempt(s,'en','water',{now:now+200,error:true});assert.equal(recentWordCards(s,rows)[0].id,'en:water');
});
test('reading requires the complete utterance; formatting alone is ignored',()=>{
    assert.ok(wordReadingMatches('HELLO, my friend!','Hello, my friend.'));assert.ok(wordReadingMatches('火 花。','火花'));assert.ok(!wordReadingMatches('hello','Hello, my friend.'));assert.ok(!wordReadingMatches('火','火花'));assert.ok(!wordReadingMatches('','火花'));
});
test('island tasks use one successful exercise, not legacy fragments; old claimed quests remain complete',()=>{
    const q=read('adventure/island-packs/hanzi.json').quests.find(q=>q.id===873100),content={catalogQuests:{quests:[q]}};
    const save={languageLearning:{target:'zh-CN'},hanzi:{memories:{fragments:Object.fromEntries(q.groups[0].items.map(i=>[i.id,3]))}},quests:{[q.id]:{accepted:true,claimed:false,progress:{'hanzi:shan':3}}}};
    assert.equal(catalogQuestReady(save,content,q),false);
    syncDictionaryQuestProgress(save,content,{languages:{zh:{entries:Object.fromEntries(q.groups[0].items.map(i=>[i.id,{learned:true}]))}}});assert.ok(catalogQuestReady(save,content,q));assert.equal(save.quests[q.id].progress['hanzi:shan'],1);
    save.quests[q.id]={accepted:true,claimed:true,progress:{}};assert.ok(catalogGoalRows(save,content,q).every(g=>g.value===g.count));
});
for(const version of [1,2])test(`v${version} word activation and checkpoint replay restore spent/activated state`,()=>{
    const dataset=read('adventure/combat.json');dataset.cards={...dataset.cards,...cards};
    const word=rows.find(r=>r.id==='zh:huo'),snapshot={version,cards:[word],activated:[]};
    const player={id:'hero',school:'fire',level:5,deck:[{key:'Fire_SingleAttack_Level0_60',count:2}]};
    const monster={id:'foe',school:'ice',level:1,hp:50000,attributes:{},pool:[],sequences:[],genes:[],cardsets:{}};
    const battle=createPveBattle({dataset,player,monsters:[monster],seed:77,wordCards:snapshot}),hero=battle.sides.near[0],h=cardsInHand(hero).find(h=>hero.wordCards[h.seq]),decision={...h,targetId:'mob0'};
    assert.throws(()=>playPveRound(battle,decision),/激活/);activateWordCard(hero,h.seq);snapshot.activated.push(word.id);
    playPveRound(battle,decision);assert.equal(hero.deckMap[h.seq],-2);assert.ok(battle.events.some(e=>e.wordCardText===word.readText&&e.card===word.baseCardKey));
    const checkpoint={encounterId:'test',monster,player,seed:77,wordCards:snapshot,decisions:[battle.lastDecision]};
    const restored=restorePveBattle(dataset,{encounters:[{id:'test'}]},checkpoint);assert.deepEqual(restored.events,battle.events);assert.deepEqual(restored.sides.near[0].deckMap,hero.deckMap);
});


test('v2 reserves a word in full ordinary hands and replenishes each round until exhausted',()=>{
    const u=unit(30);u.deckMap.fill(1,0,8);prepareCard(u);
    assert.equal(cardsInHand(u).length,8);assert.equal(u.deckMap[7],0);
    for(let n=0;n<10;n++){
        const words=cardsInHand(u).filter(h=>u.wordCards[h.seq]);assert.equal(words.length,1);
        if(n%3===0)markCardUsed(u,words[0].seq);
        else if(n%3===1)markCardFizzled(u,words[0].seq);
        else{discardCard(u,words[0].seq);validateDiscardedCards(u);}
        prepareCard(u);assert.equal(cardsInHand(u).length,8);
    }
    assert.equal(cardsInHand(u).filter(h=>u.wordCards[h.seq]).length,0);
    const old=unit(30);old.wordCardRulesVersion=1;old.deckMap.fill(1,0,8);prepareCard(old);
    assert.equal(cardsInHand(old).filter(h=>old.wordCards[h.seq]).length,0);
});
