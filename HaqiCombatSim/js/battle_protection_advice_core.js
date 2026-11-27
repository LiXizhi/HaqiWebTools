import {validTargets} from './combat_arena_core.js';
import {isAttackCard} from './combat_cards_core.js';
import {isAlive} from './combat_unit_core.js';
import {attackTacticEffects} from './battle_tactics_core.js';

// Compare only the announced attack and legal targets, on disposable status copies.
// A matching shield that adds mitigation wins over an unrelated or duplicate ward.
export function heavyProtection(battle,choices,intent){
 const hero=battle.sides.near[0],threatened=battle.unitsById?.[intent.targetId];
 const targetsFor=h=>validTargets(battle,hero,h.card).filter(u=>!threatened||u.id===threatened.id);
 const candidates=choices.filter(h=>targetsFor(h).length&&(/^(Absorb|AreaAbsorb)$/.test(h.card.type)||/^(Wards|AreaWard)$/.test(h.card.type)&&String(h.card.params?.wards??'').split(',').some(id=>Number(battle.resolved.wards[id]?.boost_damage)<0)));
 const incoming=battle.resolved.cards[intent.cardKey||intent.key];
 if(!incoming||!isAttackCard(incoming))return candidates[0];
 const attacker=battle.unitsById?.[intent.caster]||battle.sides.far.find(isAlive);
 const preview={...incoming,type:'SingleAttack'};
 const remaining=target=>(attackTacticEffects(battle,attacker,target,preview)?.effects||[]).filter(e=>e.kind==='ward'&&e.boost<0).reduce((ratio,e)=>ratio*Math.max(0,1+e.boost/100),1);
 return candidates.map(h=>{
  if(/^(Absorb|AreaAbsorb)$/.test(h.card.type))return {h,score:0.000001};
  const wards=String(h.card.params?.wards??'').split(',').map(Number).filter(id=>id>0).map(id=>({id}));
  const score=Math.max(...targetsFor(h).map(target=>remaining(target)-remaining({...target,wards:[...(target.wards||[]),...wards]})));
  return {h,score};
 }).filter(row=>row.score>0).sort((a,b)=>b.score-a.score)[0]?.h;
}

