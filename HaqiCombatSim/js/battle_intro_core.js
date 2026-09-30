// Presentation-only timeline. No combat mutation, random draws or saved state.
const clamp=n=>Math.max(0,Math.min(1,n));
const ease=n=>1-(1-clamp(n))**3;
export function battleIntroRoster(battle){
    return (battle?.monsterTemplates||[]).slice(0,4).map((template,index)=>{
        const unit=battle.sides?.far?.[index];
        return {id:unit?.id||`mob${index}`,template,name:unit?.name||template.name,level:unit?.level??template.level,school:unit?.school||template.school};
    });
}
export function battleIntroDuration(count,reduced=false){return reduced?2600:3200+Math.max(0,count-1)*220;}
export function battleIntroFrame(elapsed,count,reduced=false){
    const duration=battleIntroDuration(count,reduced),exit=reduced?0:ease((elapsed-(duration-300))/300);
    return {elapsed,duration,done:elapsed>=duration,progress:clamp(elapsed/duration),exit,
        curtain:reduced?1:ease(elapsed/380),
        rows:Array.from({length:count},(_,i)=>({entry:reduced?1:ease((elapsed-200-i*220)/580),banner:reduced?1:ease((elapsed-650-i*220)/430)}))};
}
