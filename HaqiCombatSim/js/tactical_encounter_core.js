import {canCast,isAlive,payCard,setCooldown,validateCooldown,appendWard,appendCharm} from './combat_unit_core.js';
import {isAttackCard,expectedBaseDamage} from './combat_cards_core.js';
import {validTargets} from './combat_arena_core.js';
import {canAffordCard,isOwnSchoolCost,costPips} from './combat_formulas_core.js';
import {analyzeDecision,chooseDecision} from './battle_ai/inference_core.js';
import {observeBattle,haqiRulesAdapter,cardSemantics} from './battle_ai/haqi_adapter_core.js';
import {numericFromSection,splitCardList} from './combat_card_targeting_core.js';

// Base spell values, not a promise of final HP loss: no RNG or hidden state is read.
export function tacticalEffectDetails(card,resolved,caster){
 const p=card.params||{},cost=costPips({...caster.pips},card.pipcost,isOwnSchoolCost(card.spellSchool,caster.school,resolved.version),resolved.version);
 const range=(min,max)=>min===undefined?null:{min:numericFromSection(min,cost),max:numericFromSection(max??min,cost)};
 const effects={basis:'base',damage:range(p.damage_min,p.damage_max),damagePercent:card.type==='SingleAttackWithPercent'?Number(p.damage_percent||0):null,damagePercentBasis:card.type==='SingleAttackWithPercent'?'targetCurrentHp':null,dot:splitCardList(p.dots).map(v=>numericFromSection(v,cost)),heal:range(p.heal_min,p.heal_max),hot:splitCardList(p.hots).map(v=>numericFromSection(v,cost)),modifiers:[]};
 for(const [kind,ids,table] of [['ward',p.ward??p.wards,resolved.wards],['charm',p.charm??p.charms,resolved.charms]])for(const id of splitCardList(ids)){
  const status=table?.[id];if(status?.boost_damage!==undefined)effects.modifiers.push({kind,id:Number(id),damagePercent:Number(status.boost_damage),school:status.school||status.spell_school||'all'});
 }
 const baseAccuracy=Number(card.accuracy);
 const fmt=r=>r.min===r.max?String(r.min):`${r.min}–${r.max}`,parts=[];
 if(Number.isFinite(baseAccuracy))parts.push(`卡牌基础命中率${baseAccuracy}%`);
 if(effects.damagePercent!==null)parts.push(`即时：目标当前生命的${effects.damagePercent}%`);
 else if(effects.damage)parts.push(`即时伤害${fmt(effects.damage)}`);
 if(effects.dot.length)parts.push(`持续${effects.dot.length}次：${effects.dot.map(Math.abs).join('/')}`);
 if(effects.heal)parts.push(`即时治疗${fmt(effects.heal)}`);
 if(effects.hot.length)parts.push(`持续治疗${effects.hot.length}次：${effects.hot.join('/')}`);
 for(const m of effects.modifiers)parts.push(`${m.kind==='ward'?'下次匹配受伤':'下次匹配攻击'}${m.damagePercent>=0?'+':''}${m.damagePercent}%`);
 if(effects.damage||effects.dot.length)parts.push('伤害未计强化、虚弱、护盾与抗性；实际命中时结算');
 const mitigationDetail=effects.dot.length?'护盾只作用于下一段匹配伤害，触发后消耗；施法时的强化/虚弱同时影响即时与后续持续伤害，之后新增虚弱不改变已有持续伤害。':effects.damage?'护盾作用于本次匹配受伤；强化/虚弱作用于施法时的攻击。':'';
 return {baseAccuracy,effects,effectDetail:parts.length?`基础值 · ${parts.join('；')}`:'',mitigationDetail};
}

// Authored encounter policy only: damage, cost, accuracy and status consumption
// stay in the native card engine. Never inspect a player's hand or decision.
const emit=(a,e)=>{const event={turn:a.turn,...e};a.events.push(event);a.onEvent?.(event);};
const negativeWard=(a,u)=>u.wards.some(w=>Number(a.resolved.wards[w.id]?.boost_damage)<0);
const positiveCharm=(a,u)=>u.charms.some(id=>Number(a.resolved.charms[id]?.boost_damage)>0);
const weakest=units=>[...units].sort((x,y)=>x.hp-y.hp||x.slot-y.slot)[0];
// Challenge-local copies retain the native spell/status machinery. Original
// player cards and the shared dataset never receive these stronger modifiers.
export function applyTacticalBalance(resolved,spec,defaults){
 if(!spec)return;
 const rules={};
 for(const key of ['preparationBoost','counterBoost','focusWeight']){
  const value=spec[key]??defaults[key];
  if(!Number.isFinite(value)||value<0||value>200)throw Error('战术强化参数无效');
  rules[key]=value;
 }
 rules.preparationShield=spec.preparationShield??defaults.preparationShield;
 rules.focusFreeAttack=spec.focusFreeAttack??defaults.focusFreeAttack;
 if(typeof rules.focusFreeAttack!=='boolean')throw Error('战术集火参数无效');
 if(typeof rules.preparationShield!=='boolean')throw Error('战术护盾参数无效');
 rules.preparationWard=Number(splitCardList(resolved.cards.Ice_GlobalShield.params.wards)[0]);
 const base=resolved.cards.Fire_FireDamageBlade_Adv,source=splitCardList(base.params.charms??base.params.charm)[0];
 resolved.charms={...resolved.charms,900011:{...resolved.charms[source],id:900011,boost_damage:rules.preparationBoost,desc:`下次火焰攻击+${rules.preparationBoost}%`}};
 rules.counterCharms={};
 for(const [index,school] of ['fire','ice','storm','life','death'].entries()){
  const title=school[0].toUpperCase()+school.slice(1),card=resolved.cards[`${title}_${title}DamageBlade`];
  const native=resolved.charms[splitCardList(card.params.charms??card.params.charm)[0]],id=900100+index;
  rules.counterCharms[school]=id;
  resolved.charms[id]={...native,id,boost_damage:rules.counterBoost,desc:`反制准备：下次本系攻击+${rules.counterBoost}%`};
 }
 resolved.cards={...resolved.cards,Fire_FireDamageBlade_Adv:{...base,params:{...base.params,charms:900011}}};
 resolved.tacticalEncounter=rules;
}
const preparationKey=(a,u)=>a.resolved.tacticalEncounter&&u.school==='fire'?'Fire_FireDamageBlade_Adv':`${u.school[0].toUpperCase()+u.school.slice(1)}_${u.school[0].toUpperCase()+u.school.slice(1)}DamageBlade`;
export function configureTacticalEncounter(a,spec){
 if(!spec)return;
 if(spec.version!==1||!['normal','elite','boss'].includes(spec.id))throw Error('战术挑战规则版本无效');
 const phaseThreshold=spec.phaseThreshold??0.5;
 if(!Number.isFinite(phaseThreshold)||phaseThreshold<=0||phaseThreshold>=1)throw Error('首领相变阈值无效');
 a.tacticalEncounter={version:1,id:spec.id,phaseThreshold,phase:1,intents:[],queued:[],history:[]};
}
function reasoningChoice(a,u,budget,keys,guard,turn,previous){
 const observation=observeBattle(a,u.id);
 // The adapter strips opponents' hands and all hidden draw order.
 const actor=observation.units.find(row=>row.id===u.id);
 actor.pips={...budget.pips};actor.cooldowns={...budget.cooldowns};
 const blade=preparationKey(a,u);
 // The charger owns its native preparation spell too. Previously the authored
 // blade choice was overwritten by inference without offering it as a candidate.
 const support=guard?['Ice_GlobalShield','Life_SingleHeal_Level0']:(!positiveCharm(a,u)&&previous?.key!==blade?[blade]:[]);
 actor.deckSeq=[...new Set([...keys,...support])].filter(key=>a.resolved.cards[key]);
 actor.deckMap=actor.deckSeq.map(()=>1);observation.remainingCards=[];observation.turn=turn;
 const burst=keys.map(key=>a.resolved.cards[key]).filter(c=>c&&isAttackCard(c)&&Number(c.pipcost)>0).sort((x,y)=>expectedBaseDamage(y)-expectedBaseDamage(x))[0];
 const prepared=positiveCharm(a,u)||previous?.key===blade;
 const leader=a.sides.far.find(isAlive);
 // Encounter-local role objective supplements the native one-action estimate:
 // value preparation for a paid attack, rather than consuming it on a free poke.
 // All bonuses depend only on visible units and the previously announced action.
 const rulesAdapter={...haqiRulesAdapter,evaluate(obs,action,settings){
  const result=haqiRulesAdapter.evaluate(obs,action,settings),card=a.resolved.cards[action.key];
  let roleValue=0,goal='';
  if(!guard&&burst){
   const value=expectedBaseDamage(burst)*0.5;
   if(action.key===blade){roleValue=value;goal='主攻先强化，为有费攻击准备爆发';}
   else if(card&&isAttackCard(card)&&Number(card.pipcost)>0){roleValue=value;goal='主攻使用积攒的魔力完成有费爆发';}
   else if(prepared&&action.pass&&!canCast(budget,burst,a.resolved)){roleValue=value;goal='保留强化并积攒下一轮有费攻击所需魔力';}
   else if(prepared&&card&&isAttackCard(card)&&Number(card.pipcost)===0){roleValue=-value;goal='避免小攻击提前消耗爆发强化';}
   if(card&&isAttackCard(card)&&action.targetId&&!(Number(card.pipcost)===0&&(prepared||a.resolved.tacticalEncounter?.focusFreeAttack===false))){
    const target=observation.units.find(row=>row.id===action.targetId);
    const seen=observation.publicHistory.filter(e=>e.caster===action.targetId&&isAttackCard(a.resolved.cards[e.key])).length;
    const threat=(target?.slot===a.sides.near[0].slot?1:0)+Math.min(2,seen);
    roleValue+=value*threat*(a.resolved.tacticalEncounter?.focusWeight??0);
    if(threat)goal+='；优先压制前排及已公开出手的攻击者';
   }
  }else if(guard&&leader&&leader.hp>leader.maxHp*0.5&&action.targetId===leader.id&&cardSemantics(card||{},a.resolved).roles.includes('shield')&&!negativeWard(a,leader)){
   roleValue=40;goal='守护保护主攻位的准备窗口';
  }
  return {...result,score:result.score+roleValue,evidence:[...result.evidence,...(goal?[{code:'encounter_role',text:goal,value:roleValue}]:[])]};
 }};
 const analysis=analyzeDecision(observation,{rulesAdapter,difficulty:'advanced',config:{branches:4,candidateCount:3}});
 const action=chooseDecision(analysis,{mode:'best',seed:a.seed});
 return {action,evidence:analysis.candidates[0]?.evidence?.map(row=>row.text).join('；')||'保留魔力等待更好的机会',evaluated:analysis.evaluated.length};
}
function plan(a,u,turn=a.turn,previous=null){
 const state=a.tacticalEncounter,cards=a.resolved.cards;
 if(state.id==='boss'&&previous?.kind==='attack'&&Number(cards[previous.key]?.pipcost)>=2){
  return {caster:u.id,name:u.name,key:null,targetId:null,kind:'wait',effect:'恢复',reason:'重击后恢复一回合，积蓄魔力',counter:'本轮不出手；已有持续伤害仍结算，可治疗或反击',turn,phase:state.phase,policy:'authored',evaluated:0};
 }
 const budget={...u,pips:{...u.pips},cooldowns:{...u.cooldowns}};
 if(turn>a.turn){
  if(previous?.key&&canCast(budget,cards[previous.key],a.resolved)){
   payCard(budget,cards[previous.key],a.resolved);
   setCooldown(budget,cards[previous.key].spellName,Number(cards[previous.key].params.cooldown)||0);
  }
  validateCooldown(budget);
  if(budget.pips.normal+budget.pips.power<a.resolved.global.maxPips)budget.pips.normal++;
 }
 const keys=[...(u.template.pool||[]).map(r=>r.key),...(u.template.sequences||[]).flat().map(r=>r.card)];
 const attacks=[...new Set(keys)].map(k=>cards[k]).filter(c=>c&&isAttackCard(c)&&canCast(budget,c,a.resolved)).sort((x,y)=>Number(y.pipcost)-Number(x.pipcost)||x.key.localeCompare(y.key));
 const blade=cards[preparationKey(a,u)];
 const hostile=weakest(a.sides.near.filter(isAlive)),leader=a.sides.far.find(isAlive);
 let card=attacks[0],target=hostile,effect='攻击',reason='集中攻击当前生命最低的对手',counter='给锁定目标加盾、削弱施法者，或在出手前击倒施法者';
 const guard=state.id==='elite'&&u!==a.sides.far[0];
 const ready=c=>c&&canCast(budget,c,a.resolved);
 if(state.id==='boss'&&!positiveCharm(a,u)&&previous?.effect!=='蓄力'&&ready(blade)){
  card=blade;target=u;effect='蓄力';reason='重新准备下一次重击，每次准备均占用本轮行动';counter='可以趁准备期进攻，或提前加盾、施加虚弱';
 }else if(state.id==='boss'&&state.phase===2&&previous?.kind!=='weaken'&&ready(cards.Death_AreaDamageWeakness)){
  card=cards.Death_AreaDamageWeakness;target=hostile;effect='全体虚弱';reason='第二阶段先压制对方全体，为后续重击做准备';counter='用小攻击消耗虚弱，或用该回合布置强化、陷阱、护盾';
 }else if(guard&&leader&&!negativeWard(a,leader)&&previous?.effect!=='守护'&&ready(cards.Ice_GlobalShield)){
  card=cards.Ice_GlobalShield;target=leader;effect='守护';reason='主攻位没有减伤护盾，守护位为它补盾';counter='先击倒守护位，或用小攻击消耗主攻位护盾';
 }else if(!guard&&!positiveCharm(a,u)&&previous?.effect!=='蓄力'&&turn%2===1&&ready(blade)){
  card=blade;target=u;effect='蓄力';reason='尚无强化，先强化下一次同系攻击';counter='可以趁准备期进攻，或提前加盾、施加虚弱';
 }else if(guard&&hostile&&negativeWard(a,hostile)){
  card=attacks.at(-1)||card;effect='破盾';reason='锁定目标已有护盾，用小攻击消耗它';counter='守护位与主攻位分别行动，留意护盾消耗顺序';
 }
 let reasoning=null;
 if(state.id==='elite'){
  reasoning=reasoningChoice(a,u,budget,keys,guard,turn,previous);
  card=reasoning.action.pass?null:cards[reasoning.action.key];
  target=a.unitsById[reasoning.action.targetId];reason=reasoning.evidence;
  const roles=card?cardSemantics(card,a.resolved).roles:[];
  effect=roles.includes('heal')?'治疗':roles.includes('shield')?'守护':card&&isAttackCard(card)?(target&&negativeWard(a,target)?'破盾':'集火'):card?'蓄力':'等待';
 }
 if(!card)return {caster:u.id,name:u.name,key:null,targetId:null,kind:'wait',effect:'等待',reason:reasoning?.evidence||'当前魔力不足，保留魔力',counter:'利用这一回合布置状态',turn,phase:state.phase,policy:reasoning?'reasoning':'authored',evaluated:reasoning?.evaluated||0};
 const targets=validTargets(a,u,card);target=targets.find(t=>t.id===target?.id)||targets[0];
 const area=/^Area/.test(card.type),attack=isAttackCard(card);
 // Advice follows the final inferred action, not the provisional attack above.
 if(effect==='守护')counter='先打尚未上盾的目标，或用小攻击消耗护盾后再重击';
 else if(effect==='治疗')counter='优先击倒治疗者，或集中攻击伤员，避免分散伤害';
 else if(effect==='蓄力')counter='趁准备期集中进攻，或给锁定目标加盾、对施法者施加虚弱';
 if(attack)effect=area?'群攻':Number(card.pipcost)>=2?'重击':effect;
 if(attack&&Number(card.pipcost)>=2&&a.resolved.tacticalEncounter)counter+=`；重击实际消耗护盾或虚弱后，锁定目标获得反击强化：下次本系攻击+${a.resolved.tacticalEncounter.counterBoost}%（含持续伤害）`;
 const affectedTargetIds=area?targets.map(t=>t.id):target?[target.id]:[];
 const details=tacticalEffectDetails(card,a.resolved,budget);
 if(state.id==='boss'&&card.key===preparationKey(a,u)&&a.resolved.tacticalEncounter?.preparationShield){
  const ward=a.resolved.wards[a.resolved.tacticalEncounter.preparationWard];
  details.effects.modifiers.push({kind:'ward',id:ward.id,damagePercent:Number(ward.boost_damage),school:'all'});
  details.effectDetail+=`；蓄力同时获得护盾：下次受伤${ward.boost_damage}%`;
  counter+='；用小攻击或已施加的持续伤害先消耗屏障，再集中进攻';
 }
 return {caster:u.id,name:u.name,key:card.key,targetId:target?.id||null,targetName:area?(target?.side==='near'?'我方全体':'敌方全体'):target?.name||'',scope:area?'all':'single',affectedTargetIds,kind:attack?'attack':effect==='治疗'?'heal':effect==='守护'?'shield':effect==='全体虚弱'?'weaken':'buff',baseDamage:attack?expectedBaseDamage(card,budget):null,...details,effect,reason,counter,turn,phase:state.phase,policy:reasoning?'reasoning':'authored',evaluated:reasoning?.evaluated||0};
}
// Called once at the start of selection, before any player decision is read.
// Locked targets never silently retarget after a death/control/ward change.
export function lockTacticalIntents(a){
 const state=a.tacticalEncounter;if(!state)return;
 const boss=a.sides.far[0];
 if(state.id==='boss'&&state.phase===1&&isAlive(boss)&&boss.hp/boss.maxHp<=state.phaseThreshold){
  state.phase=2;emit(a,{type:'tactic_phase',caster:boss.id,phase:2,effect:'首领进入第二阶段',extraAction:false});
 }
 state.intents=state.queued.length?state.queued:a.sides.far.filter(isAlive).map(u=>plan(a,u));
 state.queued=a.sides.far.filter(isAlive).map(u=>plan(a,u,a.turn+1,state.intents.find(row=>row.caster===u.id)));
 for(const intent of state.intents)emit(a,{type:'tactic_intent',...intent});
 for(const intent of state.queued)emit(a,{type:'tactic_intent',...intent,announcedTurn:a.turn,upcoming:true});
}
export function tacticalEnemyIntents(a){return a.finished?[]:structuredClone(a.tacticalEncounter?.intents||[]);}
export function tacticalNextIntents(a){return a.finished?[]:structuredClone(a.tacticalEncounter?.queued||[]);}
export function tacticalMonsterPick(a,u,phase){
 if(!a.tacticalEncounter)return undefined;
 if(phase!=='normal')return null;
 const intent=a.tacticalEncounter.intents.find(row=>row.caster===u.id);
 return intent?{...intent,scripted:true,lockedTactic:true}:null;
}
export function recordTacticalResolution(a,u,pick,outcome,events=[]){
 if(!pick?.lockedTactic)return;
 const consumed=events.filter(e=>e.type==='effect_used'||e.sourceType==='effect_used').map(e=>({target:e.target,kind:e.kind,id:e.id,boost:Number(a.resolved[e.kind==='charm'?'charms':'wards']?.[e.id]?.boost_damage)||0}));
 const damage=events.filter(e=>e.type==='damage').map(e=>({target:e.target,amount:e.amount}));
 const event={type:'tactic_resolution',caster:u.id,key:pick.key,targetId:pick.targetId,effect:pick.effect,baseAccuracy:pick.baseAccuracy,effects:pick.effects,effectDetail:pick.effectDetail,mitigationDetail:pick.mitigationDetail,outcome,consumed,damage,
  shieldConsumed:consumed.some(e=>e.kind==='ward'&&e.boost<0),weakenConsumed:consumed.some(e=>e.kind==='charm'&&e.boost<0),
  resourcesUnavailable:!!pick.key&&!canCast(u,a.resolved.cards[pick.key],a.resolved)&&outcome==='unavailable',pips:{...u.pips}};
 a.tacticalEncounter.history.push({turn:a.turn,...event});emit(a,event);
 if(a.tacticalEncounter.id==='boss'&&a.resolved.tacticalEncounter?.preparationShield&&outcome==='resolved'&&pick.key===preparationKey(a,u)&&isAlive(u)&&!negativeWard(a,u)){
  const statusId=a.resolved.tacticalEncounter.preparationWard;appendWard(u,statusId);
  emit(a,{type:'tactic_prepare_guard',caster:u.id,targetId:u.id,key:pick.key,statusId,boost:Number(a.resolved.wards[statusId].boost_damage),detail:'蓄力屏障：下一段受伤减半，小攻击或持续伤害可先破盾'});
 }
 if(a.resolved.tacticalEncounter&&outcome==='resolved'&&pick.kind==='attack'&&Number(a.resolved.cards[pick.key]?.pipcost)>=2&&(event.shieldConsumed||event.weakenConsumed)&&isAlive(u)){
   const recipient=a.unitsById[pick.targetId],statusId=a.resolved.tacticalEncounter.counterCharms[recipient?.school];
   if(recipient&&isAlive(recipient)&&statusId&&!recipient.charms.includes(statusId)){
    appendCharm(recipient,statusId);
    emit(a,{type:'tactic_counter_window',caster:u.id,targetId:recipient.id,key:pick.key,statusId,kind:'charm',boost:a.resolved.tacticalEncounter.counterBoost,shieldConsumed:event.shieldConsumed,weakenConsumed:event.weakenConsumed,detail:`反制准备：下次本系攻击+${a.resolved.tacticalEncounter.counterBoost}%（含持续伤害）`});
   }
 }
}
export function recordTacticalStatus(a,event){
 if(!a.tacticalEncounter)return;
 const cast=a.events.findLast(e=>e.type==='cast');
 if(event.type==='effect_used'){
  const boost=Number(a.resolved[event.kind==='charm'?'charms':'wards']?.[event.id]?.boost_damage)||0;
  if(!boost)return;
  const friendly=a.unitsById[event.target]?.side==='near';
  const type=event.kind==='ward'&&boost<0?(friendly?'tactic_block':'tactic_shield_break'):event.kind==='charm'&&boost>0?'tactic_charge':null;
  if(type)emit(a,{type,caster:event.caster??cast?.caster,key:event.card??cast?.card,segment:event.segment||(event.kind==='charm'?'cast':'unknown'),targetId:event.target,statusId:event.id,kind:event.kind,boost,action:'consumed'});
 }
}
export function recordTacticalResources(a,u,decision){
 if(!a.tacticalEncounter)return;
 const hand=u.deckSeq.flatMap((key,seq)=>{
  if(u.deckMap[seq]!==1)return [];
  const card=a.resolved.cards[key];
  return [{key,seq,cost:Number(card?.pipcost)||0,attack:isAttackCard(card),affordable:!!card&&canAffordCard(u.pips,card.pipcost,isOwnSchoolCost(card.spellSchool,u.school,a.resolved.version),a.resolved.version),cooldown:u.cooldowns[card?.spellName]||0,castable:canCast(u,card,a.resolved)}];
 });
 emit(a,{type:'tactic_resources',caster:u.id,pips:{...u.pips},selectedKey:decision.key||null,pass:!!decision.pass,hand,remainingDeck:u.deckMap.filter(x=>x===0).length,attackCardsRemaining:u.deckSeq.filter((key,seq)=>u.deckMap[seq]>=0&&isAttackCard(a.resolved.cards[key])).length});
}
