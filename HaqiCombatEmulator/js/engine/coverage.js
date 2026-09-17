// An explicit capability registry; unknown source effects never become a no-op.
export const EFFECT_TYPES = new Set([
  'Pass','SingleAttack','AreaAttack','ArenaAttack','SingleHeal','AreaHeal',
  'SingleAttackWithDOT','AreaAttackWithDOT','DOTAttack','AreaDOTAttack','DOTAttackWithHOT',
  'SingleHealWithHOT','AreaHealWithHOT','SingleHealWithCleanse','SingleCleanse','AreaCleanse',
  'Charms','AreaCharm','Wards','AreaWard','StandingWards','SymmetryWards',
  'StealCharm','StealWard','RemovePositiveCharm','RemoveNegativeCharm','RemovePositiveWard','RemoveNegativeWard',
  'Absorb','AreaAbsorb','AreaHealWithAbsorb','SingleStun','AreaStun','SingleAttackWithStun','AreaAttackWithStun',
  'SingleAttackWithSelfStun','SingleAttackWithLifeTap','SingleAttackWithLifeTapAndStandingWards',
  'SingleAttackWithStandingWards','SingleAttackWithTrap','SingleAttackWithImmolate','SingleHealWithImmolate',
  'AreaAttackWithImmolate','SingleAttackWithPercent','SingleAttackWithExplode','Global','MiniAura',
  'GainPips','AreaPowerPipBoost','ConversePositiveWard'
]);
export function cardIssues(card,ruleset) {
  if(!card)return ['卡牌不存在'];
  const issues=[];
  if(!EFFECT_TYPES.has(card.type))issues.push(`尚未实现效果 ${card.type}`);
  if(card.params.bCharging)issues.push('风暴印记充能尚未通过移植验证');
  if(card.params.spelllist)issues.push('组合 spelllist 尚未实现');
  for(const [field,group] of [['charms','charmlist'],['charm','charmlist'],['wards','wardlist'],['ward','wardlist'],['target_wards','wardlist'],['caster_wards','wardlist'],['other_ward','wardlist'],['miniaura','miniauralist']]) {
    if(card.params[field]!=null)for(const id of String(card.params[field]).split(','))if(!ruleset.effects[group]?.[id.trim()])issues.push(`缺失 ${group}/${id}`);
  }
  return issues;
}
export function coverage(ruleset) {
  const supported=[],blocked=[];
  for(const card of Object.values(ruleset.cards)) {
    const issues=cardIssues(card,ruleset);
    (issues.length?blocked:supported).push({key:card.key,type:card.type,issues});
  }
  return {status:'experimental',supported:supported.length,total:supported.length+blocked.length,blocked,missing:ruleset.manifest.missing,fullParity:false};
}
