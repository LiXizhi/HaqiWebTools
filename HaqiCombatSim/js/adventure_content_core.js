// Fail closed on required content outside this chapter's supported vocabulary.
import { isSupportedType } from './combat_cards_core.js';
const assert=(ok,message)=>{if(!ok)throw new Error(`章节数据无效：${message}`);};
export function validateAdventureContent(c,d,assets) {
    assert(c.schemaVersion===1&&c.contentVersion==='kids-opening-1','版本');
    assert(c.quests?.length===14&&c.quests.every((q,i)=>q.id===63000+i),'任务编号');
    assert(!c.missingAssets?.length,'缺少必要资源');
    const image=(ref,required=true)=>{
        if(!ref&&!required)return;
        assert(ref&&assets[ref.id],`图片 ${ref?.id}`);
        if(ref.crop)assert(ref.crop.length===4&&ref.crop.every(Number.isFinite)&&ref.crop[2]>0&&ref.crop[3]>0,`图片裁剪 ${ref.id}`);
    };
    const card=key=>assert(d.cards[key]&&isSupportedType(d.cards[key].type),`未支持卡牌 ${key}`);
    const actions=new Set(['gotonext','doaccept','dofinished','donpcdialoged','closedialog']);
    const dialogue=rows=>{assert(rows?.length,'空白对话');for(const line of rows){assert(c.npcs[line.npcId]&&typeof line.text==='string','对话居民');for(const b of line.buttons)assert(actions.has(b.action),`对话动作 ${b.action}`);}};
    const goals=new Set(['79016','79019','79037','hatch-pet']);
    for(const [index,q]of c.quests.entries()) {
        assert(c.npcs[q.startNpc]&&c.npcs[q.endNpc],`任务 ${q.id} 居民`);
        for(const dependency of q.requires)assert(c.quests.slice(0,index).some(p=>p.id===dependency),`任务依赖 ${dependency}`);
        dialogue(q.startDialog);dialogue(q.endDialog);
        for(const t of q.talks){assert(c.npcs[t.npcId],`交谈 ${t.npcId}`);dialogue(t.dialog);}
        for(const goal of q.goals){
            assert(Number.isInteger(goal.count)&&goal.count>0,'目标数量');
            if(goal.kind==='talk')assert(c.npcs[goal.id],`任务居民 ${goal.id}`);
            else if(goal.kind==='defeat')assert(Object.values(c.monsters).some(m=>m.goalId===goal.id),`任务怪物 ${goal.id}`);
            else assert(goal.kind==='action'&&goals.has(String(goal.id)),`任务动作 ${goal.id}`);
        }
        for(const group of q.rewards)for(const reward of group.items)assert(c.items[reward.id]&&Number.isInteger(reward.count)&&reward.count>0,`奖励 ${reward.id}`);
    }
    for(const n of Object.values(c.npcs))image(n.portrait);
    for(const item of Object.values(c.items)) {
        image(item.art,false);
        for(const stat of [139,140,141])if(item.stats?.[stat])card(c.cardItems[item.stats[stat]]);
    }
    for(const rows of Object.values(c.learn))for(const lesson of rows){card(lesson.key);assert(c.items[lesson.itemId],'学习物品');}
    const supportedParams=new Set(['charms','wards','damage_min','damage_max','damage_school','convert_rate','dots','icon_gsid','dots_damage_school','cooldown','heal_min','heal_max','hots','bCharging']);
    for(const spell of Object.values(d.cards)) {
        for(const key of Object.keys(spell.params))assert(supportedParams.has(key),`未支持卡牌效果 ${spell.key}/${key}`);
        card(spell.key);image(spell.art);
        if(spell.params.bCharging)assert(d.pve?.stormChargingWardIds?.length===5&&d.pve.stormChargingWardIds.every(id=>d.charms.ward[id]),'狂风印记模板');
        for(const [key,group]of [['charms','charm'],['wards','ward']])if(spell.params[key]!==undefined) {
            for(const id of String(spell.params[key]).split(','))assert(d.charms[group][id],`${spell.key} 的 ${key}:${id}`);
        }
    }
    const instructionKeys=new Set(['round','card','card_set','speak','accuracy_boost','force_pip_cost','target_hostile','target_friendly','hp_drop','hp_range','priority','priority_weight_percent']);
    const targets=new Set(['self','max_max_hp','lowest_hp','random_friendly','random_hostile','threat_highest']);
    for(const m of Object.values(c.monsters)) {
        assert(m.attributes.ai_module==='Genes_Attacker',`怪物AI ${m.id}`);
        for(const row of [...m.pool,...Object.values(m.cardsets).flat()]){card(row.key);assert(Number.isFinite(row.weight)&&row.weight>0,'AI权重');}
        for(const row of [...m.sequences.flat(),...m.genes]) {
            for(const key of Object.keys(row))assert(instructionKeys.has(key),`未支持AI指令 ${m.id}/${key}`);
            if(row.card)card(row.card);
            else assert(m.cardsets[row.card_set],`AI卡池 ${row.card_set}`);
            if(row.round)assert(/^\d+[+-]?$/.test(row.round),`AI回合 ${row.round}`);
            for(const key of ['target_hostile','target_friendly'])if(row[key])assert(targets.has(row[key]),`AI目标 ${row[key]}`);
        }
    }
    for(const e of c.encounters)assert(c.monsters[e.monsterId]&&c.arenas.some(a=>a.id===e.sourceArenaId&&a.zone===e.zone&&a.monsters.includes(e.monsterId)),`遭遇 ${e.id}`);
    assert(c.items[c.pet.itemId]&&c.items[c.pet.foodId]&&c.pet.foodXp>0,'宠物');
    image(c.extras.campMap);image(c.extras.townMap);
    return {quests:c.quests.length,npcs:Object.keys(c.npcs).length,encounters:c.encounters.length,cards:Object.keys(d.cards).length,assets:Object.keys(assets).length};
}
