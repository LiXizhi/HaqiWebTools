import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {HOME_COUNT_WORDS,homeCountingArea,homeCountObjects,homeCountSnapshot,homeCountCurrent,homeCountAnswer} from '../js/home_counting_core.js';
import {selectAuthoredHomeGame,validateAuthoredHomeGames} from '../js/home_authored_game_core.js';
import {homeGameActions} from '../js/home_language_game_core.js';
import {buildWordIndex,parseWordLexicon} from '../js/word_lexicon_core.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const data=JSON.parse(read('data/adventure/curriculum/english-home-practice.json'));
const catalog=JSON.parse(read('data/adventure/home/catalog.json')).items;
const index=buildWordIndex(parseWordLexicon(read('data/adventure/locale/word_en.txt'),'en'));
const area={x:0,y:0,w:40,h:5};
const objects=(amount,itemId='book')=>Array.from({length:amount},(_,n)=>({id:'object-'+n,itemId,x:n*3,y:0}));
test('all ten numbers use exact real quantities in three familiar contexts',()=>{
 validateAuthoredHomeGames(data,index);
 for(const noun of ['book','cup','ball'])for(let amount=1;amount<=10;amount++){
  const os=objects(amount,noun),state={words:{[noun]:{lastPractice:{at:1}}}},args={mode:'count',index,state,objects:os,actions:homeGameActions('count',os,[],catalog),pets:[{id:'pet'}],catalog,countArea:area,newWordBudget:1};
  const game=selectAuthoredHomeGame(data,args);assert.ok(game,`${amount} ${noun}`);assert.equal(game.count.amount,amount);assert.deepEqual(game.words,[HOME_COUNT_WORDS[amount-1]]);assert.equal(game.counting.targets.length,amount);
  assert.equal(selectAuthoredHomeGame(data,{...args,newWordBudget:0}),null);
  assert.equal(selectAuthoredHomeGame(data,{...args,state:{words:{}}}),null);
  assert.ok(homeCountAnswer(game,HOME_COUNT_WORDS[amount-1],'text'));
  assert.equal(homeCountAnswer(game,String(amount),'text'),false);assert.ok(homeCountAnswer(game,String(amount),'speech'));
  assert.equal(homeCountAnswer(game,'12','speech'),false);
 }
 assert.equal(homeCountSnapshot({itemIds:['book'],amount:10},objects(11),area,catalog),null);
});
test('counting ignores outside props but rejects stale quantities, replacements and targets crossing the border',()=>{
 const os=objects(2),snapshot=homeCountSnapshot({itemIds:['book'],amount:2},os,area,catalog);
 assert.ok(homeCountCurrent(snapshot,os,catalog));assert.ok(homeCountCurrent(snapshot,[...os,{id:'outside',itemId:'book',x:50,y:0}],catalog));
 assert.equal(homeCountCurrent(snapshot,objects(3),catalog),false);
 assert.equal(homeCountCurrent(snapshot,os.slice(0,1),catalog),false);
 assert.equal(homeCountCurrent(snapshot,[os[0],{...os[1],id:'replacement'}],catalog),false);
 assert.equal(homeCountCurrent(snapshot,[os[0],{...os[1],x:39.5}],catalog),false);
 assert.equal(homeCountCurrent(snapshot,[os[0],{...os[1],itemId:'cup'}],catalog),false);
 assert.deepEqual(homeCountObjects(['book'],os,null,catalog),[]);
 const mobile=homeCountingArea({camera:{x:0,y:0},scale:40,size:{width:390,height:900}});assert.ok(mobile.w>0&&mobile.h>0);
 assert.equal(homeCountingArea({camera:{x:0,y:0},scale:40,size:{width:300,height:300}}),null);
});


test('food counting practices the known noun and requires a known accurate quantity',()=>{
 for(const [item,word,plural] of [['apple','apple','apples'],['banana','banana','bananas'],['orange-fruit','orange','oranges'],['pear','pear','pears'],['egg','egg','eggs']])for(let amount=1;amount<=10;amount++){
  const quantity=HOME_COUNT_WORDS[amount-1],os=objects(amount,item),state={words:{[word]:{lastPractice:{at:1}},[quantity]:{lastPractice:{at:2}}}};
  const args={mode:'count',index,state,objects:os,actions:homeGameActions('count',os,[],catalog),pets:[{id:'pet'}],catalog,countArea:area};
  const subset={...data,games:data.games.filter(g=>g.id.startsWith('en-l1-food-count-'))},game=selectAuthoredHomeGame(subset,args);assert.ok(game);assert.deepEqual(game.words,[word]);assert.equal(game.count.amount,amount);
  assert.ok(homeCountAnswer(game,quantity+' '+(amount===1?word:plural),'text'));assert.equal(homeCountAnswer(game,quantity,'text'),false);
  assert.equal(selectAuthoredHomeGame(subset,{...args,state:{words:{[word]:{lastPractice:{at:1}}}}}),null);
  assert.equal(homeCountAnswer(game,'ten milk','text'),false);
 }
});
