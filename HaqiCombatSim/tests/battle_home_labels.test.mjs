import {homeLabelChange,homeGameActionMatches} from '../js/home_language_game_core.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {applyHomeAction} from '../js/home_actions_core.js';
import {validateHomePart} from '../js/home_core.js';
import {homeEditDelta,applyHomeEditDelta} from '../js/home_edit_history_core.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../data/adventure/home/catalog.json',import.meta.url))).items;
const initial=()=>({'chunk:0,0':{book:{id:'book',itemId:'book',x:2,y:2}},'local:practice':{}});

test('home labels survive serialization, undo and redo without creating learning receipts',()=>{
 const parts=initial(),before=structuredClone(parts);
 assert.equal(applyHomeAction(parts,{type:'label',id:'book',text:'  My story corner  '},catalog),true);
 assert.equal(parts['chunk:0,0'].book.label,'My story corner');
 const changes=homeEditDelta(before,parts);
 const loaded=JSON.parse(JSON.stringify(parts));validateHomePart('chunk',loaded['chunk:0,0'],catalog);
 assert.equal(loaded['chunk:0,0'].book.label,'My story corner');
 assert.deepEqual(parts['local:practice'],{});
 applyHomeEditDelta(parts,changes,true,{catalog});assert.deepEqual(parts,before);
 applyHomeEditDelta(parts,changes,false,{catalog});assert.equal(parts['chunk:0,0'].book.label,'My story corner');
 assert.equal(applyHomeAction(parts,{type:'label',id:'book',text:'My story corner'},catalog),false);
 applyHomeAction(parts,{type:'label',id:'book',text:''},catalog);assert.equal(parts['chunk:0,0'].book.label,undefined);
});

test('invalid labels are rejected on edit and imported chunks, while old saves remain valid',()=>{
 validateHomePart('chunk',initial()['chunk:0,0'],catalog);
 for(const text of ['x'.repeat(61),'two\nlines','hidden\u202eword',42,null]){
  const parts=initial(),before=structuredClone(parts);
  assert.throws(()=>applyHomeAction(parts,{type:'label',id:'book',text},catalog));assert.deepEqual(parts,before);
  assert.throws(()=>validateHomePart('chunk',{book:{...parts['chunk:0,0'].book,label:text}},catalog));
 }
 assert.throws(()=>applyHomeAction(initial(),{type:'label',id:'removed',text:'Hello'},catalog),/已变化/);
});


test('writing practice needs a changed saved label on the requested object with an accepted meaning',()=>{
 const before={id:'book',label:'Old'},after={...before,label:'My book.'};
 assert.equal(homeLabelChange([{id:'book',before,after}],'book'),'My book.');
 assert.equal(homeLabelChange([{id:'book',before,after:before}],'book'),null);
 assert.equal(homeLabelChange([{id:'book',before,after:{id:'book'}}],'book'),null);
 assert.equal(homeLabelChange([{id:'book',before,after}],'other'),null);
 const game={action:{kind:'label',objectId:'book'},answer:'My book.',alternatives:[{answer:'Our book.'}]};
 assert.ok(homeGameActionMatches(game,{kind:'label',objectId:'book',text:'Our book.'}));
 assert.ok(!homeGameActionMatches(game,{kind:'label',objectId:'book',text:'My cup.'}));
 assert.ok(!homeGameActionMatches(game,{kind:'label',objectId:'cup',text:'My book.'}));
 assert.ok(!homeGameActionMatches(game,{kind:'move',objectId:'book',text:'My book.'}));
});
