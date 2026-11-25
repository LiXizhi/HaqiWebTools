// Optional camp investigation. All evidence comes from deliberate nearby actions;
// reading a description never grants a word practice or repeats quest rewards.
import {validateForestPromise} from './forest_promise_core.js';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const SITES={tent:'forest-supplies-tent',desk:'forest-route-desk'};
const EVIDENCE={tent:['grass','paper'],desk:['tracks','lamp']};
export const FOREST_MYSTERY_EVENTS=[
 {id:'return',text:'把捡到的靴子放回帐篷'},
 {id:'dim',text:'巡夜灯暗了，莫尼出门查看'},
 {id:'find',text:'回程在湿草地捡到靴子'},
];
export const forestMysteryOrderCorrect=order=>Array.isArray(order)&&order.join(',')==='dim,find,return';
// Compare causes rather than giving away the entire sequence. No save mutation.
export function forestMysteryOrderFeedback(order){
 if(!Array.isArray(order)||order.length!==3||new Set(order).size!==3||!order.every(id=>FOREST_MYSTERY_EVENTS.some(row=>row.id===id)))return {correct:false,events:[],message:'先把三张经过卡各放一次。'};
 if(order.indexOf('find')<order.indexOf('dim'))return {correct:false,evidence:'lamp',events:['dim','find'],message:'茜茜：莫尼说靴子是在回程捡到的。对照灯柄和证词，想想出门查看灯该放在哪里？'};
 if(order.indexOf('return')<order.indexOf('find'))return {correct:false,evidence:'grass',events:['find','return'],message:'茜茜：帐篷边和靴底都有湿草屑。靴子要怎样从草地回到帐篷？看看这两张卡的先后。'};
 return {correct:true,events:[]};
}
export const FOREST_MYSTERY_REASONING=[
 {id:'wet-paper',question:'补给单湿了，帽子却是干的。哪件物证最适合核对“它们一起淋了雨”的猜想？',answer:'paper',reply:'茜茜：湿补给单和干帽子就在一起。再对照莫尼的证词，帽子留在帐篷里，补给单跟着他出去了。',retry:'茜茜：先找能直接比较“湿”和“干”的物证。别急着猜是谁拿走了东西。'},
 {id:'return-trip',question:'想核对“有人把东西送回帐篷，又回路线桌”的经过，先看哪件物证？',answer:'tracks',reply:'茜茜：脚印通向帐篷，又折回路线桌。鞋底缺口相同，能和莫尼说的来回路线互相核对。',retry:'茜茜：这次要找的是来回的方向。哪件物证能让我们沿着路线看一看？'},
];
export const FOREST_MYSTERY_OBSERVATIONS={
 grass:{name:'靴底留下的草屑',text:'帐篷边的泥里也有发亮的草屑。草茎被压断，和靴底夹住的那几根很像。'},
 paper:{name:'湿透的补给单',text:'另一半补给单压在干帽子下面。纸上的墨迹被雨水晕开了，帽子和帐篷里面却是干的。'},
 tracks:{name:'一来一回的脚印',text:'草地边的脚印通向帐篷，又折回路线桌。两排鞋底的缺口在同一边，像是同一个人来回走过。'},
 lamp:{name:'灯旁的泥手印',text:'灯柄上留着泥手印，接缝里夹着和靴底相似的碎草。有人从湿草地走来，提过这盏灯。'},
};
// Optional questions connect physical clues to the timeline testimony.
// Reading a reply never creates progress or awards practice.
export const FOREST_MYSTERY_QUESTIONS=[
 {evidence:'grass',question:'靴底的草屑是从哪里来的？',reply:'莫尼：我回程经过湿草地，靴子就掉在那里。我把它捡起来，走回帐篷，草屑也一起带回来了。'},
 {evidence:'lamp',question:'你为什么先去看巡夜灯？',reply:'莫尼：灯变暗了，我先出去查看。捡到靴子是在回程，不是在出门以前。'},
 {evidence:'paper',question:'补给单湿了，为什么帽子还是干的？',reply:'莫尼：帽子一直放在帐篷里。另一半补给单跟着我出去了，被雨淋湿；回来后，我把它放回干帽子旁边。'},
 {evidence:'tracks',question:'脚印为什么一来一回？',reply:'莫尼：我把靴子放回帐篷，又回到路线桌。我以为东西放回去就好了，忘了告诉茜茜位置变了。'},
];
export function forestMysteryStage(save){
 const m=save.forestCommission?.mystery;
 if(!m||m.status!=='active')return null;
 const order=m.route==='tracks'?['tent','desk']:['desk','tent'];
 for(const site of order)if(!EVIDENCE[site].every(id=>m.observed.includes(id)))return site;
 return m.witness?'explain':'witness';
}
export function forestMysteryGoal(save){
 const stage=forestMysteryStage(save);
 return {
  tent:{id:SITES.tent,kind:'landmark',label:'回补给帐篷检查草屑和湿补给单',hint:'检查两件物证；不急着认定是谁拿走了补给。'},
  desk:{id:SITES.desk,kind:'landmark',label:'到路线桌旁查看脚印和巡夜灯',hint:'沿脚印找方向，再看看灯柄。'},
  witness:{id:36201,kind:'npc',label:'把找到的物证拿给莫尼看',hint:'先听当事人说说，别只凭脚印猜。'},
  explain:{id:36200,kind:'npc',label:'和茜茜一起还原补给的经过',hint:'把三件事排好，再决定以后怎样送补给。'},
 }[stage]||null;
}
export function applyForestMystery(save,action,nearby){
 const s=save.forestCommission;
 check(s?.phase==='done','先完成巡逻并向茜茜汇报，再一起调查。');
 if(action.step==='mystery-start'){
  nearby(36200,'npc');
  if(s.mystery?.status==='solved')return {changed:false,message:'草屑和脚印的经过已经记在调查袋里。'};
  if(s.mystery?.status==='active')return {changed:false,message:'调查还在继续，按当前线索找就好。'};
  if(s.mystery)s.mystery.status='active';
  else s.mystery={version:1,status:'active',route:s.plan==='tracks'?'tracks':'light',observed:[],witness:false};
  return {message:s.mystery.route==='tracks'?'茜茜和你约好：先回帐篷找草屑，再沿脚印查看。':'茜茜和你约好：先检查巡夜灯，再回帐篷看看补给。'};
 }
 const m=s.mystery,stage=forestMysteryStage(save);
 check(m?.status==='active','先和茜茜约好一起调查。');
 if(action.step==='mystery-pause'){
  m.status='paused';return {message:'茜茜替你收好调查袋。找到的物证会保留，回来可以继续。'};
 }
 const goal=forestMysteryGoal(save);nearby(goal.id,goal.kind);
 if(action.step==='mystery-inspect'){
  check(['tent','desk'].includes(stage),'物证已经齐了，先去找当事人。');
  const decoy=stage==='tent'?'hat':'bush';
  if(action.object===decoy)return {changed:false,message:stage==='tent'?'帽子里面是干的，也没有泥。它一直待在帐篷下，说明不了草地上发生了什么。':'灌木叶子是湿的，叶下却没有脚印。先看看草地边那条路。'};
  check(EVIDENCE[stage].includes(action.object),'这个物件不在眼前，先走近对应的地方。');
  if(m.observed.includes(action.object))return {changed:false,message:FOREST_MYSTERY_OBSERVATIONS[action.object].text};
  m.observed.push(action.object);
  return {message:FOREST_MYSTERY_OBSERVATIONS[action.object].text};
 }
 if(action.step==='mystery-question'){
  check(stage==='witness','先把两处现场的物证找齐。');m.witness=true;
  return {message:'莫尼：灯一暗，我先去看灯。回程看见靴子掉在湿草地上，就捡回帐篷。补给单也淋湿了。我以为放回去就好了，没有说一声，害你们找了半天。'};
 }
 if(action.step==='mystery-solve'){
  check(stage==='explain','先找齐物证，再听莫尼说说。');
  check(Array.isArray(action.order)&&action.order.length===3&&new Set(action.order).size===3&&action.order.every(id=>FOREST_MYSTERY_EVENTS.some(row=>row.id===id)),'先把三张经过卡各放一次。');
  check(['sign','pair'].includes(action.ending),'先商量以后怎样送补给。');
  const feedback=forestMysteryOrderFeedback(action.order);
  if(!feedback.correct)return {changed:false,message:feedback.message};
  m.status='solved';m.ending=action.ending;
  return {message:action.ending==='sign'?'茜茜把补给位置写在便签上：挪动物品后留个记号。这次没有小偷，是一句没来得及说的话。':'茜茜和莫尼约好：以后结伴送补给，送到后当面说一声。这次没有小偷，是一句没来得及说的话。',completed:true};
 }
 throw Error('未知营地调查操作');
}
export function validateForestMystery(save){
 const s=save.forestCommission,m=s?.mystery;if(m===undefined)return;
 check(s.phase==='done'&&m&&typeof m==='object'&&!Array.isArray(m)&&m.version===1&&['active','paused','solved'].includes(m.status)&&['light','tracks'].includes(m.route),'营地调查记录无效');
 check(Object.keys(m).every(k=>['version','status','route','observed','witness','ending','promise'].includes(k)),'营地调查包含未知字段');
 check(Array.isArray(m.observed)&&m.observed.length<=4&&new Set(m.observed).size===m.observed.length&&m.observed.every(id=>Object.hasOwn(FOREST_MYSTERY_OBSERVATIONS,id))&&typeof m.witness==='boolean','营地调查物证无效');
 const first=m.route==='tracks'?EVIDENCE.tent:EVIDENCE.desk,second=m.route==='tracks'?EVIDENCE.desk:EVIDENCE.tent;
 check(!m.observed.some(id=>second.includes(id))||first.every(id=>m.observed.includes(id)),'营地调查路线不一致');
 check(!m.witness||m.observed.length===4,'营地调查缺少物证');
 check(m.status==='solved'?m.witness&&['sign','pair'].includes(m.ending):m.ending===undefined,'营地调查结论无效');
 validateForestPromise(m);
}
