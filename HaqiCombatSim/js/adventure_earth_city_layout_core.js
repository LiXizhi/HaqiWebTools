import {hashSeed} from './rng_core.js';
export function earthCityBlock(x,y,blockSize=500,worldWidth=8640000){
    x=((x%worldWidth)+worldWidth)%worldWidth;
    const bx=Math.floor(x/blockSize),by=Math.floor(y/blockSize),value=hashSeed(`earth-district:2:${bx}:${by}`)%10;
    return {bx,by,x:x-bx*blockSize,y:y-by*blockSize,zone:value===0?'park':value<4?'commercial':'residential'};
}
