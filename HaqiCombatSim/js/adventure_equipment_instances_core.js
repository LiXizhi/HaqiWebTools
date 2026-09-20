import {upgradeAt} from './adventure_upgrade_core.js';
// Item_CombatApparel.lua L588–696: addlel and gem belong to an item GUID, not its GSID.
const copy=value=>JSON.parse(JSON.stringify(value));
export function equipmentInstances(save,content) {
    const rows=copy(save.equipmentInstances||[]);let serial=save.nextEquipmentGuid||1;
    for(const item of Object.values(content.items).filter(item=>item.kind===1||item.slot===24)) {
        const count=save.inventory[item.id]||0,owned=rows.filter(row=>row.gsid===item.id);
        // Keep the equipped instance first when a debug edit reduces a stack.
        owned.sort((a,b)=>Number(b.guid===save.equipmentGuids?.[item.slot])-Number(a.guid===save.equipmentGuids?.[item.slot]));
        for(const row of owned.slice(count))rows.splice(rows.indexOf(row),1);
        for(let i=owned.length;i<count;i++)rows.push({guid:`equipment-${serial++}`,gsid:item.id,serverdata:{addlel:i===0?(save.upgrades[item.id]||0):0}});
    }
    return {rows,serial};
}
export function findEquipmentInstance(save,content,itemId,guid) {
    const rows=equipmentInstances(save,content).rows;
    if(guid)return rows.find(row=>row.guid===guid&&(!itemId||row.gsid===Number(itemId)));
    const selected=save.equipmentGuids?.[content.items[itemId]?.slot];
    return rows.find(row=>row.gsid===Number(itemId)&&row.guid===selected)||rows.find(row=>row.gsid===Number(itemId));
}
export function syncEquipmentInstances(save,content) {
    const {rows,serial}=equipmentInstances(save,content);
    save.equipmentInstances=rows;save.nextEquipmentGuid=serial;save.equipmentGuids??={};
    for(const slot of Object.keys(save.equipmentGuids))if(!save.equipment[slot])delete save.equipmentGuids[slot];
    for(const [slot,id] of Object.entries(save.equipment)) {
        const owned=rows.filter(row=>row.gsid===id);
        if(!owned.some(row=>row.guid===save.equipmentGuids[slot]))save.equipmentGuids[slot]=owned[0]?.guid;
    }
    // Compatibility projection for v1/v2 saves and older consumers; instances are authoritative.
    for(const id of Object.keys(save.upgrades))if(!(save.inventory[id]>0))delete save.upgrades[id];
    for(const id of new Set(rows.map(row=>row.gsid))) {
        const level=findEquipmentInstance(save,content,id)?.serverdata.addlel||0;
        if(level||Object.hasOwn(save.upgrades,id))save.upgrades[id]=level;
    }
}
export function validateEquipmentInstances(save,content) {
    const check=(ok)=>{if(!ok)throw Error('存档装备实例无效');};
    if(save.equipmentInstances===undefined){check(save.equipmentGuids===undefined&&save.nextEquipmentGuid===undefined);return;}
    check(Array.isArray(save.equipmentInstances)&&save.equipmentGuids&&typeof save.equipmentGuids==='object'&&!Array.isArray(save.equipmentGuids));
    check(Number.isSafeInteger(save.nextEquipmentGuid)&&save.nextEquipmentGuid>0);
    const seen=new Set(),counts={};
    for(const row of save.equipmentInstances){
        const item=content.items[row.gsid],n=row.serverdata?.addlel;
        check(item&&(item.kind===1||item.slot===24)&&/^equipment-[1-9]\d*$/.test(row.guid)&&!seen.has(row.guid));
        check(Number(row.guid.slice(10))<save.nextEquipmentGuid);seen.add(row.guid);
        check(Number.isInteger(n)&&n>=0&&(n===0||upgradeAt(content,row.gsid,n)));
        counts[row.gsid]=(counts[row.gsid]||0)+1;
        const gem=row.serverdata.gem;
        if(gem)check(Array.isArray(gem.ins)&&gem.ins.every(id=>Number.isSafeInteger(id)&&id>0)&&Number.isSafeInteger(gem.holecnt)&&gem.holecnt>=0);
        if(gem&&content.gemCatalog){
            const types=gem.ins.map(id=>content.gemCatalog.items[id]?.stats[42]);
            check(gem.ins.length<=Number(item.stats[36]||0)&&types.every(Boolean)&&new Set(types).size===types.length);
        }
    }
    for(const [id,count] of Object.entries(counts))check(count<=(save.inventory[id]||0));
    for(const [slot,guid] of Object.entries(save.equipmentGuids))check(save.equipmentInstances.some(row=>row.guid===guid&&row.gsid===save.equipment[slot]&&content.items[row.gsid].slot===Number(slot)));
}
