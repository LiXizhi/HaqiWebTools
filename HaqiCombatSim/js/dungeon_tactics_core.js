import {isAttackCard} from './combat_cards_core.js';
import {canEquip} from './adventure_deck_core.js';
import {validTargets} from './combat_arena_core.js';
import {threatTarget} from './combat_threat_core.js';
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
 'journey:dream-feather':{recommendedLevel:10,title:'梦境三影：破盾清弱',roles:['warden','hexer','charger'],preparation:'建议携带两位出战战宠或伙伴组成三人阵容。留意敌方护盾与虚弱的消耗顺序。',steps:['梦境敌阵分别负责架起护盾、施加虚弱与蓄力强攻：先用低费小招清理虚弱和护盾，再集火击败蓄力位。']},
 'journey:gold-bell':{recommendedLevel:15,title:'金鬃三卫：断蓄与破防',roles:['charger','warden','breaker'],preparation:'火鸟岛进阶三人挑战，建议先编排两位战宠或伙伴同行；完整通关可赢取 30 格精良口袋。',steps:['金鬃守卫与头目分别负责强化蓄力、套盾掩护与布置陷阱：趁准备回合集火陷阱主攻位，并在重击回合前留好护盾或虚弱。']},
 'journey:frozen-letter':{recommendedLevel:28,title:'霜原双人阵：解弱破冰盾',roles:['warden','hexer'],steps:['寒冰守护频繁施盾，同伴会施加虚弱。用低费攻击消耗虚弱与护盾后，再打出强化组合。']},
 'journey:storm-compass':{recommendedLevel:35,title:'风眼四人阵：分工与集火',roles:['charger','warden','hexer','breaker'],preparation:'寒冰岛高阶四人敌阵，敌方四系协同出战。建议满编四位单位，兼顾破盾、减伤与集火输出。',steps:['敌方四人分别负责强化、护盾、虚弱与陷阱：安排队友保护后排，先用小招拆掉护盾和虚弱，再集中击破陷阱与主攻位。']},
 'journey:sand-echo':{recommendedLevel:32,title:'沙海回声：预判双倍蓄力',roles:['breaker'],steps:['沙海守卫会先设陷阱再重击。利用准备回合叠好强化，在敌人挥出重击前留出护盾或虚弱。']},
 'journey:oasis-key':{recommendedLevel:40,title:'古墓三卫：拆陷阱与防爆发',roles:['breaker','hexer','warden'],preparation:'沙漠岛高阶三人秘境，完整通关可获 50 格精良口袋。建议携带两位高成长战宠或伙伴协同应战。',steps:['古墓守卫交替布置陷阱、施加虚弱并架盾拖延：及时用低费法术清掉自身虚弱与敌方护盾，在陷阱爆发回合前留盾减伤。']},
 'journey:night-promise':{recommendedLevel:55,title:'幽暗双影：抗压与反击',roles:['hexer','breaker'],steps:['一名敌人用虚弱压制输出，另一名布置陷阱准备爆发。及时清理虚弱状态并优先击倒陷阱手。']},
 'journey:marsh-beacon':{recommendedLevel:55,title:'深沼四领主：抗弱破防决战',roles:['warden','hexer','breaker','charger'],preparation:'幽暗岛终阶四人秘境，敌方领主生命与爆发极高。建议满编高等级阵容并备足护盾或恢复卡牌。',steps:['铁壳王与瘟疫领主轮流架盾、施放虚弱并叠陷阱强攻：稳住全队血线，优先集火击倒陷阱手与蓄力领主。']},
 'journey:tide:elite-1':{version:2,recommendedLevel:60,companionSlots:2,title:'潮灯三波：看清意图再出手',roles:['charger'],waves:[
  {role:'charger',cycle:['blade','attack']},
  {role:'warden',cycle:['shield','attack','attack']},
  {role:'breaker',cycle:['blade','trap','attack']}
 ],steps:['第一波守卫强化后重击，注意防御窗口。','第二波举盾连攻，用小招破盾后再打高伤。','第三波叠加强化与陷阱，准备回合抢攻并留盾接大招。']},
 'journey:tide:elite-2':{recommendedLevel:60,title:'潮信五波：双守卫协防与强攻',preparation:'潮汐岛 60 级终阶五波双敌挑战，完整通关可获本系「潘多拉·终极进化灵盾」。建议携带高成长战宠并备足破盾与护盾卡牌。',roles:['charger','warden'],steps:['每波两名潮汐守卫分别负责强化重击与全体护盾：先用低费法术破除护盾，再集中火力击倒主攻位。','后半程海灯守卫伤害极高，在双敌蓄力回合提前架盾或施加虚弱。']},
 'journey:float:elite-1':{version:2,recommendedLevel:70,companionSlots:2,title:'双图测量台：控场与破防',roles:['hexer'],waves:[
  {role:'hexer',cycle:['weakness','attack','attack']},
  {role:'warden',cycle:['shield','attack','attack']},
  {role:'breaker',cycle:['blade','trap','attack']}
 ],steps:['第一波以虚弱开场，先用低费牌清掉虚弱再爆发。','第二波高盾驻守，避免直接交主力大招。','第三波先强化后设陷阱，把握两回合准备期反制。']},
 'journey:float:elite-2':{recommendedLevel:70,title:'瀑下空白图：双敌压制与破阵',preparation:'浮岸岛 70 级终阶五波双敌挑战，完整通关可获全学派「亚瑟君王战甲」（+2000 生命）。建议满编高阶阵容并留意虚弱与陷阱叠加。',roles:['hexer','breaker'],steps:['两名守卫轮流施加虚弱并布置陷阱准备重击：及时用小招清掉自身虚弱，避免主力大招被压低伤害。','优先集火布置陷阱的一侧，并在敌人重击回合前为前排留出护盾。']},
 'journey:sail:elite-1':{version:2,recommendedLevel:80,companionSlots:2,title:'风帆档案室：终章守夜考验',roles:['charger'],waves:[
  {role:'charger',cycle:['blade','attack']},
  {role:'hexer',cycle:['weakness','attack','attack']},
  {role:'breaker',cycle:['blade','trap','attack']}
 ],steps:['第一波蓄力爆发，注意留盾或提前压血。','第二波施放虚弱干扰输出，先清减益再集中攻势。','第三波强化与陷阱连发，利用双单位配合完成收割。']},
 'journey:sail:elite-2':{recommendedLevel:80,title:'白帆终夜：五波双敌巅峰对决',preparation:'风帆岛 80 级最高难度五波双敌秘境，完整通关可获本系毕业「潘多拉五系法杖」（+50% 本系伤害与 10% 暴击）。建议穿齐高阶装备并满编四位单位应战。',roles:['breaker','warden'],steps:['每波双敌分别负责布置陷阱强攻与高频护盾掩护：先用小招破盾，再借队友强化与陷阱组合快速减员。','末波归帆塔双守卫续航能力极强，稳住血线后逐个击破即可登顶。']}
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
 const support=!attack&&[...new Set(keys)].map(key=>cards[key]).find(c=>c&&(c.key==='Ice_GlobalShield'||String(c.key).includes('Heal')));
 if(!attack&&!support)throw Error('战术副本缺少可用攻击：'+template.id);
 if(tactic.version===2||tactic.version===3){
  const fallbackKey=(attack||support).key;
  const action=tactic.cycle[(round-1)%tactic.cycle.length];
  let planned={blade:`${school}_${school}DamageBlade`,trap:`${school}_${school}DamageTrap`,shield:'Ice_GlobalShield',weakness:'Death_AreaDamageWeakness',attack:fallbackKey}[action];
  let actualAction=action;
  if(!cards[planned]){
   if(tactic.version===3){
    planned=action==='blade'?'Ice_GlobalShield':action==='trap'?'Death_AreaDamageWeakness':fallbackKey;
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
 if(!attack){
  const useRole=preparing&&cards[planned];
  const key=useRole?planned:support.key;
  const heal=String(key).includes('Heal');
  return {key,scripted:true,target_hostile:'threat_highest',target_friendly:heal?'min_hp':key==='Ice_GlobalShield'?'max_max_hp':'self',
   speak:useRole?`${LABELS[role]}准备！下一回合支援同伴。`:'守护同伴！',
   tacticLabel:useRole?LABELS[role]:(heal?'恢复':'护盾')};
 }
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
 const card=rows.length===1&&battle.resolved.cards[rows[0].key];
 const targets=card&&isAttackCard(card)&&!/^Area|^Arena/.test(card.type)?validTargets(battle,units[0],card):[];
 const target=battle.threatRulesVersion>=1?threatTarget(units[0],targets):targets[0];
 return {kind:labels.includes('攻击')?'heavy':rows.some(r=>r.tacticNext&&r.tacticLabel==='护盾')?'guard':'charge',label:labels.join(' / '),...(card?{cardKey:rows[0].key}:{}),...(scripted?{nextLabel:rows[0].tacticNext}:{}),...(target?{targetId:target.id}:{}),detail:rows.map(r=>`${r.name}：${r.tacticLabel}${r.tacticNext?`，下一回合${r.tacticNext}`:''}`).join('；')+(target?`，当前瞄准${target.name}`:'')+'。仇恨、控制、击倒或状态消耗会改变实际结果。'};
}
