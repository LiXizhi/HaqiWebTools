import {isAttackCard} from './combat_cards_core.js';
// Authored Web challenge arrangements. Exported monster data and old checkpoints stay intact.
const PROFILES={
 'journey:first-watch':{version:2,recommendedLevel:5,companionSlots:2,title:'四波巡夜，四种应对',roles:['charger'],waves:[
  {role:'charger',cycle:['blade','attack']},
  {role:'warden',cycle:['shield','attack','attack']},
  {role:'hexer',cycle:['weakness','attack','attack']},
  {role:'breaker',cycle:['blade','trap','attack']}
 ],steps:['第一波：强化后攻击。可以抢攻，也可以为重击准备护盾或虚弱。','第二波：加盾后连续攻击两回合。观察盾的状态，用小攻击消耗护盾，再安排主攻。','第三波：施加虚弱后连续攻击两回合。虚弱会消耗在适用的攻击上，可以先用小攻击处理，再打主攻。','第四波：先强化，再布置陷阱，随后攻击。准备期可以进攻；若来不及击倒，就为重击做好防护。']},
 'journey:lost-spark':{recommendedLevel:6,title:'双人敌阵：主攻与守护',roles:['charger','warden'],steps:['主攻交替强化与攻击，守护交替加盾与攻击。先消耗护盾，或集中处理守护位，再让主攻打出组合。']},
 'journey:ember-night':{recommendedLevel:50,title:'后期四人敌阵：集火与保护',preparation:'这是后期四人挑战，末波包含 50 级敌人。建议准备四位等级与装备相称的出战单位；只提升主角等级仍可能失利。',roles:['charger','breaker','warden','hexer'],steps:['敌方分别负责强化、陷阱、护盾与虚弱，下一回合集中进攻。观察状态，选择集火目标，并留人为队友防护。']},
 'journey:hanzi:stele-trial':{version:2,recommendedLevel:8,companionSlots:2,title:'三波守碑，破蓄破盾',roles:['charger'],waves:[
  {role:'charger',cycle:['blade','attack']},
  {role:'warden',cycle:['shield','attack','attack']},
  {role:'breaker',cycle:['blade','trap','attack']}
 ],steps:['第一波炽壳墨蟹会先强化再重击：可抢先压血，或留好护盾、虚弱接下重击。','第二波石甲守碑虫会举盾护身：先用低费小招破盾，再释放强化后的主力法术。','第三波古林灵穿山会连续布置强化与陷阱：抓紧准备回合进攻，重击前务必防护。']},
 'journey:vault-lamp':{recommendedLevel:12,title:'宝库双人阵：先破守护',roles:['charger','warden'],steps:['主攻交替强化与重击，守护会为队友套盾。优先用小招破盾并集火守护，再集中击败主攻。']},
 'journey:frozen-letter':{recommendedLevel:28,title:'霜原双人阵：解弱破冰盾',roles:['warden','hexer'],steps:['寒冰守护频繁施盾，同伴会施加虚弱。用低费攻击消耗虚弱与护盾后，再打出强化组合。']},
 'journey:sand-echo':{recommendedLevel:32,title:'沙海回声：预判双倍蓄力',roles:['breaker'],steps:['沙海守卫会先设陷阱再重击。利用准备回合叠好强化，在敌人挥出重击前留出护盾或虚弱。']},
 'journey:night-promise':{recommendedLevel:55,title:'幽暗双影：抗压与反击',roles:['hexer','breaker'],steps:['一名敌人用虚弱压制输出，另一名布置陷阱准备爆发。及时清理虚弱状态并优先击倒陷阱手。']},
 'journey:tide:elite-1':{version:2,recommendedLevel:60,companionSlots:2,title:'潮灯三波：看清意图再出手',roles:['charger'],waves:[
  {role:'charger',cycle:['blade','attack']},
  {role:'warden',cycle:['shield','attack','attack']},
  {role:'breaker',cycle:['blade','trap','attack']}
 ],steps:['第一波守卫强化后重击，注意防御窗口。','第二波举盾连攻，用小招破盾后再打高伤。','第三波叠加强化与陷阱，准备回合抢攻并留盾接大招。']},
 'journey:float:elite-1':{version:2,recommendedLevel:70,companionSlots:2,title:'双图测量台：控场与破防',roles:['hexer'],waves:[
  {role:'hexer',cycle:['weakness','attack','attack']},
  {role:'warden',cycle:['shield','attack','attack']},
  {role:'breaker',cycle:['blade','trap','attack']}
 ],steps:['第一波以虚弱开场，先用低费牌清掉虚弱再爆发。','第二波高盾驻守，避免直接交主力大招。','第三波先强化后设陷阱，把握两回合准备期反制。']},
 'journey:sail:elite-1':{version:2,recommendedLevel:80,companionSlots:2,title:'风帆档案室：终章守夜考验',roles:['charger'],waves:[
  {role:'charger',cycle:['blade','attack']},
  {role:'hexer',cycle:['weakness','attack','attack']},
  {role:'breaker',cycle:['blade','trap','attack']}
 ],steps:['第一波蓄力爆发，注意留盾或提前压血。','第二波施放虚弱干扰输出，先清减益再集中攻势。','第三波强化与陷阱连发，利用双单位配合完成收割。']}
};
const TOWER_MILESTONE_MODES=[
 {role:'charger',title:'蓄力守层者',cycle:['blade','attack'],tip:'会先强化再挥出重击；趁蓄力回合抢攻，或留好护盾、虚弱接下重击。'},
 {role:'warden',title:'铁壁守关首领',cycle:['shield','attack','attack'],tip:'会先架起护盾再连续进攻两回合；用低费小招破盾后，再释放主力法术。'},
 {role:'hexer',title:'迷雾控场者',cycle:['weakness','attack','attack'],tip:'会先施加虚弱压制你的输出；先用小攻击消掉虚弱，再打强化组合。'},
 {role:'breaker',title:'破阵试炼首领',cycle:['blade','trap','attack'],tip:'会连续布置强化与陷阱后发动重击；把握两回合准备期压血，并在重击前防护。'}
];
export function towerFloorNumber(encounterId){
 const match=typeof encounterId==='string'&&encounterId.match(/:floor-(\d+)$/);
 return match?Number(match[1]):0;
}
export function towerFloorTactic(dungeon,encounterId){
 if(dungeon?.kind!=='tower')return null;
 const floor=typeof encounterId==='number'?encounterId:towerFloorNumber(encounterId);
 if(!Number.isInteger(floor)||floor<5||floor%5!==0)return null;
 if(Number.isInteger(dungeon.floors)&&floor>dungeon.floors)return null;
 const mode=TOWER_MILESTONE_MODES[Math.floor(floor/5-1)%TOWER_MILESTONE_MODES.length];
 return {...mode,floor,tier:floor%10===0?'boss':'elite'};
}
export function nextTowerMilestone(dungeon,currentFloor=0){
 if(dungeon?.kind!=='tower'||!Number.isInteger(dungeon.floors)||dungeon.floors<5)return null;
 const next=Math.min(dungeon.floors,(Math.floor(Math.max(0,currentFloor)/5)+1)*5);
 if(next<=currentFloor||next%5!==0)return null;
 return towerFloorTactic(dungeon,next);
}
export function dungeonTacticsProfile(dungeon){return dungeon?.kind==='elite'?PROFILES[dungeon.id]||null:null;}
export function dungeonTacticsVersion(dungeon){return dungeonTacticsProfile(dungeon)?.version||1;}
function scriptedWave(checkpoint,profile){return profile?.waves?.find((_,i)=>checkpoint.encounterId===`${checkpoint.dungeonTacticsId}:floor-${i+1}`);}
export function validDungeonTacticsCheckpoint(checkpoint,dungeon){
 if(checkpoint.dungeonTacticsVersion===undefined)return checkpoint.dungeonTacticsId===undefined;
 if(checkpoint.dungeonTacticsVersion===3){
  return dungeon?.kind==='tower'&&checkpoint.dungeonTacticsId===dungeon.id&&!!towerFloorTactic(dungeon,checkpoint.encounterId);
 }
 const profile=dungeonTacticsProfile(dungeon);
 if(!profile||checkpoint.dungeonTacticsId!==dungeon.id)return false;
 return checkpoint.dungeonTacticsVersion===1||(checkpoint.dungeonTacticsVersion===2&&profile.version===2&&!!scriptedWave(checkpoint,profile));
}
export function dungeonTacticsPreparation(save,content,dungeon,player={deck:save.deck}){
 const profile=dungeonTacticsProfile(dungeon);if(!profile)return null;
 const recommendedLevel=profile.recommendedLevel||dungeon.recommendedLevel;
 const belowLevel=(save.level||1)<recommendedLevel;
 const lines=[`当前 ${save.level||1} 级，建议 ${recommendedLevel} 级。${belowLevel?'可以先做岛上任务升级，再来挑战。':'等级建议已达到，仍需留意卡组和生命。'}`];
 if(profile.preparation)lines.push(profile.preparation);
 const school=save.school[0].toUpperCase()+save.school.slice(1);
 let missing=belowLevel;
 for(const [suffix,label]of [['Blade','强化术'],['Trap','陷阱']]){
  const key=`${school}_${school}Damage${suffix}`,lesson=content.learn?.[save.school]?.find(row=>row.key===key);
  const learned=save.cards?.[key]>0,fixed=player.fixedCards?.some(row=>row.key===key&&row.count>0),equipped=player.deck?.some(row=>row.key===key&&row.count>0);
  if(fixed)lines.push(label+'由当前装备附带，已可在战斗中抽到；配合相同学派的攻击使用。');
  else if(equipped)lines.push(label+'已装入当前卡组；配合相同学派的攻击使用。');
  else if(learned){missing=true;lines.push(label+'已学会，尚未装入当前卡组；可到卡组中加入。');}
  else {missing=true;lines.push(label+'尚未学会'+(lesson?`，本学派 ${lesson.level} 级解锁`:'')+'；课堂借用的卡牌不会带出课堂。');}
 }
 const recovery='副本内不会自动恢复生命；可先离开副本，在岛上休息恢复，再进入继续已有进度。';
 if(save.heroHp!==null&&save.heroHp!==undefined)lines.push(`当前主角生命 ${Math.floor(save.heroHp)}；`+recovery);
 else lines.push(recovery);
 return {recommendedLevel,missing,lines};
}
export function dungeonTacticsMonsters(templates,checkpoint){
 if(checkpoint.dungeonTacticsVersion===3){
  const tactic=towerFloorTactic({kind:'tower',id:checkpoint.dungeonTacticsId},checkpoint.encounterId);
  if(!tactic)throw Error('试炼塔守关战术无效');
  return templates.map((m,i)=>({...m,dungeonTactic:{version:3,role:i===0?tactic.role:TOWER_MILESTONE_MODES[(Math.floor(tactic.floor/5-1)+i)%TOWER_MILESTONE_MODES.length].role,cycle:i===0?tactic.cycle:TOWER_MILESTONE_MODES[(Math.floor(tactic.floor/5-1)+i)%TOWER_MILESTONE_MODES.length].cycle}}));
 }
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
 const role=[1,2,3].includes(tactic?.version)&&tactic.role;
 if(!LABELS[role])return null;
 const school=template.school[0].toUpperCase()+template.school.slice(1);
 const keys=[...(template.pool||[]).map(row=>row.key),...(template.sequences||[]).flat().map(row=>row.card),...(template.genes||[]).map(row=>row.card),...Object.values(template.cardsets||{}).flat().map(row=>row.key)];
 const attacks=[...new Set(keys)].map(key=>cards[key]).filter(c=>c&&isAttackCard(c));
 const attack=attacks.find(c=>c.spellSchool===template.school)||attacks[0];
 if(!attack)throw Error('战术副本缺少可用攻击：'+template.id);
 if(tactic.version===2||tactic.version===3){
  const action=tactic.cycle[(round-1)%tactic.cycle.length];
  let planned={blade:`${school}_${school}DamageBlade`,trap:`${school}_${school}DamageTrap`,shield:'Ice_GlobalShield',weakness:'Death_AreaDamageWeakness',attack:attack.key}[action];
  let actualAction=action;
  if(!cards[planned]){
   if(tactic.version===3){
    planned=action==='blade'?'Ice_GlobalShield':action==='trap'?'Death_AreaDamageWeakness':attack.key;
    actualAction=planned==='Ice_GlobalShield'?'shield':planned==='Death_AreaDamageWeakness'?'weakness':'attack';
   }
   if(!cards[planned])throw Error('巡夜战术缺少卡牌：'+planned);
  }
  const next=tactic.cycle[round%tactic.cycle.length],label=ACTION_LABELS[actualAction];
  return {key:planned,scripted:true,target_hostile:'threat_highest',target_friendly:actualAction==='shield'?'max_max_hp':'self',
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
