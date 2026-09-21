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