import { findEquipmentInstance } from './adventure_equipment_instances_core.js';
import {progressionStatEntry,equipmentSetStats} from './adventure_progression_bonuses_core.js';
// Equipment presentation data. All values come from the chapter and existing combat rules.
import { playerSpec, applyAction, SCHOOL_NAMES,canEquip } from './adventure_core.js';
import { statIdToEntry } from './combat_unit_core.js';
import { baseMaxHp, applyHpStats, powerPipChanceByLevel } from './combat_formulas_core.js';
import { upgradeAt, upgradeAttributes } from './adventure_upgrade_core.js';

export const EQUIPMENT_SLOTS = [{id:2,name:'帽子'},{id:5,name:'法袍'},{id:7,name:'靴子'},{id:11,name:'法杖'},{id:24,name:'卡包'},{id:4,name:'眼饰'},{id:6,name:'裤子'},{id:8,name:'背部'},{id:9,name:'手套'},{id:10,name:'左手'},{id:15,name:'手镯'},{id:16,name:'戒指'},{id:17,name:'项链'},{id:18,name:'炫彩头饰'},{id:19,name:'炫彩服装'},{id:70,name:'炫彩背饰'},{id:71,name:'炫彩鞋子'},{id:'mount',name:'坐骑'}];
const STAT_NAMES = {hpFlat:'生命',hpPct:'生命加成',powerPipPct:'超级魔力率',damagePct:'攻击',resistPct:'防御',accuracyPct:'命中',critPct:'暴击',resiliencePct:'韧性',penetration:'穿透',startupNormal:'起始普通魔力',startupPower:'起始超级魔力',damageAbs:'固定攻击',resistAbs:'固定防御',hitPct:'命中率',dodgePct:'闪避率',penetrationReceive:'受穿透',outputHealPct:'治疗加成',inputHealPct:'受治疗加成',critRatioBonus:'暴击伤害加成'};
const percent = stat => stat.endsWith('Pct');
export const signedAttribute = value => `${value>0?'+':''}${value}`;
export function progressionAttributes(stats) {
    return Object.entries(stats||{}).map(([id,value])=>{
        const entry=progressionStatEntry(id);
        if(!entry)return {label:Number(id)===256?'双倍攻击（原版禁用）':`未接入属性 ${id}`,value:Number(value),unit:''};
        const schoolStat=SCHOOL_STATS.has(entry.stat)||['damageAbs','resistAbs'].includes(entry.stat);
        return {label:`${schoolStat?(entry.school==='all'?'全系':SCHOOL_NAMES[entry.school]||entry.school):''}${STAT_NAMES[entry.stat]}`,value:Number(value)*(entry.scale??1),unit:percent(entry.stat)?'%':''};
    });
}
export function equipmentSetDetails(save,content,itemId) {
    const config=content.progressionBonuses,setId=config?.components?.[itemId];
    if(!setId)return null;
    const equipped=Object.values(save.equipment).filter(id=>canEquip(save,content.items[id],content));
    const count=equipmentSetStats(equipped,config).counts[setId]||0;
    return {setId,count,groups:(config.sets[setId]||[]).map(group=>({items:group.items,active:count>=group.items,attributes:progressionAttributes(group.stats)}))};
}
export function visibleEquipmentSummary(save,content) {
    const primary=new Set(['hp','damagePct','resistPct','accuracyPct','critPct','pip','normal','power','capacity','eachCapacity','fixed']);
    return equipmentSummary(save,content).filter(row=>primary.has(row.key)||row.value!==0);
}
export function unsupportedEquipmentStats(item) {
    const metadata=new Set([36,41,134,135,136,137,138,139,140,141,167,168,169,170,180]);
    return Object.keys(item.stats||{}).filter(id=>Number(item.stats[id])!==0&&!statIdToEntry(id)&&!metadata.has(Number(id)));
}
export function equipmentAttributes(item, save, content, guid) {
    const rows=[];
    for(const [id,value] of Object.entries(item.stats)) {
        const entry=statIdToEntry(id);
        if(entry){
            const schoolStat=SCHOOL_STATS.has(entry.stat);
            const schoolLabel=schoolStat?(entry.school==='all'?'全系':SCHOOL_NAMES[entry.school]||entry.school):'';
            const name=entry.stat==='hpFlat'?'生命值':STAT_NAMES[entry.stat];
            rows.push({label:`${schoolLabel}${name}`,name,schoolLabel,value:Number(value),unit:percent(entry.stat)?'%':''});
        }
        else if(Number(id)===167||Number(id)===170)rows.push({label:Number(id)===167?'卡包容量':'同卡上限',value:Number(value),unit:'张'});
    }
    for(const row of upgradeAttributes(upgradeAt(content,item.id,findEquipmentInstance(save,content,item.id,guid)?.serverdata.addlel||0)))rows.push({...row,label:'强化 · '+row.label});
    for(const id of findEquipmentInstance(save,content,item.id,guid)?.serverdata.gem?.ins||[]){
        const gem=content.items[id];if(!gem)continue;
        for(const [stat,value] of Object.entries(gem.stats)){const entry=statIdToEntry(stat);if(entry)rows.push({label:`宝石 · ${gem.name} · ${SCHOOL_STATS.has(entry.stat)?(entry.school==='all'?'全系':SCHOOL_NAMES[entry.school]||entry.school):''}${STAT_NAMES[entry.stat]}`,value:Number(value),unit:percent(entry.stat)?'%':''});}
    }
    return rows;
}
const SCHOOL_STATS=new Set(['damagePct','resistPct','accuracyPct','critPct','resiliencePct','penetration']);
export function equipmentCards(item,content) {
    return [139,140,141].map(id=>content.cardItems[item?.stats[id]]).filter(Boolean);
}
export function equipmentSummary(save,content) {
    const spec=playerSpec(save,content),s=spec.stats;
    const school=stat=>(s[stat].all||0)+(s[stat][save.school]||0);
    // Reuse player_server.lua HP / power-pip ports; no separate UI formula.
    return [
        {key:'hp',label:'最大生命',value:applyHpStats(baseMaxHp(save.school,save.level,'kids'),s.hpPct,s.hpFlat,'kids'),unit:''},
        ...[['damagePct','本系攻击'],['resistPct','本系防御'],['accuracyPct','本系命中'],['critPct','本系暴击']].map(([key,label])=>({key,label,value:school(key),unit:'%'})),
        ...[['resiliencePct','本系韧性'],['penetration','本系穿透'],['damageAbs','本系固定攻击'],['resistAbs','本系固定防御']].map(([key,label])=>({key,label,value:school(key),unit:percent(key)?'%':''})),
        ...['outputHealPct','inputHealPct','hitPct','dodgePct','penetrationReceive','critRatioBonus'].map(key=>({key,label:STAT_NAMES[key],value:s[key]||0,unit:percent(key)?'%':''})),
        ...Object.keys(SCHOOL_NAMES).filter(element=>element!==save.school).flatMap(element=>['damagePct','resistPct','accuracyPct','critPct','resiliencePct','penetration'].map(key=>({key:`${element}.${key}`,label:`${SCHOOL_NAMES[element]}${STAT_NAMES[key]}`,value:(s[key].all||0)+(s[key][element]||0),unit:percent(key)?'%':''}))),
        {key:'pip',label:'超级魔力率',value:Math.min(100,powerPipChanceByLevel(save.level,'kids')+s.powerPipPct),unit:'%'},
        {key:'normal',label:'起始普通魔力',value:s.startupNormal,unit:''},
        {key:'power',label:'起始超级魔力',value:s.startupPower,unit:''},
        {key:'capacity',label:'卡包容量',value:spec.deckCapacity,unit:'张'},
        {key:'eachCapacity',label:'单卡上限',value:spec.deckEachCapacity,unit:'张'},
        {key:'fixed',label:'装备附加牌',value:spec.fixedCards.length,unit:'张'},
    ];
}
export function previewEquipment(save,content,action) {
    const next=JSON.parse(JSON.stringify(save));
    applyAction(next,content,action);
    const before=equipmentSummary(save,content),after=equipmentSummary(next,content);
    const previous=new Map(before.map(row=>[row.key,row.value]));
    return {rows:after.map(row=>({...row,before:previous.get(row.key)||0,delta:row.value-(previous.get(row.key)||0)})),
        trimmed:save.deck.reduce((n,row)=>n+row.count,0)-next.deck.reduce((n,row)=>n+row.count,0),
        fixedCards:playerSpec(next,content).fixedCards};
}
