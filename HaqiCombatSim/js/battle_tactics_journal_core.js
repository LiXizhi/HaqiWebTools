// Receipt of consumed effects. No damage prediction, combat mutation or RNG.
const keys=['boost','trap','shield','weaken','combo','guardCombo','teamCombo'];
export const TACTICS_MILESTONES=[
 {id:'combo',title:'一击双重铺垫',body:'在正式战斗中，让强化与陷阱一起增强同一击。'},
 {id:'guardCombo',title:'让重击轻下来',body:'在正式战斗中，让虚弱与护盾共同削弱同一击。'},
 {id:'teamCombo',title:'多人阵容的蓄力一击',body:'在双人或四人阵容的正式战斗中，完成一次强化与陷阱组合。'},
];
export const emptyTactics=()=>Object.fromEntries(keys.map(key=>[key,0]));
export function roundTacticsReport(battle,events=[]){
 const report=emptyTactics();let cast=null;
 for(const event of events){
  if(event.type==='cast'){cast={caster:event.caster,boost:false,weaken:false,traps:new Set(),shields:new Set(),counted:new Set()};continue;}
  if(event.sourceType==='effect_used'||event.type==='effect_used'){
   const unit=battle.unitsById[event.target],effect=battle.resolved[event.kind==='charm'?'charms':'wards']?.[event.id],boost=Number(effect?.boost_damage);
   if(!unit||!boost)continue;
   const friendly=battle.sides.near.some(row=>row.id===unit.id);
   const kind=event.kind==='charm'?(friendly&&boost>0?'boost':!friendly&&boost<0?'weaken':null):(friendly&&boost<0?'shield':!friendly&&boost>0?'trap':null);
   if(!kind)continue;report[kind]++;
   if(!cast)continue;
   if(event.kind==='charm'&&unit.id===cast.caster)cast[kind]=true;
   if(kind==='trap')cast.traps.add(unit.id);
   if(kind==='shield')cast.shields.add(unit.id);
  }
  if(event.type==='damage'&&cast&&event.caster===cast.caster&&event.amount>=0&&!cast.counted.has(event.target)){
   cast.counted.add(event.target);
   if(event.amount>0&&cast.boost&&cast.traps.has(event.target)){
    report.combo++;if(battle.sides.near.length>1)report.teamCombo++;
   }
   if(cast.weaken&&cast.shields.has(event.target))report.guardCombo++;
  }
 }
 return report;
}
export function recordTacticsRound(pending,battle,playback){
 if(!pending||!Array.isArray(pending.decisions))return false;
 const decisionCount=pending.decisions.length,previous=pending.tactics;
 if(previous?.decisionCount===decisionCount)return false;
 if(previous&&previous.decisionCount>decisionCount)throw new Error('战术记录不能倒退');
 const report=roundTacticsReport(battle,playback?.events);
 const next={version:1,decisionCount,...emptyTactics(),...previous};
 next.decisionCount=decisionCount;
 for(const key of keys)next[key]=Math.min(999999,(previous?.[key]||0)+report[key]);
 pending.tactics=next;return true;
}
export function settleTacticsRecord(save,pending,battle){
 if(battle.winner!=='near'||!pending.tactics)return null;
 const old=save.tacticsRecord||{version:1,wins:0,...emptyTactics()},next={...old,wins:Math.min(999999,old.wins+1)};
 for(const key of keys)next[key]=Math.min(999999,(old[key]||0)+pending.tactics[key]);
 save.tacticsRecord=next;
 return TACTICS_MILESTONES.filter(row=>!old[row.id]&&next[row.id]).map(row=>row.id);
}
export function tacticsReportLines(report){
 if(!report)return [];
 const lines=[];
 if(report.combo)lines.push('强化与陷阱共同增强了 '+report.combo+' 次攻击');
 if(report.guardCombo)lines.push('虚弱与护盾共同削弱了 '+report.guardCombo+' 次攻击');
 if(report.boost)lines.push('强化生效 '+report.boost+' 次');
 if(report.trap)lines.push('陷阱生效 '+report.trap+' 次');
 if(report.shield)lines.push('护盾生效 '+report.shield+' 次');
 if(report.weaken)lines.push('虚弱生效 '+report.weaken+' 次');
 return lines;
}
export function validateTacticsRecords(save){
 const check=(value,fields,label)=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1)throw new Error(label+'无效');
  for(const key of fields)if(!Number.isSafeInteger(value[key])||value[key]<0||value[key]>999999)throw new Error(label+'无效');
 };
 if(save.tacticsRecord!==undefined)check(save.tacticsRecord,['wins',...keys],'战术实绩');
 if(save.pendingEncounter?.tactics!==undefined){
  check(save.pendingEncounter.tactics,['decisionCount',...keys],'本场战术记录');
  if(save.pendingEncounter.tactics.decisionCount!==save.pendingEncounter.decisions?.length)throw new Error('本场战术记录与回合不同步');
 }
}
