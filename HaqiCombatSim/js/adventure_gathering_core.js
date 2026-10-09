import {petTraitParams} from './adventure_pet_traits_core.js';
import {createRng,hashSeed} from './rng_core.js';
import {groundDecorations} from './adventure_ground_decorations_core.js';
import {defaultParams} from './combat_params_core.js';
export const gatheringParams=content=>({...defaultParams('kids').adventure,...content.balanceParams?.adventure});
export function gatheringValue(bag,params){
    let value=0;
    for(const [id,count] of Object.entries(bag||{})){
        const unit=params[`gatherValue_${id}`];
        if(!Number.isSafeInteger(count)||count<0||!Number.isSafeInteger(unit)||unit<=0)throw Error('采集物数量或估值无效');
        value+=unit*count;
    }
    if(!Number.isSafeInteger(value))throw Error('采集物数量过大');return value;
}
export function gatheringAllocation(value,owner,roleIds,mode='self'){
    if(!Number.isSafeInteger(value)||value<=0||!roleIds.includes(owner))throw Error('冶炼收益无效');
    if(!['self','split','other'].includes(mode))throw Error('分配方式无效');
    const peer=roleIds.find(id=>id!==owner);
    if(!peer||mode==='self')return {[owner]:value};
    return mode==='other'?{[peer]:value}:{[owner]:Math.ceil(value/2),[peer]:Math.floor(value/2)};
}
export function gatheringNodes(world,position,config,params){
    if(!world.layout?.rules?.terrain||world.isEarth||world.isCityDungeon)return [];
    const radius=params.gatherDistance+100;
    return groundDecorations(world,{x:position.x-radius,y:position.y-radius,w:radius*2,h:radius*2}).flatMap(d=>{
        const item=config.items.find(item=>item.frames.includes(d.frame));
        return item?[{...d,itemId:item.id,name:item.name,color:item.color,units:params.gatherUnits}]:[];
    });
}
export function gatheringRemaining(state,node,day){
    const used=state.day<day?0:state.depleted[node.id];
    return used===true?0:Math.max(0,(node.units||1)-(Number(used)||0));
}
// A moving actor, a different node, a modal or a paused frame resets the dwell.
export function advanceGathering(previous,{position,node,dt,enabled,params}){
    const changed=!previous||previous.id!==node?.id||Math.hypot(position.x-previous.x,position.y-previous.y)>.5;
    const next={id:node?.id,x:position.x,y:position.y,elapsed:0,progress:0,ready:false};
    if(!enabled||!node||changed||dt<=0||dt>.25)return next;
    next.x=previous.x;next.y=previous.y;
    next.elapsed=previous.elapsed+dt;
    next.progress=Math.max(0,Math.min(1,(next.elapsed-params.gatherDwellSeconds)/params.gatherUnitSeconds));
    next.ready=next.progress>=1;return next;
}
export function collectGathering(state,node,roleId,day){
    if(state.day>day)day=state.day;
    const next=structuredClone(state);
    if(next.day!==day){next.day=day;next.depleted={};}
    if(!gatheringRemaining(next,node,day))throw Error('这里的资源已经采集过了');
    next.depleted[node.id]=(Number(next.depleted[node.id])||0)+1;next.bags[roleId]??={};next.bags[roleId][node.itemId]=(next.bags[roleId][node.itemId]||0)+1;return next;
}

export function smeltGroundDrop(state,roleId,zone,position,params){
    const next=structuredClone(state),value=(next.credits?.[roleId]||0)+gatheringValue(next.bags[roleId],params);
    if(value<params.gatherSmeltValue)return null;
    next.credits??={};next.credits[roleId]=value-params.gatherSmeltValue;next.bags[roleId]={};
    next.dropSerial=(next.dropSerial||0)+1;
    const id=`ground-smelt:${next.lootNamespace||'legacy'}:${roleId}:${next.day}:${next.dropSerial}`;
    const rng=createRng(hashSeed(id)),rare=rng.float()<params.gatherFairyChance;
    const angle=rng.float()*Math.PI*2;
    const drop={id,zone,x:position.x+Math.cos(angle)*params.gatherDropDistance,y:position.y+Math.sin(angle)*params.gatherDropDistance,
        currency:rare?17213:100,amount:rare?params.gatherFairyAmount:params.gatherBeanAmount};
    (next.drops??=[]).push(drop);return {state:next,drop};
}
export function applyGroundPickup(save,drop){
    const next=structuredClone(save);
    if(next.rewardedEncounters.includes(drop.id))return next;
    next.inventory[drop.currency]=(next.inventory[drop.currency]||0)+drop.amount;
    next.rewardedEncounters.push(drop.id);next.revision++;return next;
}
export function gatheringPetPower(pet,content){
    if(!pet||pet.hp<=0||pet.hunger<=0)return 0;
    return 1+(petTraitParams(content).values.gathering[(pet.passiveTraits?.gathering||0)-1]||0)/100;
}
export function canPetAssistGathering(progress,node,position,params,enabled=true){
    return !!(enabled&&node&&progress?.id===node.id&&progress.elapsed>=params.gatherDwellSeconds&&Math.hypot(position.x-progress.x,position.y-progress.y)<=.5);
}
