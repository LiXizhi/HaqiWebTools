import {createArena,validTargets} from './combat_arena_core.js';
import {defaultParams,resolveParams} from './combat_params_core.js';
import {useCard} from './combat_cards_core.js';
import {canCast} from './combat_unit_core.js';
import {wordLanguage} from './word_lexicon_core.js';

// Loaned cards and wounded practice opponents; no real role/save state is shared.
// Card costs, damage, shields and healing all use the existing combat engine.
export const MENTOR_PRACTICES={
 36206:{school:'fire',title:'烈火：应对围攻',keys:['Fire_SingleAttackWithDOT_Level1','Life_SingleHeal_Level0','Fire_AreaAttackWithDOT_Level4'],enemies:3},
 36207:{school:'ice',title:'寒冰：先守后攻',keys:['Ice_SingleAttack_Level1','Ice_GlobalShield','Life_SingleHeal_Level0'],enemies:1},
 36208:{school:'storm',title:'风暴：抓住关键目标',keys:['Storm_SingleAttack_Level1','Life_SingleHeal_Level0','Ice_GlobalShield'],enemies:2},
 36209:{school:'life',title:'生命：救助伙伴',keys:['Life_SingleHeal_Level0','Storm_SingleAttack_Level1','Ice_GlobalShield'],enemies:1},
 36210:{school:'death',title:'死亡：吸取生命',keys:['Storm_SingleAttack_Level1','Ice_GlobalShield','Death_SingleAttackWithLifeTap_Level2'],enemies:1}
};
const CUES={
 fire:{zh:'敌人有三个。用群攻同时击败它们。',en:'There are three enemies. Attack all of them at once.',ja:'敵は三体いる。全員を同時に攻撃しよう。',ko:'적이 셋 있어요. 모두 한꺼번에 공격하세요.'},
 ice:{zh:'伙伴要被攻击了。先给伙伴加护盾。',en:'Your friend is in danger. Shield your friend first.',ja:'仲間が狙われている。先に仲間に盾をかけよう。',ko:'친구가 위험해요. 먼저 친구에게 보호막을 걸어 주세요.'},
 counter:{zh:'伙伴挡住了攻击。现在击败敌人。',en:'Your friend survived the attack. Now defeat the enemy.',ja:'仲間は攻撃に耐えた。今度は敵を倒そう。',ko:'친구가 공격을 견뎠어요. 이제 적을 쓰러뜨리세요.'},
 storm:{zh:'后方的治疗者会治疗同伴。先击败治疗者。',en:'The healer in the back can heal others. Defeat the healer first.',ja:'後ろの回復役は仲間を回復する。先に回復役を倒そう。',ko:'뒤에 있는 치유사는 다른 적을 치료해요. 치유사부터 쓰러뜨리세요.'},
 life:{zh:'伙伴受伤了。治疗伙伴，不要治疗自己。',en:'Your friend is hurt. Heal your friend, not yourself.',ja:'仲間がけがをしている。自分ではなく仲間を回復しよう。',ko:'친구가 다쳤어요. 자신이 아니라 친구를 치료해 주세요.'},
 death:{zh:'你受伤了。用吸血攻击伤害敌人，同时恢复自己的生命。',en:'You are hurt. Drain the enemy to heal yourself.',ja:'自分がけがをしている。敵の命を吸い取り、自分を回復しよう。',ko:'당신이 다쳤어요. 적의 생명력을 흡수해서 자신을 회복하세요.'}
};
const NAMES={zh:{student:'你',companion:'伙伴',enemy1:'前排敌人',enemy2:'后方治疗者',enemy3:'侧翼敌人'},en:{student:'You',companion:'Friend',enemy1:'Front enemy',enemy2:'Healer in the back',enemy3:'Flank enemy'},ja:{student:'自分',companion:'仲間',enemy1:'前の敵',enemy2:'後ろの回復役',enemy3:'横の敵'},ko:{student:'당신',companion:'친구',enemy1:'앞쪽 적',enemy2:'뒤의 치유사',enemy3:'옆쪽 적'}};
export function mentorPracticeLanguage(value){const lang=wordLanguage(value);return CUES.fire[lang]?lang:'en';}
export function mentorPracticeCue(state,language=state.language){return CUES[(state.presentationPhase??state.phase)==='counter'?'counter':state.school][mentorPracticeLanguage(language)];}
export function mentorPracticeName(id,language){return NAMES[mentorPracticeLanguage(language)][id]||id;}

export function createMentorPractice(dataset,{npcId,seed=1,language='en'}={}){
 const lesson=MENTOR_PRACTICES[npcId];if(!lesson)throw Error('这位导师没有实操练习。');
 const params=defaultParams('kids');
 // Existing practice fairness option: no random fizzle during a mentor demonstration.
 params.fairPlay={forceAccuracy:100};
 const resolved=resolveParams(dataset,params);
 if(lesson.keys.some(key=>!resolved.cards[key]))throw Error('导师练习卡牌尚未准备好。');
 const spec=(id,school)=>({id,name:id,school,level:3,deck:[]});
 const arena=createArena({resolved,near:[spec('student',lesson.school),spec('companion','life')],far:Array.from({length:lesson.enemies},(_,i)=>spec('enemy'+(i+1),i===1?'life':'fire')),seed});
 for(const unit of Object.values(arena.unitsById))unit.pips={normal:resolved.global.maxPips,power:0};
 for(const enemy of arena.sides.far)enemy.hp=Math.min(enemy.maxHp,70);
 const hero=arena.unitsById.student,partner=arena.unitsById.companion;
 if(lesson.school==='ice')partner.hp=Math.min(partner.maxHp,95);
 if(lesson.school==='life')partner.hp=Math.max(1,partner.maxHp-100);
 if(lesson.school==='death')hero.hp=Math.max(1,hero.maxHp-100);
 return {npcId:Number(npcId),school:lesson.school,title:lesson.title,keys:[...lesson.keys],seed,language:mentorPracticeLanguage(language),arena,selected:null,phase:'start',done:false,failed:false,message:'先读指令，再选卡、点目标。',feedback:[],hint:false};
}
export function selectMentorPractice(state,key){
 if(state.done||state.failed||!state.keys.includes(key))return false;
 state.selected=key;state.message='已选好卡牌，请点施法目标。';return true;
}
export function castMentorPractice(state,targetId){
 if(state.done||state.failed)return false;
 const {arena}=state,hero=arena.unitsById.student,partner=arena.unitsById.companion;
 const card=arena.resolved.cards[state.selected],target=arena.unitsById[targetId];
 if(!card){state.message='请先选一张卡牌。';return false;}
 if(!target||!validTargets(arena,hero,card).includes(target)){
  state.message='这张牌不能用于这个目标。看看它是攻击、护盾还是治疗。';return false;
 }
 if(!canCast(hero,card,arena.resolved)){state.message='这张牌现在不能使用，请换一张。';return false;}
 const hp=()=>Object.fromEntries(Object.values(arena.unitsById).map(u=>[u.id,u.hp]));
 const before=hp();state.lastCasts=[];
 const perform=(caster,spell,recipient)=>{
  const beforeHp=hp();useCard(arena,caster,spell,recipient);const afterHp=hp();
  const changed=Object.keys(afterHp).filter(id=>afterHp[id]!==beforeHp[id]&&id!==caster.id);
  state.lastCasts.push({card:spell,casterId:caster.id,targetId:recipient.id,targetIds:changed.length?changed:[recipient.id],beforeHp,afterHp});
 };
 perform(hero,card,target);
 let passed=false;
 if(state.school==='ice'&&state.phase==='start'){
  const protectedPartner=target===partner&&partner.wards.some(w=>w.id===27);
  perform(arena.unitsById.enemy1,arena.resolved.cards.Storm_SingleAttack_Level1,partner);
  if(protectedPartner&&partner.hp>0){state.phase='counter';state.message='护盾生效，伙伴安全了。再选攻击牌反击。';}
  else state.failed=true;
 }else if(state.school==='ice')passed=arena.unitsById.enemy1.hp===0&&partner.hp>0;
 else if(state.school==='fire')passed=arena.sides.far.every(u=>u.hp===0);
 else if(state.school==='storm'){
  passed=arena.unitsById.enemy2.hp===0;
  if(!passed)perform(arena.unitsById.enemy2,arena.resolved.cards.Life_SingleHeal_Level0,arena.unitsById.enemy1);
 }else if(state.school==='life')passed=partner.hp>before.companion;
 else if(state.school==='death')passed=hero.hp>before.student&&target.hp<before[targetId];
 state.feedback=Object.values(arena.unitsById).filter(u=>u.hp!==before[u.id]).map(u=>({id:u.id,delta:u.hp-before[u.id]}));
 state.selected=null;
 if(passed){state.done=true;state.message='实操通过。记住这次的目标和卡牌效果。';}
 else if(state.phase!=='counter'||state.school!=='ice'||state.failed){
  state.failed=true;state.message=state.school==='storm'?'治疗者还在，已经给前排恢复了生命。重试时先找关键目标。':state.school==='ice'?'这次没有保护好伙伴。重试时先读清要保护谁。':'这次的卡牌或目标没有完成指令。看看生命变化，再试一次。';
 }else if(card.key!=='Ice_GlobalShield'){
  state.failed=true;state.message='敌人还在。重试时先保护伙伴，再用攻击牌反击。';
 }
 return true;
}
