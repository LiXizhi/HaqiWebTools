import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validHomeDrawing,homeDrawingHasMarks,homeDrawingChange} from '../js/home_drawing_core.js';
import {applyHomeAction} from '../js/home_actions_core.js';
import {validateHomePart} from '../js/home_core.js';
import {homeGameActionMatches,homeGameObjectMatches,homeGameActions} from '../js/home_language_game_core.js';
import {buildWordIndex,parseWordLexicon} from '../js/word_lexicon_core.js';
import {validateAuthoredHomeGames,selectAuthoredHomeGame} from '../js/home_authored_game_core.js';
import {paintHomeDrawing} from '../js/view_home_drawing_art.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const catalog=read('data/adventure/home/catalog.json').items;
const drawing={version:1,strokes:[{color:'#294734',points:[[100,100],[400,500],[700,200]]}]};
test('bounded drawings save only to real paper, preserve normal edits and reject malformed imports',()=>{
 const before={id:'paper',itemId:'paper',x:2,y:1},parts={'chunk:0,0':{paper:before}};
 assert.ok(validHomeDrawing(drawing));assert.ok(homeDrawingHasMarks(drawing));
 for(const bad of [null,{version:2,strokes:[]},{version:1,strokes:[{color:'url(x)',points:[[0,0]]}]},{version:1,strokes:[{color:'#294734',points:[[Infinity,0]]}]},{version:1,strokes:Array.from({length:33},()=>drawing.strokes[0])}])assert.equal(validHomeDrawing(bad),false);
 assert.equal(homeDrawingHasMarks({version:1,strokes:[]}),false);assert.equal(homeDrawingHasMarks({version:1,strokes:[{color:'#294734',points:[[100,100]]}]}),false);
 assert.equal(applyHomeAction(parts,{type:'drawing',id:'paper',drawing},catalog),true);const after=parts['chunk:0,0'].paper;assert.deepEqual(after.drawing,drawing);assert.ok(homeDrawingChange([{id:'paper',before,after}],'paper'));
 assert.equal(applyHomeAction(parts,{type:'drawing',id:'paper',drawing},catalog),false);
 assert.equal(homeDrawingChange([{id:'paper',before:after,after}],'paper'),null);
 assert.equal(validateHomePart('chunk',JSON.parse(JSON.stringify(parts['chunk:0,0'])),catalog).paper.drawing.version,1);
 assert.throws(()=>validateHomePart('chunk',{paper:{...after,drawing:{version:1,strokes:[{color:'#294734',points:[[1001,0]]}]}}},catalog));
 assert.throws(()=>applyHomeAction({'chunk:0,0':{paper:{...before,itemId:'book'}}},{type:'drawing',id:'paper',drawing},catalog));
 assert.equal(applyHomeAction(parts,{type:'drawing',id:'paper',drawing:{version:1,strokes:[]}},catalog),true);assert.equal(parts['chunk:0,0'].paper.drawing,undefined);
});
test('drawing actions require marks and invalidate changed works before learning receipts',()=>{
 const game={action:{kind:'draw',objectId:'paper'},drawingSnapshot:drawing};
 assert.ok(homeGameActionMatches(game,{kind:'draw',objectId:'paper',drawing}));assert.equal(homeGameActionMatches(game,{kind:'draw',objectId:'other',drawing}),false);
 assert.equal(homeGameActionMatches(game,{kind:'draw',objectId:'paper',drawing:{version:1,strokes:[]}}),false);
 assert.ok(homeGameObjectMatches(game,[{id:'paper',drawing}]));assert.equal(homeGameObjectMatches(game,[{id:'paper'}]),false);
 const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));validateAuthoredHomeGames(read('data/adventure/curriculum/english-home-practice.json'),index);
});
test('the world preview preserves the drawing canvas proportions inside differently shaped paper',()=>{
 const points=[],dots=[],ctx={arc(...args){dots.push(args);},fill(){},save(){},restore(){},fillRect(){},strokeRect(){},beginPath(){},rect(){},clip(){},stroke(){},moveTo(x,y){points.push([x,y]);},lineTo(x,y){points.push([x,y]);}};
 paintHomeDrawing(ctx,{version:1,strokes:[{color:'#294734',points:[[0,0],[1000,1000]]}]},0,0,100,100);
 assert.ok(Math.abs((points[1][0]-points[0][0])/(points[1][1]-points[0][1])-1.5)<.001);
 assert.ok(points.every(([x,y])=>x>=0&&x<=100&&y>=0&&y<=100));
 paintHomeDrawing(ctx,{version:1,strokes:[{color:'#294734',points:[[500,500]]}]},0,0,100,100);assert.equal(dots.length,1);assert.equal(dots[0][0],50);assert.equal(dots[0][1],50);
});
test('the signing chapter cannot claim the picture is present after it was cleared',()=>{
 const data=read('data/adventure/curriculum/english-home-practice.json'),story=data.games.find(g=>g.id==='en-l1-a-picture-for-tomorrow-name');
 const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
 const objects=[{id:'paper',itemId:'paper',x:2,y:1,drawing}],pets=[{id:'pet'}],args={index,objects,pets,catalog,mode:'write',arcId:story.arcOnly,newWordBudget:1,state:{words:{paper:{lastPractice:{at:1}}}},actions:homeGameActions('write',objects,pets,catalog)};
 const game=selectAuthoredHomeGame({...data,games:[story]},args);assert.ok(game);assert.ok(homeGameObjectMatches(game,objects));
 assert.equal(selectAuthoredHomeGame({...data,games:[story]},{...args,objects:objects.map(o=>({...o,drawing:undefined}))}),null);
 assert.equal(homeGameObjectMatches(game,objects.map(o=>({...o,drawing:undefined}))),false);
});
