import {esc} from '../views/dom.js';
import {SCHOOL_NAMES} from '../rules/formulas.js';
export function statusBadges(unit,ruleset,arenaAura) {
  const badges=[];
  const add=(kind,text)=>badges.push(`<span class="effect-badge ${kind}">${esc(text)}</span>`);
  for(const [list,group,label] of [['charms','charmlist','剑'],['wards','wardlist','盾']])for(const entry of unit[list]){
    const e=ruleset.effects[group]?.[entry.id]??{},parts=[];
    for(const [key,title] of [['boost_damage','伤害'],['boost_heal','治疗'],['boost_accuracy','施法成功率']])if(e[key]!=null)parts.push(`${title} ${e[key]>=0?'+':''}${e[key]}%`);
    if(e.stunabsorb)parts.push('抵挡眩晕');
    if(e.dispel_school)parts.push(`封锁 ${SCHOOL_NAMES[e.dispel_school]??e.dispel_school}`);
    if(e.stats)parts.push(`属性 ${e.stats}`);
    if(e.desc)parts.push(e.desc);
    if(e.prism_from)parts.push(`${SCHOOL_NAMES[e.prism_from]??e.prism_from}→${SCHOOL_NAMES[e.prism_to]??e.prism_to}`);
    add(e.positive===false?'negative':'positive',`${label} ${SCHOOL_NAMES[e.school]??(e.school==='all'?'全系':'')} ${parts.join(' · ')||e.name||`#${entry.id}`} · ${entry.rounds!=null?`${entry.rounds} 回合`:'触发后消耗'}`);
  }
  for(const s of unit.absorbs)add('positive',`吸收盾 · 剩余 ${Math.ceil(s.amount)}`);
  for(const s of unit.dots)add('negative',`持续伤害 · ${s.values.length} 次 · 下一次 ${s.values[0]} · ${ruleset.cards[s.card]?.name??s.card}`);
  for(const s of unit.hots)add('positive',`持续治疗 · ${s.values.length} 次 · 下一次 ${s.values[0]}`);
  if(unit.stun)add('negative',`眩晕 · 跳过 ${unit.stun} 次行动`);
  if(unit.aura)add('neutral',`灵气 #${unit.aura.id} · ${unit.aura.rounds} 回合 · ${ruleset.effects.miniauralist?.[unit.aura.id]?.stats??''}`);
  if(arenaAura)add('neutral',`全场光环 · ${SCHOOL_NAMES[arenaAura.school]??'全系'} ${arenaAura.boost_damage!=null?`伤害 ${arenaAura.boost_damage}%`:''} ${arenaAura.boost_heal!=null?`治疗 ${arenaAura.boost_heal}%`:''}`);
  return badges.join('')||'<span class="muted">无增益 / 减益</span>';
}
