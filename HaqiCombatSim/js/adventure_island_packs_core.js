// Pure installation of authored, replaceable island content. No save format change.
import {installCatalogQuests} from './adventure_catalog_quests_core.js';
import {installIslandEncounters} from './adventure_island_encounters_core.js';
const assert=(ok,message)=>{if(!ok)throw Error('岛屿扩展配置无效：'+message);};
export function validateIslandPacks(packs,content){
    const npcIds=new Set(Object.keys(content.npcs).map(Number)),questIds=new Set([...(content.quests||[]),...(content.catalogQuests?.quests||[])].map(q=>q.id));
    const zones=new Set(),encounters=new Set(content.encounters.map(e=>e.id));
    for(const pack of packs){
        assert(pack.version===1&&pack.island?.id&&pack.island.name,'版本或岛名');
        assert(!zones.has(pack.island.id),'重复岛屿');zones.add(pack.island.id);
        assert(Number.isInteger(pack.island.recommendedLevel)&&pack.island.recommendedLevel>0,'等级');
        for(const npc of pack.npcs){assert(Number.isInteger(npc.id)&&!npcIds.has(npc.id)&&npc.zone===pack.island.id,'居民编号');npcIds.add(npc.id);assert(content.npcs[npc.appearanceSourceId],'居民外观来源');}
        for(const q of pack.quests){assert(Number.isInteger(q.id)&&!questIds.has(q.id),'任务编号');questIds.add(q.id);}
        for(const e of pack.encounters){assert(!encounters.has(e.id)&&e.zone===pack.island.id,'遭遇编号');encounters.add(e.id);}
    }
    for(const pack of packs)for(const q of pack.quests){
        assert(npcIds.has(q.startNpc)&&npcIds.has(q.endNpc),'任务居民');
        assert(q.region===pack.island.id&&!q.repeat,'任务区域');
        for(const p of q.prerequisites)assert(questIds.has(p.id)&&p.id!==q.id,'任务前置');
        for(const group of q.groups){assert(['talk','kill'].includes(group.kind),'目标类型');for(const g of group.items){assert(Number.isInteger(g.count)&&g.count>0,'目标数量');assert(group.kind==='kill'||npcIds.has(g.id),'交谈目标');}}
        for(const [rows,terminal] of [[q.startDialog,'doaccept'],[q.endDialog,'dofinished'],...q.talks.map(t=>[t.dialog,'donpcdialoged'])]){
            assert(rows.length,'空对白');rows.forEach((r,i)=>{assert(npcIds.has(r.npcId)&&r.text&&r.buttons.length===1&&r.buttons[0].action===(i===rows.length-1?terminal:'gotonext'),'对白动作');});
        }
    }
    const packQuests=new Map(packs.flatMap(p=>p.quests).map(q=>[q.id,q]));
    const visiting=new Set(),visited=new Set();
    function visit(id){
        if(visited.has(id)||!packQuests.has(id))return;
        assert(!visiting.has(id),'任务前置循环');visiting.add(id);
        for(const p of packQuests.get(id).prerequisites)visit(p.id);
        visiting.delete(id);visited.add(id);
    }
    for(const id of packQuests.keys())visit(id);
    for(const pack of packs){
        const monsters=new Set(pack.monsters.map(m=>m.id)),goals=new Set(Object.values(pack.goalPaths));
        assert(monsters.size===pack.monsters.length,'重复怪物');
        for(const m of pack.monsters){assert(m.id&&m.templateId&&Number.isInteger(m.stats.level)&&m.stats.level>=pack.island.recommendedLevel&&m.stats.hp>0&&m.stats.xp>=0&&m.stats.coins>=0,'怪物属性');assert(Number.isInteger(pack.goalPaths[m.id]),'怪物目标映射');}
        for(const e of pack.encounters)assert(monsters.has(e.monsterId)&&Number.isFinite(e.x)&&Number.isFinite(e.y),'遭遇怪物或位置');
        for(const q of pack.quests)for(const g of q.groups.filter(g=>g.kind==='kill'))for(const item of g.items)assert(goals.has(item.id),'击败目标映射');
        for(const j of pack.journeys){assert(j.island===pack.island.id&&j.enemyTemplateIds.every(id=>monsters.has(id)),'副本区域或怪物');assert(j.kind==='tower'?Number.isInteger(j.floors)&&j.floors>0:Number.isInteger(j.arenaCount)&&j.arenaCount>0,'副本关卡数量');}
    }
    return true;
}
export function installIslandPackActors(content,packs){
    for(const pack of packs)for(const npc of pack.npcs){
        const source=content.npcs[npc.appearanceSourceId];
        const row={...structuredClone(source),...structuredClone(npc),instanceId:`island-pack:${npc.zone}:${npc.id}`,hidden:false,enabled:'',buttons:[],portrait:structuredClone(source.portrait),source:`data/adventure/island-packs/${pack.island.id}.json`};
        // This is a new character using an existing appearance, not the original NPC.
        delete row.character;delete row.originalPosition;
        content.npcs[row.id]=row;
        content.npcCatalog?.npcs.push(row);
    }
    content.islandPacks=packs;
}
export function installIslandPackEncounters(content,dataset,packs,templates,cards,names){
    const monsters={},encounters=[];
    for(const pack of packs)for(const row of pack.monsters){
        const original=templates[row.templateId];assert(original,'怪物模板 '+row.templateId);
        const m=structuredClone(original);Object.assign(m,row.stats,{id:row.id,name:row.name,source:row.id,appearanceSource:original.source});
        m.attributes={...m.attributes,level:m.level,hp:m.hp,experience_pts:m.xp,joybean_count:m.coins};
        monsters[m.id]=m;
    }
    for(const pack of packs)encounters.push(...pack.encounters);
    installIslandEncounters(content,dataset,{version:1,monsters,encounters},cards,names);
    assert(encounters.every(e=>!content.encounters.find(row=>row.id===e.id).blocked.length),'新怪物含未支持行为');
}
export function installIslandPackQuests(content,packs){
    const paths={...content.catalogQuests.paths},quests=[...content.catalogQuests.quests];
    for(const pack of packs){Object.assign(paths,pack.goalPaths);quests.push(...structuredClone(pack.quests));}
    installCatalogQuests(content,{version:1,paths,quests});
}
export function islandPackJournal(packs){
    return packs.flatMap(pack=>pack.quests.map(q=>({id:q.id,title:q.title,description:q.description,region:q.region,obsolete:false,startNpc:pack.npcs.find(n=>n.id===q.startNpc).name,endNpc:pack.npcs.find(n=>n.id===q.endNpc).name,objectives:q.groups.flatMap(g=>g.items.map(i=>({type:g.kind==='talk'?'ClientDialogNPC':'Goal',id:String(i.id),name:i.name,count:String(i.count)}))),prerequisites:q.prerequisites.map(p=>({...p,title:pack.quests.find(r=>r.id===p.id)?.title||''})),requirements:q.requirements.map(r=>({name:'等级',min:String(r.min)})),rewards:q.rewards,repeat:'0'})));
}
