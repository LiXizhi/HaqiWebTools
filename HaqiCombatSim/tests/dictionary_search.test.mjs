import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeDictionarySearch,searchDictionary,suggestDictionaryWords} from '../js/dictionary_search_core.js';
const read=language=>JSON.parse(fs.readFileSync(new URL('../data/adventure/dictionary/'+language+'.json',import.meta.url)));
test('Chinese search accepts unaccented and numbered pinyin, while preserving ü',()=>{
 const zh=read('zh');for(const query of ['shui','shuǐ','shui3','ＳＨＵＩ３'])assert.equal(searchDictionary(zh,query)[0].id,'shui');
 assert.equal(normalizeDictionarySearch('lü4','zh'),'lü');assert.equal(normalizeDictionarySearch('lv4','zh'),'lü');assert.notEqual(normalizeDictionarySearch('lu4','zh'),'lü');assert.equal(searchDictionary(zh,'目光')[0].id,'mu-eye');
});
test('search prioritizes exact words, combines clues, matches examples without changing content',()=>{
 const en=read('en'),before=JSON.stringify(en);assert.equal(searchDictionary(en,'ＨＥＬＰ')[0].id,'help');assert.ok(searchDictionary(en,'帮助').some(e=>e.id==='help'));assert.equal(searchDictionary(en,'hello 你好')[0].id,'hello');assert.equal(searchDictionary(en,'zzzz').length,0);assert.equal(searchDictionary(en,'  ').length,30);assert.equal(JSON.stringify(en),before);
});

test('beginner searches can find an entry from a common inflected form',()=>{
 const en=read('en');assert.equal(searchDictionary(en,'wrote')[0].id,'write');assert.equal(searchDictionary(en,'children')[0].id,'child');assert.equal(searchDictionary(en,'HELPED')[0].id,'help');
});

test('English search suggests one-letter mistakes without replacing literal matches',()=>{
 const en=read('en'),before=JSON.stringify(en);
 for(const [query,id] of [['hepl','help'],['watre','water'],['helllo','hello'],['hllo','hello'],['hallo','hello'],['ＨＥＰＬ','help']])assert.ok(suggestDictionaryWords(en,query).some(e=>e.id===id),query);
 for(const query of ['hello','children','help me','你好','he','zzzz','hxxlo','a'.repeat(33)])assert.deepEqual(suggestDictionaryWords(en,query),[],query);
 assert.deepEqual(suggestDictionaryWords(read('zh'),'shiu'),[]);assert.equal(searchDictionary(en,'hepl').length,0);assert.equal(JSON.stringify(en),before);
 const many={language:'en',entries:['hat','bat','cat','mat'].map(text=>({id:text,text}))};assert.equal(suggestDictionaryWords(many,'zat').length,3);
});

test('copied words and pinyin tolerate surrounding quotation and sentence punctuation',()=>{
 const en=read('en'),zh=read('zh');
 for(const query of ['Hello!','“help”','（water?）',"'children'",'【ＨＥＬＰ！】'])assert.ok(searchDictionary(en,query).length,query);
 for(const query of ['shui3，','“shuǐ”','（ＳＨＵＩ３。）'])assert.equal(searchDictionary(zh,query)[0].id,'shui');
 assert.ok(suggestDictionaryWords(en,'“hepl!”').some(e=>e.id==='help'));
 assert.equal(normalizeDictionarySearch("don't",'en'),"don't");assert.equal(normalizeDictionarySearch('mother-in-law','en'),'mother-in-law');assert.equal(normalizeDictionarySearch('help/me','en'),'help/me');
 for(const query of ['!!!','“”','（。？）'])assert.deepEqual(searchDictionary(en,query),[]);
 assert.equal(searchDictionary(en,' \n ').length,en.entries.length);
});

test('suggestions also recover beginner typos in authored inflected forms',()=>{
 const en=read('en');for(const q of ['childen','childern','“CHILDRENn!”'])assert.ok(suggestDictionaryWords(en,q).some(e=>e.id==='child'),q);
 assert.deepEqual(suggestDictionaryWords(en,'children'),[]);assert.equal(searchDictionary(en,'childen').length,0);
 const repeated={language:'en',entries:[{id:'child',text:'child',forms:['children','children']}]};assert.equal(suggestDictionaryWords(repeated,'childen').length,1);
});

test('authored everyday alternatives lead to the related word without changing answer forms',()=>{
 const en=read('en'),before=JSON.stringify(en);
 for(const [query,id] of [['HI!','hello'],['bye','goodbye'],['mom','mother'],['mum','mother'],['dad','father'],['kid','child']]){assert.equal(searchDictionary(en,query)[0].id,id);assert.deepEqual(suggestDictionaryWords(en,query),[]);}
 const withExact={...en,entries:[...en.entries,{id:'hi',text:'hi'}]};assert.equal(searchDictionary(withExact,'hi')[0].id,'hi');assert.equal(JSON.stringify(en),before);
 assert.equal(searchDictionary(en,'mommy').length,0);
});
