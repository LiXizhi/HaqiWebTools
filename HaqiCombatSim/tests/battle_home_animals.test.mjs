import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildWordIndex,parseWordLexicon,canonicalWord} from '../js/word_lexicon_core.js';
import {validateAuthoredHomeGames,selectAuthoredHomeGame} from '../js/home_authored_game_core.js';
import {homeGameActions,homeGamePetMatches,homeGameActionMatches,validateHomeGame} from '../js/home_language_game_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const data=read('data/adventure/curriculum/english-home-practice.json'),catalog=read('data/adventure/home/catalog.json').items,definitions=read('data/adventure/pets.json').pets;
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
test('animal author scenes bind only to verified existing species and invalidate changed companions',()=>{
 validateAuthoredHomeGames(data,index);
 for(const story of data.games.filter(g=>g.action.petSpeciesIds)){
  const speciesId=story.action.petSpeciesIds[0];assert.ok(definitions[speciesId]);
  assert.deepEqual(story.action.petSpeciesIds,[{cat:'pixel_orange_cat_pudding',dog:'pixel_corgi_bobo',bird:'pet_flower_bird',frog:'coral_leopard_frog',cow:'milk_moo_bubu',sheep:'zodiac_goat_mianmian',rabbit:'pixel_volt_bunny',mouse:'zodiac_rat_mimi'}[story.words[0]]],'reviewed animal appearance must match the target word');
  const objects=[{id:'facility',itemId:story.action.itemIds[0],x:2,y:1}],pets=[{id:'wrong',speciesId:'dragon_green'},{id:'right',speciesId,stage:story.action.petStages?.[0]??0}],actions=homeGameActions('care',objects,pets,catalog);
  const state={words:Object.fromEntries([...story.words,...story.requires].map(w=>[canonicalWord(index,w),{lastPractice:{at:1}}]))},args={mode:'care',arcId:story.arcOnly,index,state,objects,pets,actions,catalog};
  const game=selectAuthoredHomeGame({...data,games:[story]},args);assert.equal(game.action.petId,'right');assert.ok(homeGamePetMatches(game,pets));
  assert.equal(homeGameActionMatches(game,{...game.action,petId:'wrong'}),false);
  assert.equal(homeGamePetMatches(game,[{id:'right',speciesId:'dragon_green'}]),false);assert.equal(homeGamePetMatches(game,[]),false);
  assert.equal(selectAuthoredHomeGame({...data,games:[story]},{...args,pets:pets.slice(0,1)}),null);
  if(story.action.petStages){
   for(const stage of [1,2,3])assert.ok(homeGamePetMatches(game,[{id:'right',speciesId,stage}]));
   for(const stage of [0,undefined,4]){const wrong=[{id:'right',speciesId,stage}];assert.equal(homeGamePetMatches(game,wrong),false);assert.equal(selectAuthoredHomeGame({...data,games:[story]},{...args,pets:wrong}),null);}
  }
  assert.throws(()=>validateHomeGame(story,{...args,words:game.words,actions:[{...game.action}]}));
 }
 const stageBad=structuredClone(data);stageBad.games.find(g=>g.action.petStages).action.petStages=[0,4];assert.throws(()=>validateAuthoredHomeGames(stageBad,index),/外观阶段/);
 const bad=structuredClone(data);bad.games.find(g=>g.action.petSpeciesIds).action.petSpeciesIds=[];assert.throws(()=>validateAuthoredHomeGames(bad,index),/宠物种类/);
});
