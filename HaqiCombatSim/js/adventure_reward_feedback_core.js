// Transient presentation data only: never persisted or used to grant rewards.
export function rewardSnapshot(save) {
    return {xp:save.xp,level:save.level,inventory:{...save.inventory},cards:{...save.cards},pets:Object.keys(save.pets||{})};
}
export function rewardChanges(before,save,content) {
    const items=Object.entries(save.inventory).flatMap(([id,count])=>{
        const gained=count-(before.inventory[id]||0),item=content.items[id];
        return gained>0&&item?[{kind:'item',id:Number(id),count:gained,name:item.name,gear:(item.kind===1||item.slot===24)&&item.slot>0}]:[];
    });
    const cards=Object.keys(save.cards).filter(key=>save.cards[key]>0&&!before.cards[key]).map(key=>({kind:'card',key,count:1,name:content.cards?.[key]?.name||content.cardLibrary?.find(row=>row.key===key)?.name||key}));
    const pets=Object.keys(save.pets||{}).filter(id=>!before.pets.includes(id)).map(id=>({kind:'pet',id,count:1,name:content.pets?.[id]?.name||save.pets[id].name||'新伙伴'}));
    return {xp:Math.max(0,save.xp-before.xp),fromLevel:before.level,level:save.level>before.level?save.level:null,items:[...items,...cards,...pets]};
}
