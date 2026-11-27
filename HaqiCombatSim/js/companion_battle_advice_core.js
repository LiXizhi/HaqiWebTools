import {heavyProtection} from './battle_protection_advice_core.js';
import {castableCards,validTargets} from './combat_arena_core.js';
import {isAttackCard,isHealCard,expectedBaseDamage} from './combat_cards_core.js';
import {openingEnemyIntentInfo} from './opening_training_core.js';
import {dungeonEnemyIntentInfo} from './dungeon_tactics_core.js';
import {tacticalEnemyIntents} from './tactical_encounter_core.js';
import {canCast,isAlive,selectableCards} from './combat_unit_core.js';
import {runeCardsInHand} from './combat_pve_core.js';
import {castBlockedMessage} from './adventure_cast_feedback_core.js';
import {attackTacticEffects,cardTacticAdvice} from './battle_tactics_core.js';

function currentIntent(battle){
 const rows=tacticalEnemyIntents(battle);
 const heavy=rows.find(row=>row.kind==='attack'&&['重击','群攻'].includes(row.effect));
 if(heavy)return {...heavy,kind:'heavy'};
 const row=rows[0];
 return row?{...row,kind:({buff:'charge',shield:'guard'})[row.kind]||row.kind}:openingEnemyIntentInfo(battle)||dungeonEnemyIntentInfo(battle);
}

const handRows=battle=>[...selectableCards(battle.sides.near[0]),...runeCardsInHand(battle)];
export function companionSelectedAdvice(battle,selected,discarded=[]){
 const hero=battle.sides.near[0],card=battle.resolved.cards[selected?.key];
 if(hero.stunned||!isAlive(hero))return {text:hero.stunned?'被眩晕了，先跳过这回合。':'先跳过，让伙伴继续战斗。',blocked:true,practice:false,wait:true};
 const unavailable=!selected||discarded.includes(selected.seq)||!handRows(battle).some(h=>h.seq===selected.seq&&h.key===selected.key);
 const blocked=unavailable?'这张牌已经不在手里，重新选一张吧。':castBlockedMessage(hero,card,battle.resolved);
 if(blocked)return {text:blocked,blocked:true,practice:false};
 const targets=validTargets(battle,hero,card);
 if(!targets.length)return {text:'这张牌暂时没有可选目标，换一张吧。',blocked:true,practice:false};
 if(isHealCard(card)){
  const injured=targets.filter(u=>u.hp<u.maxHp).sort((a,b)=>(b.maxHp-b.hp)-(a.maxHp-a.hp))[0];
  if(!injured)return {text:'生命都满了，先留着治疗牌。',blocked:false,practice:false,reconsider:true};
  const practice=!!hero.wordCards?.[selected.seq]&&!hero.wordCards[selected.seq].activated;
  const subject=injured.id===hero.id?'你':'伙伴';
  return {text:practice?subject+'受伤了。点亮起的头像，完成语言互动。':'这张牌可以帮'+subject+'恢复生命。',blocked:false,practice,suggestedTargetId:injured.id};
 }
 if(hero.wordCards?.[selected.seq]&&!hero.wordCards[selected.seq].activated)return {text:'点亮起的目标，完成语言互动。',blocked:false,practice:true};
 const tactic=cardTacticAdvice(battle,hero,card,targets);
 return {...tactic,text:tactic?.shortText||(card.type==='CatchPet'?'点怪物试着捕捉，可能会失败。':'点亮起的目标出招。'),blocked:false,practice:false};
}

// Only reason about currently visible, legal cards. Never choose a move for the player.
export function companionBattleAdvice(battle,visibleSeqs,names={}){
 const hero=battle.sides.near[0],visible=new Set(visibleSeqs);
 if(hero.stunned||!isAlive(hero))return {kind:'wait',text:hero.stunned?'被眩晕了，先跳过这回合。':'先跳过，让伙伴继续战斗。',seqs:[]};
 const ready=h=>isAlive(hero)&&visible.has(h.seq)&&canCast(hero,h.card,battle.resolved)&&validTargets(battle,hero,h.card).length;
 const choices=[...castableCards(battle,hero),...runeCardsInHand(battle).map(h=>({...h,card:battle.resolved.cards[h.key]}))].filter(ready);
 const practice=selectableCards(hero).map(h=>({...h,card:battle.resolved.cards[h.key]})).find(h=>hero.wordCards?.[h.seq]&&!hero.wordCards[h.seq].activated&&ready(h));
 const R=battle.resolved,hasEffect=(card,field,test)=>String(card.params?.[field]??'').split(',').some(id=>test(R[field]?.[id]));
 const attacks=choices.filter(h=>isAttackCard(h.card));
 const helpsAttack=e=>Number(e?.boost_damage)>0&&attacks.some(h=>String(e.school||'all').toLowerCase()==='all'||String(e.school).toLowerCase()===String(h.card.params?.damage_school||h.card.spellSchool).toLowerCase());
 const addsEffect=(h,field)=>validTargets(battle,hero,h.card).some(target=>String(h.card.params?.[field]??'').split(',').some(id=>helpsAttack(R[field]?.[id])&&!(target[field]||[]).some(active=>Number(typeof active==='object'?active.id:active)%1000===Number(id)%1000)));
 const boost=choices.find(h=>h.card.type==='Charms'&&addsEffect(h,'charms'));
 const trap=choices.find(h=>h.card.type==='Wards'&&addsEffect(h,'wards'));
 const protection=choices.find(h=>/^(Absorb|AreaAbsorb)$/.test(h.card.type)||h.card.type==='Wards'&&hasEffect(h.card,'wards',e=>Number(e?.boost_damage)<0));
 const heal=choices.find(h=>isHealCard(h.card)&&validTargets(battle,hero,h.card).some(u=>u.hp<u.maxHp));
 const intent=currentIntent(battle),name=h=>names[h.key]?.name||h.card.name||'这张牌';
 if(!choices.length&&practice)return {kind:'practice',text:'试试语言卡：点目标，再完成互动。',seqs:[practice.seq]};
 if(!choices.length)return {text:'这页的牌用不了，换页或跳过。',seqs:[]};
 if(intent?.kind==='heavy'){
  const threatened=battle.unitsById?.[intent.targetId];
  const defensive=heavyProtection(battle,choices,intent);
  const h=defensive||heal;
  if(h){
   const targets=validTargets(battle,hero,h.card);
   const target=targets.find(u=>u.id===threatened?.id)||targets.filter(u=>u.hp<u.maxHp).sort((a,b)=>(b.maxHp-b.hp)-(a.maxHp-a.hp))[0]||targets[0];
   return {kind:'defend',text:'重击要来了。「'+name(h)+'」'+(target?'选'+target.name+'。':'能帮忙。'),seqs:[h.seq],targetId:target?.id};
  }
  if(attacks.length)return {kind:'attack',text:'重击要来了，试试先击倒它。',seqs:attacks.map(h=>h.seq)};
 }
 const counter=battle.resolved.tacticalEncounter?.counterCharms?.[hero.school];
 if(counter!==undefined&&hero.charms.includes(counter)){
  const attack=attacks.filter(h=>String(h.card.params?.damage_school||h.card.spellSchool).toLowerCase()===hero.school).sort((a,b)=>expectedBaseDamage(b.card)-expectedBaseDamage(a.card))[0];
  if(attack)return {kind:'counter',text:'反击加成已就位，用「'+name(attack)+'」攻击对手。',seqs:[attack.seq]};
 }
 const capture=choices.find(h=>h.card.type==='CatchPet');
 if(capture)return {kind:'capture',text:'试试抓宠符文，可能会失败哦。',seqs:[capture.seq]};
 const shielded=attacks.filter(h=>validTargets(battle,hero,h.card).some(target=>attackTacticEffects(battle,hero,target,h.card)?.effects.some(e=>e.kind==='ward'&&e.boost<0)));
 if(shielded.length){
  const light=[...shielded].sort((a,b)=>Number(a.card.pipcost)-Number(b.card.pipcost))[0];
  return {text:'先用低消耗的「'+name(light)+'」试探护盾。',seqs:[light.seq]};
 }
 if(intent?.kind==='guard'&&attacks.length)return {text:'对手准备加盾，出手后留意它身上的状态。',seqs:attacks.map(h=>h.seq)};
 if(['charge','heal'].includes(intent?.kind)&&(boost||trap)&&attacks.length){
  const h=boost||trap;return {text:'对手不攻击，试试「'+name(h)+'」强化下一击。',seqs:[h.seq]};
 }
 if(attacks.length)return {text:intent?.kind==='heavy'?'重击要来了，试试先击倒它。':intent?.kind==='charge'?'对手在蓄力，可以进攻！':'选攻击牌，再点对手。',seqs:attacks.map(h=>h.seq)};
 const h=heal||protection||boost||trap||choices[0];
 return {text:'「'+name(h)+'」能用，点开看看。',seqs:[h.seq]};
}

// Keep the pet bubble and the companion panel on the same locked enemy plan.
export function companionTacticalHint(battle,discarded=[]){
 if(battle.finished||!currentIntent(battle))return null;
 const hero=battle.sides.near[0],hand=selectableCards(hero).filter(h=>!discarded.includes(h.seq));
 const advice=companionBattleAdvice(battle,hand.map(h=>h.seq));
 const row=hand.find(h=>advice.seqs.includes(h.seq));
 if(!row||advice.kind==='practice')return null;
 const card=battle.resolved.cards[row.key],targets=validTargets(battle,hero,card);
 const target=targets.find(u=>u.id===advice.targetId)||(isHealCard(card)?targets.filter(u=>u.hp<u.maxHp).sort((a,b)=>(b.maxHp-b.hp)-(a.maxHp-a.hp))[0]:targets[0]);
 return target?{action:{seq:row.seq,key:row.key,targetId:target.id}}:null;
}
