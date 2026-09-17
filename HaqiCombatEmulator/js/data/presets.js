import {SCHOOLS,SCHOOL_NAMES} from '../rules/formulas.js';
import {cardIssues} from '../engine/coverage.js';
export function legacyDefaultBuild(school,ruleset) {
  // Explicit laboratory presets, not a claim about real player deck distributions.
  const eligible=Object.values(ruleset.cards).filter(c=>c.school===school&&c.requireLevel<=50&&!cardIssues(c,ruleset).length&&!/Rune|Pet|_Green|_Blue|_Purple|_Orange|_Crazy|_gold|OutStanding/.test(c.key));
  const attacks=eligible.filter(c=>['SingleAttack','SingleAttackWithDOT','SingleAttackWithLifeTap'].includes(c.type)&&c.pipcost>0&&c.pipcost<=4&&typeof c.params.damage_min==='number').sort((a,b)=>a.pipcost-b.pipcost||a.key.localeCompare(b.key,'en'));
  const area=eligible.find(c=>['AreaAttack','AreaAttackWithDOT'].includes(c.type)&&c.pipcost>0&&c.pipcost<=6);
  const heal=eligible.find(c=>c.type==='SingleHeal'&&c.pipcost>0&&c.pipcost<=4);
  const selected=[attacks[0],attacks.find(c=>c.pipcost>=3)??attacks[1],area,heal].filter(Boolean);
  if(!selected.length)throw new Error(`缺少 ${school} 可用基准卡组`);
  return {name:SCHOOL_NAMES[school],school,level:50,mode:'snapshot',attributes:{maxHP:5000,powerPip:50,damage:30,resist:15},deck:selected.flatMap(c=>Array(8).fill(c.key)),runes:[],pet:null};
}
export function defaultBuild(school,ruleset) {
  const build=legacyDefaultBuild(school,ruleset),prefix=school[0].toUpperCase()+school.slice(1);
  const keys=[...new Set(build.deck)];
  for(const key of [`${prefix}_${prefix}DamageBlade`,school==='ice'?'Ice_GlobalShield':`${prefix}_${prefix}GreatShield`,`${prefix}_${prefix}DamageTrap`,...({fire:['Fire_AreaAccuracyWeakness'],death:['Death_AreaDamageWeakness'],life:['Life_HealBlade'],storm:['Storm_AreaDamageTrap'],ice:['Ice_SingleStun']}[school])]) {
    const c=ruleset.cards[key];if(!c||cardIssues(c,ruleset).length)throw new Error(`默认辅助技能缺失或不可执行：${key}`);keys.push(key);
  }
  return {...build,deck:keys.flatMap(key=>Array(4).fill(key)),deckCapacity:40,handSize:8,drawPerRound:8,deckPreset:'balanced-v1'};
}
export function autoConfigureDeck(build,ruleset) {
  const preset=defaultBuild(build.school,ruleset),capacity=build.deckCapacity??40;
  if(!Number.isInteger(capacity)||capacity<1||capacity>200)throw new Error('卡包容量须为 1–200');
  const keys=[...new Set(preset.deck)].filter(key=>ruleset.cards[key].requireLevel<=(build.level??50));
  // Round-robin copies preserve skill variety in smaller bags.
  const deck=[];for(let copy=0;copy<4;copy++)for(const key of keys)if(deck.length<capacity)deck.push(key);
  return {...build,deck,deckPreset:'balanced-v1'};
}
export function upgradeLegacyDecks(scenario,ruleset) {
  let count=0;const next=structuredClone(scenario);
  for(const team of next.teams)for(const build of team){
    const old=legacyDefaultBuild(build.school,ruleset).deck;
    if(JSON.stringify(build.deck)===JSON.stringify(old)){Object.assign(build,autoConfigureDeck(build,ruleset));count++;}
  }
  return {scenario:next,count};
}
export function defaultScenario(ruleset,size=4) {
  return {schemaVersion:1,size,firstSide:0,teams:[Array.from({length:size},(_,i)=>defaultBuild(SCHOOLS[i],ruleset)),Array.from({length:size},(_,i)=>defaultBuild(SCHOOLS[(i+2)%5],ruleset))]};
}
