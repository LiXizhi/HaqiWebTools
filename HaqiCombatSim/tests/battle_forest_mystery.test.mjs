import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as A from '../js/adventure_core.js';
import {checkedProgress} from '../js/adventure_cloud_core.js';
import {persistReward} from '../js/adventure_reward_persistence.js';
import {forestCommissionPhase,forestCommissionGoal,forestCommissionScene,FOREST_NPCS,FOREST_SITES} from '../js/forest_commission_core.js';
import {forestMysteryStage} from '../js/forest_mystery_core.js';
const read=file=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+file,import.meta.url)));
const content=read('chapter.json'),dataset=read('combat.json');
function fresh(plan='tracks'){
 const save=A.createAdventure(content,{school:'fire',seed:231});
 save.forestCommission={version:1,phase:'done',clearBaseline:0,plan};
 save.dungeonChallengeRecords={'journey:first-watch':{version:1,clears:1,bestTurns:8,bestDefeats:0,lastTurns:8,lastDefeats:0}};
 return save;
}
function act(save,step,props={},target){
 const goal=forestCommissionGoal(save);
 const forestTarget=target||{id:goal.id,kind:goal.kind,...save.position};
 return A.applyAction(save,content,{type:'forest-commission',step,...props},{forestTarget});
}
function evidence(save,route='tracks'){
 const order=route==='tracks'?['grass','paper','tracks','lamp']:['tracks','lamp','grass','paper'];
 for(const object of order)act(save,'mystery-inspect',{object});
}
const solution={order:['dim','find','return'],ending:'sign'};

test('completed patrols invite the unresolved investigation, then keep active evidence goals and solved records',()=>{
 const save=fresh(),before=structuredClone(save);
 assert.equal(forestCommissionGoal(save).id,FOREST_NPCS.receiver);
 assert.match(forestCommissionGoal(save).label,/草屑与脚印/);assert.match(forestCommissionGoal(save).hint,/补给的经过还没查清/);
 assert.deepEqual(save,before);
 act(save,'mystery-start');assert.equal(forestCommissionPhase(save),'investigation');
 assert.equal(forestCommissionGoal(save).id,FOREST_SITES.boots);
 evidence(save);act(save,'mystery-question');act(save,'mystery-solve',solution);
 const restored=A.parseSave(JSON.stringify(save),content);
 assert.equal(forestCommissionPhase(restored),'done');assert.equal(forestCommissionGoal(restored).label,'营地急件已完成');
 assert.match(forestCommissionGoal(restored).hint,/巡逻记录/);
});

for(const route of ['tracks','light'])test(`${route} proposal changes the first physical investigation and survives pause/load`,()=>{
 const save=fresh(route),rewards=structuredClone(save.inventory);
 act(save,'mystery-start');
 assert.equal(forestCommissionPhase(save),'investigation');
 assert.equal(forestCommissionGoal(save).id,route==='tracks'?FOREST_SITES.boots:FOREST_SITES.note);
 assert.equal(forestCommissionScene(save).sites[forestCommissionGoal(save).id].active,true);
 const first=route==='tracks'?'grass':'tracks';act(save,'mystery-inspect',{object:first});
 act(save,'mystery-pause');assert.equal(forestCommissionPhase(save),'done');
 const loaded=checkedProgress(save,content,dataset).save;
 assert.equal(loaded.forestCommission.mystery.status,'paused');
 act(loaded,'mystery-start');assert.deepEqual(loaded.forestCommission.mystery.observed,[first]);
 assert.equal(forestMysteryStage(loaded),route==='tracks'?'tent':'desk');
 assert.deepEqual(loaded.inventory,rewards);
});

test('evidence requires the current physical scene, four discoveries, and testimony before a conclusion',()=>{
 const save=fresh();act(save,'mystery-start');const before=JSON.stringify(save);
 assert.throws(()=>act(save,'mystery-inspect',{object:'grass'},{id:FOREST_SITES.boots,kind:'landmark',x:save.position.x+500,y:save.position.y}),/靠近/);
 assert.throws(()=>act(save,'mystery-inspect',{object:'grass'},{id:FOREST_NPCS.giver,kind:'npc',...save.position}),/靠近/);
 assert.throws(()=>act(save,'mystery-inspect',{object:'tracks'}),/不在眼前/);
 assert.throws(()=>act(save,'mystery-question'),/物证/);
 assert.throws(()=>act(save,'mystery-solve',solution),/物证/);
 assert.equal(JSON.stringify(save),before);
 assert.equal(act(save,'mystery-inspect',{object:'hat'}).changed,false);
 assert.equal(JSON.stringify(save),before,'decoys never advance evidence or learning');
 act(save,'mystery-inspect',{object:'grass'});const found=JSON.stringify(save);
 assert.equal(act(save,'mystery-inspect',{object:'grass'}).changed,false);assert.equal(JSON.stringify(save),found);
 act(save,'mystery-inspect',{object:'paper'});assert.equal(forestMysteryStage(save),'desk');
 act(save,'mystery-inspect',{object:'tracks'});act(save,'mystery-inspect',{object:'lamp'});
 assert.equal(forestCommissionGoal(save).id,FOREST_NPCS.giver);
 assert.throws(()=>act(save,'mystery-solve',solution),/物证/);
 act(save,'mystery-question');assert.equal(forestCommissionGoal(save).id,FOREST_NPCS.receiver);
 assert.equal(forestMysteryStage(save),'explain');
});

for(const ending of ['sign','pair'])test(`${ending} ending changes camp responses without granting a second quest reward or practice`,()=>{
 const save=fresh();act(save,'mystery-start');evidence(save);act(save,'mystery-question');
 const before=JSON.stringify(save),inventory=structuredClone(save.inventory);
 assert.equal(act(save,'mystery-solve',{...solution,order:['return','dim','find']}).changed,false);
 assert.equal(JSON.stringify(save),before);
 act(save,'mystery-solve',{...solution,ending});
 assert.equal(forestCommissionPhase(save),'done');assert.equal(save.forestCommission.mystery.ending,ending);
 assert.match(forestCommissionScene(save).sites[FOREST_SITES.boots].label,ending==='sign'?/便签/:/结伴/);
 assert.match(forestCommissionScene(save).npcs[FOREST_NPCS.receiver],/物证/);
 assert.deepEqual(save.inventory,inventory);assert.equal(save.forestCommission.labelPractices,undefined);
 assert.ok(checkedProgress(save,content,dataset));
 const solved=JSON.stringify(save);assert.equal(act(save,'mystery-start').changed,false);
 assert.throws(()=>act(save,'mystery-solve',{...solution,ending}));assert.throws(()=>act(save,'report'));
 assert.equal(JSON.stringify(save),solved);
});

test('investigation cannot be started before the original patrol reward is reported',()=>{
 for(const phase of ['boots','delivery','note','briefing','patrol']){
  const save=fresh();save.forestCommission.phase=phase;
  assert.throws(()=>act(save,'mystery-start'),/完成巡逻/);
  assert.equal(save.forestCommission.mystery,undefined);
 }
});

test('invalid investigation saves are rejected while older completed commissions remain readable',()=>{
 assert.ok(checkedProgress(fresh(),content,dataset));
 const base={version:1,status:'active',route:'tracks',observed:[],witness:false};
 for(const mutation of [
  {status:'unknown'},{route:'shortcut'},{observed:['grass','grass']},{observed:['tracks']},
  {observed:['missing']},{witness:true},{ending:'sign'},{status:'solved'}, {coins:999},
 ]){
  const save=fresh();save.forestCommission.mystery={...base,...mutation};
  assert.throws(()=>checkedProgress(save,content,dataset));
 }
 const save=fresh();save.forestCommission.mystery={...base,observed:['grass']};
 assert.ok(checkedProgress(save,content,dataset));
});

test('failed storage leaves the original investigation untouched and retry records only one observation',()=>{
 const save=fresh();act(save,'mystery-start');const before=JSON.stringify(save);
 const request={type:'forest-commission',step:'mystery-inspect',object:'grass'};
 const access={forestTarget:{id:FOREST_SITES.boots,kind:'landmark',...save.position}};
 assert.throws(()=>persistReward(save,content,request,access,{getItem(){return null;},setItem(){throw Error('quota');}}),/quota/);
 assert.equal(JSON.stringify(save),before);
 let written;const committed=persistReward(save,content,request,access,{getItem(){return null;},setItem(key,value){if(!key.endsWith('.updated'))written=value;}});
 assert.deepEqual(committed.save.forestCommission.mystery.observed,['grass']);
 assert.deepEqual(JSON.parse(written).forestCommission.mystery.observed,['grass']);
 assert.equal(act(committed.save,'mystery-inspect',{object:'grass'}).changed,false);
});
