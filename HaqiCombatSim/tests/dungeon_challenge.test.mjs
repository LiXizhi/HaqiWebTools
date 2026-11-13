import test from 'node:test';
import assert from 'node:assert/strict';
import {startDungeonChallenge,dungeonChallengePreview,settleDungeonChallenge,validateDungeonChallenges,dungeonChallengeLines} from '../js/dungeon_challenge_core.js';

const dungeon={id:'journey:lost-spark',kind:'elite',arenas:[{id:'a'},{id:'b'}]};
const content={dungeons:[dungeon]},pending={dungeonMonsterIds:['one']};
const battle=(turns,won=true)=>({finished:true,turn:turns,winner:won?'near':'far'});
function setup(){const run={cleared:[]},save={dungeonRuns:{[dungeon.id]:run}};startDungeonChallenge(run,dungeon);return{run,save};}
function settle(save,run,id,turns,won=true){if(won)run.cleared.push(id);return settleDungeonChallenge(save,dungeon,run,pending,battle(turns,won));}
test('whole-run record includes defeats, resumes, and saves only after complete clear',()=>{
 const {run,save}=setup();settle(save,run,'a',3);settle(save,run,'b',2,false);
 assert.equal(save.dungeonChallengeRecords,undefined);
 validateDungeonChallenges(save,content);
 const resumed=structuredClone(save),live=resumed.dungeonRuns[dungeon.id];
 const preview=dungeonChallengePreview(resumed,dungeon,live,pending,battle(4));
 assert.deepEqual([preview.turns,preview.defeats,preview.complete],[9,1,true]);
 assert.equal(live.turns,undefined,'preview never mutates the run');
 const result=settle(resumed,live,'b',4);
 assert.deepEqual(result,{first:true,newBest:true,turns:9,defeats:1});
 assert.deepEqual(resumed.dungeonChallengeRecords[dungeon.id],{version:1,clears:1,bestTurns:9,bestDefeats:1,lastTurns:9,lastDefeats:1});
 validateDungeonChallenges(resumed,content);
 assert.equal(settleDungeonChallenge(resumed,dungeon,live,pending,battle(4)),null);
});
test('restart retains best and updates last clear; slower clears do not replace best',()=>{
 const {run,save}=setup();settle(save,run,'a',2);settle(save,run,'b',3);
 run.cleared=[];startDungeonChallenge(run,dungeon);settle(save,run,'a',4);settle(save,run,'b',4);
 assert.equal(save.dungeonChallengeRecords[dungeon.id].bestTurns,5);
 assert.equal(save.dungeonChallengeRecords[dungeon.id].lastTurns,8);
 run.cleared=[];startDungeonChallenge(run,dungeon);settle(save,run,'a',1);
 assert.equal(settle(save,run,'b',2).newBest,true);
 assert.equal(save.dungeonChallengeRecords[dungeon.id].bestTurns,3);
 assert.equal(save.dungeonChallengeRecords[dungeon.id].clears,3);
});
test('old partial runs, unfinished fights and real-player co-op cannot fabricate personal records',()=>{
 assert.equal(dungeonChallengePreview({},dungeon,{cleared:['a']},pending,battle(2)),null);
 const {run,save}=setup();
 assert.equal(dungeonChallengePreview(save,dungeon,run,pending,{...battle(2),finished:false}),null);
 save.coopRun={};assert.equal(settleDungeonChallenge(save,dungeon,run,pending,battle(2)),null);
 assert.equal(save.dungeonChallengeRecords,undefined);
 assert.match(dungeonChallengeLines(null)[0],/尚未完成/);
});
test('records reject invalid IDs, noninteger scores and progress mismatches',()=>{
 const {save,run}=setup();validateDungeonChallenges(save,content);
 run.challenge.wins=1;assert.throws(()=>validateDungeonChallenges(save,content),/本轮挑战/);
 run.challenge.wins=0;run.challenge.turns=1.5;assert.throws(()=>validateDungeonChallenges(save,content));
 delete run.challenge;save.dungeonChallengeRecords={'fake':{version:1}};assert.throws(()=>validateDungeonChallenges(save,content),/个人实绩/);
});
