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
test('home typing and speech share NPC word coverage, 80% pass threshold, and inline feedback on example line',()=>{
 const selected={itemId:'chair',color:''};
 for(const text of [' I WANT   A CHAIR!!! ','I want a chait.','a chair I want','I want a chair and a table.']){
  const result=matchHomeSpell(text,catalog,'en',selected);
  assert.equal(result.candidates.length,1,text);
  assert.equal(result.feedback.accuracy,1);
 }
 // 80% accuracy passes for a selected item (e.g., 4/5 words in "Create a wooden house." or "Can I have chair?")
 const eighty=matchHomeSpell('Create wooden house.',[{id:'template-wood',zh:'完整木屋',en:'wooden house'}],'en',{itemId:'template-wood',color:''});
 assert.equal(eighty.feedback.accuracy,0.75); // 3/4 is 75%, fails
 const eightyPass=matchHomeSpell('I want wooden house.',[{id:'template-wood',zh:'完整木屋',en:'wooden house'}],'en',{itemId:'template-wood',color:''});
 assert.equal(eightyPass.feedback.accuracy,0.8); // 4/5 is 80%, passes
 assert.equal(eightyPass.candidates.length,1);
 assert.equal(eightyPass.feedback.lineIndex,1);
 for(const text of ['', ' ', 'chair','I want chair.', 'I want a table.'])assert.equal(matchHomeSpell(text,catalog,'en',selected).candidates.length,0,text);
 const partial=matchHomeSpell('I want a table',catalog,'en',selected);
 assert.equal(partial.feedback.lineIndex,1);
 assert.ok(partial.feedback.parts.some(p=>p.text==='chair'&&p.missing));
 assert.ok(partial.feedback.parts.some(p=>p.text==='want'&&p.matched));
});
test('third nonempty speech unlocks only a selected item; typing and empty speech never bypass',()=>{
 const selected={itemId:'chair',color:'red'};
 for(const count of [1,2])assert.equal(matchHomeSpell('hello',catalog,'en',selected,{input:'speech',speechAttempts:count}).candidates.length,0);
 assert.deepEqual(matchHomeSpell('hello',catalog,'en',selected,{input:'speech',speechAttempts:3}).candidates,[{itemId:'chair',color:'red'}]);
 for(const text of ['', ' ', '...'])assert.equal(matchHomeSpell(text,catalog,'en',selected,{input:'speech',speechAttempts:3}).candidates.length,0);
 assert.equal(matchHomeSpell('hello',catalog,'en',selected,{input:'text',speechAttempts:3}).candidates.length,0);
 assert.equal(matchHomeSpell('hello',catalog,'en',null,{input:'speech',speechAttempts:3}).candidates.length,0);
});
