import {isAttackCard} from './combat_cards_core.js';
// Authored Web challenge arrangements. Exported monster data and old checkpoints stay intact.
const PROFILES={
 'journey:first-watch':{recommendedLevel:5,title:'读懂蓄力，接住重击',roles:['charger'],steps:['对手一回合强化，一回合攻击。准备阶段可以进攻，也可以为下一击准备虚弱或护盾。']},
 'journey:lost-spark':{recommendedLevel:6,title:'双人敌阵：主攻与守护',roles:['charger','warden'],steps:['主攻交替强化与攻击，守护交替加盾与攻击。先消耗护盾，或集中处理守护位，再让主攻打出组合。']},
 'journey:ember-night':{recommendedLevel:50,title:'后期四人敌阵：集火与保护',preparation:'这是后期四人挑战，末波包含 50 级敌人。建议准备四位等级与装备相称的出战单位；只提升主角等级仍可能失利。',roles:['charger','breaker','warden','hexer'],steps:['敌方分别负责强化、陷阱、护盾与虚弱，下一回合集中进攻。观察状态，选择集火目标，并留人为队友防护。']}
};
export function dungeonTacticsProfile(dungeon){return dungeon?.kind==='elite'?PROFILES[dungeon.id]||null:null;}
export function dungeonTacticsPreparation(save,content,dungeon){
 const profile=dungeonTacticsProfile(dungeon);if(!profile)return null;
 const recommendedLevel=profile.recommendedLevel||dungeon.recommendedLevel;
 const belowLevel=(save.level||1)<recommendedLevel;
 const lines=[`当前 ${save.level||1} 级，建议 ${recommendedLevel} 级。${belowLevel?'可以先做岛上任务升级，再来挑战。':'等级建议已达到，仍需留意卡组和生命。'}`];
 if(profile.preparation)lines.push(profile.preparation);
 const school=save.school[0].toUpperCase()+save.school.slice(1);
 let missing=belowLevel;
 for(const [suffix,label]of [['Blade','强化术'],['Trap','陷阱']]){
  const key=`${school}_${school}Damage${suffix}`,lesson=content.learn?.[save.school]?.find(row=>row.key===key);
  const learned=save.cards?.[key]>0,equipped=learned&&save.deck?.some(row=>row.key===key&&row.count>0);
  if(equipped)lines.push(label+'已装入当前卡组；配合相同学派的攻击使用。');
  else if(learned){missing=true;lines.push(label+'已学会，尚未装入当前卡组；可到卡组中加入。');}
  else {missing=true;lines.push(label+'尚未学会'+(lesson?`，本学派 ${lesson.level} 级解锁`:'')+'；课堂借用的卡牌不会带出课堂。');}
 }
 const recovery='副本内不会自动恢复生命；可先离开副本，在岛上休息恢复，再进入继续已有进度。';
 if(save.heroHp!==null&&save.heroHp!==undefined)lines.push(`当前主角生命 ${Math.floor(save.heroHp)}；`+recovery);
 else lines.push(recovery);
 return {recommendedLevel,missing,lines};
}
export function dungeonTacticsMonsters(templates,checkpoint){
 const profile=checkpoint.dungeonTacticsVersion===1&&PROFILES[checkpoint.dungeonTacticsId];
 if(!profile)return templates;
 return templates.map((m,i)=>({...m,dungeonTactic:{version:1,role:profile.roles[i%profile.roles.length]}}));
}
const LABELS={charger:'强化',breaker:'陷阱',warden:'护盾',hexer:'虚弱'};
export function dungeonTacticPick(template,round,cards){
 const role=template.dungeonTactic?.version===1&&template.dungeonTactic.role;
 if(!LABELS[role])return null;
 const school=template.school[0].toUpperCase()+template.school.slice(1);
 const keys=[...(template.pool||[]).map(row=>row.key),...(template.sequences||[]).flat().map(row=>row.card),...(template.genes||[]).map(row=>row.card),...Object.values(template.cardsets||{}).flat().map(row=>row.key)];
 const attacks=[...new Set(keys)].map(key=>cards[key]).filter(c=>c&&isAttackCard(c));
 const attack=attacks.find(c=>c.spellSchool===template.school)||attacks[0];
 if(!attack)throw Error('战术副本缺少可用攻击：'+template.id);
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
 return {kind:labels.includes('攻击')?'heavy':'charge',label:labels.join(' / '),detail:rows.map(r=>`${r.name}：${r.tacticLabel}`).join('；')+'。控制、击倒或状态消耗会改变实际结果。'};
}
