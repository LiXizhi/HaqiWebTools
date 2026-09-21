import {statIdToEntry} from './combat_unit_core.js';
export function progressionStatEntry(id) {
    const value=Number(id),schools=['all','fire','ice','storm','myth','life','death','balance'];
    if(value>=151&&value<=158)return {stat:'damageAbs',school:schools[value-151]};
    if(value>=159&&value<=166)return {stat:'resistAbs',school:schools[value-159]};
    if(value===188)return {stat:'dodgePct'};
    if(value===376)return {stat:'critRatioBonus',scale:0.001};
    return statIdToEntry(value);
}
export function equipmentSetStats(equipped,config) {
    const counts={},stats={};
    for(const id of new Set(equipped)){
        const setId=config?.components?.[id];
        if(setId)counts[setId]=(counts[setId]||0)+1;
    }
    for(const [setId,count] of Object.entries(counts))for(const group of config.sets[setId]||[]){
        if(count<group.items)continue;
        for(const [id,value] of Object.entries(group.stats))stats[id]=(stats[id]||0)+value;
    }
    return {counts,stats};
}
export function dragonTotemStage(config,professionId,expId=50359,experience=0) {
    if(!Number.isSafeInteger(experience)||experience<0)throw Error('龙图腾经验无效');
    const rows=config?.professions?.[professionId]||[];
    return [...rows].sort((left,right)=>right.exp-left.exp).find(row=>row.expId===expId&&experience>=row.exp)||null;
}