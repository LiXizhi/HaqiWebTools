// Sources: player_server.lua:GetUpdatedMaxHP; card_server.lua:damage_expression/heal_expression.
export const SCHOOLS = ['ice', 'fire', 'storm', 'death', 'life'];
export const SCHOOL_NAMES = {ice:'寒冰',fire:'烈火',storm:'风暴',death:'死亡',life:'生命',balance:'平衡'};
export const SCHOOL_COLORS = {ice:'#66d2ff',fire:'#ff977a',storm:'#bd9bff',death:'#84ceab',life:'#edca78',balance:'#a5b2c5'};
export const ENGINE_VERSION = '0.2.1';
export const PARITY_STATUS = 'experimental';
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function baseHP(version, school, level, hpPercent=0, hpFlat=0, vip=-1) {
  const kids = {fire:[415,1500],ice:[500,2025],storm:[400,1200],life:[460,1800],death:[450,1650]};
  const teen = {fire:[450,36],ice:[600,48],storm:[425,34],life:[540,42],death:[500,40]};
  const [start, end] = (version === 'kids' ? kids : teen)[school];
  let hp = Math.ceil(version === 'kids' ? (end-start)*(level-1)/49+start : end*(level-1)+start);
  hp = Math.ceil(version === 'kids' ? hp + hp * 3.14 * hpPercent / 100 : hp * (100 + hpPercent) / 100);
  if(version === 'kids' && vip >= 0) hp = Math.ceil(hp*(100+[5,5,5,6,6,6,7,7,7,8,10][vip])/100);
  return hp + hpFlat;
}
export function damageExpression(version, base, absolute=0, boosts=[], percent=0, resist=0, penetration=0, receivePenetration=0) {
  let damage = base * Math.max(50, absolute+100)/100;
  if(version === 'kids') {
    resist = Math.ceil(resist*(100-Math.min(70,penetration)-receivePenetration)/100);
    for(const b of boosts) damage = Math.ceil(damage*(100+b)/100);
  } else {
    let positive = 0;
    for(const b of boosts) if(b>0) positive += b;
    for(const b of boosts) if(b<0) damage *= (100+b)/100;
    damage = Math.ceil(damage*(100+positive)/100);
  }
  damage = Math.ceil(damage*(100+percent)/100);
  return Math.ceil(damage*(100+resist)/100);
}
export function healExpression(version, base, boosts=[]) {
  let value = base;
  for(const b of boosts) {value *= (100+b)/100; if(version === 'kids') value = Math.ceil(value);}
  return version === 'teen' && value <= 0 ? 1 : value;
}
export function numerical(value, pips=0) {
  if(typeof value === 'number' && Number.isFinite(value)) return value;
  if(typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if(typeof value === 'string' && /^\d+p$/.test(value)) return Number(value.slice(0,-1))*pips;
  if(value == null) return 0;
  throw new Error(`非法数值表达式: ${value}`);
}
export function availablePips(unit, school, version) {
  if(version === 'teen') return (school === unit.school || school === 'balance') ? unit.pips : unit.pips/2;
  return unit.pips + unit.powerPips*(school === unit.school ? 2 : 1);
}
export function costPips(unit, requested, school, version) {
  let cost = Math.abs(requested), real = 0;
  const own = school === unit.school || (version === 'teen' && school === 'balance');
  while(cost > 0 && (unit.pips > 0 || unit.powerPips > 0)) {
    if(own && cost >= 2 && unit.powerPips > 0) {unit.powerPips--;cost-=2;real+=2;}
    else if(version === 'teen' && !own) {const n=Math.min(2,unit.pips);unit.pips-=n;cost--;real+=n/2;}
    else if(unit.pips > 0) {unit.pips--;cost--;real++;}
    else {unit.powerPips--;cost--;real++;}
  }
  return real;
}
