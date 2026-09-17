// Genes_Attacker-style mob policy (config/Aries/Mob genes): pure, seeded, observation-only.
// Gene fields used: hp_range "lo,hi", hp_drop N (fires once when HP first drops below N%), priority
// (lower first), card (explicit key) or card_set (id into mob.cardsets), target_hostile / target_friendly.
// `memory` is a plain object owned by the caller so one-shot hp_drop genes fire once per battle.
import {rng,randomInt} from '../engine/random.js';
import {chooseAction} from './strategy.js';
export const GENES_BOT_VERSION='genes-0.1';
const hostileTarget=(rule,enemies,random)=>{
  if(!enemies.length)return null;
  const byHp=[...enemies].sort((a,b)=>a.hp/a.maxHP-b.hp/b.maxHP);
  switch(rule){
    case 'threat_lowest':case 'hp_highest':return byHp[byHp.length-1];
    case 'hp_lowest':return byHp[0];
    case 'random':return enemies[randomInt(random,0,enemies.length-1)];
    // threat_highest: the source tracks damage dealt; the observation exposes only state, so the
    // highest-level enemy (ties: lowest HP) stands in for the biggest threat.
    default:return [...enemies].sort((a,b)=>b.level-a.level||a.hp-b.hp)[0];
  }
};
export function activeGenes(mob,hpPercent,memory) {
  const out=[];
  for(const [index,gene] of (mob.genes??[]).entries()) {
    if(gene.hp_drop!=null){if(hpPercent<Number(gene.hp_drop)&&!memory[`drop:${index}`]){out.push({gene,index,oneShot:true});}continue;}
    if(gene.hp_range!=null){const [lo,hi]=String(gene.hp_range).split(',').map(Number);if(hpPercent>=lo&&hpPercent<=hi)out.push({gene,index,oneShot:false});continue;}
    out.push({gene,index,oneShot:false});
  }
  return out.sort((a,b)=>Number(a.gene.priority??10)-Number(b.gene.priority??10)||a.index-b.index);
}
export function chooseMobAction(observation,ruleset,mob,memory={},seed=1,gsidToCard={}) {
  const actions=observation.legalActions;
  if(!actions.length)throw new Error('怪物没有可用动作');
  const random=rng(`${seed}:${observation.turn}:${observation.unitId}:genes`);
  const caster=observation.units.find(u=>u.id===observation.unitId);
  const hpPercent=caster.hp/caster.maxHP*100;
  const enemies=observation.units.filter(u=>u.side!==caster.side&&u.hp>0);
  const casts=actions.filter(a=>a.kind==='cast');
  for(const {gene,index,oneShot} of activeGenes(mob,hpPercent,memory)) {
    let keys=null;
    if(gene.card)keys=new Map([[String(gene.card),1]]);
    else if(gene.card_set!=null){const set=mob.cardsets?.[String(gene.card_set)]??[];keys=new Map();for(const {gsid,weight} of set){const key=gsidToCard[gsid];if(key)keys.set(key,(keys.get(key)??0)+weight);}}
    if(!keys||!keys.size)continue;
    const candidates=casts.filter(a=>keys.has(a.card));
    if(!candidates.length){if(oneShot&&gene.card&&!observation.hand.some(h=>h.key===gene.card))continue;continue;}
    // Weighted pick among distinct cards, then a target by the gene's rule.
    const distinct=[...new Set(candidates.map(a=>a.card))];
    const total=distinct.reduce((n,k)=>n+keys.get(k),0);let roll=randomInt(random,1,total),card=distinct[0];
    for(const k of distinct){roll-=keys.get(k);if(roll<=0){card=k;break;}}
    const options=candidates.filter(a=>a.card===card);
    const info=ruleset.cards[card];
    const friendly=options.some(a=>observation.units.find(u=>u.id===a.targetId)?.side===caster.side);
    let target;
    if(friendly)target=String(gene.target_friendly??'self')==='self'?caster:observation.units.find(u=>u.side===caster.side&&u.hp>0&&options.some(a=>a.targetId===u.id));
    else target=hostileTarget(gene.target_hostile,enemies.filter(e=>options.some(a=>a.targetId===e.id)),random);
    const action=options.find(a=>a.targetId===(target?.id??options[0].targetId))??options[0];
    if(oneShot)memory[`drop:${index}`]=true;
    return {...action,gene:index,speak:gene.speak??null,cardName:info?.name??card};
  }
  return chooseAction(observation,ruleset,'tactical',seed);
}
