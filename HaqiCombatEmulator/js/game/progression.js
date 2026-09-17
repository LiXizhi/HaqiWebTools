// Pure player progression rules: profile creation, experience, HP, card knowledge and deck limits.
// Experience curve and card unlock levels are documented approximations (no table exists in config/Aries).
import {baseHP,SCHOOLS} from '../rules/formulas.js';
import {cardIssues} from '../engine/coverage.js';
import {CURRENCY} from './data.js';
export const MAX_LEVEL=50;
export const PLAYER_CARD_EXCLUDE=/Rune|Pet|_Green|_Blue|_Purple|_Orange|_Crazy|_gold|OutStanding|_adv|_Adv|Mob|Boss|VIP|Binding|Power|Accuracy\d|low_level|Stance|Dominance/;
// Placeholder curve (the server-side level table is not in the repo): 4·L²+26 so a level-L mob
// (experience_pts ≈ L²/2, doubled by the kids global_exp_bonus) is worth roughly one eighth of a level,
// while island quests (≈1100–1200 exp at Lv 10–20) carry most of the progression as in the source.
export const expToNext=level=>level>=MAX_LEVEL?Infinity:4*level*level+26;
export function createProfile({version='kids',name,school,gender}) {
  if(!SCHOOLS.includes(school))throw new Error('请选择魔法学派');
  if(!['boy','girl'].includes(gender))throw new Error('请选择角色形象');
  name=String(name??'').trim().slice(0,12)||'小哈奇';
  return {schemaVersion:1,version,name,school,gender,level:1,exp:0,world:'61HaqiTown',pos:null,inventory:{[CURRENCY.coin]:50},deck:[],quests:{active:{},finished:{}},stats:{kills:0,defeats:0,battles:0,questsDone:0,playtime:0},createdAt:Date.now(),savedAt:0};
}
export function addExp(profile,amount) {
  let gained=Math.max(0,Math.floor(amount)),levels=0;
  profile.exp+=gained;
  while(profile.level<MAX_LEVEL&&profile.exp>=expToNext(profile.level)){profile.exp-=expToNext(profile.level);profile.level++;levels++;}
  if(profile.level>=MAX_LEVEL)profile.exp=Math.min(profile.exp,expToNext(MAX_LEVEL-1));
  return {gained,levels};
}
export const playerMaxHP=(profile)=>baseHP(profile.version,profile.school,profile.level);
export const playerPowerPip=profile=>Math.min(60,5+profile.level);
export function addItem(profile,gsid,count=1){profile.inventory[gsid]=(profile.inventory[gsid]??0)+count;if(profile.inventory[gsid]<=0)delete profile.inventory[gsid];return profile.inventory[gsid]??0;}
export const itemCount=(profile,gsid)=>profile.inventory[gsid]??0;
export function canAfford(profile,cost){return cost.every(c=>itemCount(profile,c.gsid)>=c.count);}
export function pay(profile,cost){if(!canAfford(profile,cost))throw new Error('货币不足');for(const c of cost)addItem(profile,c.gsid,-c.count);}
// Cards a player of this school and level may put into the deck. Unlock level follows the key's
// _LevelN tier (N*5-4), the Level0_NN starter ladder, LevelX at 20, utility cards by pip cost.
export function unlockLevel(card) {
  const m=/_Level(\d+)(?:_(\d+))?/.exec(card.key);
  if(/_LevelX/.test(card.key))return 20;
  if(m){const n=Number(m[1]);if(n===0&&m[2])return Math.max(1,1+Math.round((Number(m[2])-45)/5));if(n===0)return 1;return Math.max(1,n*5-4);}
  return card.pipcost<=0?4:card.pipcost*5;
}
export function knownCards(profile,ruleset) {
  const prefix=profile.school[0].toUpperCase()+profile.school.slice(1)+'_';
  return Object.values(ruleset.cards).filter(c=>c.school===profile.school&&c.key.startsWith(prefix)&&c.gsids?.length&&!PLAYER_CARD_EXCLUDE.test(c.key)&&!cardIssues(c,ruleset).length&&unlockLevel(c)<=profile.level).sort((a,b)=>unlockLevel(a)-unlockLevel(b)||a.pipcost-b.pipcost||a.key.localeCompare(b.key));
}
export const deckCapacity=profile=>Math.min(40,14+Math.floor((profile.level-1)/4)*2);
export const maxCopies=profile=>Math.min(6,3+Math.floor((profile.level-1)/10));
export function defaultDeck(profile,ruleset) {
  const known=knownCards(profile,ruleset),cap=deckCapacity(profile),copies=maxCopies(profile),deck=[];
  const attacks=known.filter(c=>/Attack/.test(c.type)),others=known.filter(c=>!/Attack/.test(c.type));
  for(const pool of [attacks,others])for(let round=0;round<copies&&deck.length<cap;round++)for(const c of pool){if(deck.length>=cap)break;if(deck.filter(k=>k===c.key).length<copies)deck.push(c.key);}
  return deck;
}
export function validateDeck(profile,ruleset,deck) {
  const known=new Set(knownCards(profile,ruleset).map(c=>c.key)),cap=deckCapacity(profile),copies=maxCopies(profile),counts={};
  for(const key of deck){if(!known.has(key))return `未掌握卡牌 ${key}`;counts[key]=(counts[key]??0)+1;if(counts[key]>copies)return `${ruleset.cards[key].name??key} 超过 ${copies} 张`;}
  if(deck.length>cap)return `卡组超过 ${cap} 张`;
  if(!deck.length)return '卡组为空';
  return null;
}
export function ensureDeck(profile,ruleset){if(validateDeck(profile,ruleset,profile.deck))profile.deck=defaultDeck(profile,ruleset);return profile.deck;}
export function playerBuild(profile,ruleset) {
  ensureDeck(profile,ruleset);
  return {name:profile.name,school:profile.school,level:profile.level,mode:'snapshot',deck:[...profile.deck],deckCapacity:Math.max(deckCapacity(profile),profile.deck.length),handSize:7,drawPerRound:7,kind:'player',recycleDeck:true,
    attributes:{maxHP:playerMaxHP(profile),powerPip:playerPowerPip(profile),initialPips:1,initialPowerPips:profile.level>=10?1:0,damage:{},resist:{}}};
}
