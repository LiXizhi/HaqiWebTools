import {openingJourney,OPENING_PET} from './opening_journey_core.js';

// Read the same pending party and story phase that settlement will use.
// A won battle alone must never imply that the companion journey is complete.
export function openingResultGuidance(save,battle){
 const state=openingJourney(save),pending=save.pendingEncounter;
 if(save.zone!=='camp'||!state||!pending||!battle.finished||battle.redMushroom||battle.tacticsField)return null;
 const fire=state.phase==='challenge'&&pending.encounterId==='fire-scout';
 const ice=state.phase==='showcase'&&pending.encounterId==='ice-scout';
 if(!fire&&!ice)return null;
 if(battle.winner!=='near')return {
  title:'这段旅程还在继续',
  body:fire?'返回营地后可以再次挑战，也可以找莫尼，换个办法帮助咕噜噜。':'返回营地后，先检查自己和伙伴的生命，再决定何时重试。',
  lesson:battle.monsterTemplates?.find(row=>row.openingLesson)?.openingLesson||'',
 };
 if(fire)return {title:'咕噜噜可以进入营地了',body:'收下奖励后，回去找莫尼，邀请咕噜噜成为搭档。',lesson:''};
 if(pending.party?.some(row=>row.speciesId===OPENING_PET))return {
  title:'第一次搭档挑战成功',body:'收下奖励后，你和咕噜噜就完成了这段搭档旅程。回到营地，看看新的冒险目标吧。',lesson:'',
 };
 return {title:'挑战赢了，搭档还没上场',body:'先安排咕噜噜加入队伍，再一起挑战寒冰侦查兵，完成搭档旅程。',lesson:''};
}
