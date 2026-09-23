// Journal rows stay a display projection. Progress lives in adventure_catalog_quests_core.js.
import {islandFor} from './adventure_world_map_core.js';
import {currentQuest,questState,questReady} from './adventure_core.js';
import {catalogQuestStatus} from './adventure_catalog_quests_core.js';
export const QUEST_REGIONS={camp:'魔法营地',town:'哈奇岛',fire:'火鸟岛',ice:'寒冰岛',desert:'沙漠岛',dark:'幽暗岛','21':'魔法师之路','22':'试炼秘境'};
export function defaultJournalRegion(save){
    return islandFor(save.zone)?.id||islandFor(save.dungeonReturn?.zone)?.id||'town';
}
const children=(n,tag)=>n?.children?.filter(c=>c.tag===tag)||[];
const child=(n,tag)=>children(n,tag)[0];
const text=(n,tag)=>child(n,tag)?.text||'';
export function projectQuestJournal(catalog) {
    const tables=catalog.tables;
    const named=file=>Object.fromEntries((tables[file]?.data.children||[]).map(n=>[text(n,'id'),text(n,'label')||text(n,'name')||text(n,'desc')]));
    const npc=named('npc_list.xml'),items=named('reward_list.xml'),attrs=named('attr_list.xml');
    for(const n of catalog.worldNpcs||[])if(n.data.attributes.name)npc[n.id]=n.data.attributes.name;
    const goals=Object.fromEntries(tables['goal_list_excel.xml'].goals.map(g=>[g.id,g.name]));
    const sources={Goal:goals,GoalItem:named('quest_item_list.xml'),ClientGoalItem:named('client_item_list.xml'),ClientExchangeItem:named('client_exchange_item_list.xml'),FlashGame:named('flash_game_list.xml'),ClientDialogNPC:npc,CustomGoal:{...items,...named('custom_goal_list.xml')}};
    const active=catalog.quests.filter(q=>!q.obsolete);
    const obsoleteIds=new Set(catalog.quests.filter(q=>q.obsolete).map(q=>Number(q.id)));
    const titles=Object.fromEntries(active.map(q=>[q.id,q.title]));
    const npcName=id=>id==='-1'?'自己':npc[id]||`居民 ${id||'未知'}`;
    return {version:1,quests:active.map(q=>({id:q.id,title:q.title,description:q.description,region:q.island||q.group[1],obsolete:q.obsolete,
        startNpc:npcName(q.startNpc),endNpc:npcName(q.endNpc),
        objectives:Object.entries(sources).flatMap(([tag,names])=>children(child(q.data,tag),'item').map(i=>({type:tag,id:i.attributes.id,name:names[i.attributes.id]||`目标 ${i.attributes.id}`,count:i.attributes.value||'1'}))),
        prerequisites:q.requires.filter(r=>!obsoleteIds.has(Number(r.id))).map(r=>({id:Number(r.id),title:titles[r.id]||`任务 ${r.id}`,value:r.value})),
        requirements:children(child(q.data,'RequestAttr'),'item').map(i=>({name:attrs[i.attributes.id]||`条件 ${i.attributes.id}`,min:i.attributes.value,max:i.attributes.topvalue})),
        rewards:children(child(q.data,'Reward'),'items').map(g=>({choice:g.attributes.choice,schoolFilter:g.attributes.schoolfilter==='1',items:children(g,'item').map(i=>({id:Number(i.attributes.id),name:items[i.attributes.id]||`物品 ${i.attributes.id}`,count:i.attributes.value||'1'}))})),
        repeat:text(q.data,'QuestRepeat'),validDate:text(q.data,'ValidDate')
    }))};
}
export function journalQuestStatus(save,content,row,stats) {
    const playable=content.quests.find(q=>q.id===row.id);
    if(playable){const state=questState(save,row.id);return state.claimed?'已完成':state.accepted?(questReady(save,playable)?'可交付':'进行中'):currentQuest(save,content)?.id===row.id?'可接取':'未开启';}
    const quest=content.catalogQuests?.byId[row.id];
    if(quest)return catalogQuestStatus(save,content,quest,stats||{});
    return row.obsolete?'原版已废除':'尚未开放';
}
export function focusJournalQuest(rows,filters,selectedId,pageSize,save,content,stats) {
    const id=Number(selectedId),next={...filters};
    if(!Number.isInteger(id))return {filters:next,page:0};
    const match=quest=>Number(quest.id)===id;
    let index=filterJournalQuests(rows,next,save,content,stats).findIndex(match);
    if(index<0){
        const quest=rows.find(match);
        next.region=quest&&QUEST_REGIONS[quest.region]?quest.region:'';
        index=filterJournalQuests(rows,next,save,content,stats).findIndex(match);
    }
    return {filters:next,page:index>=0?Math.floor(index/pageSize):0};
}
export function filterJournalQuests(rows,{region='',status='',query=''}={},save,content,stats) {
    const needle=query.trim().toLocaleLowerCase();
    return rows.filter(q=>!q.obsolete&&(!region||q.region===region)&&(!status||journalQuestStatus(save,content,q,stats)===status)&&(!needle||`${q.id} ${q.title}`.toLocaleLowerCase().includes(needle)));
}
