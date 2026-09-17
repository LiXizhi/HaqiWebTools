// Shared presentation poses, anchored at the feet; no gameplay state or RNG.
export const HIT_DURATION_MS=220;
export function actorPose(action='idle',progress=0,direction=1,reduced=false) {
    const p=Math.max(0,Math.min(1,progress)),wave=Math.sin(Math.PI*p);
    const pose={x:0,y:0,rotation:0,sx:1,sy:1,alpha:1,brightness:1};
    if(action==='cast') {
        pose.y=reduced?0:-12*wave;pose.sx=1-.07*wave;pose.sy=1+.09*wave;
        pose.brightness=1+.3*wave;
    } else if(action==='hit') {
        // Reach recoil in 26ms, hold briefly, then spring back with a damped tremor.
        const kick=p<.12?p/.12:p<.25?1:Math.pow((1-p)/.75,2);
        const tremor=p>.25?Math.sin((p-.25)*Math.PI*6)*(1-p)*2.5:0;
        pose.x=reduced?0:-direction*(18*kick+tremor);pose.rotation=reduced?0:-direction*.19*kick;
        pose.sx=1+.14*kick;pose.sy=1-.17*kick;pose.brightness=1+2.4*Math.max(0,1-p/.22);
    } else if(action==='death') {
        const fall=p*p*(3-2*p);
        pose.y=reduced?0:20*fall;pose.rotation=reduced?0:-direction*.55*fall;
        pose.sx=1+.15*fall;pose.sy=1-.45*fall;pose.alpha=1-fall;
    }
    return pose;
}

export function battleActorAction(id,hp,event,progress=0) {
    if(hp<=0)return {action:'death',progress:event?.type==='damage'&&event.target===id?progress:1};
    if(event?.type==='damage'&&event.target===id&&event.amount>0)return {action:'hit',progress};
    if(['cast','fizzle'].includes(event?.type)&&event.caster===id)return {action:'cast',progress:Math.min(1,progress/.45)};
    return {action:'idle',progress:0};
}
