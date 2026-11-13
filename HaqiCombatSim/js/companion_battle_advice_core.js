import {castableCards,validTargets} from './combat_arena_core.js';
import {isAttackCard,isHealCard} from './combat_cards_core.js';
import {openingEnemyIntentInfo} from './opening_training_core.js';
import {canCast,isAlive,selectableCards} from './combat_unit_core.js';
import {runeCardsInHand} from './combat_pve_core.js';
import {castBlockedMessage} from './adventure_cast_feedback_core.js';
import {cardTacticAdvice} from './battle_tactics_core.js';

const handRows=battle=>[...selectableCards(battle.sides.near[0]),...runeCardsInHand(battle)];
export function companionSelectedAdvice(battle,selected,discarded=[]){
 const hero=battle.sides.near[0],card=battle.resolved.cards[selected?.key];
 if(hero.stunned||!isAlive(hero))return {text:hero.stunned?'你被眩晕了，这回合先跳过，等恢复后再出招。':'你暂时无法出招，跳过回合，让还能行动的伙伴继续。',blocked:true,practice:false,wait:true};
 const unavailable=!selected||discarded.includes(selected.seq)||!handRows(battle).some(h=>h.seq===selected.seq&&h.key===selected.key);
 const blocked=unavailable?'这张牌已经不在手里，重新选一张吧。':castBlockedMessage(hero,card,battle.resolved);
 if(blocked)return {text:blocked,blocked:true,practice:false};
 const targets=validTargets(battle,hero,card);
 if(!targets.length)return {text:'这张牌暂时没有可选目标，换一张吧。',blocked:true,practice:false};
 if(isHealCard(card)){
  const injured=targets.filter(u=>u.hp<u.maxHp).sort((a,b)=>(b.maxHp-b.hp)-(a.maxHp-a.hp))[0];
  if(!injured)return {text:'大家的生命都是满的，治疗牌可以先留着。',blocked:false,practice:false,reconsider:true};
  const practice=!!hero.wordCards?.[selected.seq]&&!hero.wordCards[selected.seq].activated;
  const subject=injured.id===hero.id?'你':'伙伴';
  return {text:practice?subject+'受伤了。先点亮起的头像，再完成英语互动。':'这张牌可以帮'+subject+'恢复生命。',blocked:false,practice,suggestedTargetId:injured.id};
 }
 if(hero.wordCards?.[selected.seq]&&!hero.wordCards[selected.seq].activated)return {text:'点亮着的目标，再完成英语互动，这张语言卡才能出招。',blocked:false,practice:true};
 const tactic=cardTacticAdvice(battle,hero,card,targets);
 return {...tactic,text:tactic?.text||(card.type==='CatchPet'?'点亮着的怪物尝试捕捉；不是每次都能成功。':'牌选好了。现在点亮着的目标，才会出招。'),blocked:false,practice:false};
}

// Only reason about currently visible, legal cards. Never choose a move for the player.
export function companionBattleAdvice(battle,visibleSeqs,names={}){
 const hero=battle.sides.near[0],visible=new Set(visibleSeqs);
 if(hero.stunned||!isAlive(hero))return {kind:'wait',text:hero.stunned?'你被眩晕了，这回合先跳过，等恢复后再出招。':'你暂时无法出招，跳过回合，让还能行动的伙伴继续。',seqs:[]};
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
 const intent=openingEnemyIntentInfo(battle),name=h=>names[h.key]?.name||h.card.name||'这张牌';
 if(!choices.length&&practice)return {kind:'practice',text:'还有一张语言卡。选它、点目标，完成英语互动就能出招。',seqs:[practice.seq]};
 if(!choices.length)return {text:'这页没有能施放的牌，换一页看看，或跳过这一回合。',seqs:[]};
 const capture=choices.find(h=>h.card.type==='CatchPet');
 if(capture)return {kind:'capture',text:'抓宠符文现在能用。选中后点亮着的怪物；捕捉不保证成功。',seqs:[capture.seq]};
 if(intent?.kind==='guard'&&attacks.length>1){
  const light=[...attacks].sort((a,b)=>Number(a.card.pipcost)-Number(b.card.pipcost))[0];
  return {text:'第一击会被盾削弱。可以用低消耗的「'+name(light)+'」试探。',seqs:[light.seq]};
 }
 if(intent?.kind==='heavy'&&(heal||protection)){
  const h=heal||protection;return {text:'重击要来了。「'+name(h)+'」现在能用，先看看它能帮谁。',seqs:[h.seq]};
 }
 if(['charge','heal'].includes(intent?.kind)&&(boost||trap)&&attacks.length){
  const h=boost||trap;return {text:'它这回合不攻击。可以用「'+name(h)+'」准备下一击，也可以直接进攻。',seqs:[h.seq]};
 }
 if(attacks.length)return {text:intent?.kind==='heavy'?'重击要来了。手里能用的是攻击牌，看看能否先击倒它。':intent?.kind==='charge'?'它这回合不攻击。手里的攻击牌现在可以出手。':'选一张攻击牌，再点对手；留意它还剩多少生命。',seqs:attacks.map(h=>h.seq)};
 const h=heal||protection||boost||trap||choices[0];
 return {text:'「'+name(h)+'」现在能用。点开看看效果，再选择亮起的目标。',seqs:[h.seq]};
}
