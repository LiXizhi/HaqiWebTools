// Optional camp investigation. All evidence comes from deliberate nearby actions;
// reading a description never grants a word practice or repeats quest rewards.
const check=(ok,message)=>{if(!ok)throw Error(message);};
const SITES={tent:'forest-supplies-tent',desk:'forest-route-desk'};
const EVIDENCE={tent:['grass','paper'],desk:['tracks','lamp']};
export const FOREST_MYSTERY_EVENTS=[
 {id:'return',text:'把捡到的靴子放回帐篷'},
 {id:'dim',text:'巡夜灯暗了，莫尼出门查看'},
 {id:'find',text:'回程在湿草地捡到靴子'},
];
export const forestMysteryOrderCorrect=order=>Array.isArray(order)&&order.join(',')==='dim,find,return';
export const FOREST_MYSTERY_OBSERVATIONS={
 grass:{name:'靴底留下的草屑',text:'帐篷边的泥里也有发亮的草屑。草茎被压断，和靴底夹住的那几根很像。'},
 paper:{name:'湿透的补给单',text:'另一半补给单压在干帽子下面。纸上的墨迹被雨水晕开了，帽子和帐篷里面却是干的。'},
 tracks:{name:'一来一回的脚印',text:'草地边的脚印通向帐篷，又折回路线桌。两排鞋底的缺口在同一边，像是同一个人来回走过。'},
 lamp:{name:'灯旁的泥手印',text:'灯柄上留着泥手印，接缝里夹着和靴底相似的碎草。有人从湿草地走来，提过这盏灯。'},
};
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
  if(!forestMysteryOrderCorrect(action.order))return {changed:false,message:'茜茜：这段先后好像接不上。莫尼先去查看灯，回程才看见草地上的靴子。再把卡片挪一挪？'};
  m.status='solved';m.ending=action.ending;
  return {message:action.ending==='sign'?'茜茜把补给位置写在便签上：挪动物品后留个记号。这次没有小偷，是一句没来得及说的话。':'茜茜和莫尼约好：以后结伴送补给，送到后当面说一声。这次没有小偷，是一句没来得及说的话。',completed:true};
 }
 throw Error('未知营地调查操作');
}
export function validateForestMystery(save){
 const s=save.forestCommission,m=s?.mystery;if(m===undefined)return;
 check(s.phase==='done'&&m&&typeof m==='object'&&!Array.isArray(m)&&m.version===1&&['active','paused','solved'].includes(m.status)&&['light','tracks'].includes(m.route),'营地调查记录无效');
 check(Object.keys(m).every(k=>['version','status','route','observed','witness','ending'].includes(k)),'营地调查包含未知字段');
 check(Array.isArray(m.observed)&&m.observed.length<=4&&new Set(m.observed).size===m.observed.length&&m.observed.every(id=>Object.hasOwn(FOREST_MYSTERY_OBSERVATIONS,id))&&typeof m.witness==='boolean','营地调查物证无效');
 const first=m.route==='tracks'?EVIDENCE.tent:EVIDENCE.desk,second=m.route==='tracks'?EVIDENCE.desk:EVIDENCE.tent;
 check(!m.observed.some(id=>second.includes(id))||first.every(id=>m.observed.includes(id)),'营地调查路线不一致');
 check(!m.witness||m.observed.length===4,'营地调查缺少物证');
 check(m.status==='solved'?m.witness&&['sign','pair'].includes(m.ending):m.ending===undefined,'营地调查结论无效');
}
