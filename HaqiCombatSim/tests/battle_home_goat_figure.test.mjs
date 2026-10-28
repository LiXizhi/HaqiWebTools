import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildWordIndex,parseWordLexicon} from '../js/word_lexicon_core.js';
import {homeGameActions,homeGameObjectMatches,validateHomeGame} from '../js/home_language_game_core.js';
import {selectAuthoredHomeGame} from '../js/home_authored_game_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const data=read('data/adventure/curriculum/english-home-practice.json'),catalog=read('data/adventure/home/catalog.json').items;
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
test('goat teaching requires the reviewed figurine and cannot turn other objects or a sheep into a goat',()=>{
 const objects=[{id:'goat',itemId:'goat-figure'},{id:'ball',itemId:'ball'}],pets=[{id:'friend',speciesId:'zodiac_goat_mianmian'}];
 for(const story of data.games.filter(g=>g.words.includes('goat'))){
  const actions=homeGameActions(story.mode,objects,pets,catalog),args={mode:story.mode,arcId:story.arcOnly,index,state:{words:{goat:{lastPractice:{at:1}}}},objects,pets,catalog,actions};
  const game=selectAuthoredHomeGame({...data,games:[story]},args);assert.ok(game);assert.deepEqual(game.animalProp,{objectId:'goat',itemId:'goat-figure'});
  assert.ok(homeGameObjectMatches(game,objects));assert.equal(homeGameObjectMatches(game,objects.slice(1)),false);assert.equal(homeGameObjectMatches(game,[{id:'goat',itemId:'ball'}]),false);
  assert.throws(()=>validateHomeGame({...story,action:{...game.action,objectId:'ball'}},{...args,words:['goat']}),/动物词/);
 }
 const care={prompt:'Goat?',answer:'A goat.',reply:'Hello.',words:['goat'],action:{kind:'pet-use',objectId:'cup',petId:'friend',activity:'drink'}};
 assert.throws(()=>validateHomeGame(care,{index,words:['goat'],objects:[...objects,{id:'cup',itemId:'cup'}],pets,actions:[care.action]}),/动物词/);
});
test('goat art catalog uses the verified CDN WebP and complete recorded crop within its budget',()=>{
 const manifest=read('data/adventure/home/goat-figure.json'),item=catalog.find(i=>i.id==='goat-figure'),art=item.art;
 assert.deepEqual(art,manifest.art);assert.equal(item.activity,null);assert.equal(item.zh,'山羊摆件');assert.equal(manifest.generation.transparentBackground,true);
 const bytes=fs.readFileSync(new URL('../'+art.local,import.meta.url));assert.equal(bytes.length,art.bytes);assert.ok(bytes.length<=200000);assert.equal(createHash('sha256').update(bytes).digest('hex'),art.sha256);
 assert.ok(art.cdn.startsWith('https://cdn.keepwork.com/'));assert.deepEqual(art.crop,[0,0,art.width,art.height]);assert.deepEqual(manifest.verification.alphaRange,[0,255]);assert.ok(manifest.verification.alphaZeroPixels>0);
});
