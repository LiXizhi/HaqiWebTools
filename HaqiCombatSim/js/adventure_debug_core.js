// Debug save editing only. Combat formulae and runtime balance parameters are unchanged.
import { parseSave, availableCardLessons, syncDeckLayouts, syncProgression, canEquip, deckLimits, deckCardCopies, recommendedDeck, petLevel } from './adventure_core.js';
import { clampDeck } from './combat_unit_core.js';
import { upgradeLevels } from './adventure_upgrade_core.js';
import { findEquipmentInstance, syncEquipmentInstances } from './adventure_equipment_instances_core.js';

const check=(ok,message)=>{if(!ok)throw new Error(message);};
export function debugFields(save,content) {
    const fields=[],add=(id,label,group,value,min=0,max=Number.MAX_SAFE_INTEGER)=>fields.push({id,label,group,value,min,max});
    add('level','角色等级','角色',save.level,1,content.progression.levelCap);
    add('xp','累计经验','角色',save.xp);
    for(const id of [100,17213])if(content.items[id])add(`inventory:${id}`,content.items[id].name,'货币',save.inventory[id]||0);
    for(const item of Object.values(content.items)) {
        if([100,113,17213].includes(item.id)||content.cardItems[item.id])continue;
        add(`inventory:${item.id}`,`${item.name} · ${item.id}`,'物品',save.inventory[item.id]||0);
    }
    for(const item of Object.values(content.items))if(upgradeLevels(content,item.id).length)add(`upgrade:${item.id}`,`${item.name}强化等级`,'强化',save.upgrades[item.id]||0,0,Math.max(...upgradeLevels(content,item.id).map(row=>row.level)));
    for(const lesson of availableCardLessons(save,content).filter(row=>row.supported!==false))add(`card:${lesson.key}`,`${content.items[lesson.itemId]?.name||lesson.name||'法术卡牌 '+(lesson.itemId||content.learn[save.school].indexOf(lesson)+1)}`,'卡牌',save.cards[lesson.key]||0,save.cards[lesson.key]?1:0,lesson.copies);
    // Legacy pet uses chapter XP. Expanded party pets own a separate progression protocol.
    if(save.pet&&!content.pets)add('petXp','宠物累计经验','宠物',save.pet.xp,0,content.pet.levels.max_exp);
    return fields;
}
export function debugLevelForXp(xp,content) {
    return Math.min(content.progression.levelCap,content.progression.xpThresholds.filter(n=>xp>=n).length);
}
export function prepareDebugEdit(save,content,patch) {
    check(!save.pendingEncounter,'请先完成当前战斗，再修改属性');
    check(patch&&typeof patch==='object'&&!Array.isArray(patch),'属性修改格式无效');
    const fields=debugFields(save,content),byId=new Map(fields.map(field=>[field.id,field]));
    for(const [key,value] of Object.entries(patch)) {
        const field=byId.get(key);check(field,`不支持修改属性：${key}`);
        check(Number.isSafeInteger(value)&&value>=field.min&&value<=field.max,`${field.label}必须是 ${field.min} 至 ${field.max} 的整数`);
    }
    const next=JSON.parse(JSON.stringify(save)),notes=[];
    if(Object.hasOwn(patch,'level'))next.xp=content.progression.xpThresholds[patch.level-1];
    if(Object.hasOwn(patch,'xp')){
        check(!Object.hasOwn(patch,'level')||debugLevelForXp(patch.xp,content)===patch.level,'等级与累计经验不一致');
        next.xp=patch.xp;
    }
    for(const [key,value] of Object.entries(patch))if(key.startsWith('inventory:'))next.inventory[key.slice(10)]=value;
    for(const [key,value] of Object.entries(patch)) {
        const [kind,id]=key.split(':');
        if(kind==='upgrade'){
            check(!value||(next.inventory[id]||0)>0,'请先拥有装备，再设置强化等级');
            next.upgrades[id]=value;
            const instance=findEquipmentInstance(next,content,id);
            if(instance){syncEquipmentInstances(next,content);next.equipmentInstances.find(row=>row.guid===instance.guid).serverdata.addlel=value;}
        }
        if(kind==='card'){if(value)next.cards[id]=value;else delete next.cards[id];}
        if(key==='petXp'){next.pet.xp=value;next.pet.level=petLevel(value,content);}
    }
    syncProgression(next,content);
    for(const [slot,id] of Object.entries(next.equipment))if(!canEquip(next,content.items[id],content)){
        delete next.equipment[slot];notes.push(`自动卸下：${content.items[id].name}`);
    }
    for(const id of Object.keys(next.upgrades))if(!(next.inventory[id]>0)){delete next.upgrades[id];notes.push('已清除未持有装备的强化记录');}
    syncEquipmentInstances(next,content);
    const ownedDeck=next.deck.map(row=>({...row,count:Math.min(row.count,deckCardCopies(next,content,row.key))})).filter(row=>row.count>0);
    next.deck=clampDeck(ownedDeck,{...deckLimits(next,content),version:'kids'}).deck;
    if(!next.deck.length)next.deck=recommendedDeck(next,content);
    if(JSON.stringify(next.deck)!==JSON.stringify(save.deck))notes.push('配卡已按持有数量及卡包容量调整');
    syncDeckLayouts(next,content);
    const rows=debugFields(next,content),changes=rows.filter(row=>row.value!==byId.get(row.id)?.value).map(row=>({...row,before:byId.get(row.id)?.value||0}));
    next.revision=(save.revision||0)+1;
    return {save:parseSave(next,content),changes,notes};
}
