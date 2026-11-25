import {isAttackCard} from './combat_cards_core.js';
import {canEquip} from './adventure_deck_core.js';
// Authored Web challenge arrangements. Exported monster data and old checkpoints stay intact.
const PROFILES={
 'journey:first-watch':{version:2,recommendedLevel:5,companionSlots:2,title:'四波巡夜，四种应对',roles:['charger'],waves:[
  {role:'charger',cycle:['blade','attack']},
  {role:'warden',cycle:['shield','attack','attack']},
  {role:'hexer',cycle:['weakness','attack','attack']},
  {role:'breaker',cycle:['blade','trap','attack']}
 ],steps:['第一波：强化后攻击。可以抢攻，也可以为重击准备护盾或虚弱。','第二波：加盾后连续攻击两回合。观察盾的状态，用小攻击消耗护盾，再安排主攻。','第三波：施加虚弱后连续攻击两回合。虚弱会消耗在适用的攻击上，可以先用小攻击处理，再打主攻。','第四波：先强化，再布置陷阱，随后攻击。准备期可以进攻；若来不及击倒，就为重击做好防护。']},
 'journey:lost-spark':{recommendedLevel:6,title:'双人敌阵：主攻与守护',roles:['charger','warden'],steps:['主攻交替强化与攻击，守护交替加盾与攻击。先消耗护盾，或集中处理守护位，再让主攻打出组合。']},
 'journey:ember-night':{recommendedLevel:50,title:'后期四人敌阵：集火与保护',preparation:'这是后期四人挑战，末波包含 50 级敌人。建议准备四位等级与装备相称的出战单位；只提升主角等级仍可能失利。',roles:['charger','breaker','warden','hexer'],steps:['敌方分别负责强化、陷阱、护盾与虚弱，下一回合集中进攻。观察状态，选择集火目标，并留人为队友防护。']}
};
export function dungeonTacticsProfile(dungeon){return dungeon?.kind==='elite'?PROFILES[dungeon.id]||null:null;}
export function dungeonTacticsVersion(dungeon){return dungeonTacticsProfile(dungeon)?.version||1;}
function scriptedWave(checkpoint,profile){return profile?.waves?.find((_,i)=>checkpoint.encounterId===`${checkpoint.dungeonTacticsId}:floor-${i+1}`);}
export function validDungeonTacticsCheckpoint(checkpoint,dungeon){
 if(checkpoint.dungeonTacticsVersion===undefined)return checkpoint.dungeonTacticsId===undefined;
 const profile=dungeonTacticsProfile(dungeon);
 if(!profile||checkpoint.dungeonTacticsId!==dungeon.id)return false;
 return checkpoint.dungeonTacticsVersion===1||(checkpoint.dungeonTacticsVersion===2&&profile.version===2&&!!scriptedWave(checkpoint,profile));
}
export function dungeonTacticsPreparation(save,content,dungeon,player={deck:save.deck}){
 const profile=dungeonTacticsProfile(dungeon);if(!profile)return null;
 const recommendedLevel=profile.recommendedLevel||dungeon.recommendedLevel;
 const belowLevel=(save.level||1)<recommendedLevel;
 const messages=[{source:belowLevel?'当前 {level} 级，建议 {recommendedLevel} 级。可以先做岛上任务升级，再来挑战。':'当前 {level} 级，建议 {recommendedLevel} 级。等级建议已达到，仍需留意卡组和生命。',vars:{level:save.level||1,recommendedLevel}}];
 if(profile.preparation)messages.push(profile.preparation);
 const school=save.school[0].toUpperCase()+save.school.slice(1);
 let missing=belowLevel;
 for(const [suffix,label]of [['Blade','强化术'],['Trap','陷阱']]){
  const key=`${school}_${school}Damage${suffix}`,lesson=content.learn?.[save.school]?.find(row=>row.key===key);
  const learned=save.cards?.[key]>0,fixed=player.fixedCards?.some(row=>row.key===key&&row.count>0),equipped=player.deck?.some(row=>row.key===key&&row.count>0);
  if(fixed)messages.push({source:'{card}由当前装备附带，已可在战斗中抽到；配合相同学派的攻击使用。',vars:{card:label}});
  else if(equipped)messages.push({source:'{card}已装入当前卡组；配合相同学派的攻击使用。',vars:{card:label}});
  else if(learned){missing=true;messages.push({source:'{card}已学会，尚未装入当前卡组；可到卡组中加入。',vars:{card:label}});}
  else if(Object.values(content.items||{}).some(item=>canEquip(save,item,content)&&[139,140,141].some(id=>content.cardItems?.[item.stats?.[id]]===key))){missing=true;messages.push({source:'{card}可由已拥有的装备附带；到背包比较并穿戴后，即可在战斗中抽到。',vars:{card:label}});}
  else {missing=true;messages.push(lesson?{source:'{card}尚未学会，本学派 {level} 级解锁；课堂借用的卡牌不会带出课堂。',vars:{card:label,level:lesson.level}}:{source:'{card}尚未学会；课堂借用的卡牌不会带出课堂。',vars:{card:label}});}
 }
 const recovery='副本内不会自动恢复生命；可先离开副本，在岛上休息恢复，再进入继续已有进度。';
 if(save.heroHp!==null&&save.heroHp!==undefined)messages.push({source:'当前主角生命 {hp}；'+recovery,vars:{hp:Math.floor(save.heroHp)}});
 else messages.push(recovery);
 if((save.formation||[]).some(id=>id&&save.pets?.[id]?.hunger===0))messages.push('伙伴需有饱食才会恢复生命；饱食耗尽时，可在伙伴面板放入口粮，或先移出阵位休息恢复饱食。');
 const lines=messages.map(message=>typeof message==='string'?message:message.source.replace(/\{(\w+)\}/g,(_,key)=>String(message.vars[key])));
 return {recommendedLevel,missing,lines,messages};
}
export function dungeonTacticsMonsters(templates,checkpoint){
 const profile=[1,2].includes(checkpoint.dungeonTacticsVersion)&&PROFILES[checkpoint.dungeonTacticsId];
 if(!profile)return templates;
 if(checkpoint.dungeonTacticsVersion===2){
  const wave=scriptedWave(checkpoint,profile);
  if(!wave)throw Error('巡夜战术波次无效');
  return templates.map(m=>({...m,dungeonTactic:{version:2,role:wave.role,cycle:wave.cycle}}));
 }
 return templates.map((m,i)=>({...m,dungeonTactic:{version:1,role:profile.roles[i%profile.roles.length]}}));
}
const LABELS={charger:'强化',breaker:'陷阱',warden:'护盾',hexer:'虚弱'};
const ACTION_LABELS={blade:'强化',trap:'陷阱',shield:'护盾',weakness:'虚弱',attack:'攻击'};
export function dungeonTacticPick(template,round,cards){
 const tactic=template.dungeonTactic;
 const role=[1,2].includes(tactic?.version)&&tactic.role;
 if(!LABELS[role])return null;
 const school=template.school[0].toUpperCase()+template.school.slice(1);
 const keys=[...(template.pool||[]).map(row=>row.key),...(template.sequences||[]).flat().map(row=>row.card),...(template.genes||[]).map(row=>row.card),...Object.values(template.cardsets||{}).flat().map(row=>row.key)];
 const attacks=[...new Set(keys)].map(key=>cards[key]).filter(c=>c&&isAttackCard(c));
 const attack=attacks.find(c=>c.spellSchool===template.school)||attacks[0];
 if(!attack)throw Error('战术副本缺少可用攻击：'+template.id);
 if(tactic.version===2){
  const action=tactic.cycle[(round-1)%tactic.cycle.length];
  const planned={blade:`${school}_${school}DamageBlade`,trap:`${school}_${school}DamageTrap`,shield:'Ice_GlobalShield',weakness:'Death_AreaDamageWeakness',attack:attack.key}[action];
  if(!cards[planned])throw Error('巡夜战术缺少卡牌：'+planned);
  const next=tactic.cycle[round%tactic.cycle.length],label=ACTION_LABELS[action];
  return {key:planned,scripted:true,target_hostile:'threat_highest',target_friendly:action==='shield'?'max_max_hp':'self',
   speak:`${label}！下一回合准备${ACTION_LABELS[next]}。`,tacticLabel:label,tacticNext:ACTION_LABELS[next]};
 }
 const preparing=round%2===1;
 const planned={charger:`${school}_${school}DamageBlade`,breaker:`${school}_${school}DamageTrap`,warden:'Ice_GlobalShield',hexer:'Death_AreaDamageWeakness'}[role];
 const key=preparing&&cards[planned]?planned:attack.key;
 return {key,scripted:true,target_hostile:'threat_highest',target_friendly:role==='warden'?'max_max_hp':'self',
  speak:preparing&&key===planned?`${LABELS[role]}准备！下一回合进攻。`:'接招！',
  tacticLabel:preparing&&key===planned?LABELS[role]:'攻击'};
}
// This is the next scheduled action, not a hit or survival guarantee.
export function dungeonEnemyIntentInfo(battle){
 if(battle.finished)return null;
 const units=battle.sides.far.filter(u=>u.hp>0&&u.template?.dungeonTactic);
 if(!units.length)return null;
 const rows=units.map(u=>({name:u.name,...dungeonTacticPick(u.template,battle.turn,battle.resolved.cards)}));
 const labels=[...new Set(rows.map(r=>r.tacticLabel))];
 const scripted=rows.length===1&&rows[0].tacticNext;
 return {kind:labels.includes('攻击')?'heavy':rows.some(r=>r.tacticNext&&r.tacticLabel==='护盾')?'guard':'charge',label:labels.join(' / '),...(scripted?{cardKey:rows[0].key,nextLabel:rows[0].tacticNext}:{}),detail:rows.map(r=>`${r.name}：${r.tacticLabel}${r.tacticNext?`，下一回合${r.tacticNext}`:''}`).join('；')+'。控制、击倒或状态消耗会改变实际结果。'};
}
