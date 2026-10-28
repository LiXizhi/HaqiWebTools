import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {HOME_POSITION_WORDS,homePositionBinding,homePositionCurrent} from '../js/home_position_core.js';
import {validateAuthoredHomeGames,selectAuthoredHomeGame} from '../js/home_authored_game_core.js';
import {homeGameActions,homeGameObjectMatches,homeObjectWasMoved} from '../js/home_language_game_core.js';
import {buildWordIndex,parseWordLexicon} from '../js/word_lexicon_core.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const data=JSON.parse(read('data/adventure/curriculum/english-home-practice.json')),catalog=JSON.parse(read('data/adventure/home/catalog.json')).items;
const index=buildWordIndex(parseWordLexicon(read('data/adventure/locale/word_en.txt'),'en'));
const objects=[{id:'ball',itemId:'ball',x:4,y:5},{id:'chair-a',itemId:'chair',x:0,y:0},{id:'chair-b',itemId:'chair',x:4,y:0}];
test('position language binds to actual nonoverlapping furniture geometry, not a generic move',()=>{
 const placements={behind:{x:0,y:-1.5},left:{x:-2,y:0},right:{x:1.5,y:0},'next to':{x:-1.5,y:0},near:{x:0,y:2},between:{x:2,y:0}};
 for(const kind of HOME_POSITION_WORDS.filter(w=>!['on','under','in'].includes(w))){
  const binding=homePositionBinding({kind,anchorItemIds:['chair']},'ball',objects,catalog);assert.ok(binding,kind);
  assert.equal(homePositionCurrent(binding,objects,catalog),false);
  const moved=[{...objects[0],...placements[kind]},...objects.slice(1)];assert.ok(homePositionCurrent(binding,moved,catalog),kind);
  assert.ok(homeGameObjectMatches({position:binding},moved,catalog));
  assert.equal(homePositionCurrent(binding,[{...objects[0],x:0,y:0},...objects.slice(1)],catalog),false);
  assert.equal(homePositionCurrent(binding,[moved[0],{...objects[1],x:1},objects[2]],catalog),false);
  assert.equal(homePositionCurrent(binding,[moved[0],objects[2]],catalog),false);
 }
 assert.equal(homeObjectWasMoved([{id:'ball',before:objects[0],after:{...objects[0],rotation:1}}],'ball'),false);
 assert.equal(homePositionBinding({kind:'between',anchorItemIds:['chair']},'ball',objects.slice(0,2),catalog),null);
 const tight=[objects[0],objects[1],{...objects[2],x:1.5}];assert.equal(homePositionBinding({kind:'between',anchorItemIds:['chair']},'ball',tight,catalog),null);
});
test('position stories introduce one target with real anchors and known object prerequisites',()=>{
 validateAuthoredHomeGames(data,index);
 const args={mode:'place',index,state:{words:{ball:{lastPractice:{at:1}},chair:{lastPractice:{at:2}}}},objects,pets:[{id:'pet'}],catalog,actions:homeGameActions('place',objects,[],catalog),newWordBudget:1};
 for(const kind of HOME_POSITION_WORDS.filter(w=>!['on','under','in'].includes(w))){
  const subset={...data,games:data.games.filter(g=>g.mode==='place'&&g.position.kind===kind)};
  const game=selectAuthoredHomeGame(subset,args);assert.ok(game,kind);assert.deepEqual(game.words,[kind]);assert.ok(game.position);
  assert.equal(selectAuthoredHomeGame(subset,{...args,newWordBudget:0}),null);
  assert.equal(selectAuthoredHomeGame(subset,{...args,state:{words:{ball:{lastPractice:{at:1}}}}}),null);
  assert.equal(selectAuthoredHomeGame(subset,{...args,objects:objects.slice(0,1)}),null);
 }
});

test('behind means the far ground side of the exact reference, not foreground, diagonal, overlap or a tabletop',()=>{
 const binding=homePositionBinding({kind:'behind',anchorItemIds:['chair']},'ball',objects,catalog);assert.ok(binding);
 for(const p of [{x:0,y:2},{x:3,y:-2},{x:0,y:0},{x:0,y:-4},{x:0,y:-1.5,parentId:'chair-a'}])assert.equal(homePositionCurrent(binding,[{...objects[0],...p},...objects.slice(1)],catalog),false,JSON.stringify(p));
 assert.ok(homePositionCurrent(binding,[{...objects[0],x:0,y:-1.5},...objects.slice(1)],catalog));
 const blocked=[...objects,{id:'wall',itemId:'table',x:-1,y:-2,sizeScale:3}];
 assert.equal(homePositionBinding({kind:'behind',anchorItemIds:['chair']},'ball',blocked.slice(0,2).concat(blocked.at(-1)),catalog),null);
});
