import {processStatAgainstCharms,processDamageAgainstWards} from './combat_unit_core.js';

const schools={fire:'烈火',ice:'寒冰',storm:'风暴',life:'生命',death:'死亡',balance:'平衡',myth:'神秘',all:'任意系'};
const schoolName=school=>schools[String(school||'all').toLowerCase()]||'对应系';
const ids=value=>String(value??'').split(',').map(Number).filter(Number.isFinite);

// Run the engine's consumption selectors on disposable status copies. This is a
// preview of matching effects, not a damage forecast: no RNG or live state is used.
export function attackTacticEffects(battle,actor,target,card){
 if(!actor||!target||!['SingleAttack','AreaAttack'].includes(card?.type))return null;
 const effects=[],R=battle.resolved,collect=event=>{
  const effect=event.kind==='charm'?R.charms[event.id]:R.wards[event.id];
  if(Number(effect?.boost_damage))effects.push({...event,boost:Number(effect.boost_damage)});
 };
 const caster={id:actor.id,charms:[...(actor.charms||[])],_arena:{onStatusEffect:collect}};
 const receiver={id:target.id,wards:(target.wards||[]).map(w=>({...w})),_arena:{onStatusEffect:collect}};
 const school=card.params?.damage_school||card.spellSchool;
 processStatAgainstCharms(caster,R,[],'boost_damage',school);
 const finalSchool=processDamageAgainstWards(receiver,R,[],school);
 return {effects,school,finalSchool};
}

export function cardTacticAdvice(battle,actor,card,targets=[]){
 if(['DOTAttack','DOTAttackWithHOT','DoT','SingleAttackWithDOT','AreaAttackWithDOT','AreaDOTAttack'].includes(card?.type)&&card.params?.dots){
  const direct=['SingleAttackWithDOT','AreaAttackWithDOT'].includes(card.type);
  return {kind:'dot',text:'这是'+schoolName(card.params.damage_school||card.spellSchool)+'持续伤害法术。施放时结算强化与虚弱，并把加成带入后续伤害；每段伤害发生时，再检查目标当时的护盾和陷阱。'+(direct?'初始一击也会触发对应护盾；护盾消耗后，后续伤害可能更有效。':'可以用较小的一段伤害先消耗护盾，再准备后续攻势。')};
 }
 const field=['Charms','AreaCharm'].includes(card?.type)?'charms':['Wards','AreaWard'].includes(card?.type)?'wards':null;
 if(field){
  const effect=ids(card.params?.[field]??card.params?.[field.slice(0,-1)]).map(id=>battle.resolved[field]?.[id]).find(e=>Number(e?.boost_damage));
  if(!effect)return null;
  const positive=Number(effect.boost_damage)>0,school=schoolName(effect.school);
  if(['AreaCharm','AreaWard'].includes(card.type)){
   const text=field==='charms'
    ?positive?'给己方全体加上强化，再由各自用'+school+'攻击；每位队友的效果分别触发和消耗。':'给敌方全体加上虚弱，削弱各自下一次'+school+'攻击；可以配合护盾保护队友。'
    :positive?'给敌方全体挂上陷阱，再用'+school+'攻击；每个目标分别触发，也可以和进攻者的强化配合。':'给己方全体加盾，削弱各自受到的下一次'+school+'伤害；每位队友的护盾分别触发和消耗。';
   return {kind:field==='charms'?(positive?'boost':'weaken'):(positive?'trap':'shield'),text};
  }
  const text=field==='charms'
   ?positive?'给准备进攻的队友加上强化，再由他用'+school+'攻击。对应攻击结算时会消耗触发的强化。':'给对手加上虚弱，削弱他下一次'+school+'攻击。先看清对手准备使用的招式。'
   :positive?'先给对手挂陷阱，再用'+school+'攻击他。可以和进攻者身上的强化配合。':'给需要保护的队友加盾，削弱打向他的下一次'+school+'伤害。其他系攻击未必会消耗这层盾。';
  return {kind:field==='charms'?(positive?'boost':'weaken'):(positive?'trap':'shield'),text};
 }
 if(!['SingleAttack','AreaAttack'].includes(card?.type)||!targets.length)return null;
 const rows=targets.map(target=>({target,...attackTacticEffects(battle,actor,target,card)}));
 const best=rows.find(row=>row.effects.some(e=>e.kind==='ward'&&e.boost<0))||rows.find(row=>row.effects.length);
 if(!best)return {kind:'attack',text:'这是'+schoolName(card.params?.damage_school||card.spellSchool)+'攻击。先看看自己有没有对应强化、对手有没有陷阱或护盾，再决定目标。'};
 const {effects,target}=best,parts=[];
 if(effects.some(e=>e.kind==='charm'&&e.boost>0))parts.push('你身上的强化会增强这一击');
 if(effects.some(e=>e.kind==='charm'&&e.boost<0))parts.push('你身上的虚弱会削弱这一击');
 if(effects.some(e=>e.kind==='ward'&&e.boost>0))parts.push('目标身上的陷阱会增强这一击');
 if(effects.some(e=>e.kind==='ward'&&e.boost<0))parts.push('目标的护盾会削弱这一击');
 const differentTargets=targets.length>1&&card.type==='SingleAttack';
 return {kind:'attack',text:(differentTargets||card.type==='AreaAttack'?'对'+(target.name||'这个目标')+'：':'')+parts.join('；')+'。攻击结算时会消耗触发的效果。'+(card.type==='AreaAttack'?'群攻会分别结算其他目标的效果。':''),suggestedTargetId:target.id};
}
