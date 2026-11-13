// A carried-object commission. English changes what the player does in the scene;
// progress, reward ownership and the real dungeon record remain independent.
export const FOREST_COMMISSION_ID='camp-patrol-supplies';
export const FOREST_PATROL_DUNGEON='journey:first-watch';
export const FOREST_NPCS={giver:36201,receiver:36200};
export const FOREST_SITES={boots:'forest-supplies-tent',note:'forest-route-desk'};
const PHASES=['boots','delivery','note','briefing','patrol','done'];
const GEAR={ice:[1236,1246,1256],death:[1237,1247,1257],life:[1238,1248,1258],storm:[1239,1249,1259],fire:[1240,1250,1260]};
const PATROL_CLOAK={fire:1415,ice:1416,storm:1417,death:1418,life:1419};
const check=(ok,message)=>{if(!ok)throw Error(message);};
const count=s=>s.dungeonChallengeRecords?.[FOREST_PATROL_DUNGEON]?.clears||0;
export function forestCommissionAvailable(save){return !save.openingJourney||save.openingJourney.phase==='done';}
export function forestCommission(save){return save.forestCommission||null;}
export function forestCommissionPhase(save){const s=forestCommission(save);return s?.phase==='patrol'&&count(save)>s.clearBaseline?'report':s?.phase||'offer';}
export function forestCommissionPouch(save){
 const phase=forestCommissionPhase(save);
 if(phase==='delivery')return [{id:'patrol-boots',name:'待送达的巡逻靴',description:'从帐篷旁找到的营地补给。交给茜茜，不可出售或穿戴。',artItem:GEAR[save.school]?.[2]}];
 if(['briefing','patrol','report'].includes(phase))return [{id:'patrol-note',name:'巡逻路线便签',description:'Keep together. Focus on one enemy. 茜茜标出了巡夜灯的位置；任务结束后归还。'}];
 return [];
}
export function forestCommissionGoal(save){
 const phase=forestCommissionPhase(save),common={phase,zone:'camp'};
 const rows={
  offer:{id:FOREST_NPCS.giver,kind:'npc',label:'找莫尼接取营地急件',hint:'一份需要读懂英语标签的补给委托。'},
  boots:{id:FOREST_SITES.boots,kind:'landmark',label:'到补给帐篷按英语补给单选物',hint:'Find the boots beside the tent. Leave the hat.'},
  delivery:{id:FOREST_NPCS.receiver,kind:'npc',label:'把巡逻靴交给茜茜',hint:'靴子已经放进旅行背包的委托袋。'},
  note:{id:FOREST_SITES.note,kind:'landmark',label:'到营地路线桌寻找便签',hint:'The note is behind the rock. Move the rock.'},
  briefing:{id:FOREST_NPCS.receiver,kind:'npc',label:'把路线便签拿给茜茜',hint:'先听巡逻分工，再去实战。'},
  patrol:{id:FOREST_PATROL_DUNGEON,kind:'landmark',label:'完整挑战晨雾中的巡夜灯',hint:'5级精英副本；先准备卡组、穿戴装备。可随时回来继续。'},
  report:{id:FOREST_NPCS.receiver,kind:'npc',label:'回营地向茜茜汇报',hint:'整轮巡逻已经完成，领取装备与补给员荣誉。'},
  done:{id:FOREST_NPCS.receiver,kind:'npc',label:'营地急件已完成',hint:'装备、英语线索与巡逻记录都保留在冒险中。'},
 };
 return {...common,...rows[phase]};
}
// One scene description drives world markers and physical props. No extra quest
// state is stored merely to decorate the scene.
export function forestCommissionScene(save){
 if(!forestCommissionAvailable(save))return null;
 const phase=forestCommissionPhase(save),goal=forestCommissionGoal(save);
 const giver={offer:'巡逻补给还没送到，来看看补给单。',boots:'照英语补给单拿物品，遇到生词可以查看提示。',delivery:'找到补给了？茜茜在等这双靴子。',done:'巡逻队平安回来了，多亏你的补给。'};
 const receiver={delivery:'补给到了！把委托袋拿给我看看。',note:'路线桌上留了一条英语线索，照着找找看。',briefing:'带上便签，我们一起确认巡逻分工。',patrol:'护好同伴，集中攻击；准备好了再出发。',report:'巡夜灯亮了！快来领巡逻队的回礼。',done:'营地补给员，欢迎回来。'};
 return {phase,goal,npcs:{[FOREST_NPCS.giver]:giver[phase]||'补给齐了，巡逻队就能出发。',[FOREST_NPCS.receiver]:receiver[phase]||'今晚的巡逻，需要补给与配合。'},sites:{
  [FOREST_SITES.boots]:{active:phase==='boots',boots:['offer','boots'].includes(phase),hat:true,bootsArt:GEAR[save.school]?.[2],hatArt:GEAR[save.school]?.[0],label:['offer','boots'].includes(phase)?'补给待领取':'巡逻靴已送出'},
  [FOREST_SITES.note]:{active:phase==='note',rock:true,label:['briefing','patrol','report'].includes(phase)?'路线便签已带走':phase==='done'?'巡逻路线已归还':'路线桌留有英语线索'},
 }};
}
export function forestCommissionRewards(save,content,step){
 const ids=GEAR[save.school]||[];
 return (step==='deliver'?[ids[2]]:[PATROL_CLOAK[save.school]]).filter(Boolean).map(id=>({id,item:content.items[id],owned:(save.inventory[id]||0)>0,coins:200}));
}
function nearby(save,access,id,kind){
 const target=access.forestTarget;
 check(save.zone==='camp'&&!save.pendingEncounter,'先结束战斗，回到营地再继续委托。');
 check(target?.id===id&&target.kind===kind&&Number.isFinite(target.x)&&Number.isFinite(target.y)&&Math.hypot(save.position.x-target.x,save.position.y-target.y)<=110,'靠近委托地点再进行这个操作。');
}
function grant(save,content,step){
 const rows=forestCommissionRewards(save,content,step);
 check(rows.length===1&&rows.every(row=>row.item?.kind===1),'委托装备尚未准备好，请稍后重试。');
 for(const row of rows){if(row.owned)save.inventory[100]=(save.inventory[100]||0)+row.coins;else save.inventory[row.id]=1;}
 return rows;
}
export function applyForestCommission(save,content,action,access={}){
 check(forestCommissionAvailable(save),'先和伙伴完成第一次冒险，再接营地委托。');
 const phase=forestCommissionPhase(save),s=forestCommission(save);
 if(action.step==='accept'){
  nearby(save,access,FOREST_NPCS.giver,'npc');
  if(s)return {changed:false,message:'委托已记下，按当前线索继续就好。'};
  save.forestCommission={version:1,phase:'boots'};
  return {message:'莫尼把英语补给单交给你：去帐篷旁读单选物，需要时可以查看中文提示。'};
 }
 check(s,'先找莫尼接取营地急件。');
 if(action.step==='take-boots'){
  nearby(save,access,FOREST_SITES.boots,'landmark');check(phase==='boots','这处补给已经取过了。');
  if(action.learning!==undefined){
   const {at,attempts}=action.learning||{};
   check(Number.isFinite(at)&&at>=0&&Number.isSafeInteger(attempts)&&attempts>=1&&attempts<=999,'选物练习记录无效');
   s.findAttempts=Math.min((s.findAttempts||0)+1,999);
  }
  if(action.object!=='boots')return {changed:action.learning!==undefined,message:action.object==='hat'?'这是 hat，帽子。补给单要的是 boots，靴子。帽子留在原处。':'先看清物品，再放入委托袋。'};
  if(action.learning!==undefined){
   const {at}=action.learning;
   // Accessible object labels, contextual clues and optional help support this
   // guided reading; it is never independent recall or speaking practice.
   s.practice={id:'forest:camp-patrol-supplies:boots:1',at,attempts:s.findAttempts,assisted:true};
  }
  delete s.findAttempts;
  s.phase='delivery';return {message:'巡逻靴已放入委托袋，带去交给茜茜。'};
 }
 if(action.step==='deliver'){
  nearby(save,access,FOREST_NPCS.receiver,'npc');check(phase==='delivery','委托袋里没有这次要送的巡逻靴。');
  const rewards=grant(save,content,'deliver');s.phase='note';
  return {message:'茜茜收下补给，把一双适合你学派的靴子交给你。到背包比较并穿戴，再去找路线便签。',rewards};
 }
 if(action.step==='take-note'){
  nearby(save,access,FOREST_SITES.note,'landmark');check(phase==='note','先完成当前的送达任务。');
  check(action.revealed===true,'先按线索挪开石头，看看后面。');s.phase='briefing';
  return {message:'找到路线便签了。Keep together：巡逻时要一起行动。拿给茜茜确认路线。'};
 }
 if(action.step==='brief'){
  nearby(save,access,FOREST_NPCS.receiver,'npc');check(phase==='briefing','先把路线便签带回来。');
  check(count(save)<999999,'巡逻实绩已达到当前记录上限，请保留便签，稍后再确认路线。');
  s.clearBaseline=count(save);s.phase='patrol';return {message:'路线已确认。先练习配合、穿好装备，再完整挑战晨雾中的巡夜灯；撤退后仍可重试。'};
 }
 if(action.step==='report'){
  nearby(save,access,FOREST_NPCS.receiver,'npc');check(phase==='report','先在接到巡逻安排后，完整完成一轮巡夜灯挑战。');
  const rewards=grant(save,content,'report');s.phase='done';
  return {message:'巡逻补给送到了，路线也验证了！获得本学派5级披风和荣誉「营地补给员」。已有的同件披风折算200奇豆。',rewards,completed:true};
 }
 throw Error('未知营地委托操作');
}
export function validateForestCommission(save){
 const s=save.forestCommission;if(s===undefined)return;
 check(s&&typeof s==='object'&&!Array.isArray(s)&&s.version===1&&PHASES.includes(s.phase),'营地委托记录无效');
 const late=['patrol','done'].includes(s.phase);
 check(late?Number.isSafeInteger(s.clearBaseline)&&s.clearBaseline>=0&&s.clearBaseline<=999999:s.clearBaseline===undefined,'营地委托巡逻记录无效');
 check(Object.keys(s).every(k=>['version','phase','clearBaseline','practice','findAttempts'].includes(k)),'营地委托记录包含未知字段');
 check(s.findAttempts===undefined||(s.phase==='boots'&&Number.isSafeInteger(s.findAttempts)&&s.findAttempts>=1&&s.findAttempts<=999),'营地委托尝试记录无效');
 if(s.practice!==undefined){
  const p=s.practice;
  check(s.phase!=='boots'&&p&&typeof p==='object'&&!Array.isArray(p)&&p.id==='forest:camp-patrol-supplies:boots:1'&&Number.isFinite(p.at)&&p.at>=0&&Number.isSafeInteger(p.attempts)&&p.attempts>=1&&p.attempts<=999&&p.assisted===true&&Object.keys(p).every(k=>['id','at','attempts','assisted'].includes(k)),'营地委托选物记录无效');
 }
 check(!late||count(save)>=s.clearBaseline,'营地委托与巡逻实绩不一致');
 check(s.phase!=='done'||count(save)>s.clearBaseline,'营地委托尚未完成巡逻');
}

// Place interaction points at actual camp structures, with a walkable approach.
export function forestCommissionSites(world,save,canStand){
 if(world.zone!=='camp'||!forestCommissionAvailable(save))return [];
 const pick=(frame,fallback)=>world.buildings.find(b=>b.frame===frame)||world.npcs.find(n=>n.id===fallback);
 const approach=anchor=>{
  if(!anchor)return null;
  for(const [dx,dy] of [[0,75],[-100,65],[100,65],[0,130],[-150,100],[150,100],[0,0]]){const p={x:anchor.x+dx,y:anchor.y+dy};if(canStand(p.x,p.y))return p;}
  return null;
 };
 return [
  {id:FOREST_SITES.boots,name:'补给帐篷',forestSite:'boots',anchor:pick('tent',FOREST_NPCS.giver)},
  {id:FOREST_SITES.note,name:'营地路线桌',forestSite:'note',anchor:pick('academy',FOREST_NPCS.receiver)},
 ].flatMap(({anchor,...site})=>{const p=approach(anchor);return p?[{...site,...p}]:[];});
}
