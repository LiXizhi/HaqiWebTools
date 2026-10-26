import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildWordIndex,parseWordLexicon,canonicalWord,matchWordText} from '../js/word_lexicon_core.js';

const curriculum=JSON.parse(fs.readFileSync(new URL('../data/adventure/curriculum/english-level-one.json',import.meta.url),'utf8'));
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));

test('English L1 has 180 independently addressable canonical targets with explicit source locations',()=>{
    assert.equal(curriculum.words.length,180);
    assert.equal(new Set(curriculum.words.map(w=>w.id)).size,180);
    assert.equal(new Set(curriculum.words.map(w=>w.entryId)).size,180);
    for(const word of curriculum.words){
        assert.equal(canonicalWord(index,word.word),word.entryId,word.word);
        assert.ok(matchWordText(index,word.word).some(m=>m.id===word.entryId),word.word);
        assert.equal(word.source.id,curriculum.source.id);
        assert.ok(Number.isInteger(word.source.page)&&word.source.page>=4&&word.source.page<=16);
        assert.ok(word.meaning.trim());
        // A manifest cannot grant story completion or manufacture practice evidence.
        if(word.coverage.status==='complete'){
            assert.ok(word.coverage.authoredIntroduction);
            assert.ok(word.coverage.homeVariants.length>=12);
        }
    }
});

test('taking and counting no longer borrow the use and number learning records',()=>{
    assert.equal(canonicalWord(index,'take'),'take');
    assert.equal(canonicalWord(index,'use'),'use');
    assert.equal(canonicalWord(index,'count'),'count');
    assert.equal(canonicalWord(index,'number'),'number');
    assert.equal(canonicalWord(index,'thank you'),'thank you');
    for(const form of ['takes','taking','took','taken'])assert.equal(canonicalWord(index,form),'take');
    for(const form of ['counts','counting','counted'])assert.equal(canonicalWord(index,form),'count');
});
