// Presentation follows successful aura events, not the already-resolved end of the round.
export function presentedEnvironment(current,events,index,progress,impact){
    const event=events[index];
    if(event?.type==='aura')return event.aura;
    if(event?.type!=='cast'||progress<impact)return current;
    for(let i=index+1;i<events.length;i++){
        const next=events[i];
        if(['cast','fizzle','pass'].includes(next.type))break;
        if(next.type==='aura'&&next.card===event.card&&next.caster===event.caster)return next.aura;
    }
    return current;
}
