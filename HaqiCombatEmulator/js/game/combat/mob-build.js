// MobTemplate (config/Aries/Mob/**) -> emulator snapshot build. Pure; throws instead of guessing.
import {SCHOOLS} from '../../rules/formulas.js';
import {cardIssues} from '../../engine/coverage.js';
import {MAX_CARD_COPIES} from '../../rules/deck.js';
export const MOB_DECK_SIZE=18;
export function mobCardPool(mob,ruleset,gsidToCard) {
  // available_cards on the mob wins; otherwise cardsets referenced by genes (or set 1); genes may add explicit card keys.
  let weighted=mob.availableCards?.length?mob.availableCards:null;
  if(!weighted){const sets=Object.values(mob.cardsets??{});weighted=sets.length?sets.flat():[];}
  const pool=new Map();
  for(const {gsid,weight} of weighted){const key=gsidToCard[gsid];if(!key){continue;}pool.set(key,(pool.get(key)??0)+weight);}
  for(const gene of mob.genes??[])if(gene.card&&ruleset.cards[gene.card]&&!pool.has(gene.card))pool.set(gene.card,Math.max(1,Math.round((gene.weight??10))));
  const usable=[...pool].filter(([key])=>ruleset.cards[key]&&!cardIssues(ruleset.cards[key],ruleset).length);
  return usable.map(([key,weight])=>({key,weight}));
}
export function mobDeck(mob,ruleset,gsidToCard,size=MOB_DECK_SIZE) {
  const pool=mobCardPool(mob,ruleset,gsidToCard);
  if(!pool.length)throw new Error(`${mob.name} 没有可用卡牌`);
  const total=pool.reduce((n,c)=>n+c.weight,0),deck=[];
  for(const c of pool){const copies=Math.min(MAX_CARD_COPIES,Math.max(1,Math.round(c.weight/total*size)));for(let i=0;i<copies;i++)deck.push(c.key);}
  return deck;
}
export function mobBuild(mob,ruleset,gsidToCard) {
  if(!SCHOOLS.includes(mob.school))throw new Error(`${mob.name} 的学派 ${mob.school} 不在五系之内`);
  const deck=mobDeck(mob,ruleset,gsidToCard);
  const schoolMap=obj=>Object.fromEntries(SCHOOLS.map(s=>[s,Number(obj?.[s]??0)]));
  const pips=Math.max(0,mob.startPips|0),powerPips=Math.max(0,mob.startPowerPips|0);
  // Source mobs ignore card level gates; the compiled level is raised to the deck's highest requireLevel so the shared validator accepts it.
  const level=Math.max(1,Math.min(200,mob.level|0),...deck.map(k=>ruleset.cards[k].requireLevel??0));
  return {name:mob.name,school:mob.school,level,mode:'snapshot',kind:'mob',deck,deckCapacity:Math.max(deck.length,14),handSize:7,drawPerRound:7,
    attributes:{maxHP:Math.max(1,mob.hp|0),powerPip:Math.max(0,Math.min(100,mob.powerPip|0)),initialPips:Math.min(pips,7-Math.min(powerPips,7)),initialPowerPips:Math.min(powerPips,7),damage:schoolMap(mob.damage),resist:schoolMap(mob.resist)},
    template:mob.key};
}
export function mobParty(templates,ruleset,gsidToCard){return templates.slice(0,4).map(m=>mobBuild(m,ruleset,gsidToCard));}
