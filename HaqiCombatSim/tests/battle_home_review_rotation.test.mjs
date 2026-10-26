import test from 'node:test';
import assert from 'node:assert/strict';
import {homePracticeWords} from '../js/home_language_game_core.js';
import {recordEffectivePractice} from '../js/language_practice_core.js';
import {buildWordIndex,parseWordLexicon} from '../js/word_lexicon_core.js';
import {seedWordLexicon} from '../js/word_lexicon_core.js';
import {emptyLanguageTree} from '../js/language_tree_core.js';
import fs from 'node:fs';

const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));

test('home review returns to older words and rotates after verified practice without dropping known words',()=>{
    const state=emptyLanguageTree();seedWordLexicon(state,index);
    const ids=[...index.entries.keys()].slice(0,12);
    ids.forEach((id,i)=>{state.words[id].lastPractice={at:i+1};state.words[id].mark=i===0?'know':'basic';});
    const seen=new Set();
    for(let round=0;round<4;round++){
        const words=homePracticeWords(state,index);
        assert.equal(words.length,3);
        words.forEach(id=>{assert.ok(!seen.has(id));seen.add(id);});
        assert.ok(recordEffectivePractice(state,{id:`review-${round}`,valid:true,input:'text',at:100+round,words,source:'home-game'},index));
    }
    assert.equal(seen.size,12);
    assert.deepEqual(homePracticeWords(state,index),ids.slice(0,3).sort((a,b)=>a.localeCompare(b)));
});

test('unverified encounters and unknown lexicon entries cannot enter home review',()=>{
    const id=[...index.entries.keys()][0];
    assert.deepEqual(homePracticeWords({words:{[id]:{count:999},invalid:{lastPractice:{at:1}}}},index),[]);
    const state={words:{[id]:{lastPractice:{at:7},practiceCount:3}}};
    const before=structuredClone(state);
    assert.deepEqual(homePracticeWords(state,index),[id]);
    assert.deepEqual(state,before);
});
