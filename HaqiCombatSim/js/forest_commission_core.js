import {forestCommissionLesson,forestLabelMatches,forestLabelWritten,forestPracticeId,forestPracticeLanguage,FOREST_LEARNING_LANGUAGES} from './forest_commission_language_core.js';
import {forestExchangeMatches,forestExchangeId} from './forest_exchange_core.js';
import {applyForestMystery,forestMysteryGoal,validateForestMystery} from './forest_mystery_core.js';
import {applyForestPromise,forestPromiseGoal} from './forest_promise_core.js';
// A carried-object commission. The selected language changes scene decisions;
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
export function forestCommissionPhase(save){const s=forestCommission(save);return s?.phase==='done'&&s.mystery?.status==='active'?'investigation':s?.phase==='done'&&s.mystery?.promise?.status==='active'?'promise':s?.phase==='patrol'&&count(save)>s.clearBaseline?'report':s?.phase||'offer';}
export function forestCommissionPouch(save){
 const phase=forestCommissionPhase(save);
 if(phase==='delivery')return [{id:'patrol-boots',name:'待送达的巡逻靴',description:'从帐篷旁找到的营地补给。交给茜茜，不可出售或穿戴。',artItem:GEAR[save.school]?.[2]}];
 if(['briefing','patrol','report'].includes(phase))return [{id:'patrol-note',name:'巡逻路线便签',description:save.forestCommission?.exchangeCompleted?.includes('note')?'便签由茜茜保管，你们可以一起查看路线和巡夜灯的位置。':forestCommissionLesson(save).clues.briefing+' 茜茜标出了巡夜灯的位置；任务结束后归还。'}];
 return [];
}
export function forestCommissionGoal(save){
 const phase=forestCommissionPhase(save),lesson=forestCommissionLesson(save),common={phase,zone:'camp'};
 if(phase==='investigation')return {...common,...forestMysteryGoal(save)};
 if(phase==='promise')return {...common,...forestPromiseGoal(save)};
 const rows={
  offer:{id:FOREST_NPCS.giver,kind:'npc',label:'找莫尼接取营地急件',hint:`巡夜灯忽然熄灭，茜茜出发前还缺一份补给。${lesson.name}补给单上留着线索。`},
  boots:{id:FOREST_SITES.boots,kind:'landmark',label:`到补给帐篷按${lesson.name}补给单选物`,hint:lesson.clues.boots},
  delivery:{id:FOREST_NPCS.receiver,kind:'npc',label:'把巡逻靴交给茜茜',hint:'靴子已经放进旅行背包的委托袋。'},
  note:{id:FOREST_SITES.note,kind:'landmark',label:'到营地路线桌寻找便签',hint:lesson.clues.note},
  briefing:{id:FOREST_NPCS.receiver,kind:'npc',label:save.forestCommission?.exchangeCompleted?.includes('note')?'和茜茜确认巡逻路线':'把路线便签拿给茜茜',hint:'先听巡逻分工，再去实战。'},
  patrol:{id:FOREST_PATROL_DUNGEON,kind:'landmark',label:'完整挑战晨雾中的巡夜灯',hint:'5级精英副本；先准备卡组、穿戴装备。可随时回来继续。'},
  report:{id:FOREST_NPCS.receiver,kind:'npc',label:'回营地向茜茜汇报',hint:'整轮巡逻已经完成，领取装备与补给员荣誉。'},
  done:save.forestCommission?.mystery?.status==='solved'?{id:FOREST_NPCS.receiver,kind:'npc',label:'营地急件已完成',hint:'装备、语言线索与巡逻记录都保留在冒险中。'}:{id:FOREST_NPCS.receiver,kind:'npc',label:'和茜茜查看草屑与脚印',hint:'巡逻已经结束，补给的经过还没查清。回营地和茜茜一起看看。'},
 };
 return {...common,...rows[phase]};
}
// One scene description drives world markers and physical props; companion
// wording also reflects the player's saved proposal.
export function forestCommissionScene(save){
 if(!forestCommissionAvailable(save))return null;
 const phase=forestCommissionPhase(save),goal=forestCommissionGoal(save);
 const giver={offer:'巡夜灯灭了一次，巡逻补给还没送到。来看看补给单。',boots:'靴底怎么有发亮的草屑？照补给单拿物品，帽子先留给守帐篷的人。',delivery:'找到补给了？茜茜在等这双靴子。',done:'巡逻队平安回来了，多亏你的补给。下次留心那片发亮的草。'};
 const receiver={delivery:'补给到了！你愿意和我一起去吗？先把委托袋拿给我看看。',note:'风把分工便签吹跑了。路线桌有一角纸，能帮我找找吗？',briefing:'带上便签，我们一起确认巡逻分工。这次别把同伴留在后面。',patrol:save.forestCommission?.plan==='tracks'?'我记着你说的脚印。先护好同伴、守亮灯，再找线索。':'护好同伴，集中攻击；有人走慢了，另一个就等一下。',report:'巡夜灯亮了！你也平安回来了，快来收下巡逻队的回礼。',done:'营地补给员，欢迎回来。下次巡逻，我会先叫上你。'};
 const scene={phase,goal,npcs:{[FOREST_NPCS.giver]:giver[phase]||'补给齐了，巡逻队就能出发。',[FOREST_NPCS.receiver]:receiver[phase]||'这次巡逻，需要补给与配合。'},sites:{
  [FOREST_SITES.boots]:{active:phase==='boots',boots:['offer','boots'].includes(phase),hat:true,bootsArt:GEAR[save.school]?.[2],hatArt:GEAR[save.school]?.[0],label:['offer','boots'].includes(phase)?'补给待领取':'巡逻靴已送出'},
  [FOREST_SITES.note]:{active:phase==='note',rock:true,label:['briefing','patrol','report'].includes(phase)?'路线便签已带走':phase==='done'?'巡逻路线已归还':'路线桌留有语言线索'},
 }};
 if(phase==='investigation'){
  scene.npcs[FOREST_NPCS.giver]='草屑和湿补给单？拿来给我看看，我知道它们是怎么回事。';
  scene.npcs[FOREST_NPCS.receiver]='我在这里等你。找到物证后，我们一起把经过理清楚。';
  if(scene.sites[goal.id]){scene.sites[goal.id].active=true;scene.sites[goal.id].label=goal.id===FOREST_SITES.boots?'调查补给帐篷':'调查巡夜灯与脚印';}
 }
 if(save.forestCommission?.mystery?.status==='solved'){
  const sign=save.forestCommission.mystery.ending==='sign';
  scene.sites[FOREST_SITES.boots].label=sign?'补给便签：挪动后留位置':'结伴送补给，交付说一声';
  scene.npcs[FOREST_NPCS.giver]=sign?'补给换了位置，我会写在便签上。这次一定记得。':'下次送补给，我和茜茜一起去。送到后当面说一声。';
  scene.npcs[FOREST_NPCS.receiver]='原来是莫尼把靴子捡回来了。谢谢你先找物证，没有急着责怪谁。';
 }
 if(phase==='done'&&save.sparkRescue?.status==='safe'){
  scene.npcs[FOREST_NPCS.receiver]=save.sparkRescue.promise==='signal'?'守护者捎话来了：火种回到课堂了。它还记得你教的灯光信号，路上一直有人回应。':'守护者捎话来了：火种回到课堂了。这回他们等齐才走，谁也没有掉队。';
 }
 if(phase==='promise'){
  if(scene.sites[goal.id]){scene.sites[goal.id].active=true;scene.sites[goal.id].label=goal.label;}
  scene.npcs[FOREST_NPCS.giver]=save.forestCommission.mystery.promise.stage==='confirm'?'消息写清或说清了吗？让我也来回应你。':'准备出发前，先问问彼此。你来得正好。';
  scene.npcs[FOREST_NPCS.receiver]='这次不赶时间。问清、等齐，比谁先出发更重要。';
 }
 if(save.forestCommission?.mystery?.promise?.status==='done'){
  const sign=save.forestCommission.mystery.ending==='sign';
  scene.sites[FOREST_SITES.boots].label=sign?'位置便签：备用灯芯在补给帐篷里':'同行约定：先问清，再等齐';
  scene.npcs[FOREST_NPCS.giver]=sign?'我照着便签找到了备用灯芯。这次不用满营地猜了。':'这次我会等到大家都回应，再一起出发。';
 }
 return scene;
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
  return {message:`莫尼把${forestCommissionLesson(save).name}补给单交给你：去帐篷旁读单选物，需要时可以查看提示。`};
 }
 check(s,'先找莫尼接取营地急件。');
 if(typeof action.step==='string'&&action.step.startsWith('mystery-'))return applyForestMystery(save,action,(id,kind)=>nearby(save,access,id,kind));
 if(typeof action.step==='string'&&action.step.startsWith('promise-'))return applyForestPromise(save,action,(id,kind)=>nearby(save,access,id,kind));
 if(action.step==='plan'){
  nearby(save,access,FOREST_NPCS.receiver,'npc');check(phase==='briefing','拿回便签后，再和茜茜商量。');
  check(['light','tracks'].includes(action.plan),'先选一个巡逻提议。');
  if(s.plan===action.plan)return {changed:false,message:'茜茜记得你的提议，准备好了就出发。'};
  s.plan=action.plan;
  return {message:action.plan==='light'?'茜茜点头：先保住灯光，一起前进，遇敌集中攻击。':'茜茜蹲下看了看脚印：我也想知道是谁。先一起守住灯，等路亮了，再找脚印的主人。'};
 }
 if(action.step==='exchange'){
  const {word,language,input}=action,{at,attempts,assisted}=action.learning||{};
  check((word==='boots'&&phase==='delivery')||(word==='note'&&phase==='briefing'&&!s.exchangeCompleted?.includes('note')),'物品已经交付，或还没有找到。');
  nearby(save,access,FOREST_NPCS.receiver,'npc');
  check(FOREST_LEARNING_LANGUAGES.includes(language)&&save.languageLearning?.target===language,'目标语言已改变，请用当前语言重新交流。');
  check(['text','speech'].includes(input)&&Number.isFinite(at)&&at>=0&&Number.isSafeInteger(attempts)&&attempts>=1&&attempts<=999&&typeof assisted==='boolean','交流记录无效，请重新试试。');
  check(forestExchangeMatches(save,word,action.text),'茜茜还没听明白。试试提示中的短句，也可以直接递交物品。');
  const result=word==='boots'?applyForestCommission(save,content,{step:'deliver'},access):{message:'茜茜听懂了，接过便签。现在可以一起确认路线和巡逻分工。'};
  if(word==='note')s.exchangeCompleted=['note'];
  (s.exchangePractice||=[]).push({id:forestExchangeId(word,language),word,language,input,at,attempts,assisted});
  return word==='note'?result:{...result,message:`茜茜听懂了，接过靴子。${result.message}`};
 }
 if(action.step==='label'){
  const word=action.word;
  check(['boots','note'].includes(word),'这件物品不需要写标签。');
  check(word==='boots'?phase==='delivery':phase==='briefing','先把对应物品放进委托袋。');
  nearby(save,access,FOREST_NPCS.receiver,'npc');
  if(forestLabelWritten(save,word))return {changed:false,message:'这个标签已经写好了，直接递交物品就行。'};
  check(forestLabelMatches(save,word,action.text),'标签还没写对，可以看看提示，再试一次。');
  const {at,attempts,assisted}=action.learning||{};
  check(Number.isFinite(at)&&at>=0&&Number.isSafeInteger(attempts)&&attempts>=1&&attempts<=999&&typeof assisted==='boolean','标签练习记录无效');
  const {language,name}=forestCommissionLesson(save);
  if(language==='en')s.labels=[...(s.labels||[]),word];
  else{const labels=s.localizedLabels??={};labels[language]=[...(labels[language]||[]),word];}
  (s.labelPractice??=[]).push({id:forestPracticeId(word,language,true),word,at,attempts,assisted,...(language==='en'?{}:{language})});
  return {message:`${name}标签写好了！现在把物品递给茜茜。`};
 }
 if(action.step==='take-boots'){
  nearby(save,access,FOREST_SITES.boots,'landmark');check(phase==='boots','这处补给已经取过了。');
  if(action.learning!==undefined){
   const {at,attempts}=action.learning||{};
   check(Number.isFinite(at)&&at>=0&&Number.isSafeInteger(attempts)&&attempts>=1&&attempts<=999,'选物练习记录无效');
   s.findAttempts=Math.min((s.findAttempts||0)+1,999);
  }
  const {language,words}=forestCommissionLesson(save);
  if(action.object!=='boots')return {changed:action.learning!==undefined,message:action.object==='hat'?`这是 ${words.hat}，帽子。补给单要的是 ${words.boots}，靴子。帽子留在原处。`:'先看清物品，再放入委托袋。'};
  if(action.learning!==undefined){
   const {at}=action.learning;
   // Accessible object labels, contextual clues and optional help support this
   // guided reading; it is never independent recall or speaking practice.
   s.practice={id:forestPracticeId('boots',language),at,attempts:s.findAttempts,assisted:true,...(language==='en'?{}:{language})};
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
  check(action.revealed===true,'先按线索挪开石头，看看后面。');
  if(action.learning!==undefined){
   const {at,attempts}=action.learning||{};
   check(Number.isFinite(at)&&at>=0&&Number.isSafeInteger(attempts)&&attempts>=1&&attempts<=999,'路线线索练习记录无效');
   const {language}=forestCommissionLesson(save);
   s.notePractice={id:forestPracticeId('note',language),at,attempts,assisted:true,...(language==='en'?{}:{language})};
  }
  s.phase='briefing';
  return {message:`找到路线便签了。${forestCommissionLesson(save).clues.briefing} 拿给茜茜确认路线。`};
 }
 if(action.step==='brief'){
  nearby(save,access,FOREST_NPCS.receiver,'npc');check(phase==='briefing','先把路线便签带回来。');
  check(action.tactic==='focus','先按路线便签选择巡逻时的攻击方式。');
  check(action.recalled==='boots','先认出刚才交付的补给。');
  const {at,attempts,assisted}=action.learning||{};
  check(Number.isFinite(at)&&at>=0&&Number.isSafeInteger(attempts)&&attempts>=1&&attempts<=999&&typeof assisted==='boolean','巡逻分工练习记录无效');
  check(count(save)<999999,'巡逻实绩已达到当前记录上限，请保留便签，稍后再确认路线。');
  s.briefingPractice={language:forestCommissionLesson(save).language,at,attempts,assisted};
  s.clearBaseline=count(save);s.phase='patrol';return {message:save.level<5?'路线已确认，便签和巡逻准备会保留。先沿当前主线完成任务、提升到5级，再回来和茜茜出发；练习配合本身不提供升级经验。':'路线已确认：巡逻时集中攻击同一个敌人。先练习配合、穿好装备，再完整挑战晨雾中的巡夜灯；撤退后仍可重试。'};
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
 check(Object.keys(s).every(k=>['version','phase','clearBaseline','practice','notePractice','briefingPractice','findAttempts','labels','localizedLabels','labelPractice','exchangePractice','exchangeCompleted','plan','mystery'].includes(k)),'营地委托记录包含未知字段');
 validateForestMystery(save);
 check(s.plan===undefined||(['briefing','patrol','done'].includes(s.phase)&&['light','tracks'].includes(s.plan)),'营地巡逻提议无效');
 if(s.exchangeCompleted!==undefined)check(Array.isArray(s.exchangeCompleted)&&(s.exchangeCompleted.length===0||(s.exchangeCompleted.length===1&&s.exchangeCompleted[0]==='note'))&&(s.exchangeCompleted.length===0||['briefing','patrol','done'].includes(s.phase)),'营地交流完成记录无效');
 if(s.exchangePractice!==undefined)check(Array.isArray(s.exchangePractice)&&s.exchangePractice.length<=2&&new Set(s.exchangePractice.map(p=>p?.word)).size===s.exchangePractice.length&&Array.from(s.exchangePractice).every(p=>p&&FOREST_LEARNING_LANGUAGES.includes(p.language)&&((p.word==='boots'&&['note','briefing','patrol','done'].includes(s.phase))||(p.word==='note'&&['briefing','patrol','done'].includes(s.phase)&&s.exchangeCompleted?.includes('note')))&&p.id===forestExchangeId(p.word,p.language)&&['text','speech'].includes(p.input)&&Number.isFinite(p.at)&&p.at>=0&&Number.isSafeInteger(p.attempts)&&p.attempts>=1&&p.attempts<=999&&typeof p.assisted==='boolean'&&Object.keys(p).every(k=>['id','word','language','input','at','attempts','assisted'].includes(k))),'营地交流练习记录无效');
 const labelAllowed=word=>word==='boots'?['delivery','note','briefing','patrol','done'].includes(s.phase):word==='note'&&['briefing','patrol','done'].includes(s.phase);
 if(s.labels!==undefined)check(Array.isArray(s.labels)&&s.labels.length<=2&&new Set(s.labels).size===s.labels.length&&s.labels.every(labelAllowed),'营地物品标签无效');
 if(s.localizedLabels!==undefined)check(s.localizedLabels&&typeof s.localizedLabels==='object'&&!Array.isArray(s.localizedLabels)&&Object.entries(s.localizedLabels).every(([language,labels])=>language!=='en'&&FOREST_LEARNING_LANGUAGES.includes(language)&&Array.isArray(labels)&&labels.length<=2&&new Set(labels).size===labels.length&&labels.every(labelAllowed)),'营地多语言标签无效');
 if(s.labelPractice!==undefined)check(Array.isArray(s.labelPractice)&&s.labelPractice.length<=8&&new Set(s.labelPractice.map(p=>p?.id)).size===s.labelPractice.length&&s.labelPractice.every(p=>p&&FOREST_LEARNING_LANGUAGES.includes(forestPracticeLanguage(p))&&(forestPracticeLanguage(p)==='en'?s.labels:s.localizedLabels?.[p.language])?.includes(p.word)&&p.id===forestPracticeId(p.word,forestPracticeLanguage(p),true)&&Number.isFinite(p.at)&&p.at>=0&&Number.isSafeInteger(p.attempts)&&p.attempts>=1&&p.attempts<=999&&typeof p.assisted==='boolean'&&Object.keys(p).every(k=>['id','word','at','attempts','assisted','language'].includes(k))),'营地标签练习记录无效');
 check(s.findAttempts===undefined||(s.phase==='boots'&&Number.isSafeInteger(s.findAttempts)&&s.findAttempts>=1&&s.findAttempts<=999),'营地委托尝试记录无效');
 if(s.practice!==undefined){
  const p=s.practice;
  check(s.phase!=='boots'&&p&&typeof p==='object'&&!Array.isArray(p)&&FOREST_LEARNING_LANGUAGES.includes(forestPracticeLanguage(p))&&p.id===forestPracticeId('boots',forestPracticeLanguage(p))&&Number.isFinite(p.at)&&p.at>=0&&Number.isSafeInteger(p.attempts)&&p.attempts>=1&&p.attempts<=999&&p.assisted===true&&Object.keys(p).every(k=>['id','at','attempts','assisted','language'].includes(k)),'营地委托选物记录无效');
 }
 if(s.notePractice!==undefined){
  const p=s.notePractice;
  check(['briefing','patrol','done'].includes(s.phase)&&p&&typeof p==='object'&&!Array.isArray(p)&&FOREST_LEARNING_LANGUAGES.includes(forestPracticeLanguage(p))&&p.id===forestPracticeId('note',forestPracticeLanguage(p))&&Number.isFinite(p.at)&&p.at>=0&&Number.isSafeInteger(p.attempts)&&p.attempts>=1&&p.attempts<=999&&p.assisted===true&&Object.keys(p).every(k=>['id','at','attempts','assisted','language'].includes(k)),'营地路线线索练习记录无效');
 }
 if(s.briefingPractice!==undefined){
  const p=s.briefingPractice;
  check(late&&p&&typeof p==='object'&&!Array.isArray(p)&&FOREST_LEARNING_LANGUAGES.includes(p.language)&&Number.isFinite(p.at)&&p.at>=0&&Number.isSafeInteger(p.attempts)&&p.attempts>=1&&p.attempts<=999&&typeof p.assisted==='boolean'&&Object.keys(p).every(k=>['language','at','attempts','assisted'].includes(k)),'巡逻分工练习记录无效');
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
