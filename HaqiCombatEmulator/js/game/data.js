import {loadRuleset} from '../data/loader.js';
import {loadAssetIndex} from './assets/cdn.js';
async function json(rel) {
  const response=await fetch(new URL(rel,import.meta.url));
  if(!response.ok)throw new Error(`游戏数据加载失败 ${rel} (${response.status})`);
  const data=await response.json();
  if(data.schemaVersion!==1||!('data' in data))throw new Error(`游戏数据格式不兼容 ${rel}`);
  return data.data;
}
// Loads the exported config/Aries snapshot plus the combat ruleset. All files are static JSON.
export async function loadGameData(version='kids') {
  if(!['kids','teen'].includes(version))throw new Error('未知版本');
  const base=`../../data/game/${version}/`;
  const [ruleset,worlds,npcs,arenas,mobs,quests,shops,hp]=await Promise.all([loadRuleset(version),json(base+'worlds.json'),json(base+'npcs.json'),json(base+'arenas.json'),json(base+'mobs.json'),json(base+'quests.json'),json(base+'shops.json'),json(base+'hp.json'),loadAssetIndex()]);
  return buildGameData(version,{ruleset,worlds,npcs,arenas,mobs,quests,shops,hp});
}
// Pure assembly step (also used by Node tests, which read the same JSON from disk).
export function buildGameData(version,{ruleset,worlds,npcs,arenas,mobs,quests,shops,hp}) {
  const gsidToCard={};
  for(const card of Object.values(ruleset.cards))for(const gsid of card.gsids??[])gsidToCard[gsid]=card.key;
  const mobByTemplate={};
  for(const mob of Object.values(mobs))mobByTemplate[mob.template]=mob;
  // Templates that actually stand in an arena somewhere; kill/drop goals on anything else can never progress in 2D.
  const placedTemplates=new Set(Object.values(arenas).flat().flatMap(a=>a.mobs).filter(t=>mobByTemplate[t]));
  return {version,ruleset,worlds,npcs,arenas,mobs,mobByTemplate,placedTemplates,quests:quests.quests,goals:quests.goals,customGoals:quests.customGoals,names:quests.names,shops,hp,gsidToCard,
    questById:Object.fromEntries(quests.quests.map(q=>[q.id,q])),worldByName:Object.fromEntries(worlds.map(w=>[w.name,w]))};
}
export function itemName(data,gsid){return data.ruleset.items[gsid]?.name??data.names[gsid]??`物品 ${gsid}`;}
export function itemIcon(data,gsid){return data.ruleset.items[gsid]?.icon??null;}
export const CURRENCY={exp:113,coin:100,magicBean:984,godBean:17213};
