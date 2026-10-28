import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {homeComprehensionExposesTarget,homeGameExposesTarget} from '../js/home_language_game_core.js';
import {buildWordIndex,parseWordLexicon} from '../js/word_lexicon_core.js';
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
const base={words:['paper'],prompt:'Find the paper.',intro:'先听请求，再选择物品。',opening:'帮我找一件东西，好吗？'};
test('direct Chinese or English answer cues count as support for comprehension, but the request alone does not',()=>{
 assert.equal(homeComprehensionExposesTarget(base,index),false);
 for(const field of ['opening','intro'])for(const text of ['我们先找纸吧。','Can you find paper?'])assert.ok(homeComprehensionExposesTarget({...base,[field]:text},index));
 assert.ok(homeComprehensionExposesTarget(base,index,[{label:'我的纸'}]));
 assert.ok(homeComprehensionExposesTarget(base,index,[{label:'My paper.'}]));
 assert.equal(homeComprehensionExposesTarget(base,index,[{label:'小角落'}]),false);
 assert.equal(homeGameExposesTarget({...base,prompt:'What do we need?',intro:'我们找纸吧。'},index),false,'Chinese meaning remains an ordinary retrieval cue for expression');
 assert.ok(homeComprehensionExposesTarget({...base,words:['pencil'],intro:'找铅笔。'},index));
});
test('school listening and reading authors keep translations out of answer scaffolding',()=>{
 const data=JSON.parse(fs.readFileSync(new URL('../data/adventure/curriculum/english-home-practice.json',import.meta.url),'utf8'));
 for(const word of ['paper','pencil','pen','bag'])for(const mode of ['read','listen']){
  const game=data.games.find(g=>g.id===`en-l1-school-${word}-${mode}`);assert.ok(game.opening);assert.equal(homeComprehensionExposesTarget(game,index),false,game.id);
 }
});


test('toy and fire comprehension no longer disclose their target in the opening or instructions',()=>{
 const data=JSON.parse(fs.readFileSync(new URL('../data/adventure/curriculum/english-home-practice.json',import.meta.url),'utf8'));
 for(const id of ['en-l1-read-request-toy','en-l1-listen-request-toy','en-l1-fire-read','en-l1-fire-listen']){
  const game=data.games.find(g=>g.id===id);assert.ok(game.opening);assert.equal(homeComprehensionExposesTarget(game,index),false,id);
 }
});
