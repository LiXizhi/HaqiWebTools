import {defaultParams} from './combat_params_core.js';
export const OPENING_TRAINING_IDS=['fire-scout','ice-scout','storm-scout'];
// Web-only training arrangement, using unchanged kids cards and engine formulas.
// A version on the battle checkpoint keeps existing battles on their old rules.
export function openingTrainingMonsters(templates,checkpoint){
 if(checkpoint.openingTrainingVersion!==1)return templates;
 const settings=defaultParams('kids').adventure;
 const spec={
  'fire-scout':{hp:settings.openingFireHp,attack:'Fire_SingleAttack_Level0_45',lesson:'先选一张牌，再选目标。训练员只用小招陪你练习。'},
  'ice-scout':{hp:settings.openingIceHp,attack:'Ice_SingleAttack_Level0_45',lesson:'对手先开护盾。小招可以消耗护盾，让伙伴的下一击更有效。'},
  'storm-scout':{hp:settings.openingStormHp,attack:'Storm_SingleAttack_Level0_45',lesson:'第2回合蓄力，第3回合重击。你可以抢先攻击，也可以准备恢复生命。'}
 }[checkpoint.encounterId];
 if(!spec)return templates;
 const entry=(round,card,speak)=>({round:String(round),card,speak,accuracy_boost:'1000',target_hostile:'threat_highest',target_friendly:'self'});
 return templates.map(m=>{
  const rows=[];
  if(checkpoint.encounterId==='ice-scout')rows.push(entry('1-','Ice_GlobalShield','我先开护盾！第一击会被挡住一部分。'));
  for(let round=1;round<=12;round++){
   const charge=checkpoint.encounterId==='storm-scout'&&round%3===2;
   const heavy=checkpoint.encounterId==='storm-scout'&&round%3===0;
   rows.push(entry(round,charge?'Storm_StormDamageBlade':heavy?'Storm_SingleAttack_Level2':spec.attack,charge?'我在蓄力，下回合要出重招了！':heavy?'接招！':'轮到你了！'));
  }
  return {...m,hp:spec.hp,attributes:{...m.attributes,hp:spec.hp},genes:[],sequences:[rows],pool:[{key:spec.attack,weight:1}],openingLesson:spec.lesson};
 });
}
export function openingEnemyIntent(battle){
 const m=battle.monsterTemplates?.find(m=>m.openingLesson);if(!m)return null;
 if(m.id==='ice-scout'&&battle.turn===1)return '对手开护盾，用小招破盾。';
 if(m.id==='storm-scout')return battle.turn%3===2?'对手蓄力不攻击，下回合重击！':battle.turn%3===0?'重击来了！留意生命，必要时治疗。':'下回合对手会蓄力。';
 return m.openingLesson;
}
