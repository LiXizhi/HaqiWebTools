import {tacticsNextGoal} from './tactics_progress_core.js';
import {TACTICS_LESSONS,trainingStep,trainingCards,trainingTargets} from './tactics_training_core.js';
import {guidanceCard} from './view_adventure_guidance.js';
import {setText} from './locale_runtime.js';
import {TACTICS_MILESTONES} from './battle_tactics_journal_core.js';
import {dungeonChallengeLines} from './dungeon_challenge_core.js';
import {dungeonTacticsProfile} from './dungeon_tactics_core.js';
import {dungeonHonorTitle} from './adventure_honors_core.js';

export function renderTacticsTraining(body,model,session,cb,{el,button,spellFace}){
 const completed=model.save.tacticsTraining?.completed||{};
 if(!session){
  body.append(guidanceCard({eyebrow:'茜茜的战术课堂',title:'把一张牌，变成一次配合',body:'借用练习卡和训练靶，亲手尝试强化、陷阱、削弱与护盾。不会消耗你的卡牌、生命、体力或背包物品。',footnote:'这里分步演示，不推进正式回合；敌人按说明配合。正式战斗每位角色每回合只行动一次，铺垫需要考虑回合与先后手。'}));
  const goal=tacticsNextGoal(model.save);
  const objective=guidanceCard({eyebrow:goal.kind==='field'?'实战委托 · '+goal.done+'/'+goal.total:'战术委托 · '+goal.done+'/'+goal.total,title:goal.title,body:goal.body,footnote:goal.kind==='lesson'?'任选课程也可以；这里会继续提示下一项未完成的训练。':'实战目标可在任意可用的正式野外战斗或副本中完成，演练不计入。'});
  if(goal.kind==='lesson')objective.append(button('继续这项训练',()=>cb.start(goal.id),'primary'));
  body.append(objective);
  const list=el('div','tactics-lesson-list');
  for(const lesson of TACTICS_LESSONS){
   const row=el('section','tactics-lesson',el('h3','',lesson.title),el('p','',lesson.summary));
   const record=completed[lesson.id];
   const status=el('small','');
   setText(status,record?'已完成 {runs} 次 · 可重复练习':'尚未完成',{runs:record?.runs||0});
   row.append(status,button(record?'再练一次':'开始练习',()=>cb.start(lesson.id),record?'secondary':'primary'));list.append(row);
  }
  body.append(list);
  if(cb.back)body.append(button('返回森林委托',cb.back,'secondary'));
  const record=model.save.tacticsRecord;
  body.append(guidanceCard({eyebrow:'从课堂走向冒险',title:'你的战术实绩',body:'练习完成后，带上自己的卡牌到野外或副本运用。下面的目标只认可正式战斗胜利中的真实效果。',steps:TACTICS_MILESTONES.map(row=>(record?.[row.id]?'已达成 · ':'待挑战 · ')+row.title+'：'+row.body),footnote:record?'已记录 '+record.wins+' 场胜利。重复挑战可以继续积累实绩。':'还没有正式实绩，先从强化加陷阱的一击开始。'}));
  for(const dungeon of model.assets.content.dungeons||[])if(dungeonTacticsProfile(dungeon))body.append(guidanceCard({eyebrow:'副本个人实绩',title:dungeon.name,steps:dungeonChallengeLines(model.save.dungeonChallengeRecords?.[dungeon.id]),footnote:'首次完整通关获得荣誉「'+dungeonHonorTitle(dungeon.id)+'」，可在角色资料和场景名牌上展示。'}));
  list.querySelector('button')?.focus({preventScroll:true});return;
 }
 const step=trainingStep(session),lesson=session.lesson;
 body.append(guidanceCard({eyebrow:lesson.size===4?'4 对 4 · 分工演练':'2 对 2 · 配合演练',title:lesson.title,body:lesson.summary,footnote:'借卡分步演示，练习靶生命提高、命中固定。正式战斗每人每回合只行动一次，还要考虑先后手、装备和抗性。'}));
 const progress=el('p','tactics-step');setText(progress,session.done?'演练完成':'第 {step} / {total} 步 · 现在操作：{actor}',{step:session.actions.length+1,total:lesson.steps.length,actor:step?session.arena.unitsById[step.actor].name:''});
 body.append(progress);
 if(step)body.append(guidanceCard({title:'本步目标',body:step.text}));
 const message=el('p','tactics-feedback',session.message);message.setAttribute('role','status');message.setAttribute('aria-live','polite');body.append(message);
 const field=el('div','tactics-field'),available=new Set(trainingTargets(session));
 for(const side of ['near','far']){
  const team=el('section','tactics-team',el('h3','',side==='near'?'我方':'陪练方'));
  const units=el('div','tactics-units');
  for(const unit of session.arena.sides[side]){
   const actor=unit.id===step?.actor;
   const eligible=available.has(unit.id);
   const target=button('',()=>cb.target(unit.id),'tactics-unit'+(actor?' acting':'')+(eligible?' available':''));
   target.append(el('strong','',unit.name));
   const hp=el('span','');setText(hp,'生命 {hp} / {max}',{hp:unit.hp,max:unit.maxHp});target.append(hp);
   const effects=[];
   for(const id of unit.charms||[]){const effect=session.arena.resolved.charms[id];if(Number(effect?.boost_damage))effects.push(Number(effect.boost_damage)>0?'强化':'伤害削弱');}
   for(const ward of unit.wards||[]){const effect=session.arena.resolved.wards[ward.id];if(Number(effect?.boost_damage))effects.push(Number(effect.boost_damage)>0?'陷阱':'护盾');}
   target.append(el('small','',effects.join(' · ')||'尚无强化、陷阱或护盾'));target.disabled=session.done;
   if(eligible)target.append(el('small','tactics-target-hint','可选目标'));
   target.setAttribute('aria-label',unit.name+(actor?'，当前行动':'')+'，生命 '+unit.hp+'，'+(effects.join('、')||'无战术效果')+(eligible?'，可选目标':''));
   units.append(target);
  }
  team.append(units);field.append(team);
 }body.append(field);
 if(session.done){
  const {plain,actual,kind}=session.result,difference=Math.abs(actual-plain);
  const result=guidanceCard({eyebrow:'同一攻击 · 实际计算结果',title:kind==='prevented'?'这一击少受了 '+difference+' 点伤害':'这一击多造成了 '+difference+' 点伤害',steps:[(lesson.shielded?'直接攻击带盾目标：':'直接攻击：')+plain+' 点伤害','完成配合：'+actual+' 点伤害'],footnote:'比较最后一击的伤害，准备动作不计入这一击。这个记录来自练习靶，正式战斗的装备、抗性和其他效果会改变数值。',className:'tactics-result'});
  if(model.tacticsTrainingSaved===false){const status=el('p','tactics-feedback','演练已完成，进度尚未保存。点击返回课堂可重试；按 Esc 离开后，再进课堂仍可重试。请先保存成功再切换角色或关闭游戏。');status.setAttribute('role','status');result.append(status);}
  const actions=el('div','tactics-actions');
  if(cb.back)actions.append(button('返回森林委托',cb.back,'primary'));
  actions.append(button('返回课堂，查看记录',cb.menu,cb.back?'secondary':'primary'),button('再练一次',()=>cb.start(lesson.id),'secondary'));
  body.append(result,actions);
  body.querySelector('.tactics-actions .primary')?.focus({preventScroll:true});
 }else{
  const cards=el('div','practice-cards tactics-cards');
  for(const key of trainingCards(session)){
   const card=session.arena.resolved.cards[key],art=model.assets.dataset.cards[key]||card;
   const pick=button([spellFace(model.assets,card,art),el('span','practice-card-caption',art.name||key)],()=>cb.select(key),'practice-card'+(session.selected===key?' selected':''));
   pick.setAttribute('aria-label','选择'+(art.name||key));pick.setAttribute('aria-pressed',String(session.selected===key));cards.append(pick);
  }
  body.append(cards,button('返回课堂',cb.menu,'text-button'));
  if(cb.back)body.append(button('返回森林委托',cb.back,'secondary'));
  (body.querySelector('.tactics-unit.available')||cards.querySelector('.selected')||cards.querySelector('button'))?.focus();
 }
}
