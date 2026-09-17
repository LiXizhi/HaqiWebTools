import {damageExpression,healExpression,numerical,clamp} from '../rules/formulas.js';
import {randomInt} from './random.js';
export const ids=value=>value==null?[]:String(value).split(',').map(x=>Number(x.trim()));
export function emit(state,type,details={}) {
  if(state.recordEvents)state.events.push({turn:state.turn,type,...details});
}
const match=(effect,school)=>String(effect.school).toLowerCase()===school||effect.school==='all'||school==='skipschool';
export function consume(unit,list,field,school,ruleset) {
  const boosts=[], seen=new Set(),group=list==='charms'?'charmlist':'wardlist';
  const ordered=list==='wards'?[...unit[list].keys()].reverse():[...unit[list].keys()];
  for(const index of ordered) {
    const entry=unit[list][index],effect=ruleset.effects[group][entry.id];
    if(effect?.[field]!=null&&match(effect,school)&&!seen.has(entry.id%1000)) {
      boosts.push(effect[field]);seen.add(entry.id%1000);if(entry.rounds==null)entry.used=true;
    }
    if(list==='wards'&&field==='boost_damage'&&effect?.prism_from===school) {school=effect.prism_to;entry.used=true;}
  }
  unit[list]=unit[list].filter(e=>!e.used);
  return {boosts,school};
}
export function applyStatus(unit,list,id,rounds) {
  // Source permits duplicate ordinary charms/wards. One base id is consumed per hit.
  if(rounds!=null)unit[list]=unit[list].filter(x=>x.id!==id||x.rounds==null);
  unit[list].push({id,...(rounds!=null?{rounds}:{} )});
}
export function stat(unit,field,school=unit.school,ruleset) {
  let n=typeof unit.attributes[field]==='object'?(unit.attributes[field][school]??0):(unit.attributes[field]??0);
  const bases={damage:111,resist:119,damageAbsolute:151,resistAbsolute:159,critical:196,resilience:204,penetration:212};
  if(unit.aura&&bases[field]) {
    const map={fire:1,ice:2,storm:3,myth:4,life:5,death:6,balance:7};
    const data=ruleset.effects.miniauralist?.[unit.aura.id]?.stats??'';
    for(const m of String(data).matchAll(/\((\d+),(-?[\d.]+)\)/g))if(Number(m[1])===bases[field]||Number(m[1])===bases[field]+map[school])n+=Number(m[2]);
  }
  if(field==='resist')n=Math.min(70,n);
  if(field==='critical'&&ruleset.version==='teen')n=Math.min(30,n);
  return n;
}
export function arenaBoost(state) {
  const rounds=Math.floor((state.turn-1)/2),v=state.ruleset.version,a=state.arena;
  if(v==='teen')return a.bIncreasingDamage?2*rounds:0;
  const life=state.units.filter(u=>u.hp>0).every(u=>u.school==='life');
  return rounds*(state.scenario.size===3?8:life?(a.AllLifeEveryRoundDamageBoost??2):4);
}
export function takeDamage(state,caster,target,amount,school,card,mark='') {
  let remaining=Math.max(0,amount), absorbed=0;
  for(const shield of target.absorbs) {
    const n=Math.min(shield.amount,remaining);shield.amount-=n;remaining-=n;absorbed+=n;
  }
  target.absorbs=target.absorbs.filter(s=>s.amount>0);
  const actual=Math.min(target.hp,remaining);target.hp=Math.max(0,target.hp-remaining);
  caster.metrics.damage+=actual;target.metrics.received+=actual;
  emit(state,'damage',{caster:caster.id,target:target.id,amount:remaining,actual,absorbed,school,card,mark});
  if(target.hp<=0) {target.charms=[];target.wards=[];target.dots=[];target.hots=[];target.absorbs=[];target.aura=null;target.pips=0;target.powerPips=0;target.stun=0;target.dodgeProtection=0;emit(state,'death',{target:target.id});}
  return actual;
}
export function hit(state,caster,target,card,base,{boosts=null,school=card.params.damage_school??card.school,percent=false,dot=false}={}) {
  const r=state.ruleset,p=card.params;
  const cb=boosts??consume(caster,'charms','boost_damage',school,r).boosts;
  const wb=consume(target,'wards','boost_damage',school,r);school=wb.school;
  const modifiers=[...cb,...wb.boosts];
  if(state.aura?.school===school)modifiers.push(state.aura.boost_damage??0);
  let damage=damageExpression(r.version,base,percent?0:stat(caster,'damageAbsolute',school,r)-stat(target,'resistAbsolute',school,r),modifiers,percent?0:stat(caster,'damage',school,r)+arenaBoost(state),percent?0:-stat(target,'resist',school,r),stat(caster,'penetration',school,r)+(p.base_spellpenetration??0));
  let mark='';
  if(!dot) {
    let chance=(card.hitchance??100)+stat(caster,'hit',school,r)-stat(target,'dodge',school,r)+(r.version==='teen'?caster.level-target.level:0);
    chance=chance>=100?101:Math.max(0,chance);
    const dodge=randomInt(state.random,1,10000)>chance*100;
    if(dodge && (r.version!=='kids'||target.dodgeProtection===0)) {
      damage=r.version==='kids'?1:Math.ceil(damage*.5);mark='闪避';target.dodgeProtection=6;
    } else if(randomInt(state.random,0,1000)<=clamp(stat(caster,'critical',school,r)-stat(target,'resilience',school,r)+(p.base_criticalstrike??0),0,100)*10) {damage=Math.ceil(damage*1.3);mark='暴击';}
  }
  if(percent)damage=Math.min(damage,p.damage_max_player??p.damage_max??damage);
  return takeDamage(state,caster,target,damage,school,card.key,mark);
}
export function heal(state,caster,target,card,base,boosts=null) {
  const r=state.ruleset;
  const b=boosts??consume(caster,'charms','boost_heal','skipschool',r).boosts;
  const wb=consume(target,'wards','boost_heal','skipschool',r).boosts;
  let amount=healExpression(r.version,base,[...b,...wb,stat(caster,'outputHeal',caster.school,r),stat(target,'inputHeal',target.school,r),state.aura?.boost_heal??0]);
  if(r.version==='kids'&&state.arena.OpenAllLifeHealPenalty&&state.units.filter(u=>u.hp>0).every(u=>u.school==='life'))amount=Math.ceil(amount*.5);
  const actual=Math.max(0,Math.min(target.attributes.maxHP-target.hp,amount));
  target.hp+=actual;caster.metrics.healing+=actual;
  emit(state,'heal',{caster:caster.id,target:target.id,amount:actual,card:card.key});
  return actual;
}
const REVIVABLE=new Set(['Life_SingleHeal_ForLife_Level2','Life_SingleHealWithHOT_Level5','Life_SingleHeal_LevelX','Life_Pet_SingleHeal_Nymphora','Life_Pet_SingleHeal_Level4','Death_SingleHealWithImmolate_Level3','Balance_Rune_SingleHeal_Level2','Balance_AreaHeal_DragonLight','Balance_SingleHealWithHOT_Snake','Balance_Rune_SingleHeal_LongCD']);
export const canRevive=card=>REVIVABLE.has(card.key.replace(/_(Green|Blue|Purple|Orange)$/,''));
export function eligibleTargets(state,caster,card) {
  const t=card.type,p=card.params,r=state.ruleset;
  let friendly=/Heal|Absorb|Cleanse|GainPips|PowerPip|MiniAura|StandingWards/.test(t)||t==='Global';
  if(t.includes('Attack'))friendly=false;
  if(['Charms','AreaCharm','Wards','AreaWard','StandingWards'].includes(t)) {
    const group=t.includes('Charm')?'charmlist':'wardlist';
    friendly=ids(p.charms??p.charm??p.wards??p.ward).every(id=>r.effects[group]?.[id]?.positive!==false);
  }
  if(t.startsWith('RemoveNegative'))friendly=true;
  if(t==='Pass'||t==='Global')return [caster];
  return state.units.filter(u=>(friendly?u.side===caster.side:u.side!==caster.side)&&(u.hp>0||(friendly&&canRevive(card))));
}
function manipulate(state,caster,target,card) {
  const list=card.type.includes('Charm')?'charms':'wards',group=list==='charms'?'charmlist':'wardlist';
  const positive=!card.type.includes('Negative');
  const count=card.params.remove_count??card.params.steal_count??1;
  for(let i=0;i<count;i++) {
    const choices=target[list].map((s,index)=>({s,index,e:state.ruleset.effects[group][s.id]})).filter(x=>x.e?.can_manipulate!==false&&x.e?.positive===positive);
    if(!choices.length)break;
    const choice=choices[randomInt(state.random,0,choices.length-1)];target[list].splice(choice.index,1);
    if(card.type.startsWith('Steal'))caster[list].push(choice.s);
  }
}
export function resolveEffect(state,caster,target,card,pips) {
  const t=card.type,p=card.params,r=state.ruleset;
  const area=t.startsWith('Area')||t==='ArenaAttack';
  const targets=t==='ArenaAttack'?state.units.filter(u=>u.hp>0):area?eligibleTargets(state,caster,card):[target];
  const isAttack=/Attack/.test(t),isHeal=/Heal/.test(t);
  const school=p.damage_school??card.school;
  const attackBoost=isAttack?consume(caster,'charms','boost_damage',school,r).boosts:null;
  const healBoost=isHeal?consume(caster,'charms','boost_heal','skipschool',r).boosts:null;
  const base=isAttack&&p.damage_min!=null?randomInt(state.random,Math.ceil(numerical(p.damage_min,pips)),Math.ceil(numerical(p.damage_max,pips))):0;
  const healBase=isHeal?randomInt(state.random,Math.ceil(numerical(p.heal_min,pips)),Math.ceil(numerical(p.heal_max,pips))):0;
  for(const u of targets) {
    if(!u||(u.hp<=0&&!canRevive(card)))continue;
    let dealt=0;
    if(isAttack && !['DOTAttack','DOTAttackWithHOT','AreaDOTAttack'].includes(t)) {
      let value=base;
      if(t==='SingleAttackWithPercent')value=Math.ceil(u.hp*p.damage_percent/100);
      if(t==='SingleAttackWithExplode'&&u.dots.some(d=>d.values.some(x=>x<0))) {u.dots=u.dots.filter(d=>!d.values.some(x=>x<0));value=randomInt(state.random,numerical(p.damage_min_explode,pips),numerical(p.damage_max_explode,pips));}
      dealt=hit(state,caster,u,card,value,{boosts:attackBoost,percent:t==='SingleAttackWithPercent'});
    }
    if(isHeal)heal(state,caster,u,card,healBase,healBoost);
    if(t.includes('LifeTap')) {
      let life=Math.ceil(dealt*(p.convert_rate??0)/100);
      if(r.version==='kids'&&state.arena.OpenAllLifeHealPenalty&&state.units.filter(u=>u.hp>0).every(u=>u.school==='life'))life=Math.ceil(life*.5);
      life=Math.min(life,caster.attributes.maxHP-caster.hp);caster.hp+=life;caster.metrics.healing+=life;
      emit(state,'heal',{caster:caster.id,target:caster.id,amount:life,card:card.key});
    }
    if(p.dots&&u.hp>0)u.dots.push({caster:caster.id,card:card.key,values:String(p.dots).split(',').map(x=>numerical(x,pips)),schools:String(p.dots_damage_school??school).split(','),boosts:[...(attackBoost??[])]});
    if(p.hots) {const recipient=t==='DOTAttackWithHOT'?caster:u;recipient.hots.push({caster:caster.id,card:card.key,values:String(p.hots).split(',').map(x=>numerical(x,pips)),boosts:[...(healBoost??[])]});}
    if(t.includes('Cleanse'))u.dots=[];
    if(['Charms','AreaCharm'].includes(t))for(const id of ids(p.charms??p.charm))applyStatus(u,'charms',id);
    if(['Wards','AreaWard','StandingWards','SingleAttackWithStandingWards','SingleAttackWithLifeTapAndStandingWards'].includes(t))for(const id of ids(p.wards??p.ward))applyStatus(t.startsWith('SingleAttack')?caster:u,'wards',id,p.rounds);
    if(t==='SingleAttackWithTrap')for(const id of ids(p.target_wards))applyStatus(u,'wards',id);
    if(t==='SymmetryWards') {for(const id of ids(p.target_wards))applyStatus(u,'wards',id);for(const id of ids(p.caster_wards))applyStatus(caster,'wards',id);}
    if(t.includes('Absorb'))u.absorbs.push({amount:numerical(p.absorb_pts,pips),ward:p.ward});
    if(t.includes('Stun')&&!t.includes('SelfStun')&&u.hp>0) {
      const shield=u.wards.findIndex(w=>w.id===31);
      if(shield>=0)u.wards.splice(shield,1);
      else {u.stun=1;caster.metrics.control++;for(let i=0;i<4;i++)applyStatus(u,'wards',31);}
    }
    if(t.startsWith('Steal')||t.startsWith('Remove'))manipulate(state,caster,u,card);
    if(t==='MiniAura')u.aura={id:p.miniaura,rounds:p.rounds};
    if(t==='GainPips'||t==='AreaPowerPipBoost') {
      if(r.version==='teen')u.pips=Math.min(14,u.pips+(p.pips??0)+2*(p.powerpips??0));
      else {u.pips=Math.min(7-u.powerPips,u.pips+(p.pips??0));u.powerPips=Math.min(7-u.pips,u.powerPips+(p.powerpips??0));}
    }
    if(t==='ConversePositiveWard') {
      const index=u.wards.findIndex(w=>w.id%1000===p.fromward);
      if(index>=0)u.wards.splice(index,1,{id:p.toward});
    }
  }
  if(t.includes('Immolate')||t==='SingleAttackWithPercent') {
    const value=t==='SingleAttackWithPercent'?Math.ceil(caster.hp*p.immolate_damage_percent/100):randomInt(state.random,numerical(p.immolate_damage_min,pips),numerical(p.immolate_damage_max,pips));
    hit(state,caster,caster,card,value,{boosts:[],school:p.immolate_damage_school??school,percent:t==='SingleAttackWithPercent',dot:true});
  }
  if(t==='SingleAttackWithSelfStun')caster.stun=1;
  if(t==='Global')state.aura={...p};
}
