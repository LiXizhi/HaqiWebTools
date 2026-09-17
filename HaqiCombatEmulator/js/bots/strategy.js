import {cardEffects} from '../data/card-categories.js';
import {rng,randomInt} from '../engine/random.js';
import {numerical} from '../rules/formulas.js';
export const BOT_VERSION='tactical-0.2';
export function chooseAction(observation,ruleset,strategy='tactical',seed=1) {
  const actions=observation.legalActions;
  if(!actions.length)throw new Error('机器人没有可用动作');
  const random=rng(`${seed}:${observation.turn}:${observation.unitId}:${strategy}`);
  if(strategy==='random')return actions[randomInt(random,0,actions.length-1)];
  if(strategy!=='tactical')throw new Error('未知机器人策略');
  const caster=observation.units.find(u=>u.id===observation.unitId);
  const scores=actions.map(action=>{
    if(action.kind==='pass')return {action,score:0};
    const c=ruleset.cards[action.card],p=c.params,t=c.type,target=observation.units.find(u=>u.id===action.targetId);
    const pip=c.pipcost<0?caster.pips+2*caster.powerPips:c.pipcost;
    const avg=(a,b)=>(numerical(a,pip)+numerical(b,pip))/2;
    let score=0;
    if(t.includes('Attack')) {
      let damage=avg(p.damage_min,p.damage_max);
      if(p.dots)damage+=String(p.dots).split(',').reduce((n,x)=>n+Math.max(0,numerical(x,pip)),0)*.75;
      if(t.includes('Percent'))damage=target.hp*(p.damage_percent??0)/100;
      score=Math.min(damage,target.hp)*(1+.6*(1-target.hp/target.maxHP));
      if(damage>=target.hp)score+=target.maxHP*.35;
      if(t.startsWith('Area'))score*=observation.units.filter(u=>u.side!==caster.side&&u.hp>0).length*.85;
    }
    if(t.includes('Heal')) {
      const value=avg(p.heal_min,p.heal_max)+(p.hots?String(p.hots).split(',').reduce((n,x)=>n+numerical(x,pip),0)*.6:0);
      const allies=t.startsWith('Area')?observation.units.filter(u=>u.side===caster.side&&u.hp>0):[target];
      score=allies.reduce((n,u)=>n+Math.min(value,u.maxHP-u.hp)*(u.hp/u.maxHP<.35?2:1.1),0);
    }
    if(t.includes('Stun'))score+=target.maxHP*.08;
    if(t.includes('Absorb'))score+=numerical(p.absorb_pts,pip)*.65/(1+target.absorbs.length);
    const effects=cardEffects(c,ruleset);
    if(effects.length) {
      const list=t.includes('Charm')?target.charms:target.wards;
      const nextDamage=Math.max(220,...observation.hand.map(h=>ruleset.cards[h.key]).filter(x=>x.type.includes('Attack')).map(x=>(numerical(x.params.damage_min,pip)+numerical(x.params.damage_max,pip))/2));
      for(const e of effects){
        if(list.some(x=>x.id%1000===e.id%1000))continue;
        const all=e.school==='all'||e.school==='balance';
        if(e.boost_damage>0&&t.includes('Charm')&&(all||e.school===target.school))score+=nextDamage*e.boost_damage/100+80;
        if(e.boost_damage>0&&t.includes('Ward')&&(all||e.school===caster.school))score+=nextDamage*e.boost_damage/100+70;
        if(e.boost_damage<0&&t.includes('Charm')&&(all||e.school===target.school))score+=350*Math.abs(e.boost_damage)/100;
        if(e.boost_damage<0&&t.includes('Ward')&&observation.units.some(u=>u.hp>0&&u.side!==target.side&&(all||u.school===e.school)))score+=300*Math.abs(e.boost_damage)/100*(target.hp/target.maxHP<.5?1.5:1);
        if(e.boost_heal>0&&target.hp<target.maxHP*.8)score+=120;
        if(e.boost_heal<0&&target.hp<target.maxHP*.7)score+=100;
        if(e.boost_accuracy<0&&(all||e.school===target.school))score+=150;
        if(e.boost_accuracy>0&&observation.version==='kids'&&(all||e.school===target.school))score+=90;
      }
      if(t.startsWith('Area'))score*=observation.units.filter(u=>u.side===target.side&&u.hp>0).length*.8;
    }
    if(t.startsWith('Remove')||t.startsWith('Steal'))score+=(t.includes('Charm')?target.charms.length:target.wards.length)*35;
    if(t.includes('Cleanse'))score+=target.dots*90;
    if(t==='MiniAura')score+=target.aura?0:85;
    if(t==='GainPips'||t==='AreaPowerPipBoost')score+=Math.max(0,6-caster.pips)*25;
    if(t==='Global')score+=20;
    score=score*(c.accuracy/100)/(1+Math.max(0,c.pipcost)*.12);
    return {action,score};
  });
  scores.sort((a,b)=>b.score-a.score);
  const tied=scores.filter(s=>Math.abs(s.score-scores[0].score)<1e-8);
  return tied[randomInt(random,0,tied.length-1)].action;
}
