// Authored, optional aftermath of the lost-spark encounter. No combat or
// learning rewards are attached to the route puzzle.
import {dungeonProgress} from './adventure_city_dungeon_world_core.js';
export const SPARK_DUNGEON='journey:lost-spark';
export const SPARK_GRID={columns:5,rows:4,start:16,goal:4,puddles:[6,11,18],wind:[7,8,12],warm:[2,17]};
const check=(ok,message)=>{if(!ok)throw Error(message);};
const adjacent=(a,b)=>Number.isInteger(b)&&b>=0&&b<20&&Math.abs(a%5-b%5)+Math.abs(Math.floor(a/5)-Math.floor(b/5))===1;
export function sparkRescueReady(save,content){
 const d=content.dungeons?.find(row=>row.id===SPARK_DUNGEON),cleared=dungeonProgress(save)?.[SPARK_DUNGEON]?.cleared;
 return save.zone===SPARK_DUNGEON&&!save.pendingEncounter&&!!d?.arenas?.length&&d.arenas.every(row=>cleared?.includes(row.id));
}
export function sparkRescueNear(save,content){
 const p=content.worldMaps?.[SPARK_DUNGEON]?.portal,s=save.position;
 return sparkRescueReady(save,content)&&[p?.x,p?.y,s?.x,s?.y].every(Number.isFinite)&&Math.hypot(p.x-s.x,p.y-s.y)<=110;
}
export function sparkRouteWarmth(path){
 let warmth=2;
 for(const id of path){if(SPARK_GRID.warm.includes(id))warmth=2;else if(SPARK_GRID.wind.includes(id))warmth--;}
 return warmth;
}
export function sparkRouteMove(state,to){
 const path=state.path,from=path.at(-1);
 if(!adjacent(from,to))return '先选身边相邻的一块石头。';
 if(path.includes(to))return '这块石头已经走过。想改路，可以撤回上一步。';
 if(SPARK_GRID.puddles.includes(to))return '这里有积水，火种缩回了脚。换一条干燥的路吧。';
 if(SPARK_GRID.wind.includes(to)&&state.method==='shelter')return '这里是风口。没有提灯遮挡，要从干燥的石头绕过去。';
 if(sparkRouteWarmth([...path,to])<0)return '提灯的暖意不够了。先到暖石旁缓一缓，或撤回改路。';
 return null;
}
export function applySparkRescue(save,content,action){
 check(sparkRescueNear(save,content),'先清理守卫，再走近出口旁的避风灯台。');
 let state=save.sparkRescue;
 if(action.step==='start'||action.step==='reset'){
  check(['lamp','shelter'].includes(action.method),'先选提灯护送，或沿石头绕过风口。');
  if(state?.status==='safe')return {changed:false,message:'火种已经在避风灯台安顿好了。'};
  if(action.step==='start'&&state)return {changed:false,message:'护送已经开始，可以继续，也可以重新选路。'};
  save.sparkRescue={version:1,status:'active',method:action.method,path:[SPARK_GRID.start]};
  return {message:action.method==='lamp'?'你提起灯：风口可以通过，但要留意灯的暖意。':'你把灯交给守护者，约好沿干燥的石头绕过风口。'};
 }
 check(state?.status==='active','先和火种约好怎样走。');
 if(action.step==='undo'){
  if(state.path.length===1)return {changed:false,message:'还在起点，可以重新选择护送方法。'};
  state.path.pop();return {message:'你们退回上一块石头，重新看路。'};
 }
 if(action.step==='move'){
  check(state.path.at(-1)!==SPARK_GRID.goal,'已经到达灯台，先和火种约好接下来怎么办。');
  const reason=sparkRouteMove(state,action.to);if(reason)return {changed:false,message:reason};
  state.path.push(action.to);
  return {message:action.to===SPARK_GRID.goal?'火种走进避风灯台，身上的光稳了下来。':SPARK_GRID.warm.includes(action.to)?'暖石让灯重新暖了起来。':'火种跟着你挪到了下一块石头。'};
 }
 check(action.step==='finish'&&state.path.at(-1)===SPARK_GRID.goal,'先把火种带到避风灯台。');
 check(['together','signal'].includes(action.promise),'和火种约好回程怎样互相照应。');
 state.status='safe';state.promise=action.promise;
 return {completed:true,message:action.promise==='together'?'你们约好谁也不独自赶路。守护者接过提灯，陪火种回课堂。':'你教火种用明暗发出信号。守护者试着回应，约好沿路互相确认，再一起回课堂。'};
}
export function validateSparkRescue(save){
 const s=save.sparkRescue;if(s===undefined)return;
 check(s&&typeof s==='object'&&!Array.isArray(s)&&Object.keys(s).every(k=>['version','status','method','path','promise'].includes(k))&&s.version===1&&['active','safe'].includes(s.status)&&['lamp','shelter'].includes(s.method),'火种护送记录无效');
 check(Array.isArray(s.path)&&s.path.length>=1&&s.path.length<=20&&s.path[0]===SPARK_GRID.start,'火种护送路线无效');
 for(let i=1;i<s.path.length;i++)check(s.path[i-1]!==SPARK_GRID.goal&&!sparkRouteMove({...s,path:s.path.slice(0,i)},s.path[i]),'火种护送路线不连续');
 check(s.status==='safe'?s.path.at(-1)===SPARK_GRID.goal&&['together','signal'].includes(s.promise):s.promise===undefined,'火种护送约定无效');
}
