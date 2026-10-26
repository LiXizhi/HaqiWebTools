import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildWordIndex,parseWordLexicon} from '../js/word_lexicon_core.js';
import {curriculumWordCards,validateLanguageCurriculum,mergeCurriculumWordCards} from '../js/language_curriculum_core.js';
import {validateWordCards,makeWordCardSnapshot,installWordCards} from '../js/word_cards_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const curriculum=read('data/adventure/curriculum/english-level-one.json');
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
const base='Life_SingleHeal_Level0',cards=read('data/kids/cards.json');
const rows=curriculumWordCards(curriculum,index,base);

test('every English L1 target has a canonical card without granting any eligibility',()=>{
    validateWordCards(rows,cards);assert.equal(rows.length,180);
    for(const word of curriculum.words){
        const row=rows.find(r=>r.entryId===word.entryId);
        assert.equal(row.treeEntryId,word.entryId);assert.equal(row.readText,word.word);
        assert.equal(row.baseCardKey,base);
    }
    assert.deepEqual(makeWordCardSnapshot({languages:{}},rows,7,10,'en').cards,[]);
    const practiced={languages:{en:{entries:{book:{lastAttemptAt:1}}},ja:{entries:{book:{lastAttemptAt:99}}}}};
    const snapshot=makeWordCardSnapshot(practiced,rows,7,10,'en');
    assert.deepEqual(snapshot.cards.map(r=>r.entryId),['book']);
    assert.deepEqual(makeWordCardSnapshot(practiced,rows,7,10,'ja').cards,[]);
    const unit={deckSeq:[],deckMap:[]};installWordCards(unit,snapshot,cards);
    assert.equal(unit.wordCards[0].treeEntryId,'book');assert.equal(unit.wordCards[0].activated,false);
});

test('larger curriculum keeps the ten-candidate cap, deterministic selection and frozen checkpoint content',()=>{
    const state={languages:{en:{entries:Object.fromEntries(rows.map((r,i)=>[r.entryId,{lastAttemptAt:i+1}]))}}};
    const snapshot=makeWordCardSnapshot(state,rows,71,100,'en');assert.equal(snapshot.cards.length,10);
    assert.deepEqual(snapshot,makeWordCardSnapshot(state,rows,71,100,'en'));
    const frozen=structuredClone(snapshot),changed=structuredClone(rows);changed.forEach(r=>{r.readText='changed';});
    assert.notDeepEqual(snapshot,makeWordCardSnapshot(state,changed,71,10,'en'));
    const unit={deckSeq:[],deckMap:[]};installWordCards(unit,snapshot,cards);
    assert.deepEqual(snapshot,frozen);assert.equal(unit.wordCards[0].readText,frozen.cards[0].readText);
});

test('ambiguous, duplicate or unmapped curriculum identities fail before cards reach battle',()=>{
    const duplicate=structuredClone(curriculum);duplicate.words.push(duplicate.words[0]);
    assert.throws(()=>validateLanguageCurriculum(duplicate,index));
    const wrong=structuredClone(curriculum);wrong.words[0].entryId='different-word';
    assert.throws(()=>curriculumWordCards(wrong,index,base));
    assert.throws(()=>curriculumWordCards({...curriculum,language:'ja'},index,base));
});

test('production merging preserves legacy card effects and adds every missing core target once',()=>{
    const legacy=read('data/adventure/dictionary/word-cards.json').cards,combined=mergeCurriculumWordCards(legacy,rows);
    validateWordCards(combined,cards);
    for(const old of legacy)assert.deepEqual(combined.find(r=>r.id===old.id),old);
    assert.equal(combined.find(r=>r.id==='en:book').baseCardKey,'Storm_SingleAttack_Level1');
    assert.equal(combined.find(r=>r.id==='en:lamp').treeEntryId,'lamp');
    for(const row of rows)assert.equal(combined.filter(r=>r.id===row.id).length,1);
    assert.deepEqual(mergeCurriculumWordCards(combined,rows),combined);
});
