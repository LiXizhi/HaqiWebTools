import {defaultParams} from './combat_params_core.js';
export const OPENING_TRAINING_IDS=['fire-scout','ice-scout','storm-scout','life-scout'];
// Web-only training arrangement, using unchanged kids cards and engine formulas.
// A version on the battle checkpoint keeps existing battles on their old rules.
export function openingTrainingMonsters(templates,checkpoint){
 if(![1,2,3].includes(checkpoint.openingTrainingVersion))return templates;
 const settings=defaultParams('kids').adventure;
 const v3=checkpoint.openingTrainingVersion===3,paired=(checkpoint.party?.filter(unit=>unit.hp>0).length||0)>1;
 const spec={
  'fire-scout':{hp:v3?(paired?settings.openingFirePartyHpV3:settings.openingFireSoloHpV3):settings.openingFireHp,attack:'Fire_SingleAttack_Level0_45',lesson:v3?'它先增强下一击。趁这回合准备，再接它的攻击。':'先选一张牌，再选目标。训练员只用小招陪你练习。'},
  'ice-scout':{hp:settings.openingIceHp,attack:'Ice_SingleAttack_Level0_45',lesson:'对手先开护盾。小招可以消耗护盾，让伙伴的下一击更有效。'},
  'storm-scout':{hp:v3&&paired?settings.openingStormPartyHpV3:checkpoint.openingTrainingVersion===2&&paired?settings.openingStormPartyHpV2:settings.openingStormHp,attack:'Storm_SingleAttack_Level0_45',lesson:'第2回合蓄力，第3回合重击。你可以抢先攻击，也可以准备恢复生命。'},
  'life-scout':v3?{hp:paired?settings.openingLifePartyHpV3:settings.openingLifeSoloHpV3,attack:'Life_SingleAttack_Level0_45',lesson:'第3回合恢复一次生命，之后加强攻击。提前准备增益，抓住恢复时的空当。'}:null
 }[checkpoint.encounterId];
 if(!spec)return templates;
 const entry=(round,card,speak)=>({round:String(round),card,speak,accuracy_boost:'1000',target_hostile:'threat_highest',target_friendly:'self'});
 return templates.map(m=>{
  const rows=[];
  if(checkpoint.encounterId==='ice-scout')rows.push(entry('1-','Ice_GlobalShield','我先开护盾！第一击会被挡住一部分。'));
  for(let round=1;round<=12;round++){
   const charge=checkpoint.encounterId==='storm-scout'&&round%3===2;
   const heavy=checkpoint.encounterId==='storm-scout'&&round%3===0;
   if(v3&&checkpoint.encounterId==='fire-scout'){rows.push(entry(round,round===1?'Fire_FireDamageBlade':spec.attack,round===1?'我先增强下一击。':'接招！'));continue;}
   if(v3&&checkpoint.encounterId==='life-scout'){rows.push(entry(round,round===3?'Life_SingleHeal_Level0':round>=4?'Life_SingleAttack_Level1':spec.attack,round===2?'下一回合，我要恢复生命。':round===3?'恢复一下，继续！':'接招！'));continue;}
   rows.push(entry(round,charge?'Storm_StormDamageBlade':heavy?'Storm_SingleAttack_Level2':spec.attack,charge?'我在蓄力，下回合要出重招了！':heavy?'接招！':'轮到你了！'));
  }
  return {...m,hp:spec.hp,attributes:{...m.attributes,hp:spec.hp},genes:[],sequences:[rows],pool:[{key:spec.attack,weight:1}],openingLesson:spec.lesson,openingTrainingVersion:checkpoint.openingTrainingVersion};
 });
}
// Only scripted beginner opponents expose an intent. Never guess arbitrary AI moves.
export function openingEnemyIntentInfo(battle){
 const m=battle.monsterTemplates?.find(m=>m.openingLesson);if(!m||battle.finished)return null;
 if(m.openingTrainingVersion===3&&m.id==='fire-scout'&&battle.turn===1)return {kind:'charge',label:'增强下一击 · 本回合不攻击',detail:'你可以准备增益，也可以先出手。下一回合要留意它的攻击。'};
 if(m.openingTrainingVersion===3&&m.id==='life-scout'&&battle.turn<=12){
  if(battle.turn===3)return {kind:'heal',label:'恢复生命 · 本回合不攻击',detail:'它只在这一回合恢复一次。可以准备下一招，也可以继续攻击。'};
  if(battle.turn===2)return {kind:'attack',label:'攻击 · 下回合恢复',detail:'留意它的恢复时机。你可以准备增益，让下一击更有效。'};
  if(battle.turn>=4)return {kind:'heavy',label:'加强攻击',detail:'恢复已经用过。留意自己和伙伴的生命。'};
 }
 if(m.id==='ice-scout'&&battle.turn===1)return {kind:'guard',label:'先开护盾，再攻击',detail:'护盾会削弱第一击。要先试探，还是直接进攻？'};
 if(m.id==='storm-scout'&&battle.turn<=12){
  if(battle.turn%3===2)return {kind:'charge',label:'蓄力 · 本回合不攻击',detail:'下回合有重击。你想抢攻，还是先准备防御？'};
  if(battle.turn%3===0)return {kind:'heavy',label:'准备重击',detail:'留意生命，也可以检查手里的防御或治疗牌。'};
  return {kind:'attack',label:'准备攻击',detail:'下一回合会蓄力，留意这个空当。'};
 }
 return {kind:'attack',label:'准备攻击',detail:'看看牌的效果，再决定这一回合怎么出。'};
}
export function openingEnemyIntent(battle){
 const info=openingEnemyIntentInfo(battle);return info?info.label+'。'+info.detail:null;
}

// Presentation-only: describe a real consumed effect, never infer a better move.
export function openingStrategyCue(battle,event){
 if(!battle.monsterTemplates?.some(m=>m.openingTrainingVersion===3)||event.sourceType!=='effect_used')return null;
 if(!battle.unitsById?.[event.target])return null;
 const template=event.kind==='ward'?battle.resolved.wards?.[event.id]:event.kind==='charm'?battle.resolved.charms?.[event.id]:null;
 const boost=Number(template?.boost_damage);if(!Number.isFinite(boost)||boost===0)return null;
 const text=event.kind==='ward'?(boost<0?'消耗了一层护盾！':'陷阱触发，这一击增强了！'):(boost>0?'之前的增益用上了！':'这一击被削弱了。');
 return {unitId:event.target,text};
}
