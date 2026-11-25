// Authored, optional aftermath of the lost-spark encounter. No combat or
// learning rewards are attached to the route puzzle.
import {dungeonProgress} from './adventure_city_dungeon_world_core.js';
export const SPARK_DUNGEON='journey:lost-spark';
export const SPARK_GRID={columns:5,rows:4,start:16,goal:4,puddles:[6,11,18],wind:[7,8,12],warm:[2,17]};
export const SPARK_WIND_CYCLE=['calm','breeze','gust'];
export const SPARK_SIGNAL=[true,false,true];
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
// Wind advances on player actions, never elapsed time. Whole waiting cycles
// are equivalent, so each stone stores only its 0..2 phase offset.
export function sparkRouteStatus(state){
 const phase=(state.path.length-1+(state.waits||[]).reduce((sum,n)=>sum+n,0))%SPARK_WIND_CYCLE.length;
 return {wind:SPARK_WIND_CYCLE[phase],nextWind:SPARK_WIND_CYCLE[(phase+1)%3],warmth:sparkRouteWarmth(state.path)};
}
export function sparkRescueStory(save){
 const state=save.sparkRescue,current=state?.path.at(-1),mystery=save.forestCommission?.mystery;
 const memory=mystery?.status!=='solved'?null:mystery.ending==='sign'
  ?'你想起营地的位置便签，先指给火种看：灯台在那里，我们一起走过去。'
  :'你想起营地的约定：结伴走，送到后当面说一声。你放慢脚步，等火种跟上。';
 if(!state||current===SPARK_GRID.start)return {memory,speaker:'火种看守',text:'我在洞口看着你们。先让它看清要去哪里，再一起走。'};
 if(current===17)return {memory:null,speaker:'火种',text:'刚才灯一晃，我还以为你要先走。我们真的可以一起回去吗？'};
 if(current===2)return {memory:null,speaker:'火种',text:'灯台就在前面。我看着你的灯，已经能跟上你的脚步了。'};
 if(SPARK_GRID.wind.includes(current))return {memory:null,speaker:'火种',text:state.version===2&&sparkRouteStatus(state).wind==='gust'
  ?'风好大。先别走，我想和你一起等一等。'
  :'我看着你的灯。你走一步，我就跟一步。'};
 return {memory:null,speaker:'火种看守',text:'别急着赶路。它还在跟着你，回头看看它。'};
}
// A recollection of the retained route, not a new quest or a reward receipt.
// waits stores phase offsets, not a total: never report it as elapsed time
// or a count of every pause (whole cycles are deliberately normalized away).
export function sparkRescueDebrief(save){
 const state=save.sparkRescue;
 if(state?.status!=='safe')return null;
 const windStones=state.path.filter(id=>SPARK_GRID.wind.includes(id)).length;
 const warmStones=state.path.filter(id=>SPARK_GRID.warm.includes(id)).length;
 const windMark=state.version===2&&state.waits.some(n=>n>0);
 const reply=state.method==='shelter'
  ?{id:'S1195-R01',text:'我们绕开了风口。路远一点也没关系，我没有掉队。'}
  :windStones&&windMark
   ?{id:'S1195-R02',text:'你停下来时也护着灯。我知道，你还在这里等我。'}
   :windStones
    ?{id:'S1195-R03',text:'你替我挡住了风。每走一步，我都能看见前面的灯。'}
    :{id:'S1195-R04',text:'你没有催我走近风口。沿着干石，我也能慢慢跟上。'};
 return {reply,windStones,warmStones,route:state.path.slice()};
}
export function sparkRouteMove(state,to){
 const path=state.path,from=path.at(-1);
 if(!adjacent(from,to))return '先选身边相邻的一块石头。';
 if(path.includes(to))return '这块石头已经走过。想改路，可以撤回上一步。';
 if(SPARK_GRID.puddles.includes(to))return '这里有积水，火种缩回了脚。换一条干燥的路吧。';
 if(SPARK_GRID.wind.includes(to)&&state.method==='shelter')return '这里是风口。没有提灯遮挡，要从干燥的石头绕过去。';
 if(state.version===2&&SPARK_GRID.wind.includes(to)&&sparkRouteStatus(state).wind==='gust')return '风口正在起大风。先停步护灯，等风缓下来再走。';
 if(sparkRouteWarmth([...path,to])<0)return '提灯的暖意不够了。先到暖石旁缓一缓，或撤回改路。';
 return null;
}
// Describe only the next step. Do not reveal a solution or change a route.
export function sparkRouteGuidance(state){
 if(state.status!=='active'||state.path.at(-1)===SPARK_GRID.goal)return null;
 if(Array.from({length:20},(_,to)=>to).some(to=>sparkRouteMove(state,to)===null))return 'choose';
 if(state.version===2&&state.method==='lamp'){
  const waits=state.waits.slice();waits[waits.length-1]=(waits.at(-1)+1)%3;
  if(Array.from({length:20},(_,to)=>to).some(to=>sparkRouteMove({...state,waits},to)===null))return 'wait';
 }
 return 'backtrack';
}
export function applySparkRescue(save,content,action){
 check(sparkRescueNear(save,content),'先清理守卫，再走近出口旁的避风灯台。');
 let state=save.sparkRescue;
 if(action.step==='start'||action.step==='reset'){
  check(['lamp','shelter'].includes(action.method),'先选提灯护送，或沿石头绕过风口。');
  if(state?.status==='safe')return {changed:false,message:'火种已经在避风灯台安顿好了。'};
  if(action.step==='start'&&state)return {changed:false,message:'护送已经开始，可以继续，也可以重新选路。'};
  save.sparkRescue={version:2,status:'active',method:action.method,path:[SPARK_GRID.start],waits:[0]};
  return {message:action.method==='lamp'?'你提起灯：风口可以通过，但要留意灯的暖意。':'你把灯交给守护者，约好沿干燥的石头绕过风口。'};
 }
 check(state?.status==='active','先和火种约好怎样走。');
 if(action.step==='undo'){
  if(state.path.length===1)return {changed:false,message:'还在起点，可以重新选择护送方法。'};
  state.path.pop();if(state.version===2)state.waits.pop();delete state.signals;return {message:'你们退回上一块石头，重新看路。'};
 }
 if(action.step==='wait'){
  check(state.version===2,'这段护送沿用原来的石路，继续选路就好。');
  check(state.path.at(-1)!==SPARK_GRID.goal,'已经到达灯台，先和火种约好接下来怎么办。');
  const i=state.waits.length-1;state.waits[i]=(state.waits[i]+1)%3;
  const wind=sparkRouteStatus(state).wind;
  return {message:wind==='gust'?'你把灯护在身前。风又大了，先看清下一步。':wind==='calm'?'你们停稳脚步，护住灯芯。风停了，可以重新选路。':'你们停稳脚步，护住灯芯。微风吹过，火种仍紧紧跟着你。'};
 }
 if(action.step==='move'){
  check(state.path.at(-1)!==SPARK_GRID.goal,'已经到达灯台，先和火种约好接下来怎么办。');
  const reason=sparkRouteMove(state,action.to);if(reason)return {changed:false,message:reason};
  state.path.push(action.to);
  if(state.version===2)state.waits.push(0);
  return {message:action.to===SPARK_GRID.goal?'火种走进避风灯台，身上的光稳了下来。':SPARK_GRID.warm.includes(action.to)?'暖石让灯重新暖了起来。':'火种跟着你挪到了下一块石头。'};
 }
 if(action.step==='signal-start'||action.step==='signal-pulse'){
  check(state.version===2&&state.path.at(-1)===SPARK_GRID.goal,'先把火种带到避风灯台。');
  if(action.step==='signal-start'){
   if(state.signals)return {changed:false,message:'火种正在等你回应。看清灯光的顺序，慢慢来。'};
   state.signals=[];return {message:'火种亮一下、暗一下，又亮一下：“这是我还在这里。你也这样回应，好吗？”'};
  }
  check(Array.isArray(state.signals)&&typeof action.lit==='boolean','先和火种约好用灯光回应。');
  const next=SPARK_SIGNAL[state.signals.length];
  if(action.lit!==next)return {changed:false,message:next?'火种还在看着你。这一步亮起灯，让它知道你在。':'先遮一下灯，再亮起来。火种会看懂这段回应。'};
  state.signals.push(action.lit);
  if(state.signals.length<SPARK_SIGNAL.length)return {message:action.lit?'你亮起灯。火种靠近了一些，等着下一拍。':'你遮住灯光。火种没有跑开，它知道你还在。'};
  state.status='safe';state.promise='signal';
  return {completed:true,message:'你再亮起灯，火种也亮了起来。守护者接过提灯：“看见了，我们一起回去。”'};
 }
 check(action.step==='finish'&&state.path.at(-1)===SPARK_GRID.goal,'先把火种带到避风灯台。');
 check(['together','signal'].includes(action.promise),'和火种约好回程怎样互相照应。');
 check(state.version!==2||action.promise!=='signal','先和火种用灯光互相回应，再一起回去。');
 delete state.signals;
 state.status='safe';state.promise=action.promise;
 return {completed:true,message:action.promise==='together'?'你们约好谁也不独自赶路。守护者接过提灯，陪火种回课堂。':'你教火种用明暗发出信号。守护者试着回应，约好沿路互相确认，再一起回课堂。'};
}
export function validateSparkRescue(save){
 const s=save.sparkRescue;if(s===undefined)return;
 check(s&&typeof s==='object'&&!Array.isArray(s)&&Object.keys(s).every(k=>['version','status','method','path','promise',...(s.version===2?['waits','signals']:[])].includes(k))&&[1,2].includes(s.version)&&['active','safe'].includes(s.status)&&['lamp','shelter'].includes(s.method),'火种护送记录无效');
 check(Array.isArray(s.path)&&s.path.length>=1&&s.path.length<=20&&s.path[0]===SPARK_GRID.start,'火种护送路线无效');
 if(s.version===2)check(Array.isArray(s.waits)&&s.waits.length===s.path.length&&s.waits.every(n=>Number.isInteger(n)&&n>=0&&n<3)&&(s.path.at(-1)!==SPARK_GRID.goal||s.waits.at(-1)===0),'火种护送风势记录无效');
 for(let i=1;i<s.path.length;i++)check(s.path[i-1]!==SPARK_GRID.goal&&!sparkRouteMove({...s,path:s.path.slice(0,i),...(s.version===2?{waits:s.waits.slice(0,i)}:{})},s.path[i]),'火种护送路线不连续');
 if(s.signals!==undefined)check(s.version===2&&s.path.at(-1)===SPARK_GRID.goal&&Array.isArray(s.signals)&&s.signals.length<=(s.status==='active'?2:3)&&s.signals.every((lit,i)=>lit===SPARK_SIGNAL[i]),'火种护送灯光记录无效');
 check(s.status==='safe'?s.path.at(-1)===SPARK_GRID.goal&&['together','signal'].includes(s.promise):s.promise===undefined,'火种护送约定无效');
 if(s.version===2&&s.status==='safe')check(s.promise==='signal'?s.signals?.length===SPARK_SIGNAL.length:s.signals===undefined,'火种护送灯光记录无效');
}
