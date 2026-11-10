import {addPet} from './adventure_pets_core.js';
import {ownedPetRecords} from './adventure_pet_files_core.js';

export const OPENING_PET='legacy_gululu';
const PHASES=['offer','guide','route','explain','challenge','rescue','showcase','done'];
const assert=(ok,message)=>{if(!ok)throw Error(message);};

export function openingJourney(save){
 const state=save.openingJourney;
 return state?.version===1&&PHASES.includes(state.phase)?state:null;
}
export function openingJourneyActive(save){
 const state=openingJourney(save);
 return !!state&&state.phase!=='done';
}
// Credit only events proved by the persisted opening state; never grant quest rewards here.
export function openingTrainingCredit(save,questId,goal){
 const state=openingJourney(save);if(!state)return 0;
 if(questId===63001&&goal.kind==='talk'&&goal.id===36201&&state.petId)return 1;
 if(questId===63002&&goal.kind==='defeat'&&goal.id===40250&&state.route==='battle'&&['rescue','showcase','done'].includes(state.phase))return 1;
 if(questId===63003&&goal.kind==='defeat'&&goal.id===40249&&state.phase==='done')return 1;
 return 0;
}
export function openingGuideAnchor(save,npc){
 if(save.zone!=='camp'||openingJourney(save)?.phase!=='guide'||!npc)return null;
 const dx=npc.x-save.position.x,dy=npc.y-save.position.y,distance=Math.hypot(dx,dy);
 return distance>180?{x:save.position.x+dx/distance*96,y:save.position.y+dy/distance*96}:null;
}
// Derived from persisted progress: opening a panel never earns a milestone.
export function openingJourneyMilestones(save){
 const state=openingJourney(save);
 if(!state)return [];
 const index=PHASES.indexOf(state.phase);
 return [
  {label:'帮咕噜噜进入营地',complete:index>=PHASES.indexOf('rescue')},
  {label:'邀请咕噜噜成为搭档',complete:!!state.petId},
  {label:'和搭档赢得一次挑战',complete:state.phase==='done'}
 ];
}
export function openingFriendAnswer(text){
 const normalized=String(text||'').toLowerCase().replace(/’/g,"'").replace(/[.,!?，。！？]/gu,'').replace(/\s+/g,' ').trim();
 const accepted=['we are friends',"we're friends",'yes we are friends',"yes we're friends"].includes(normalized);
 const message=!normalized?'先告诉莫尼：我们是朋友。可以听示范，再试着输入。':/\b(not|no|enemies)\b/.test(normalized)?'这句话没有表达“我们是朋友”。试试：We are friends.':/\bfriend\b/.test(normalized)?'这里说的是我们两个人，用复数 friends：We are friends.':"莫尼还没明白。试试 We are friends. 或 We're friends.";
 return {accepted,message:accepted?'莫尼明白了。咕噜噜可以进来了。':message};
}
export function openingJourneyScene(save,npc){
 const state=openingJourney(save);
 if(save.zone!=='camp'||!npc||!state||state.phase==='offer'||state.petId)return null;
 const free=state.phase==='rescue';
 return {x:npc.x+(free?-40:48),y:npc.y+28,free,label:free?'咕噜噜 · 想和你一起走':'咕噜噜 · 等你帮忙'};
}
export function openingCompanionEvent(save,battle,event){
 if(openingJourney(save)?.phase!=='showcase')return '';
 const unit=battle?.unitsById?.[event.caster];
 if(!unit||unit.speciesId!==OPENING_PET)return '';
 if(event.type==='cast')return '咕噜噜开始行动了！你的搭档会自己选择招式。';
 if(event.type==='damage'&&event.amount>0)return '咕噜噜帮你造成了 '+event.amount+' 点伤害。';
 if(event.type==='heal'&&event.amount>0)return '咕噜噜恢复了 '+event.amount+' 点生命。';
 if(event.type==='fizzle')return '咕噜噜这次施法失误了。下一回合再一起试试。';
 return '';
}
export function validateOpeningJourney(save){
 const state=save.openingJourney;
 if(state===undefined)return;
 assert(state&&state.version===1&&PHASES.includes(state.phase),'新手冒险记录无效');
 assert(state.route===undefined||['talk','battle'].includes(state.route),'新手冒险路线无效');
 assert(state.celebrated===undefined||typeof state.celebrated==='boolean','新手冒险完成记录无效');
 assert(state.petId===undefined||typeof state.petId==='string'&&state.petId.length<=200,'新手伙伴记录无效');
 if(state.practice){
  const event=state.practice;
  assert(typeof event.id==='string'&&event.id.length>0&&event.id.length<=100&&event.input==='text'&&event.language==='en'&&event.itemId==='opening-friend'&&Number.isFinite(event.at)&&event.at>=0,'新手语言记录无效');
 }
}
export function openingJourneyTarget(save){
 const state=openingJourney(save);
 if(!state||state.phase==='done')return null;
 const rows={
  offer:[36211,'和青龙说话，看看抱抱龙发现了什么。'],
  guide:[36201,'去找莫尼，问清那只小家伙在哪。'],
  route:[36201,'和莫尼商量，怎么帮咕噜噜解围。'],
  explain:[36201,'向莫尼说明：We are friends.'],
  challenge:['fire-scout','挑战烈火侦查兵，帮咕噜噜解围。'],
  rescue:[36201,'回到莫尼身边，接咕噜噜一起走。'],
  showcase:['ice-scout','带咕噜噜挑战寒冰侦查兵，试试新搭档。']
 };
 const [id,objective]=rows[state.phase];
 return {id,kind:typeof id==='number'?'npc':'encounter',objective};
}
export function applyOpeningJourney(save,content,action){
 const state=openingJourney(save);
 assert(state,'找不到这段冒险');
 assert(save.zone==='camp'&&!save.pendingEncounter,'先回到营地并结束当前战斗');
 if(action.step==='continue'){
  assert(state.phase==='done','先和新伙伴完成挑战');
  state.celebrated=true;
  return {changed:true,message:'咕噜噜会继续陪你冒险。去找青龙吧。'};
 }
 assert(state.phase!=='done','这段冒险已经结束');
 const expected={accept:36211,meet:36201,route:36201,explain:36201,rescue:36201}[action.step];
 if(expected){
  const point=content.worldMaps?.camp?.npcPositions?.[expected];
  assert(point&&Math.hypot(save.position.x-point[0],save.position.y-point[1])<=200,'走到这位居民身边再继续');
 }
 switch(action.step){
 case 'accept':assert(state.phase==='offer','先完成当前步骤');state.phase='guide';break;
 case 'meet':assert(state.phase==='guide','先完成当前步骤');state.phase='route';break;
 case 'route':
  assert(['guide','route','explain','challenge'].includes(state.phase),'先完成当前步骤');
  assert(['talk','battle'].includes(action.route),'请选择一个办法');
  state.route=action.route;state.phase=action.route==='talk'?'explain':'challenge';break;
 case 'explain':{
  assert(state.phase==='explain','先和莫尼商量办法');
  const text=String(action.text||'').trim();
  const answer=openingFriendAnswer(text);
  assert(answer.accepted,answer.message);
  assert(typeof action.receipt==='string'&&action.receipt.length<=100,'练习记录无效');
  assert(Number.isFinite(action.at)&&action.at>=0,'练习时间无效');
  // Choosing a supplied reply advances the story, but is not evidence of typed/spoken recall.
  if(!action.choice)state.practice={id:action.receipt,input:'text',itemId:'opening-friend',language:'en',at:action.at};
  state.phase='rescue';break;
 }
 case 'rescue':{
  assert(state.phase==='rescue','先帮咕噜噜解围');
  const owned=Object.values(ownedPetRecords(save)).find(p=>p.speciesId===OPENING_PET);
  if(owned)assert(save.pets[save.petInstanceVersion===1?owned.id:OPENING_PET],'先在宠物背包中查看咕噜噜，再回来接它');
  const pet=owned||addPet(save,content,OPENING_PET);
  state.petId=save.petInstanceVersion===1?pet.id:OPENING_PET;
  state.phase='showcase';
  if(action.join)joinOpeningPet(save,state);
  break;
 }
 case 'join':assert(state.phase==='showcase','先接到咕噜噜');joinOpeningPet(save,state);break;
 default:throw Error('未知冒险步骤');
 }
 return {changed:true,message:state.phase==='showcase'?'咕噜噜已经加入你的伙伴。':'继续和抱抱龙一起出发吧。'};
}
function joinOpeningPet(save,state){
 assert(save.pets[state.petId],'先打开宠物背包查看咕噜噜');
 if(save.formation.includes(state.petId))return;
 const slot=save.formation.findIndex((id,index)=>id===null&&index!==save.heroSlot);
 assert(slot>=0,'队伍满了，请在宠物面板留出一个位置');
 save.formation[slot]=state.petId;
}
export function openingJourneyWon(save,pending){
 const state=openingJourney(save);
 if(save.zone!=='camp'||!state)return;
 if(state.phase==='challenge'&&pending.encounterId==='fire-scout')state.phase='rescue';
 if(state.phase==='showcase'&&pending.encounterId==='ice-scout'&&pending.party?.some(p=>p.speciesId===OPENING_PET)){
  state.phase='done';
 }
}
