import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildWordIndex,parseWordLexicon,canonicalWord} from '../js/word_lexicon_core.js';
import {selectAuthoredHomeGame} from '../js/home_authored_game_core.js';
import {homeGameActions,homeGameActionMatches} from '../js/home_language_game_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const data=read('data/adventure/curriculum/english-home-practice.json'),catalog=read('data/adventure/home/catalog.json').items;
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
test('six school words need real props, explicit first teaching, a companion and budget before becoming selectable',()=>{
 for(const [word,itemId] of [['pencil','pencil'],['pen','pen'],['paper','paper'],['bag','school-bag'],['phone','telephone'],['computer','computer']]){
  const subset={...data,games:data.games.filter(g=>g.id.startsWith('en-l1-school-'+word+'-'))},objects=[{id:'target',itemId,x:2,y:1},{id:'decoy',itemId:'desk-lamp',x:0,y:1}],pets=[{id:'companion'}];
  const args={index,state:{words:{}},objects,pets,catalog,newWordBudget:1,mode:'find',actions:homeGameActions('find',objects,pets,catalog)};
  const game=selectAuthoredHomeGame(subset,args);assert.equal(game.storyId,'en-l1-school-'+word+'-find-meet');assert.deepEqual(game.words,[canonicalWord(index,word)]);
  assert.equal(selectAuthoredHomeGame(subset,{...args,newWordBudget:0}),null);assert.equal(selectAuthoredHomeGame(subset,{...args,pets:[]}),null);
  assert.equal(selectAuthoredHomeGame(subset,{...args,actions:args.actions.filter(a=>a.objectId==='decoy')}),null);
  assert.equal(homeGameActionMatches(game,{kind:'find',objectId:'decoy'}),false);
  const state={words:{[canonicalWord(index,word)]:{lastPractice:{at:1}}}};
  for(const mode of ['arrange','write','read','listen']){
   const selected=selectAuthoredHomeGame(subset,{...args,state,mode,actions:homeGameActions(mode,objects,pets,catalog)});assert.ok(selected,word+' '+mode);assert.equal(selected.action.objectId,'target');
   if(mode==='read'||mode==='listen')assert.equal(selected.choices.targets.length,1);
  }
 }
});
