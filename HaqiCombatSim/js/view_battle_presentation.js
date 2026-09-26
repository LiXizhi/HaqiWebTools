import {overheadStatusEffects} from './view_adventure_overhead_status.js';

export function snapshotBattleStatus(battle) {
    return Object.fromEntries(Object.values(battle.unitsById).map(unit=>[unit.id,
        unit.hp>0?overheadStatusEffects(unit,battle):[]]));
}

// Observe the existing event boundary while the round resolves. These snapshots
// belong only to playback: never append them to combat events or saved decisions.
export function captureBattlePresentation(battle,resolve) {
    const initial=snapshotBattleStatus(battle),timeline=[];let cursor=battle.events.length;
    const previous=battle.onEvent,owned=Object.hasOwn(battle,'onEvent');
    const previousStatus=battle.onStatusEffect,ownedStatus=Object.hasOwn(battle,'onStatusEffect');
    const flush=()=>{while(cursor<battle.events.length)timeline.push({event:battle.events[cursor++],status:snapshotBattleStatus(battle)});};
    battle.onEvent=event=>{
        previous?.call(battle,event);
        flush();
    };
    battle.onStatusEffect=event=>{
        previousStatus?.call(battle,event);flush();
        timeline.push({event,status:snapshotBattleStatus(battle)});
    };
    try { resolve(); }
    finally {
        if(owned)battle.onEvent=previous;else delete battle.onEvent;
        if(ownedStatus)battle.onStatusEffect=previousStatus;else delete battle.onStatusEffect;
    }
    flush();
    const visible=new Set(['cast','damage','heal','dot','hot','speak','fizzle','pass','capture','aura']);
    const events=[];let status=initial;
    for(const {event,status:next} of timeline){
        const changed=JSON.stringify(next)!==JSON.stringify(status);
        // Replay the incoming spell from the mirror owner toward its attacker.
        // This is visual only: no extra cast, costs, secondary effects or RNG.
        if(event.type==='damage'&&event.label==='reflection')events.push({
            type:'cast',sourceType:'reflection',label:'reflection',card:event.card,
            caster:event.caster,target:event.target,round:event.round,status,
        });
        if(visible.has(event.type)||changed)events.push({...event,sourceType:event.type,type:visible.has(event.type)?event.type:'status',status:next});
        status=next;
    }
    const final=snapshotBattleStatus(battle);
    if(JSON.stringify(final)!==JSON.stringify(status))events.push({type:'status',status:final});
    return {initial,events};
}

const identity=effect=>`${effect.kind}:${effect.effectId??effect.stackKey??''}:${effect.school}:${effect.negative}:${effect.label}`;
export function battleStatusChanges(before={},after={},event={}) {
    const changes=[];
    for(const id of new Set([...Object.keys(before),...Object.keys(after)])){
        const old=[...(before[id]||[])],next=[...(after[id]||[])];
        for(const [slot,effect] of old.entries()){
            const index=next.findIndex(item=>identity(item)===identity(effect));
            const remaining=index<0?null:next.splice(index,1)[0];
            if(!remaining||remaining.count<effect.count){
                const shield=['ward','reflect'].includes(effect.kind)&&!effect.negative;
                const triggered=['damage','dot','heal','hot'].includes(event.type)||event.sourceType==='effect_used';
                const dispelled=effect.dispelSchool&&event.type==='fizzle'&&event.dispel===effect.effectId;
                changes.push({id,effect:{...effect,count:1},slot,total:old.length,kind:dispelled?'dispel-break':shield&&(triggered||['remove_ward','steal_ward'].includes(event.sourceType))?'break':triggered?'trigger':'remove'});
            }else if(remaining.count>effect.count)changes.push({id,effect:remaining,slot,total:old.length,kind:'gain'});
            else if(remaining.desc!==effect.desc)changes.push({id,effect:remaining,slot,total:old.length,kind:'pulse'});
        }
        for(const effect of next)changes.push({id,effect,slot:after[id].indexOf(effect),total:after[id].length,kind:'gain'});
    }
    return changes;
}
