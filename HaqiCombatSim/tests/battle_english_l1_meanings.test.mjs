import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseWordLexicon,buildWordIndex,canonicalWord,localWordMapping,migrateWordLexicon,seedWordLexicon} from '../js/word_lexicon_core.js';
import {emptyLanguageTree} from '../js/language_tree_core.js';
import {curriculumWordCards} from '../js/language_curriculum_core.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const index=buildWordIndex(parseWordLexicon(read('data/adventure/locale/word_en.txt'),'en'));
const zh=buildWordIndex(parseWordLexicon(read('data/adventure/locale/word_zh.txt'),'zh'));
const curriculum=JSON.parse(read('data/adventure/curriculum/english-level-one.json'));
test('English L1 cards teach intended basic senses rather than accidental old dictionary senses',()=>{
 const meanings={sorry:'对不起；抱歉',house:'房子',behind:'在后面',arm:'手臂',face:'脸',number:'数字；数目',stop:'停下',safe:'安全的',good:'好的',short:'短的',paper:'纸',dirty:'脏的',want:'想要'};
 const cards=curriculumWordCards(curriculum,index,'test');
 for(const [word,meaning] of Object.entries(meanings))assert.equal(cards.find(c=>c.title===word).description,meaning);
 const state=emptyLanguageTree();seedWordLexicon(state,index);
 for(const w of curriculum.words)Object.assign(state.words[w.entryId],{mark:'basic',practiceCount:11,lastPractice:{at:20,input:'text'},comprehension:{read:{count:2}}});
 const before=structuredClone(state);migrateWordLexicon(state,index);
 for(const w of curriculum.words){assert.equal(canonicalWord(index,w.word),w.entryId);for(const field of ['mark','practiceCount','lastPractice','comprehension'])assert.deepEqual(state.words[w.entryId][field],before.words[w.entryId][field]);}
});
test('corrected primary meanings and Chinese bridges do not link apology to darkness or houses to companies',()=>{
 for(const [word,key] of Object.entries({sorry:'抱歉',house:'房子',behind:'后面',arm:'手臂',face:'脸',paper:'纸',number:'数目',stop:'停止',safe:'安全的',good:'好的',phone:'电话机',girl:'女孩',dirty:'脏'})){
  assert.equal(index.entries.get(word).meaning,key);
  const parts=localWordMapping([{text:word,locale:'en'},{text:key,locale:'zh'}],[index,zh]);assert.ok(parts[0][0].color,word);
 }
 for(const [word,key] of [['sorry','黑暗'],['house','企业'],['behind','屁股'],['good','专家'],['number','接受'],['dirty','黄色'],['want','没有'],['girl','对象']]){
  const parts=localWordMapping([{text:word,locale:'en'},{text:key,locale:'zh'}],[index,zh]);assert.ok(!parts[0][0].color,word);
 }
 for(const [form,word] of Object.entries({houses:'house',arms:'arm',faces:'face',papers:'paper',numbers:'number',stopped:'stop',phones:'phone',girls:'girl',shorter:'short'}))assert.equal(canonicalWord(index,form),word);
});
