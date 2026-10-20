import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseWordLexicon,buildWordIndex} from '../js/word_lexicon_core.js';
import {wordTreeGlossary} from '../js/word_tree_gloss_core.js';
import {treeGloss} from '../js/language_tree_gloss_core.js';

const load=language=>buildWordIndex(parseWordLexicon(fs.readFileSync(new URL(`../data/adventure/locale/word_${language}.txt`,import.meta.url),'utf8'),language));
const zh=load('zh'),en=load('en');
test('Chinese tree shows English from shared Chinese keys when second language is English',()=>{
 const glossary=wordTreeGlossary([{text:'朋友',meaning:'朋友'}],zh,{secondaryLanguage:'en-US',englishIndex:en});
 assert.equal(treeGloss('朋友',glossary),'friend');
 for(const [word,meaning] of glossary)if(meaning){assert.notEqual(word,meaning);assert.match(meaning,/[a-z]/i);assert.doesNotMatch(meaning,/\p{Script=Han}/u);}
});
test('Chinese tree has no duplicate gloss for other or unset second languages',()=>{
 for(const secondaryLanguage of ['zh-CN','ja','ko',undefined]){
  const glossary=wordTreeGlossary([{text:'朋友',meaning:'朋友'}],zh,{secondaryLanguage,englishIndex:en});
  assert.equal(treeGloss('朋友',glossary),'');
  assert.ok([...glossary.values()].every(value=>value===''));
 }
});
test('missing English translation or unavailable index leaves just the Chinese word',()=>{
 const index=buildWordIndex(parseWordLexicon('朋友\n龘\n','zh'));
 const glossary=wordTreeGlossary([],index,{secondaryLanguage:'en',englishIndex:en});
 assert.equal(treeGloss('龘',glossary),'');
 assert.equal(treeGloss('朋友',wordTreeGlossary([],index,{secondaryLanguage:'en'})),'');
});
test('English tree keeps its Chinese meanings',()=>{
 assert.equal(treeGloss('friend',wordTreeGlossary([],en,{secondaryLanguage:'en'})),'朋友');
});
