import {dungeonTacticsProfile} from './dungeon_tactics_core.js';

// Personal records belong to a complete, freshly started adventure dungeon run.
// Old partial runs and real-player co-op keep their original progress rules.
const limit=999999,cap=n=>Math.min(limit,n);
const profile=id=>dungeonTacticsProfile({id,kind:'elite'});
export function startDungeonChallenge(run,dungeon){
 if(dungeonTacticsProfile(dungeon))run.challenge={version:1,wins:0,turns:0,defeats:0,recorded:false};
}
export function dungeonChallengePreview(save,dungeon,run,pending,battle){
 const old=run?.challenge;
 if(save.coopRun||!old||old.recorded||!dungeonTacticsProfile(dungeon)||!battle.finished||!pending?.dungeonMonsterIds)return null;
 const won=battle.winner==='near';
 const next={...old,wins:old.wins+(won?1:0),turns:cap(old.turns+Math.max(1,battle.turn)),defeats:cap(old.defeats+(won?0:1))};
 const complete=won&&next.wins===dungeon.arenas.length;
 const best=save.dungeonChallengeRecords?.[dungeon.id];
 return {...next,complete,newBest:complete&&(!best||next.turns<best.bestTurns),first:complete&&!best};
}
export function settleDungeonChallenge(save,dungeon,run,pending,battle){
 const next=dungeonChallengePreview(save,dungeon,run,pending,battle);if(!next)return null;
 const {complete,newBest,first,...progress}=next;
 run.challenge=progress;
 if(!complete)return null;
 const old=save.dungeonChallengeRecords?.[dungeon.id];
 const record={version:1,clears:cap((old?.clears||0)+1),bestTurns:newBest?next.turns:old.bestTurns,bestDefeats:newBest?next.defeats:old.bestDefeats,lastTurns:next.turns,lastDefeats:next.defeats};
 if(old?.firstRewarded)record.firstRewarded=true;
 save.dungeonChallengeRecords={...save.dungeonChallengeRecords,[dungeon.id]:record};
 run.challenge.recorded=true;
 return {first,newBest,turns:next.turns,defeats:next.defeats};
}
export function dungeonChallengeLines(record){
 if(!record)return ['尚未完成整轮挑战；从头进入副本后开始记录。'];
 return ['完整通关 '+record.clears+' 次','最快通关 '+record.bestTurns+' 回合 · 期间失利 '+record.bestDefeats+' 次','最近通关 '+record.lastTurns+' 回合 · 期间失利 '+record.lastDefeats+' 次'];
}
export function validateDungeonChallenges(save,content){
 const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
 const fields=(v,keys)=>object(v)&&v.version===1&&keys.every(k=>Number.isSafeInteger(v[k])&&v[k]>=0&&v[k]<=limit);
 const records=save.dungeonChallengeRecords;
 if(records!==undefined){
  if(!object(records))throw Error('副本个人实绩无效');
  for(const [id,row]of Object.entries(records)){
   if(!profile(id)||!fields(row,['clears','bestTurns','bestDefeats','lastTurns','lastDefeats'])||!row.clears||!row.bestTurns||row.bestTurns>row.lastTurns||row.firstRewarded!==undefined&&row.firstRewarded!==true)throw Error('副本个人实绩无效');
  }
 }
 for(const [id,run]of Object.entries(save.dungeonRuns||{})){
  const row=run.challenge;if(row===undefined)continue;
  const dungeon=content.dungeons?.find(d=>d.id===id);
  if(!profile(id)||!dungeon||!fields(row,['wins','turns','defeats'])||typeof row.recorded!=='boolean'||row.wins!==run.cleared.length||row.recorded&&(row.wins!==dungeon.arenas.length||!records?.[id]))throw Error('副本本轮挑战记录无效');
 }
}
