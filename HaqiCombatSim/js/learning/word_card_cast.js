// Resume the captured target only after the practice dialog has closed.
// Cancelling, changing battle/turn/identity or losing the target never casts.
export function openWordCardForCast({practice,row,decision,isCurrent,onActivated,cast}){
    const pending=structuredClone(decision);let accepted=false,finished=false;
    return practice.open(row,result=>{
        if(finished||!isCurrent(pending))return;
        onActivated(result,pending);accepted=true;
    },()=>{
        if(finished)return;finished=true;
        if(accepted&&isCurrent(pending))cast(pending);
    });
}
