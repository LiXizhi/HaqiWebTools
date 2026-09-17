import {SCHOOL_NAMES} from '../rules/formulas.js';
export const CATEGORY_NAMES={all:'全部',attack:'攻击',heal:'治疗',buff:'增益 / 护盾',debuff:'减益 / 控制',other:'其他'};
export function cardEffects(card,ruleset){
 const group=/Charm/.test(card.type)?'charmlist':/Ward/.test(card.type)?'wardlist':null;
 if(!group)return [];
 const value=card.params.charms??card.params.charm??card.params.wards??card.params.ward;
 return String(value??'').split(',').map(id=>ruleset.effects[group]?.[id.trim()]).filter(Boolean);
}
export function cardCategory(card,ruleset){
 if(!card)return 'other';
 if(/Attack/.test(card.type))return 'attack';if(/Heal/.test(card.type))return 'heal';
 const effects=cardEffects(card,ruleset);if(effects.length)return effects.some(e=>e.positive===false)?'debuff':'buff';
 if(/Stun|Freeze|Weakness|Taunt|Control|RemovePositive|Steal/.test(card.type))return 'debuff';
 if(/Absorb|Aura|Global|GainPips|Cleanse|RemoveNegative/.test(card.type))return 'buff';return 'other';
}
export function cardDescription(card,ruleset){
 const parts=cardEffects(card,ruleset).map(e=>{const values=[];for(const [k,label] of [['boost_damage',/Ward/.test(card.type)?'受到伤害':'造成伤害'],['boost_heal','治疗'],['boost_accuracy','施法成功率']])if(e[k]!=null)values.push(`${label}${e[k]>=0?'+':''}${e[k]}%`);if(e.stunabsorb)values.push('抵挡眩晕');if(e.prism_from)values.push(`${SCHOOL_NAMES[e.prism_from]}→${SCHOOL_NAMES[e.prism_to]}`);return `${SCHOOL_NAMES[e.school]??(e.school==='all'?'全系':'')} ${values.join('，')}`.trim();}).filter(Boolean);
 return parts.join('；')||String(card.params.description??card.type).replaceAll('#','');
}
