// Optional scene interlude after the first partnership battle. Quest credit,
// language mastery and combat formulas are deliberately independent of it.
export const CAMP_DETOUR_RUNE=23439;
export const CAMP_DETOUR_STOPS=['mushroom','bells','crystal'];
const check=(ok,message)=>{if(!ok)throw Error(message);};
export function campDetour(save){return save.openingJourney?.detour||null;}
export function campDetourAvailable(save){return save.zone==='camp'&&save.openingJourney?.phase==='done';}
export function campDetourGoal(save){
 const s=campDetour(save);if(!campDetourAvailable(save)||!s||s.paused||s.step>=3)return null;
 return {id:CAMP_DETOUR_STOPS[s.step],kind:'camp-toy',text:[
  '抱抱龙听到了歌声，去碰一碰发光蘑菇。',
  '风铃接住了歌声，去轻轻碰一下。',
  `声音藏在晶簇里，再敲 ${3-s.crystals} 下。`
 ][s.step]};
}
export function applyCampDetour(save,content,action,{campToy}={}){
 check(campDetourAvailable(save)&&!save.pendingEncounter,'先和伙伴结束挑战，回营地再玩。');
 let s=campDetour(save);
 if(action.step==='start'){
  if(!s)save.openingJourney.detour=s={step:0,crystals:0,paused:false};
  s.paused=false;return {message:s.step===3?'这段声音已经记住了。':'跟着抱抱龙，找找歌声从哪里来。'};
 }
 check(s,'先和抱抱龙约好去听歌。');
 if(action.step==='pause'){s.paused=true;return {message:'先去忙别的，想回来就找抱抱龙。'};}
 check(action.step==='touch','未知探索动作');
 const goal=campDetourGoal(save);
 if(!goal||action.id!==goal.id)return {changed:false};
 check(campToy?.id===goal.id&&Number.isFinite(campToy.x)&&Number.isFinite(campToy.y)&&Math.hypot(save.position.x-campToy.x,save.position.y-campToy.y)<=100,'靠近那个发光的小东西再试试。');
 if(s.step===2){
  if(s.crystals===2)check(content.items[CAMP_DETOUR_RUNE],'抓宠符文尚未准备好，请稍后再试。');
  s.crystals++;
  if(s.crystals<3)return {message:`里面有东西，再敲 ${3-s.crystals} 下！`};

  save.inventory[CAMP_DETOUR_RUNE]=(save.inventory[CAMP_DETOUR_RUNE]||0)+1;
 }
 s.step++;
 return {message:[null,'歌声往风铃那边去了！','晶簇也亮了，里面藏着什么？','找到抓宠符文了！野外遇到喜欢的伙伴，可以试着抓住它。'][s.step],completed:s.step===3};
}
export function validateCampDetour(save){
 const s=campDetour(save);if(s===null)return;
 check(s&&Number.isInteger(s.step)&&s.step>=0&&s.step<=3&&Number.isInteger(s.crystals)&&s.crystals>=0&&s.crystals<=3&&typeof s.paused==='boolean','营地探索记录无效');
 check(s.step<2?s.crystals===0:s.step===2?s.crystals<3:s.crystals===3,'营地探索步骤不一致');
}
