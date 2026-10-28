import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {homeGameReply,homeGameAnswer} from '../js/home_language_game_core.js';
import {validateAuthoredHomeGames} from '../js/home_authored_game_core.js';
import {buildWordIndex,parseWordLexicon} from '../js/word_lexicon_core.js';
const data=JSON.parse(fs.readFileSync(new URL('../data/adventure/curriculum/english-home-practice.json',import.meta.url),'utf8'));
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
const game=data.games.find(g=>g.id==='en-l1-my-reading-choice-wish');
test('opposite wishes select their own reply and do not modify targets or scene actions',()=>{
 const before=structuredClone(game);assert.equal(homeGameReply(game,'I want to read.').reply,game.reply);
 for(const text of ['I do not want to read.',"I don’t want to read.","I DON'T WANT TO READ!"]){assert.ok(homeGameAnswer(game,text));assert.equal(homeGameReply(game,text).reply,'OK. We can do something else.');}
 assert.equal(homeGameReply(game,'I want to sleep.'),null);assert.deepEqual(game,before);
 assert.equal(homeGameReply({...game,alternatives:[{id:'same',answer:'Yes, I want to read.'}]},'Yes, I want to read.').reply,game.reply);
});
test('branch replies require talk, complete translations and unambiguous answers',()=>{
 for(const change of [g=>delete g.alternatives[0].replyGloss,g=>g.alternatives[0].answer=g.answer,g=>g.alternatives[1].answer=g.alternatives[0].answer]){
  const g=structuredClone(game);change(g);assert.throws(()=>validateAuthoredHomeGames({version:1,language:'en',games:[g]},index),/分支回应/);
 }
 const g=structuredClone(game);g.mode='care';g.action={kind:'pet-use',activity:'read',itemIds:['book']};assert.throws(()=>validateAuthoredHomeGames({version:1,language:'en',games:[g]},index),/分支回应/);
});
