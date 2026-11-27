// D-EMBER-01: one playable preparation loop, with a permanent free supply route.
import {HUNT_ID,EQUIPMENT_ESSENCE,huntParams} from './adventure_hunt_core.js';
import {FORGE_LANGUAGES,forgeLanguage,forgeTeaAnswer} from './forge_commission_language_core.js';
import {localDayKey} from './adventure_stamina_core.js';

export const FORGE_SITE='camp-ember-herb-bed';
const PHASES=['gather','cook','challenge','report','done'];
const check=(ok,message)=>{if(!ok)throw Error(message);};
export const forgeCommissionPhase=save=>save.forgeCommission?.phase||'offer';
export function forgeCommissionAvailable(save,content){
 const params=content.balanceParams?.hunt;
 return !!params&&save.level>=params.level&&(!save.openingJourney||save.openingJourney.phase==='done');
}
export function forgeGatherAvailable(save,now=Date.now()){
 const state=save.forgeCommission;
 return state?.phase==='gather'||(PHASES.includes(state?.phase)&&state.gatherDay<localDayKey(now));
}
function practiceTea(save,state,phase,action){
  check(['cook','challenge','report','done'].includes(phase),'先在草圃认出材料，再来写补给标签。');
  check(action.language===forgeLanguage(save),'学习语言已切换，请按当前语言重新写标签。');
  check(typeof action.answer==='string'&&action.answer.trim().length>0&&action.answer.length<=80,'请写一个简短的材料名称。');
  check(Number.isFinite(action.now)&&action.now>0,'练习时间无效，请重新打开委托。');
  const previous=state.teaPractice?.[action.language];
  if(previous?.completed)return {changed:false,message:'这个语言的茶标签已经写好了。可以继续冒险。'};
  const attempts=Math.min(999,(previous?.attempts||0)+1),completed=forgeTeaAnswer(action.language,action.answer);
  state.teaPractice??={};state.teaPractice[action.language]={attempts,completed};
  if(!completed)return {message:'这个标签还不太对。对照上面的线索再试试；也可以先继续委托。'};
  state.practice??=[];
  state.practice.push({id:`forge:tea:${action.language}`,language:action.language,at:action.now,attempts,assisted:true});
  return {message:'茶标签写好了！这次带提示的书写练习已记下，可以继续冒险。'};
}
export function forgeCommissionSites(world,save,walkable){
 if(world.zone!=='camp'||(save.openingJourney&&save.openingJourney.phase!=='done'))return [];
 const anchor=world.npcs.find(row=>row.id===36201)||world.layout.spawn;
 const candidates=[[-180,100],[180,100],[-220,170],[220,170],[0,220],[0,-220]];
 const point=candidates.map(([dx,dy])=>({x:anchor.x+dx,y:anchor.y+dy})).find(p=>walkable(p.x,p.y)&&world.landmarks.every(row=>Math.hypot(row.x-p.x,row.y-p.y)>95));
 return point?[{...point,id:FORGE_SITE,name:'露水草圃',label:'露水草圃',forgeSite:true,socialHub:false}]:[];
}
function nearby(save,access){
 const target=access.forgeTarget;
 check(save.zone==='camp'&&!save.pendingEncounter,'先结束战斗，回到营地草圃。');
 check(target?.id===FORGE_SITE&&target.kind==='landmark'&&target.forgeSite===true&&Number.isFinite(target.x)&&Number.isFinite(target.y)&&Math.hypot(save.position.x-target.x,save.position.y-target.y)<=110,'走到营地的露水草圃旁，再辨认和采集。');
}
export function applyForgeCommission(save,content,action,access={}){
 check(forgeCommissionAvailable(save,content),'完成新手冒险并达到8级后，可以接取修复委托。');
 check(!save.pendingEncounter,'请先完成当前战斗。');
 const phase=forgeCommissionPhase(save),p=huntParams(content).commission;
 if(action.step==='accept'){
  if(phase!=='offer')return {changed:false,message:'信件已经收好，按当前线索继续。'};
  save.forgeCommission={version:1,phase:'gather'};
  return {message:'收下修复信：先去营地露水草圃，认出配方里的草药。'};
 }
 const state=save.forgeCommission;
 if(action.step==='practice-tea')return practiceTea(save,state,phase,action);
 if(action.step==='gather'){
  nearby(save,access);
  check(action.language===forgeLanguage(save),'学习语言已切换，请按当前配方重新辨认。');
  check(Number.isFinite(action.now)&&action.now>0,'采集时间无效，请重新打开草圃。');
  check(forgeGatherAvailable(save,action.now),'今天的草药已经采过；明天还会长出新的。');
  if(action.choice!=='herb')return {changed:false,message:'这份材料不在轻露茶配方中。看看提示，再选一次。'};
  check((save.gatherPantry?.herb||0)+p.herbs<=9999,'食材袋已经装满草药，先做些料理吧。');
  save.gatherPantry??={};save.gatherPantry.herb=(save.gatherPantry.herb||0)+p.herbs;
  state.gatherDay=localDayKey(action.now);
  if(phase==='gather')state.phase='cook';
  return {message:`采到草药 ×${p.herbs}。${phase==='gather'?'去营火煮一份轻露茶，给挑战做准备。':'可以用来制作轻露茶。今天的采集已经记下。'}`};
 }
 if(action.step==='report'){
  check(phase==='report','先带着轻露茶的增益战胜余烬守卫，再寄出回信。');
  save.inventory[100]=(save.inventory[100]||0)+p.coins;
  save.inventory[EQUIPMENT_ESSENCE]=(save.inventory[EQUIPMENT_ESSENCE]||0)+p.essence;
  state.phase='done';
  return {message:`回信已寄出，备茶与接招的办法已经记下。获得${p.coins}奇豆、装备精华 ×${p.essence}。以后每天可来草圃免费采一次草药。`};
 }
 throw Error('修复委托操作无效。');
}
export function recordForgeCommissionCooking(save,recipeId){
 if(save.forgeCommission?.phase==='cook'&&recipeId==='herbal-dew-tea')save.forgeCommission.phase='challenge';
}
export function recordForgeCommissionVictory(save,pending){
 if(save.forgeCommission?.phase==='challenge'&&pending.encounterId===HUNT_ID&&pending.campfireBuff?.id==='herbal-dew-tea')save.forgeCommission.phase='report';
}
export function validateForgeCommission(save){
 const state=save.forgeCommission;if(state===undefined)return;
 check(state&&typeof state==='object'&&!Array.isArray(state)&&state.version===1&&PHASES.includes(state.phase),'修复委托进度无效');
 if(state.gatherDay!==undefined){
  const date=typeof state.gatherDay==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(state.gatherDay)?new Date(state.gatherDay+'T12:00:00Z'):null;
  check(date&&!Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===state.gatherDay,'草圃采集日期无效');
 }
 if(state.phase!=='gather')check(typeof state.gatherDay==='string','修复委托缺少采集记录');
 if(state.teaPractice!==undefined){
  check(state.teaPractice&&typeof state.teaPractice==='object'&&!Array.isArray(state.teaPractice),'茶标签记录无效');
  for(const [language,row] of Object.entries(state.teaPractice))check(FORGE_LANGUAGES.includes(language)&&row&&Object.keys(row).length===2&&Number.isSafeInteger(row.attempts)&&row.attempts>=1&&row.attempts<=999&&typeof row.completed==='boolean','茶标签练习无效');
 }
 if(state.practice!==undefined){
  check(Array.isArray(state.practice)&&state.practice.length<=FORGE_LANGUAGES.length,'茶标签待存记录无效');
  const languages=new Set();
  for(const event of state.practice){
   check(event&&Object.keys(event).length===5&&FORGE_LANGUAGES.includes(event.language)&&event.id===`forge:tea:${event.language}`&&!languages.has(event.language)&&Number.isFinite(event.at)&&event.at>0&&Number.isSafeInteger(event.attempts)&&event.attempts>=1&&event.attempts<=999&&event.assisted===true&&state.teaPractice?.[event.language]?.completed===true&&state.teaPractice[event.language].attempts===event.attempts,'茶标签待存记录无效');
   languages.add(event.language);
  }
 }
}
