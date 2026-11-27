import {HUNT_ID,previewHuntReward} from './adventure_hunt_core.js';

// Result feedback uses only the recorded fight. Previewing never awards or rerolls loot.
export function huntResultFeedback(save,content,battle){
 if(save.pendingEncounter?.encounterId!==HUNT_ID)return null;
 const won=battle.winner==='near',team=new Set(battle.sides.near.map(unit=>unit.id));
 const history=battle.tacticalEncounter?.history||[];
 const heavy=history.filter(row=>row.effect==='重击'&&row.outcome==='resolved');
 const defended=heavy.filter(row=>row.shieldConsumed||row.weakenConsumed).length;
 const exposed=heavy.filter(row=>!row.shieldConsumed&&!row.weakenConsumed&&row.damage?.some(hit=>team.has(hit.target)&&hit.amount>0)).length;
 const counters=(battle.events||[]).filter(row=>row.type==='tactic_counter_window'&&team.has(row.targetId)).length;
 const used=(battle.events||[]).filter(row=>row.type==='tactic_charge'&&row.action==='consumed'&&team.has(row.targetId)&&row.statusId===battle.resolved.tacticalEncounter?.counterCharms[battle.unitsById[row.targetId]?.school]).length;
 const review={defended,exposed,counters,used,
  summary:`重击应对 ${defended} 次 · 重击直击 ${exposed} 次 · 反击加成使用 ${used} 次`,
  lesson:exposed>0
  ?'这次有重击直接命中。援助护盾留到“重击”回合再用，蓄力时先破盾或攒能量。'
  :counters>used
   ?'你已经争取到反击加成。这次还有加成未用上；下次可在恢复回合接本系攻击，含持续伤害。'
  :used>0
   ?'你把减伤后的反击接上了。下次继续看预告：蓄力时准备，重击时防御，恢复时反击。'
  :defended>0
   ?'你已经挡住了重击。触发反制后，用本系攻击接上；恢复回合可以治疗或攒能量。'
   :'留意当前与下一回合的预告：蓄力时准备，重击时护盾或虚弱，恢复时反击。'};
 if(!won)return {won,review,title:'再看一遍他的出招规律',body:review.lesson,steps:[review.summary],
  footnote:'本次没有获得猎印，也不会扣除已有猎印和装备。回到地图会自动恢复生命，休整后可再次挑战。'};
 const reward=previewHuntReward(save,content,save.pendingEncounter);
 const remaining=Math.max(0,reward.exchangeCost-reward.marks);
 return {won,reward,review,title:reward.dropped?'珍品掉落！':'每次胜利都接近珍品',steps:[review.summary,review.lesson],
  body:`余烬猎印 +${reward.marksPerWin} · 结算后 ${reward.marks} / ${reward.exchangeCost}`+
   '；巡林备用帽 +1，可回收重复件。'+(reward.dropped?`额外获得「${content.items[reward.selected].name}」。`:''),
  footnote:remaining?`再获 ${remaining} 枚猎印即可自选一件。直接掉落不会清空猎印进度。`:'猎印已足够自选一件。结算后前往猎印锻造兑换。'};
}
