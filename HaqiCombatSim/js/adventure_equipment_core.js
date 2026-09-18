// Equipment presentation data. All values come from the chapter and existing combat rules.
import { playerSpec, applyAction, SCHOOL_NAMES } from './adventure_core.js';
import { statIdToEntry } from './combat_unit_core.js';
import { baseMaxHp, applyHpStats, powerPipChanceByLevel } from './combat_formulas_core.js';

export const EQUIPMENT_SLOTS = [{id:2,name:'帽子'},{id:5,name:'法袍'},{id:7,name:'靴子'},{id:11,name:'法杖'},{id:24,name:'卡包'},{id:4,name:'眼饰'},{id:6,name:'裤子'},{id:8,name:'背部'},{id:9,name:'手套'},{id:10,name:'左手'},{id:15,name:'手镯'},{id:16,name:'戒指'},{id:17,name:'项链'},{id:18,name:'炫彩头饰'},{id:19,name:'炫彩服装'},{id:70,name:'炫彩背饰'},{id:71,name:'炫彩鞋子'}];
const STAT_NAMES = {hpFlat:'生命',hpPct:'生命加成',powerPipPct:'超级魔力率',damagePct:'攻击',resistPct:'防御',accuracyPct:'命中',critPct:'暴击',resiliencePct:'韧性',penetration:'穿透',startupNormal:'起始普通魔力',startupPower:'起始超级魔力',damageAbs:'固定攻击',resistAbs:'固定防御',hitPct:'命中率',dodgePct:'闪避率',penetrationReceive:'受穿透',outputHealPct:'治疗加成',inputHealPct:'受治疗加成',critRatioBonus:'暴击伤害加成'};
const percent = stat => stat.endsWith('Pct');
export function equipmentAttributes(item, save, content) {
    const rows=[];
    for(const [id,value] of Object.entries(item.stats)) {
        const entry=statIdToEntry(id);
        if(entry) rows.push({label:`${SCHOOL_STATS.has(entry.stat)?(entry.school==='all'?'全系':SCHOOL_NAMES[entry.school]||entry.school):''}${STAT_NAMES[entry.stat]}`,value:Number(value),unit:percent(entry.stat)?'%':''});
        else if(Number(id)===167||Number(id)===170)rows.push({label:Number(id)===167?'卡包容量':'同卡上限',value:Number(value),unit:'张'});
    }
    const upgrade=content.upgrade.find(row=>row.level===(save.upgrades[item.id]||0));
    if(upgrade)rows.push({label:'强化 · 全系攻击',value:upgrade.attack_percentage,unit:'%'});
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
    return {rows:after.map((row,i)=>({...row,before:before[i].value,delta:row.value-before[i].value})),
        trimmed:save.deck.reduce((n,row)=>n+row.count,0)-next.deck.reduce((n,row)=>n+row.count,0),
        fixedCards:playerSpec(next,content).fixedCards};
}
