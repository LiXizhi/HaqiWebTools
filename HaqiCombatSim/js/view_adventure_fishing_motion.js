// Short visual impulse: fast pull, then a softer return. Never changes catch RNG.
export const FISHING_PULL_MS=380;
const vectors={up:[0,-1],right:[1,0],down:[0,1],left:[-1,0]};
export function fishingPullMotion(direction,elapsed,reduced=false){
    const vector=vectors[direction];
    if(reduced||!vector||elapsed<0||elapsed>=FISHING_PULL_MS)return {x:0,y:0,strength:0};
    const progress=elapsed/FISHING_PULL_MS;
    const strength=progress<.2?Math.sin(progress/.2*Math.PI/2):(1-(progress-.2)/.8)**2;
    return {x:vector[0]*strength,y:vector[1]*strength,strength};
}
