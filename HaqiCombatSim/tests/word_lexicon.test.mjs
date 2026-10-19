import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseWordLexicon,buildWordIndex,canonicalWord,matchWordText,localWordMapping,supplementWordMapping,seedWordLexicon,migrateWordLexicon,sentenceWordTokens,wordTreeKey} from '../js/word_lexicon_core.js';
import {createWordLexiconLoader} from '../js/word_lexicon.js';
import {emptyLanguageTree,recordTreeExposure,setTreeMark,treeWordStatus,validateTreeQuestions} from '../js/language_tree_core.js';
import {localePackageFiles} from '../scripts/package_locale.mjs';
const texts=Object.fromEntries(['en','zh','ja','ko'].map(language=>[language,fs.readFileSync(new URL(`../data/adventure/locale/word_${language}.txt`,import.meta.url),'utf8')]));
const indexes=Object.fromEntries(Object.entries(texts).map(([language,text])=>[language,buildWordIndex(parseWordLexicon(text,language))]));

test('four real vocabulary files contain 2000 unique lemmas with definitions and indexed senses',()=>{
 for(const index of Object.values(indexes)){assert.equal(index.entries.size,2000);for(const row of index.entries.values()){assert.ok(row.meaning.trim());assert.ok(row.senses.length);for(const sense of row.senses)assert.ok(index.senses.get(sense).has(row.id));}}
 const files=localePackageFiles(new URL('../data/adventure/locale/',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
 for(const lang of Object.keys(indexes)){const f=files.find(f=>f.fileName.endsWith(`word_${lang}.txt`));assert.match(f.source,/Copyright|CC BY-SA/);assert.equal(f.source,texts[lang]);}
});
test('selected language loads once, including concurrent opens; failed loads can retry',async()=>{
 const calls=[];let fail=true;
 const load=createWordLexiconLoader(async url=>{const lang=String(url).match(/word_(\w+)\.txt$/)[1];calls.push(lang);if(lang==='ko'&&fail)throw Error('offline');return texts[lang];});
 assert.deepEqual(calls,[]);const [a,b]=await Promise.all([load('en'),load('en')]);assert.equal(a,b);assert.deepEqual(calls,['en']);
 assert.equal(await load('en'),a);await load('ja-JP');assert.deepEqual(calls,['en','ja']);await assert.rejects(load('ko'));fail=false;await load('ko');assert.deepEqual(calls,['en','ja','ko','ko']);await assert.rejects(load('xx'));assert.equal(calls.length,4);
});
test('English canonical forms and original offsets preserve spelling, punctuation and whole words',()=>{
 const text='Ｗorried, worrying; WORRIES! unworriedly.';
 const matches=matchWordText(indexes.en,text);assert.deepEqual(matches.filter(m=>m.id==='worry').map(m=>m.text),['Ｗorried','worrying','WORRIES']);for(const m of matches)assert.equal(text.slice(m.start,m.end),m.text);
 for(const word of ['worried','worrying','worries'])assert.equal(canonicalWord(indexes.en,word),'worry');assert.equal(canonicalWord(indexes.en,'went'),'go');assert.equal(canonicalWord(indexes.en,'unrecordedfakeword'),null);
 assert.equal(canonicalWord(indexes.en,'bigger'),'big');assert.equal(canonicalWord(indexes.en,'best'),'good');assert.ok(indexes.zh.entries.has('大'),'COW grammatical annotations must not discard basic adjectives');
 assert.ok(!matchWordText(indexes.en,'bookish').some(m=>m.id==='book'));
});
test('Chinese longest words win over characters; Japanese inflections and Korean particles respect boundaries',()=>{
 assert.deepEqual(matchWordText(indexes.zh,'担心朋友的心').filter(m=>['担心','朋友','心'].includes(m.id)).map(m=>m.id),['担心','朋友','心']);
 assert.ok(matchWordText(indexes.ja,'本を読みました。').some(m=>m.id==='読む'&&m.text==='読みました'));
 assert.ok(matchWordText(indexes.ko,'친구가 책을 읽었어요.').some(m=>m.id==='읽다'));assert.ok(matchWordText(indexes.ko,'친구가').some(m=>m.id==='친구'&&m.text==='친구'));
 assert.ok(!matchWordText(indexes.ko,'선물').some(m=>m.id==='물'));
});
test('ambiguous forms do not pick the last dictionary entry',()=>{
 const index=buildWordIndex({language:'en',entries:[{id:'see',forms:['saw'],senses:[]},{id:'saw',forms:[],senses:[]}]});assert.equal(canonicalWord(index,'saw'),null);assert.deepEqual(matchWordText(index,'saw'),[]);
});
test('trie work depends on text and word length, not a scan of all vocabulary entries',()=>{
 const make=n=>buildWordIndex({language:'zh',entries:[{id:'担心',forms:[],senses:[]},...Array.from({length:n},(_,i)=>({id:'字'+String.fromCodePoint(0x4e00+i),forms:[],senses:[]}))]});
 const small={},large={};matchWordText(make(10),'担心朋友。'.repeat(50),{stats:small});matchWordText(make(2000),'担心朋友。'.repeat(50),{stats:large});assert.equal(small.steps,large.steps);assert.ok(large.steps<1000);
});
test('local bilingual matches share canonical identity; self mastery removes every inflection immediately',()=>{
 const lines=[{text:'Worried friends worry.',locale:'en'},{text:'担心的朋友担心。',locale:'zh-CN'}],state=emptyLanguageTree();seedWordLexicon(state,indexes.en);
 const parts=localWordMapping(lines,[indexes.en,indexes.zh],state);for(let i=0;i<2;i++)assert.equal(parts[i].map(p=>p.text).join(''),lines[i].text);
 assert.equal(parts[0].filter(p=>p.wordId==='worry').length,2);assert.equal(parts[1].filter(p=>p.wordId==='worry').length,2);
 setTreeMark(state,'worry','know',1);assert.equal(treeWordStatus(state.words.worry).kind,'know');assert.ok(localWordMapping(lines,[indexes.en,indexes.zh],state).flat().every(p=>p.wordId!=='worry'));
 setTreeMark(state,'worry','unknown',2);assert.equal(localWordMapping(lines,[indexes.en,indexes.zh],state)[0].filter(p=>p.wordId==='worry').length,2);
});
test('model supplementation preserves local pairs and filters mastered canonical words',()=>{
 const lines=[{text:'Worried book',locale:'en'},{text:'担心书',locale:'zh-CN'}],state=emptyLanguageTree();seedWordLexicon(state,indexes.en);
 const local=localWordMapping(lines,[indexes.en,indexes.zh],state),model=[[{text:'Worried',color:'#123'},{text:' '},{text:'book',color:'#456'}],[{text:'担心',color:'#123'},{text:'书',color:'#456'}]];
 assert.deepEqual(supplementWordMapping(lines,local,model,indexes.en,state),local);
 setTreeMark(state,'worry','know',2);const filtered=supplementWordMapping(lines,localWordMapping(lines,[indexes.en,indexes.zh],state),model,indexes.en,state);assert.ok(filtered.flat().every(p=>p.wordId!=='worry'));
});
test('migration merges exposure without inventing verification, preserves recent explicit downgrade and is idempotent',()=>{
 const state=emptyLanguageTree();recordTreeExposure(state,{text:'worried',locale:'en',at:1});recordTreeExposure(state,{text:'worry',locale:'en',at:2});setTreeMark(state,'worried','know',3);setTreeMark(state,'worry','unknown',4);
 state.words.worried.evidence=[{correct:true,first:true,hinted:false,sentence:'a',at:1}];state.words.worry.evidence=[{correct:true,first:true,hinted:false,sentence:'b',at:2}];
 migrateWordLexicon(state,indexes.en);assert.ok(!state.words.worried);assert.equal(state.words.worry.count,2);assert.equal(state.words.worry.mark,'unknown');assert.equal(treeWordStatus(state.words.worry).verified,false);
 const before=structuredClone(state);migrateWordLexicon(state,indexes.en);assert.deepEqual(state,before);seedWordLexicon(state,indexes.en);assert.equal(state.words.book.count,0);
});
test('exposure and sentence validation share aliases without silently swallowing unknown content',()=>{
 const state=emptyLanguageTree();seedWordLexicon(state,indexes.en);recordTreeExposure(state,{text:'worried worries worry',locale:'en',at:1},indexes.en);assert.equal(state.words.worry.count,1);assert.ok(!state.words.worried);
 assert.deepEqual(sentenceWordTokens(indexes.en,'worried glorb'),['worry','glorb']);assert.ok(sentenceWordTokens(indexes.zh,'担心龘').includes('龘'));
 assert.notEqual(wordTreeKey('role','ja'),wordTreeKey('role','ko'));assert.equal(wordTreeKey('role','en'),'role');assert.equal(wordTreeKey('role','zh'),'role:zh');
});
test('Korean and Japanese questions normalize inflections while keeping different sentences distinct',()=>{
 for(const [language,targets,nouns,sentences,glosses] of [
  ['ko',['읽다','먹다','가다'],['책','밥','학교'],['책을 읽어요.','밥을 먹어요.','학교에 가요.'],{'을':'宾语助词','에':'表示目的地'}],
  ['ja',['読む','食べる','行く'],['本','ご飯','学校'],['本を読みます。','ご飯を食べます。','学校に行きます。'],{'を':'宾语助词','に':'表示目的地'}],
 ]){const state=emptyLanguageTree();seedWordLexicon(state,indexes[language]);for(const id of targets){assert.ok(state.words[id]);setTreeMark(state,id,'know',1);}for(const id of nouns){assert.ok(state.words[id]);setTreeMark(state,id,'basic',1);}
  const rows=targets.map((target,i)=>({target,sentence:sentences[i],translation:'新的句子含义',options:[{text:'正确含义',explanation:'词语的正确含义'},{text:'其他含义',explanation:'不是这个意思'},{text:'另一含义',explanation:'没有这个意思'}],answer:0,glosses}));
  const parsed=validateTreeQuestions({questions:rows},state,indexes[language]);assert.equal(new Set(parsed.map(q=>q.id)).size,3);
 }
});
