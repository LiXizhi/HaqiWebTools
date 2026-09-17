// Human-readable card text for the 2D game: numeric params (damage, heal, DoT, HoT, stun...) plus the shared charm/ward description.
import {SCHOOL_NAMES} from '../../rules/formulas.js';
import {cardDescription} from '../../data/card-categories.js';
const school=s=>SCHOOL_NAMES[s]??(s==='balance'?'平衡':s==='all'?'全系':'');
const range=(a,b,unit='')=>a==null&&b==null?null:a===b||b==null?`${a}${unit}`:`${a}~${b}${unit}`;
export function describeCard(card,ruleset) {
  if(!card)return '';
  const p=card.params??{},t=card.type??'',parts=[];
  const area=/^Area|^Arena/.test(t)?'群体':'';
  const dmg=range(p.damage_min,p.damage_max);
  if(dmg)parts.push(`${area}${school(p.damage_school??card.school)}伤害 ${dmg}${p.times>1?` ×${p.times}`:''}`);
  else if(p.damage_percent!=null)parts.push(`${area}伤害 ${p.damage_percent}%`);
  else if(p.damage_equal!=null)parts.push(`${area}伤害等于 ${p.damage_equal}`);
  const heal=range(p.heal_min,p.heal_max);
  if(heal)parts.push(`${area}治疗 ${heal}`);
  const ticks=v=>String(v).split(',').filter(Boolean);
  if(p.dots!=null)parts.push(`持续伤害 ${ticks(p.dots).join('/')}`);
  if(p.hots!=null)parts.push(`持续治疗 ${ticks(p.hots).join('/')}`);
  if(p.cooldown>0)parts.push(`冷却 ${p.cooldown} 回合`);
  const imm=range(p.immolate_damage_min,p.immolate_damage_max);
  if(imm)parts.push(`自伤 ${imm}`);
  if(p.absorb_pts!=null)parts.push(`吸收 ${p.absorb_pts}`);
  if(p.reflect_amount!=null)parts.push(`反弹 ${p.reflect_amount}`);
  if(p.powerpips!=null)parts.push(`获得 ${p.powerpips} 强力魔力`);
  if(p.steal_count!=null)parts.push(`偷取 ${p.steal_count} 个状态`);
  if(p.remove_count!=null)parts.push(`驱散 ${p.remove_count} 个状态`);
  if(p.convert_rate!=null)parts.push(`转化 ${p.convert_rate}%`);
  if(p.rounds!=null)parts.push(`持续 ${p.rounds} 回合`);
  if(/Stun/.test(t))parts.push(/Self/.test(t)?'自身眩晕':'眩晕目标');
  if(/Freeze/.test(t))parts.push('冰冻目标');
  if(/Trap/.test(t))parts.push('设置陷阱');
  if(/Pass/.test(t))parts.push('跳过');
  const shared=cardDescription(card,ruleset);
  if(shared&&shared!==t&&!/^[A-Za-z_]+$/.test(shared))parts.push(shared);
  const text=parts.join(' · ');
  return text||{Charms:'增益',Wards:'护盾',Global:'全场光环',Absorb:'吸收护盾',Stance:'姿态',Enrage:'激怒',MiniAura:'小光环'}[t]||t;
}
