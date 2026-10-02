// Canvas-independent terrain shading. Classification remains the collision authority.
// HelloWorld reference: TerrainTileManager texture splatting and coastal foam.
import {createRng} from './rng_core.js';
const rng=createRng(731902),noiseTable=Float32Array.from({length:65536},()=>rng.float());
const mod=(v,n)=>((v%n)+n)%n;
const smooth=v=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);};
export function surfaceNoise(x,y,scale=64,worldWidth=8640000){
    x/=worldWidth/(Math.max(1,Math.round(worldWidth/(scale*256)))*256);y/=scale;const ix=Math.floor(x),iy=Math.floor(y),u=smooth(x-ix),v=smooth(y-iy);
    const at=(a,b)=>noiseTable[mod(b,256)*256+mod(a,256)];
    return (at(ix,iy)*(1-u)+at(ix+1,iy)*u)*(1-v)+(at(ix,iy+1)*(1-u)+at(ix+1,iy+1)*u)*v;
}
const colors={ocean:[27,92,115],water:[49,126,140],grass:[113,144,74],urban:[152,151,139],forest:[62,105,65],crops:[149,153,75],scrub:[148,137,92],barren:[165,153,125],snow:[221,233,233],wetland:[82,134,111]};
const frames={grass:0,urban:14,forest:2,crops:13,scrub:6,barren:7,snow:12,wetland:15,ocean:8,water:10};
export const isEarthWater=t=>t==='water'||t==='ocean';
// Blend two half-period offsets so neither original texture edge remains visible.
export function seamlessEarthAtlas(source,width){
    const result=new Uint8ClampedArray(source.length),cell=width/4;
    for(let frame=0;frame<16;frame++)for(let y=0;y<cell;y++)for(let x=0;x<cell;x++){
        const u=x/(cell-1),v=y/(cell-1),a=Math.sin(Math.PI*u)**2,b=Math.sin(Math.PI*v)**2;
        const xs=[Math.min(cell-1,Math.floor(u*cell)),Math.floor(((u+.5)%1)*cell)],ys=[Math.min(cell-1,Math.floor(v*cell)),Math.floor(((v+.5)%1)*cell)];
        const baseX=(frame%4)*cell,baseY=Math.floor(frame/4)*cell,to=((baseY+y)*width+baseX+x)*4;
        for(let k=0;k<3;k++){let value=0;for(let j=0;j<2;j++)for(let i=0;i<2;i++)value+=source[((baseY+ys[j])*width+baseX+xs[i])*4+k]*(i?1-a:a)*(j?1-b:b);result[to+k]=value;}result[to+3]=255;
    }
    return result;
}
function texel(atlas,frame,x,y,period){
    const cell=atlas.width/4,u=Math.floor(mod(x/period,1)*cell),v=Math.floor(mod(y/period,1)*cell);
    return ((Math.floor(frame/4)*cell+v)*atlas.width+(frame%4)*cell+u)*4;
}
export function createEarthSurfaceRaster({x,y,size,resolution,cellSize,sample,atlas,period=256,worldWidth=8640000}){
    const step=size/resolution,west=Math.floor(x/cellSize)-2,north=Math.floor(y/cellSize)-2,count=Math.ceil(size/cellSize)+6,types=[];
    for(let gy=0;gy<count;gy++)for(let gx=0;gx<count;gx++)types.push(sample(mod((west+gx+.5)*cellSize,worldWidth),(north+gy+.5)*cellSize));
    const at=(gx,gy)=>types[(gy-north)*count+gx-west]||null;
    const pixels=new Uint8ClampedArray(resolution*resolution*4);let row=0;
    function rows(limit){const end=Math.min(resolution,row+limit);
        for(;row<end;row++)for(let col=0;col<resolution;col++){
            const wx=mod(x+(col+.5)*step,worldWidth),wy=y+(row+.5)*step,offset=(row*resolution+col)*4;
            const own=at(Math.floor((x+(col+.5)*step)/cellSize),Math.floor(wy/cellSize));
            if(!own){pixels.set([111,119,117,255],offset);continue;}
            const noise=surfaceNoise(wx,wy,46,worldWidth),large=surfaceNoise(wx,wy,180,worldWidth),gx=(x+(col+.5)*step)/cellSize-.5+(noise-.5)*.12,gy=wy/cellSize-.5+(large-.5)*.12,ix=Math.floor(gx),iy=Math.floor(gy);
            const u=smooth((gx-ix-.15)/.7),v=smooth((gy-iy-.15)/.7),near=[at(ix,iy),at(ix+1,iy),at(ix,iy+1),at(ix+1,iy+1)],weights=[(1-u)*(1-v),u*(1-v),(1-u)*v,u*v];
            const tx=wx+(surfaceNoise(wx,wy,83,worldWidth)-.5)*12,ty=wy+(surfaceNoise(wx+123,wy-77,97,worldWidth)-.5)*12;
            let r=0,g=0,b=0,water=0,total=0;
            for(let k=0;k<4;k++){
                const type=near[k];if(!type)continue;const w=weights[k],base=colors[type]||colors.grass;total+=w;if(isEarthWater(type))water+=w;
                if(atlas){const p=texel(atlas,frames[type]??0,tx,ty,period);const amount=isEarthWater(type)?.4:.72;r+=(atlas.data[p]*amount+base[0]*(1-amount))*w;g+=(atlas.data[p+1]*amount+base[1]*(1-amount))*w;b+=(atlas.data[p+2]*amount+base[2]*(1-amount))*w;}
                else{r+=base[0]*w;g+=base[1]*w;b+=base[2]*w;}
            }
            if(!total){pixels.set([111,119,117,255],offset);continue;}r/=total;g/=total;b/=total;water/=total;
            // Water keeps source identity; shallow tint and foam are visual only.
            if(water>.01){const coast=1-water,depth=water*water,tint=[35-12*depth,151-59*depth,160-44*depth],mix=.55*water;r=r*(1-mix)+tint[0]*mix;g=g*(1-mix)+tint[1]*mix;b=b*(1-mix)+tint[2]*mix;
                const foam=Math.max(0,1-Math.abs(water-(.52+(noise-.5)*.16))/.075)*(0.35+noise*.3);r=r*(1-foam)+221*foam;g=g*(1-foam)+239*foam;b=b*(1-foam)+213*foam;
                if(coast>.25&&coast<.85){const sand=(1-Math.abs(coast-.62)/.3)*.26;if(sand>0){r=r*(1-sand)+191*sand;g=g*(1-sand)+183*sand;b=b*(1-sand)+127*sand;}}
            }
            const grain=(surfaceNoise(wx,wy,5,worldWidth)-.5)*5,shade=.94+large*.12;
            pixels[offset]=r*shade+grain;pixels[offset+1]=g*shade+grain;pixels[offset+2]=b*shade+grain;pixels[offset+3]=255;
        }
        return row===resolution;
    }
    return {pixels,rows,get progress(){return row/resolution;}};
}

// Land-cover plus latitude is a game-art proxy, not a botanical/ecological survey.
export function earthDecorationFrames(type,latitude){
    const lat=Math.abs(latitude);
    if(!type||isEarthWater(type))return [];
    if(type==='snow')return [2,11];
    if(type==='barren')return [9,10,13];
    if(type==='scrub')return [8,10,13];
    if(type==='wetland')return [6,7,15];
    if(type==='forest')return lat<30?[0,1,4,5,8,14,15]:lat>50?[2,5,8,14]:[0,2,3,4,5,8,14];
    return lat<30?[0,1,4,7,9,12,15]:lat>50?[2,4,7,8,12]:[0,3,4,7,8,12];
}
