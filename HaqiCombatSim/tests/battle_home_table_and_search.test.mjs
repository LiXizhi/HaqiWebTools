import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {homePositionBinding,homePositionCurrent} from '../js/home_position_core.js';
import {applyHomeAction,homeObjects} from '../js/home_actions_core.js';
import {homeGameActions,homeGameAnswer} from '../js/home_language_game_core.js';
import {selectAuthoredHomeGame} from '../js/home_authored_game_core.js';
import {homeCountAnswer} from '../js/home_counting_core.js';
import {buildWordIndex,parseWordLexicon} from '../js/word_lexicon_core.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const catalog=JSON.parse(read('data/adventure/home/catalog.json')).items,data=JSON.parse(read('data/adventure/curriculum/english-home-practice.json'));
const index=buildWordIndex(parseWordLexicon(read('data/adventure/locale/word_en.txt'),'en'));
const known=words=>({words:Object.fromEntries(words.map(w=>[w,{lastPractice:{at:1}}]))});
test('on requires an actual saved tabletop association and respects full or missing tables',()=>{
 const parts={'chunk:0,0':{book:{id:'book',itemId:'book',x:4,y:0},table:{id:'table',itemId:'table',x:0,y:0}}},spec={kind:'on',anchorItemIds:['table']};
 const binding=homePositionBinding(spec,'book',homeObjects(parts),catalog);assert.ok(binding);
 assert.equal(homePositionCurrent(binding,homeObjects(parts),catalog),false);
 assert.equal(homePositionCurrent(binding,[{...parts['chunk:0,0'].book,x:1,y:.5},parts['chunk:0,0'].table],catalog),false);
 applyHomeAction(parts,{type:'move',id:'book',position:{x:1,y:.5,parentId:'table'}},catalog);
 assert.ok(homePositionCurrent(binding,homeObjects(parts),catalog));
 assert.equal(homePositionCurrent(binding,[parts['chunk:0,0'].book],catalog),false);
 const full=[{id:'book',itemId:'book',x:4,y:0},parts['chunk:0,0'].table,...['a','b','c'].map(id=>({id,itemId:'cup',parentId:'table',x:1,y:.5}))];
 assert.equal(homePositionBinding(spec,'book',full,catalog),null);
 assert.equal(homePositionBinding(spec,'ball',[{id:'ball',itemId:'ball',x:4,y:0},parts['chunk:0,0'].table],catalog),null);
});
test('where and there stories require familiar props and preserve the intended question or pointing expression',()=>{
 for(const word of ['where','there'])for(const noun of ['book','ball','cup']){
  const objects=[{id:'target',itemId:noun,x:0,y:0}],subset={...data,games:data.games.filter(g=>g.id.startsWith(`en-l1-search-${word}-${noun}`))};
  const args={mode:'find',index,state:known([noun]),objects,pets:[{id:'pet'}],catalog,actions:homeGameActions('find',objects,[],catalog),newWordBudget:1};
  const game=selectAuthoredHomeGame(subset,args);assert.ok(game);assert.deepEqual(game.words,[word]);assert.ok(homeGameAnswer(game,word==='where'?`Where is the ${noun}?`:'There!'));
  assert.equal(selectAuthoredHomeGame(subset,{...args,state:known([])}),null);assert.equal(selectAuthoredHomeGame(subset,{...args,objects:[]}),null);
 }
});
test('count and number have distinct targets, and a number report must match the actual known quantity',()=>{
 for(const target of ['count','number'])for(let amount=1;amount<=3;amount++){
  const quantity=['one','two','three'][amount-1],objects=Array.from({length:amount},(_,n)=>({id:'book-'+n,itemId:'book',x:n*2,y:0}));
  const args={mode:'count',index,state:known(['book',quantity]),objects,pets:[{id:'pet'}],catalog,countArea:{x:0,y:0,w:12,h:4},actions:homeGameActions('count',objects,[],catalog),newWordBudget:1};
  const subset={...data,games:data.games.filter(g=>g.mode==='count'&&g.count.target===target)};
  const game=selectAuthoredHomeGame(subset,args);assert.ok(game);assert.deepEqual(game.words,[target]);assert.equal(game.count.amount,amount);
  assert.ok(homeCountAnswer(game,target==='count'?'I can count.':`The number is ${quantity}.`,'text'));
  assert.equal(homeCountAnswer(game,'Ten.','text'),false);
  if(target==='number'){assert.equal(selectAuthoredHomeGame(subset,{...args,state:known(['book'])}),null);assert.equal(homeCountAnswer(game,`The number is ${amount}.`,'text'),false);assert.ok(homeCountAnswer(game,`The number is ${amount}.`,'speech'));}
 }
});
