import {TACTICS_FIELD_ENCOUNTERS as TACTICS_LESSONS} from './tactics_field_battle_core.js';
import {TACTICS_MILESTONES} from './battle_tactics_journal_core.js';

// Optional learning objectives derive from saved receipts, without quest rewards.
export function tacticsNextGoal(save){
 const completed=save.tacticsTraining?.completed||{};
 const lessonsDone=TACTICS_LESSONS.filter(row=>completed[row.id]?.fieldWins>0).length;
 const lesson=TACTICS_LESSONS.find(row=>!completed[row.id]?.fieldWins);
 if(lesson)return {kind:'lesson',id:lesson.id,title:lesson.title,body:lesson.summary,done:lessonsDone,total:TACTICS_LESSONS.length,complete:false};
 const milestone=TACTICS_MILESTONES.find(row=>!save.tacticsRecord?.[row.id]);
 const victoriesDone=TACTICS_MILESTONES.filter(row=>save.tacticsRecord?.[row.id]>0).length;
 if(milestone)return {kind:'field',id:milestone.id,title:milestone.title,body:milestone.body+' 胜利后领取战利品，才会保存这项实绩。',done:victoriesDone,total:TACTICS_MILESTONES.length,complete:false};
 return {kind:'complete',id:'complete',title:'战术委托已完成',body:'四组怪物与三项实战目标都已完成。可以再次出战，或挑战精英副本的个人纪录。',done:TACTICS_MILESTONES.length,total:TACTICS_MILESTONES.length,complete:true};
}
