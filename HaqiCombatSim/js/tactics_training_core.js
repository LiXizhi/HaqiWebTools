import {createArena,validTargets} from './combat_arena_core.js';
import {defaultParams,resolveParams} from './combat_params_core.js';
import {useCard} from './combat_cards_core.js';
import {canCast} from './combat_unit_core.js';

// Loaned cards and disposable units use the live engine, without player resources.
const ATTACK='Fire_SingleAttack_Level0_45',ICE_ATTACK='Ice_SingleAttack_Level0_45',BLADE='Fire_FireDamageBlade',TRAP='Fire_FireDamageTrap',SHIELD='Ice_GlobalShield',WEAK='Death_AreaDamageWeakness';
export const TACTICS_LESSONS=[
 {id:'focus',title:'双人演练 · 把力量送到同一击',size:2,summary:'辅助先强化主攻，再给同一个敌人布陷阱；主攻用烈火攻击接上。',steps:[
  {actor:'support',card:BLADE,target:'striker',text:'辅助行动：把烈火强化给主攻。强化留在施法者身上，就帮不到主攻。'},
  {actor:'support',card:TRAP,target:'enemy',text:'辅助行动：给左侧的训练靶布烈火陷阱。下一击要打中这个目标。'},
  {actor:'striker',card:ATTACK,target:'enemy',text:'主攻行动：用烈火攻击命中有陷阱的训练靶，同时用上强化和陷阱。'}]},
 {id:'break-shield',title:'双人演练 · 先破盾，再蓄力',size:2,shielded:true,summary:'敌人已经有护盾。辅助先用小攻击消耗护盾，再把强化与陷阱留给主攻的一击。',steps:[
  {actor:'support',card:ATTACK,target:'enemy',text:'辅助行动：先用烈火攻击打左侧带盾的训练靶，消耗它的护盾。',feedback:'护盾已经被这一击消耗，后面的主攻不会再受这层盾削弱。'},
  {actor:'support',card:BLADE,target:'striker',text:'辅助行动：护盾已破，现在把烈火强化交给主攻。'},
  {actor:'support',card:TRAP,target:'enemy',text:'辅助行动：给已经破盾的左侧训练靶布烈火陷阱。'},
  {actor:'striker',card:ATTACK,target:'enemy',text:'主攻行动：烈火攻击命中左侧训练靶，让强化和陷阱一起生效。'}]},
 {id:'guard',title:'双人演练 · 让重击轻下来',size:2,summary:'削弱留在敌人身上，护盾留在被攻击的伙伴身上。两者一起降低同一击的伤害。',steps:[
  {actor:'support',card:WEAK,target:'enemy',text:'辅助行动：对任意一个敌人使用群体虚弱，降低敌方全体下一次攻击的威力。',feedback:'群体虚弱已经影响敌方全体，不需要逐个施放。'},
  {actor:'support',card:SHIELD,target:'striker',text:'辅助行动：给主攻加护盾。对手下一步会攻击主攻。'},
  {actor:'enemy',card:ATTACK,target:'striker',text:'换到对手视角：向有护盾的主攻打出烈火攻击，检验这次减伤。'}]},
 {id:'squad',title:'四人演练 · 分工与集火',size:4,summary:'强化、陷阱、保护、主攻各司其职。人数增加以后，更要看清效果给了谁、攻击打向谁。',steps:[
  {actor:'support',card:BLADE,target:'striker',text:'强化位：把烈火强化交给主攻。'},
  {actor:'trapper',card:TRAP,target:'enemy',text:'布置位：给左侧训练靶放烈火陷阱，约定集火目标。'},
  {actor:'guard',card:SHIELD,target:'striker',text:'保护位：给主攻加护盾，保护准备出手的伙伴。'},
  {actor:'striker',card:ATTACK,target:'enemy',text:'主攻位：烈火攻击集火左侧目标，兑现队友铺好的效果。'}]},
];
const lessonFor=id=>TACTICS_LESSONS.find(row=>row.id===id);
function makeArena(dataset,lesson,seed){
 const resolved=resolveParams(dataset,defaultParams('kids'));
 for(const key of [ATTACK,ICE_ATTACK,BLADE,TRAP,SHIELD,WEAK])if(!resolved.cards[key])throw Error('战术练习卡牌暂未准备好。');
 resolved.fairPlay={...resolved.fairPlay,forceAccuracy:100};
 const spec=(id,name,school)=>({id,name,school,level:1,deck:[]});
 const near=[spec('striker','主攻','fire'),spec('support','辅助','life')];
 if(lesson.size===4)near.push(spec('trapper','布置位','fire'),spec('guard','保护位','ice'));
 const far=Array.from({length:lesson.size},(_,i)=>spec(i?'enemy-'+i:'enemy',i?'陪练 '+(i+1):'训练靶','fire'));
 const arena=createArena({resolved,near,far,seed});
 for(const unit of Object.values(arena.unitsById)){unit.maxHp=5000;unit.hp=5000;unit.pips={normal:resolved.global.maxPips,power:0};}
 if(lesson.shielded)cast(arena,'enemy',SHIELD,'enemy');
 return arena;
}
function cast(arena,actorId,key,targetId){
 const actor=arena.unitsById[actorId],target=arena.unitsById[targetId],card=arena.resolved.cards[key];
 if(!actor||!target||!card||!validTargets(arena,actor,card).includes(target)||!canCast(actor,card,arena.resolved))return null;
 actor.pips={normal:arena.resolved.global.maxPips,power:0};
 const before=target.hp;useCard(arena,actor,card,target);
 return {damage:Math.max(0,before-target.hp),targetId};
}
function replay(state){
 const arena=makeArena(state.dataset,state.lesson,state.seed);
 for(const row of state.actions)cast(arena,row.actor,row.card,row.target);
 return arena;
}
export function createTacticsTraining(dataset,{lessonId='focus',seed=1}={}){
 const lesson=lessonFor(lessonId);if(!lesson)throw Error('没有这项战术演练。');
 const state={dataset,lesson,seed,actions:[],selected:null,done:false,result:null,message:lesson.steps[0].text};
 state.arena=replay(state);return state;
}
export function trainingStep(state){return state.done?null:state.lesson.steps[state.actions.length];}
export function trainingCards(state){
 const step=trainingStep(state);if(!step)return [];
 return [...new Set([step.card,ATTACK,ICE_ATTACK,BLADE,TRAP,SHIELD,WEAK])];
}
export function trainingTargets(state){
 const step=trainingStep(state),actor=step&&state.arena.unitsById[step.actor],card=state.arena.resolved.cards[state.selected];
 return actor&&card?validTargets(state.arena,actor,card).map(unit=>unit.id):[];
}
export function selectTrainingCard(state,key){
 if(!trainingCards(state).includes(key))return false;
 state.selected=key;state.message='已选卡牌，再选择要施放的目标。';return true;
}
function counterexample(state,trial,step,targetId,result){
 const actor=trial.unitsById[step.actor],target=trial.unitsById[targetId],R=trial.resolved;
 const card=R.cards[state.selected],parts=[];
 if(['SingleAttack','AreaAttack'].includes(card.type)){
  parts.push('这次对'+target.name+'造成了 '+result.damage+' 点伤害。');
  const unspent=[];
  if(actor.charms.some(id=>Number(R.charms[id]?.boost_damage)>0))unspent.push('进攻者身上的强化');
  if(target.wards.some(ward=>Number(R.wards[ward.id]?.boost_damage)>0))unspent.push('目标身上的陷阱');
  if(unspent.length)parts.push(unspent.join('和')+'仍未触发；攻击需要与效果的学派匹配。');
 }else if(card.type==='AreaCharm'){
  parts.push('群体虚弱影响了敌方全体；这张牌的作用不符合本步分工。');
 }else if(targetId!==step.target){
  parts.push('效果交给了'+target.name+'；本步需要交给'+trial.unitsById[step.target].name+'。');
 }else parts.push('目标选对了，但这张牌的作用不符合本步分工。');
 return '反例演示：'+parts.join('')+' '+step.text+' 演示已还原到本步开始，可以换牌再试。';
}
export function castTrainingCard(state,targetId){
 const step=trainingStep(state);if(!step)return false;
 if(!state.selected){state.message='先选一张卡牌，再选目标。';return false;}
 const trial=replay(state),result=cast(trial,step.actor,state.selected,targetId);
 if(!result){state.message='这张牌不能对这个目标使用。看看它是给伙伴的强化、护盾，还是给敌人的陷阱、削弱。';return false;}
 const sharedTarget=state.selected===step.card&&trial.resolved.cards[state.selected].type==='AreaCharm';
 if(state.selected!==step.card||targetId!==step.target&&!sharedTarget){
  state.message=counterexample(state,trial,step,targetId,result);return false;
 }
 state.actions.push({...step,target:targetId});state.arena=trial;state.selected=null;
 if(state.actions.length<state.lesson.steps.length){state.message=(step.feedback||'配合成功。')+trainingStep(state).text;return true;}
 const baseline=makeArena(state.dataset,state.lesson,state.seed),last=state.actions.at(-1);
 const plain=cast(baseline,last.actor,last.card,last.target).damage;
 state.done=true;state.result={plain,actual:result.damage,kind:state.lesson.id==='guard'?'prevented':'boosted'};
 state.message=state.lesson.id==='guard'?'削弱与护盾一起挡住了伤害。正式战斗还要观察敌人会攻击谁。':'强化与陷阱在同一击触发了。正式战斗还要留意学派、护盾和出手顺序。';
 return true;
}
export function recordTacticsTraining(save,state){
 if(!state.done||!state.result)return false;
 save.tacticsTraining??={version:1,completed:{}};
 const previous=save.tacticsTraining.completed[state.lesson.id];
 save.tacticsTraining.completed[state.lesson.id]={runs:Math.min(9999,(previous?.runs||0)+1),plain:state.result.plain,actual:state.result.actual};
 return true;
}
export function validateTacticsTraining(save){
 const value=save.tacticsTraining;if(value===undefined)return;
 if(!value||value.version!==1||!value.completed||typeof value.completed!=='object'||Array.isArray(value.completed))throw Error('战术演练记录无效');
 for(const [id,row] of Object.entries(value.completed)){
  if(row?.fieldWins!==undefined&&(!Number.isSafeInteger(row.fieldWins)||row.fieldWins<1||row.fieldWins>9999))throw Error('实战记录无效');
  if(!lessonFor(id)||!row||!Number.isSafeInteger(row.runs)||row.runs<1||row.runs>9999||![row.plain,row.actual].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=5000))throw Error('战术演练记录无效');
 }
}
