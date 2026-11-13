import {createPveBattle,playPveRound} from './combat_pve_core.js';
import {captureBattlePresentation} from './view_battle_presentation.js';
import {selectableCards,canCast} from './combat_unit_core.js';

const ATTACK='Fire_SingleAttack_Level0_45',HEAVY='Fire_SingleAttack_Level6_low_level';
const BLADE='Fire_FireDamageBlade',TRAP='Fire_FireDamageTrap',SHIELD='Ice_GlobalShield',WEAK='Death_AreaDamageWeakness',HEAL='Life_SingleHeal_Level0';
export const TACTICS_FIELD_ENCOUNTERS=[
 {id:'focus',title:'林边拦路怪',size:2,summary:'和茜茜一起打退拦路怪。'},
 {id:'break-shield',title:'带盾的巡逻怪',size:2,summary:'打退会开盾的怪物。'},
 {id:'guard',title:'蓄力的烈火怪',size:2,summary:'挡住重击，再反击。'},
 {id:'squad',title:'四人清路小队',size:4,summary:'四人一起打通巡逻路。'}
];
const lessonFor=id=>TACTICS_FIELD_ENCOUNTERS.find(row=>row.id===id);
export const nextTacticsFieldId=save=>TACTICS_FIELD_ENCOUNTERS.find(row=>!save.tacticsTraining?.completed?.[row.id]?.fieldWins)?.id||'focus';
const entry=(round,card,speak='')=>({round:String(round),card,speak,target_hostile:'threat_highest',target_friendly:'self'});

// Disposable loan party; every action and enemy turn is resolved by normal PvE.
// Nothing from the character's health, deck, pets or inventory is shared.
export function createTacticsFieldBattle(dataset,content,{lessonId='focus',seed=1,name='冒险者'}={}){
 const lesson=lessonFor(lessonId);if(!lesson)throw Error('这组怪物还没有准备好。');
 const deck=[BLADE,TRAP,ATTACK,HEAVY,SHIELD,WEAK,HEAL,ATTACK,HEAVY,ATTACK,HEAVY,ATTACK,HEAVY,ATTACK,HEAVY,ATTACK,HEAVY,HEAL];
 const loan=(id,label,slot,cards,fixed)=>({id,name:label,school:'fire',level:5,slot,deck:cards,deckCapacity:30,deckEachCapacity:12,stats:{hpFlat:150},fixedCards:fixed.map(key=>({key}))});
 const hero=loan('hero',name,0,deck,[BLADE,TRAP,ATTACK,HEAVY,SHIELD,WEAK,HEAL]);
 const support=loan('field-support','茜茜',1,[BLADE,BLADE,BLADE,SHIELD,SHIELD,HEAL,HEAL,HEAL,ATTACK,ATTACK,ATTACK,ATTACK],[BLADE,SHIELD,HEAL,ATTACK]);
 const party=[hero,support];
 if(lesson.size===4){
  party.push(loan('field-trapper','巡逻搭档',2,[TRAP,TRAP,TRAP,ATTACK,ATTACK,HEAVY,HEAVY,HEAL],[TRAP,ATTACK,HEAVY,HEAL]));
  party.push(loan('field-guard','营地守卫',3,[SHIELD,SHIELD,WEAK,WEAK,HEAL,HEAL,ATTACK,ATTACK],[SHIELD,WEAK,HEAL,ATTACK]));
 }
 const template=content.monsters[content.encounters.find(row=>row.id==='fire-scout')?.monsterId];
 if(!template)throw Error('林边怪物暂时没有准备好。');
 const monsters=Array.from({length:lesson.size},(_,i)=>{
  const rows=[];
  if(lesson.id==='break-shield'&&i===0)rows.push(entry('1-',SHIELD,'我先开盾！'));
  for(let round=1;round<=18;round++){
   const charge=lesson.id==='guard'&&i===0&&round%3===1;
   const heavy=lesson.id==='guard'&&i===0&&round%3===2;
   const supporting=lesson.id==='guard'&&i>0&&round%3!==0;
   rows.push(entry(round,charge||supporting?BLADE:heavy?HEAVY:ATTACK,charge?'下回合我要出重招！':heavy?'接招！':''));
  }
  const hp=lesson.size===4?190:i===0?220:140;
  return {...structuredClone(template),name:i===0?lesson.title:'林边小怪 '+(i+1),level:5,hp,maxHp:hp,attributes:{},genes:[],sequences:[rows],pool:[{key:ATTACK,weight:1}],xp:0,coins:0};
 });
 const battle=createPveBattle({dataset,player:hero,party,monsters,seed});
 const profiles=[{appearance:'girl',bodyId:'female10',headId:'wave-girl'},{appearance:'boy',bodyId:'male2',headId:'jade-boy'},{appearance:'boy',bodyId:'male2'}];
 for(const [i,unit] of battle.sides.near.slice(1).entries())unit.arenaProfile={...profiles[i],name:unit.name,school:unit.school,mountId:null};
 battle.tacticsField={id:lesson.id,title:lesson.title,size:lesson.size};
 return battle;
}

// Replay also restores random rolls and AI choices after a failed round.
export function playTacticsFieldRound({battle,decisions,create},decision){
 try{
  const playback=captureBattlePresentation(battle,()=>playPveRound(battle,decision));
  decisions.push(structuredClone(battle.lastDecision||decision));
  return {battle,playback,error:null};
 }catch(error){
  const restored=create();for(const previous of decisions)playPveRound(restored,previous);
  return {battle:restored,playback:null,error};
 }
}

// Keep one actionable sentence on the ordinary combat HUD, never a modal lesson.
export function tacticsFieldCue(battle){
 if(!battle?.tacticsField||battle.finished)return null;
 const hero=battle.sides.near[0],target=battle.sides.far.find(u=>u.hp>0);
 if(!target)return null;
 const ward=(u,sign)=>u.wards.some(w=>Math.sign(Number(battle.resolved.wards[w.id]?.boost_damage))===sign);
 const charm=(u,sign)=>u.charms.some(id=>Math.sign(Number(battle.resolved.charms[id]?.boost_damage))===sign);
 const id=battle.tacticsField.id;
 const ready=key=>selectableCards(hero).some(h=>h.key===key)&&canCast(hero,battle.resolved.cards[key],battle.resolved);
 let label;
 if(id==='guard'&&battle.unitsById.mob0.hp>0&&battle.turn%3===1&&ready(SHIELD))label='烈火怪要蓄力了：给自己加护盾，挡它下一回合的重击。';
 else if(id==='guard'&&battle.unitsById.mob0.hp>0&&battle.turn%3===2&&ready(WEAK))label='重击要来了：给烈火怪挂虚弱，降低它的伤害。';
 else if(ward(target,-1)&&ready(ATTACK))label=target.name+'有盾：先用小攻击消耗护盾。';
 else if(hero.hp<hero.maxHp/3&&ready(HEAL))label='生命不多了：用治疗恢复，也可以请茜茜帮忙。';
 else if(charm(hero,1)&&ward(target,1)&&(ready(ATTACK)||ready(HEAVY)))label='强化和陷阱都在：用烈火攻击打'+target.name+'！';
 else if(charm(hero,1)&&ready(TRAP)&&!ward(target,1))label='身上已有强化：给'+target.name+'挂烈火陷阱，再攻击它。';
 else if(ready(BLADE)&&!charm(hero,1))label='先把烈火强化给自己，让下一次烈火攻击更强。';
 else label='选手里能用的攻击，和茜茜一起打退'+target.name+'。';
 return {kind:'attack',label};
}

export function recordTacticsFieldVictory(save,battle){
 if(!battle?.tacticsField||!lessonFor(battle.tacticsField.id)||!battle.finished||battle.winner!=='near')return false;
 save.tacticsTraining??={version:1,completed:{}};
 const previous=save.tacticsTraining.completed[battle.tacticsField.id];
 save.tacticsTraining.completed[battle.tacticsField.id]={runs:Math.min(9999,(previous?.runs||0)+1),plain:previous?.plain||0,actual:previous?.actual||0,fieldWins:Math.min(9999,(previous?.fieldWins||0)+1)};
 return true;
}
