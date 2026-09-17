// Pure quest state machine over profile.quests = {active:{[id]:{progress}}, finished:{[id]:count}}.
// Goal types: Goal (kills via goal_list), GoalItem (drops with producer odds), ClientGoalItem/CustomGoal
// (own N of gsid), ClientDialogNPC (talk). FlashGame / ClientExchangeItem quests are marked unsupported.
import {addItem,itemCount,addExp} from '../progression.js';
import {CURRENCY} from '../data.js';
export const QUEST_ITEM_MIN=70000;
export function questSupported(quest,data=null) {
  if(quest.flashGames.length||quest.exchangeItems.length)return false;
  if(quest.clientGoalItems.some(g=>g.gsid>=QUEST_ITEM_MIN&&!quest.goalItems.some(i=>i.gsid===g.gsid)))return false;
  if(data){const placed=id=>{const goal=data.goals[id];return !!goal&&data.placedTemplates.has(goal.template);};
    if(quest.goals.some(g=>!placed(g.goalId))||quest.goalItems.some(g=>!placed(g.producerId)))return false;}
  return true;
}
export function questAvailable(profile,quest,data) {
  if(!questSupported(quest,data))return false;
  if(profile.quests.active[quest.id])return false;
  const done=profile.quests.finished[quest.id]??0;
  if(done&&!(quest.repeat>0||quest.weekRepeat>0))return false;
  if(quest.level&&(profile.level<quest.level.min||profile.level>quest.level.max))return false;
  if(quest.requestQuests.some(id=>!(profile.quests.finished[id]>0)))return false;
  if(quest.role&&quest.role!==0){const schools={1:'fire',2:'ice',3:'storm',5:'life',6:'death'};if(schools[quest.role]&&schools[quest.role]!==profile.school)return false;}
  return true;
}
export function questsAtNPC(profile,data,npcId) {
  const available=[],completable=[],inProgress=[];
  for(const quest of data.quests) {
    if(quest.startNPC===npcId&&questAvailable(profile,quest,data))available.push(quest);
    const active=profile.quests.active[quest.id];
    if(active&&quest.endNPC===npcId)(goalsMet(profile,quest,data)?completable:inProgress).push(quest);
    else if(active&&quest.dialogNPCs.some(d=>d.npcId===npcId&&!active.progress.dialogs[d.npcId]))inProgress.push(quest);
  }
  return {available,completable,inProgress};
}
export function markerFor(profile,data,npcId) {
  const {available,completable,inProgress}=questsAtNPC(profile,data,npcId);
  if(completable.length)return 'completable';
  if(available.length)return 'available';
  if(inProgress.length)return 'progress';
  return null;
}
export function goalProgress(profile,quest,data) {
  const active=profile.quests.active[quest.id],p=active?.progress??{kills:{},items:{},dialogs:{}};
  const rows=[];
  for(const g of quest.goals){const goal=data.goals[g.goalId];rows.push({kind:'kill',label:`消灭 ${goal?.name??g.goalId}`,have:Math.min(g.count,p.kills[g.goalId]??0),need:g.count,goalId:g.goalId,place:goal?.place??''});}
  for(const g of quest.goalItems)rows.push({kind:'item',label:`收集 ${data.names[g.gsid]??data.ruleset.items[g.gsid]?.name??g.gsid}`,have:Math.min(g.count,itemCount(profile,g.gsid)),need:g.count,gsid:g.gsid,producer:data.goals[g.producerId]?.name??''});
  for(const g of quest.customGoals){const c=data.customGoals[g.id];rows.push({kind:'custom',label:c?.label??`目标 ${g.id}`,have:Math.min(g.count,itemCount(profile,g.id)),need:g.count});}
  for(const g of quest.clientGoalItems)if(!quest.goalItems.some(i=>i.gsid===g.gsid))rows.push({kind:'item',label:`持有 ${data.ruleset.items[g.gsid]?.name??data.names[g.gsid]??g.gsid}`,have:Math.min(g.count,itemCount(profile,g.gsid)),need:g.count,gsid:g.gsid});
  for(const d of quest.dialogNPCs)rows.push({kind:'talk',label:`与 ${npcName(data,d.npcId)} 交谈`,have:p.dialogs[d.npcId]?1:0,need:1,npcId:d.npcId});
  return rows;
}
export function npcName(data,npcId){for(const list of Object.values(data.npcs)){const n=list.find(x=>x.id===npcId);if(n)return n.name;}return `NPC ${npcId}`;}
export function goalsMet(profile,quest,data){return goalProgress(profile,quest,data).every(r=>r.have>=r.need);}
export function acceptQuest(profile,quest,data) {
  if(!questAvailable(profile,quest,data))throw new Error('该任务当前不可接取');
  profile.quests.active[quest.id]={acceptedAt:profile.stats.playtime,progress:{kills:{},items:{},dialogs:{}}};
  return profile.quests.active[quest.id];
}
export function abandonQuest(profile,questId){delete profile.quests.active[questId];}
export function recordDialog(profile,data,npcId) {
  const touched=[];
  for(const [id,active] of Object.entries(profile.quests.active)){const quest=data.questById[id];if(!quest)continue;for(const d of quest.dialogNPCs)if(d.npcId===npcId&&!active.progress.dialogs[npcId]){active.progress.dialogs[npcId]=true;touched.push(quest);}}
  return touched;
}
// mobTemplate is the config path (goal_list rows reference templates, not display names).
// random: () => [0,1). Returns drops so the UI can announce them.
export function recordKill(profile,data,mobTemplate,random=()=>0.5) {
  const drops=[];
  for(const [id,active] of Object.entries(profile.quests.active)) {
    const quest=data.questById[id];if(!quest)continue;
    for(const g of quest.goals){const goal=data.goals[g.goalId];if(goal?.template===mobTemplate&&(active.progress.kills[g.goalId]??0)<g.count)active.progress.kills[g.goalId]=(active.progress.kills[g.goalId]??0)+1;}
    for(const g of quest.goalItems){const producer=data.goals[g.producerId];if(producer?.template!==mobTemplate||itemCount(profile,g.gsid)>=g.count)continue;const odds=g.odds>1?g.odds/100:g.odds;if(random()<odds){addItem(profile,g.gsid,g.producerNum||1);drops.push({gsid:g.gsid,count:g.producerNum||1,quest});}}
  }
  return drops;
}
export function rewardChoices(profile,quest){return quest.rewards.map((group,index)=>({index,choice:group.choice,items:group.items,fixed:group.choice<0||group.items.length<=1}));}
export function finishQuest(profile,quest,data,choice={}) {
  if(!profile.quests.active[quest.id])throw new Error('任务未接取');
  if(!goalsMet(profile,quest,data))throw new Error('任务目标尚未完成');
  const gained=[];let exp=0;
  for(const [index,group] of quest.rewards.entries()) {
    const picks=group.choice<0||group.items.length<=1?group.items:[group.items[choice[index]??0]].filter(Boolean);
    for(const item of picks){if(item.gsid===CURRENCY.exp)exp+=item.count;else{addItem(profile,item.gsid,item.count);gained.push(item);}}
  }
  for(const g of quest.goalItems)if(g.gsid>=QUEST_ITEM_MIN)addItem(profile,g.gsid,-Math.min(g.count,itemCount(profile,g.gsid)));
  delete profile.quests.active[quest.id];
  profile.quests.finished[quest.id]=(profile.quests.finished[quest.id]??0)+1;
  profile.stats.questsDone++;
  const level=addExp(profile,exp);
  return {exp,items:gained,levels:level.levels};
}
export function activeQuests(profile,data){return Object.keys(profile.quests.active).map(id=>data.questById[id]).filter(Boolean);}
// Where the next quests are: per playable world, the lowest level at which a not-yet-finished, supported quest opens.
export function questOutlook(profile,data,hasAsset) {
  const rows=[];
  for(const world of playableWorlds(data,hasAsset)) {
    const ids=new Set((data.npcs[world.name]??[]).map(n=>n.id));
    let available=0,minLevel=Infinity;
    for(const quest of data.quests){if(!ids.has(quest.startNPC)||!questSupported(quest,data)||profile.quests.finished[quest.id]||profile.quests.active[quest.id])continue;
      if(questAvailable(profile,quest,data))available++;const lv=quest.level?.min??0;if(lv>profile.level&&lv<minLevel)minLevel=lv;}
    rows.push({world:world.name,title:world.title??world.label,available,nextLevel:Number.isFinite(minLevel)?minLevel:null,minLevel:world.minLevel??0});
  }
  return rows;
}
// Worlds that can be walked in 2D: calibrated anchors plus a PNG map on the CDN.
export function playableWorlds(data,hasAsset){return data.worlds.filter(w=>w.anchors.length>=3&&w.mapImage&&hasAsset(w.mapImage)&&w.bornPos?.x!=null);}
export function questWorld(data,quest){for(const [world,list] of Object.entries(data.npcs))if(list.some(n=>n.id===quest.startNPC))return world;return null;}
// The tutorial island (魔法营地) has no PNG map, so its quest chain is marked finished once per profile
// instead of blocking every island quest that lists it as a prerequisite. Recorded in profile.quests.skipped.
export function skipUnplayableTutorial(profile,data,hasAsset) {
  if(profile.quests.skipped)return [];
  const playable=new Set(playableWorlds(data,hasAsset).map(w=>w.name));
  const skipped=[];
  for(const quest of data.quests){const world=questWorld(data,quest);if(world==='NewUserIsland'&&!playable.has(world)&&!profile.quests.finished[quest.id]){profile.quests.finished[quest.id]=1;skipped.push(quest.id);}}
  profile.quests.skipped=skipped;
  return skipped;
}
