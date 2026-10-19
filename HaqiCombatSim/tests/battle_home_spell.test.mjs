import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {matchHomeSpell,summonSentences} from '../js/home_core.js';
const catalog=JSON.parse(readFileSync(new URL('../data/adventure/home/catalog.json',import.meta.url))).items;
test('every home item offers one to three ordered spells in both languages, including colors',()=>{
 for(const item of catalog)for(const lang of ['en','zh'])for(const color of ['', 'red']){
  const lines=summonSentences(item,lang,color);
  assert.ok(lines.length>=1&&lines.length<=3);
  assert.ok(lines[0].length<=lines.at(-1).length);
  for(const line of lines)assert.deepEqual(matchHomeSpell(line,catalog,lang,{itemId:item.id,color}).candidates,[{itemId:item.id,color}]);
 }
});
test('spells tolerate case, punctuation and spacing but reject empty, partial, misspelled and wrong item answers',()=>{
 const selected={itemId:'chair',color:''};
 assert.equal(matchHomeSpell(' I WANT   A CHAIR!!! ',catalog,'en',selected).candidates.length,1);
 for(const text of ['', ' ', 'chair','I want a chait.', 'I want chair.', 'I want a table.', 'I want a red chair.', 'I want a chair and a table.'])assert.equal(matchHomeSpell(text,catalog,'en',selected).candidates.length,0,text);
});
