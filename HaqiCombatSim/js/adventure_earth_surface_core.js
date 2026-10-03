import {earthCityBlock} from './adventure_earth_city_layout_core.js';
// Canvas-independent terrain shading. Classification remains the collision authority.
// HelloWorld reference: TerrainTileManager texture splatting and coastal foam.
import {createRng} from './rng_core.js';
const rng=createRng(731902),noiseTable=Float32Array.from({length:65536},()=>rng.float());
const mod=(v,n)=>((v%n)+n)%n;
const smooth=v=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);};
// HelloWorld TerrainTileManager.js MARCHING_SQUARES_TABLE L278-317:
// edge midpoints, triangular single corners and pentagonal three-corner regions.
// Screen corner bits: TL=1, TR=2, BR=4, BL=8. Saddle ties use one fixed diagonal.
function marchingDistance(mask,u,v){
    let d;
    switch(mask){
        case 0:return -.5;case 15:return .5;
        case 1:d=.5-u-v;break;case 2:d=u-v-.5;break;
        case 4:d=u+v-1.5;break;case 8:d=v-u-.5;break;
        case 14:d=u+v-.5;break;case 13:d=.5-u+v;break;
        case 11:d=1.5-u-v;break;case 7:d=.5+u-v;break;
        case 3:d=.5-v;break;case 6:d=u-.5;break;
        case 12:d=v-.5;break;case 9:d=.5-u;break;
        case 5:d=Math.max(.5-u-v,u+v-1.5);break;
        case 10:d=-Math.max(.5-u-v,u+v-1.5);break;
        default:return -.5;
    }
    return d;
}
export function earthMarchingCoverage(mask,u,v){
    const d=marchingDistance(mask,u,v);
    // Restore the original .15–.85 cell splat ramp around the sloped contour.
    // This same broad weight feeds the existing shallow water, sand and foam.
    return smooth(.5+d/.7);
}
export function earthMarchingWeights(near,u,v){
    const bits=[1,2,8,4],weights=[0,0,0,0];let total=0;
    for(let k=0;k<4;k++){
        if(!near[k]||near.indexOf(near[k])!==k)continue;
        let mask=0;for(let j=0;j<4;j++)if(near[j]===near[k])mask|=bits[j];
        weights[k]=earthMarchingCoverage(mask,u,v);total+=weights[k];
    }
    // Three/four materials can meet between their triangular corners. Use the
    // center's local splat there; never invent a new terrain or leave a hole.
    if(!total)return [(1-u)*(1-v),u*(1-v),(1-u)*v,u*v];
    return weights.map(w=>w/total);
}
export function surfaceNoise(x,y,scale=64,worldWidth=8640000){
    x/=worldWidth/(Math.max(1,Math.round(worldWidth/(scale*256)))*256);y/=scale;const ix=Math.floor(x),iy=Math.floor(y),u=smooth(x-ix),v=smooth(y-iy);
    const at=(a,b)=>noiseTable[mod(b,256)*256+mod(a,256)];
    return (at(ix,iy)*(1-u)+at(ix+1,iy)*u)*(1-v)+(at(ix,iy+1)*(1-u)+at(ix+1,iy+1)*u)*v;
}
const colors={ocean:[27,92,115],water:[49,126,140],grass:[144,205,66],urban:[152,151,139],forest:[102,178,55],crops:[166,189,65],scrub:[148,137,92],barren:[191,173,132],snow:[221,233,233],wetland:[103,165,83]};
// Barren uses the sandy gravel tile (second row, first cell), not grey scree.
const frames={grass:0,urban:14,forest:2,crops:13,scrub:6,barren:4,snow:12,wetland:15,ocean:8,water:10};
export const isEarthWater=t=>t==='water'||t==='ocean';
// Average the contour distance only within .08 source cells of a segment join.
// Averaging a straight line leaves it exactly unchanged; the color ramp is not
// blurred. Unknown samples disable the local adjustment.
export function earthCoastCornerDelta(at,gx,gy){
    const distance=(x,y)=>{
        const ix=Math.floor(x),iy=Math.floor(y),a=at(ix,iy),b=at(ix+1,iy),c=at(ix+1,iy+1),d=at(ix,iy+1);
        if(!a||!b||!c||!d)return null;
        const mask=Number(isEarthWater(a))|Number(isEarthWater(b))<<1|Number(isEarthWater(c))<<2|Number(isEarthWater(d))<<3;
        return marchingDistance(mask,x-ix,y-iy);
    };
    const u=gx-Math.floor(gx),v=gy-Math.floor(gy),radius=.08;
    if(Math.min(u,1-u,v,1-v)>=radius)return 0;
    const own=distance(gx,gy);if(own===null||Math.abs(own)>.4)return 0;
    let sum=0;
    for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++){
        const d=distance(gx+x*radius,gy+y*radius);if(d===null)return 0;
        sum+=d*(x===0?2:1)*(y===0?2:1);
    }
    const change=smooth(.5+sum/16/.7)-smooth(.5+own/.7);
    return Math.abs(change)<1e-12?0:change;
}
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
export function createEarthSurfaceRaster({x,y,size,resolution,cellSize,sample,atlas,cityGround,cityGroundPeriod=768,period=256,worldWidth=8640000,cityBlockSize=500,vegetationTint=.48,roads=[],roadStyle={},detailStrength=0,detailSpacing=18,detailDensity=.32}){
    const step=size/resolution,west=Math.floor(x/cellSize)-2,north=Math.floor(y/cellSize)-2,count=Math.ceil(size/cellSize)+6,types=[];
    for(let gy=0;gy<count;gy++)for(let gx=0;gx<count;gx++)types.push(sample(mod((west+gx+.5)*cellSize,worldWidth),(north+gy+.5)*cellSize));
    const at=(gx,gy)=>types[(gy-north)*count+gx-west]||null;
    // Index only nearby segments once per bake, rather than tracing the full
    // city network every animation frame or scanning it for every texel.
    const bins=new Map(),binSize=64,blend=roadStyle.blendWidth??16,shoulder=roadStyle.shoulderWidth??4;
    for(const road of roads){
        if(road.bridge)continue;
        const dx=road.b.x-road.a.x,dy=road.b.y-road.a.y,length2=dx*dx+dy*dy;
        if(!length2)continue;
        const half=(road.width??roadStyle.width??52)/2,pad=half+shoulder+blend;
        const left=Math.max(x,Math.min(road.a.x,road.b.x)-pad),right=Math.min(x+size,Math.max(road.a.x,road.b.x)+pad),top=Math.max(y,Math.min(road.a.y,road.b.y)-pad),bottom=Math.min(y+size,Math.max(road.a.y,road.b.y)+pad);
        if(left>right||top>bottom)continue;
        for(let by=Math.floor(top/binSize);by<=Math.floor(bottom/binSize);by++)for(let bx=Math.floor(left/binSize);bx<=Math.floor(right/binSize);bx++){
            const key=`${bx}:${by}`,list=bins.get(key)||[];list.push({...road,dx,dy,length2,half});bins.set(key,list);
        }
    }
    const pixels=new Uint8ClampedArray(resolution*resolution*4),districts=new Map();let row=0;
    function rows(limit){const end=Math.min(resolution,row+limit);
        for(;row<end;row++)for(let col=0;col<resolution;col++){
            const wx=mod(x+(col+.5)*step,worldWidth),wy=y+(row+.5)*step,offset=(row*resolution+col)*4;
            const own=at(Math.floor((x+(col+.5)*step)/cellSize),Math.floor(wy/cellSize));
            if(!own){pixels.set([111,119,117,255],offset);continue;}
            const noise=surfaceNoise(wx,wy,46,worldWidth),large=surfaceNoise(wx,wy,180,worldWidth),gx=(x+(col+.5)*step)/cellSize-.5+(noise-.5)*.12,gy=wy/cellSize-.5+(large-.5)*.12,ix=Math.floor(gx),iy=Math.floor(gy);
            const u=gx-ix,v=gy-iy,near=[at(ix,iy),at(ix+1,iy),at(ix,iy+1),at(ix+1,iy+1)],weights=earthMarchingWeights(near,u,v);
            let wet=0;for(let k=0;k<4;k++)if(isEarthWater(near[k]))wet+=weights[k];
            if(wet>0&&wet<1){
                const delta=earthCoastCornerDelta(at,gx,gy);
                if(delta){const target=Math.max(0,Math.min(1,wet+delta));for(let k=0;k<4;k++)weights[k]*=isEarthWater(near[k])?target/wet:(1-target)/(1-wet);}
            }
            const tx=wx+(surfaceNoise(wx,wy,83,worldWidth)-.5)*12,ty=wy+(surfaceNoise(wx+123,wy-77,97,worldWidth)-.5)*12;
            let r=0,g=0,b=0,water=0,total=0,vegetation=0,vr=0,vg=0,vb=0,urban=0;
            for(let k=0;k<4;k++){
                const type=near[k];if(!type)continue;const w=weights[k],base=colors[type]||colors.grass;total+=w;if(isEarthWater(type))water+=w;
                if(type==='urban')urban+=w;
                if(['grass','forest','crops','wetland'].includes(type)){vegetation+=w;vr+=base[0]*w;vg+=base[1]*w;vb+=base[2]*w;}
                if(type==='urban'&&cityGround){const px=Math.floor(mod(wx/cityGroundPeriod,1)*cityGround.width),py=Math.floor(mod(wy/cityGroundPeriod,1)*cityGround.height),p=(py*cityGround.width+px)*4;r+=cityGround.data[p]*w;g+=cityGround.data[p+1]*w;b+=cityGround.data[p+2]*w;}
                else if(atlas){const p=texel(atlas,frames[type]??0,tx,ty,period);const amount=isEarthWater(type)?.4:.72;r+=(atlas.data[p]*amount+base[0]*(1-amount))*w;g+=(atlas.data[p+1]*amount+base[1]*(1-amount))*w;b+=(atlas.data[p+2]*amount+base[2]*(1-amount))*w;}
                else{r+=base[0]*w;g+=base[1]*w;b+=base[2]*w;}
            }
            if(!total){pixels.set([111,119,117,255],offset);continue;}r/=total;g/=total;b/=total;water/=total;
            if(urban>0&&water<.01&&!cityGround){
                const key=Math.floor(wx/cityBlockSize)+Math.floor(wy/cityBlockSize)*Math.ceil(worldWidth/cityBlockSize);let zone=districts.get(key);if(!zone){zone=earthCityBlock(wx,wy,cityBlockSize,worldWidth).zone;districts.set(key,zone);}const block={x:wx%cityBlockSize,y:wy%cityBlockSize,zone};
                // Parcel lawns, concrete yards and paving form districts, not one endless plaza.
                const park=block.zone==='park',residential=block.zone==='residential',edge=Math.min(block.x,block.y,cityBlockSize-block.x,cityBlockSize-block.y);
                const tint=park?[86,119,67]:residential?[126,135,112]:[155,153,144],mix=(edge>64?(park?.7:residential?.36:.18):.12)*urban/total;
                r=r*(1-mix)+tint[0]*mix;g=g*(1-mix)+tint[1]*mix;b=b*(1-mix)+tint[2]*mix;
            }
            if(vegetation>0){const mix=vegetation/total*vegetationTint;r=r*(1-mix)+vr/vegetation*mix;g=g*(1-mix)+vg/vegetation*mix;b=b*(1-mix)+vb/vegetation*mix;}
            // Water keeps source identity; shallow tint and foam are visual only.
            if(water>.01){const coast=1-water,depth=water*water,tint=[35-12*depth,151-59*depth,160-44*depth],mix=.55*water;r=r*(1-mix)+tint[0]*mix;g=g*(1-mix)+tint[1]*mix;b=b*(1-mix)+tint[2]*mix;
                const foam=Math.max(0,1-Math.abs(water-(.52+(noise-.5)*.16))/.075)*(0.35+noise*.3);r=r*(1-foam)+221*foam;g=g*(1-foam)+239*foam;b=b*(1-foam)+213*foam;
                if(coast>.25&&coast<.85){const sand=(1-Math.abs(coast-.62)/.3)*.26;if(sand>0){r=r*(1-sand)+191*sand;g=g*(1-sand)+183*sand;b=b*(1-sand)+127*sand;}}
            }
            if(detailStrength&&water<.01&&urban<.5){
                // Tiny baked pebbles, leaf litter and grass tufts use an
                // independent fixed table; no scene objects or encounter RNG.
                const cx=Math.floor(wx/detailSpacing),cy=Math.floor(wy/detailSpacing),seed=noiseTable[mod(cx*131+cy*977,noiseTable.length)];
                if(seed<detailDensity){
                    const px=mod(wx,detailSpacing)/detailSpacing,py=mod(wy,detailSpacing)/detailSpacing;
                    const sx=noiseTable[mod(cx*313+cy*271+17,noiseTable.length)],sy=noiseTable[mod(cx*173+cy*631+39,noiseTable.length)];
                    const d=((px-(.2+sx*.6))/.13)**2+((py-(.2+sy*.6))/.065)**2;
                    if(d<1.7){const amount=smooth(1-d/1.7)*detailStrength;
                        const tint=own==='snow'?[155,172,177]:own==='barren'?[127,105,75]:own==='forest'?[127,116,62]:[155,166,89];
                        r=r*(1-amount)+tint[0]*amount;g=g*(1-amount)+tint[1]*amount;b=b*(1-amount)+tint[2]*amount;
                    }
                }
            }
            const localRoads=bins.get(`${Math.floor((x+(col+.5)*step)/binSize)}:${Math.floor(wy/binSize)}`);
            let closest=null,distance=Infinity;
            for(const road of localRoads||[]){
                const rx=x+(col+.5)*step-road.a.x,ry=wy-road.a.y,t=Math.max(0,Math.min(1,(rx*road.dx+ry*road.dy)/road.length2));
                const d=Math.hypot(rx-road.dx*t,ry-road.dy*t);
                if(d-road.half<distance){distance=d-road.half;closest={road,d};}
            }
            if(closest&&water<.5){
                const {road,d}=closest,coverage=1-smooth((d-road.half-shoulder)/(blend||1));
                if(coverage>0){
                    const pavement=1-smooth((d-road.half+2)/4),grit=surfaceNoise(wx,wy,3,worldWidth),wear=surfaceNoise(wx,wy,29,worldWidth),texture=roadStyle.textureOpacity??.22;
                    const shade=(grit-.5)*texture*100+(wear-.5)*15;
                    const edge=[r*.55+126*.45,g*.55+118*.45,b*.55+91*.45],asphalt=[175+shade,177+shade,165+shade];
                    for(let k=0;k<3;k++)edge[k]=edge[k]*(1-pavement)+asphalt[k]*pavement;
                    const along=(wx*road.dx+wy*road.dy)/Math.sqrt(road.length2);
                    const stripe=(1-smooth((d-.8)/.8))*pavement*(mod(along,36)<12?.48:0);
                    edge[0]=edge[0]*(1-stripe)+238*stripe;edge[1]=edge[1]*(1-stripe)+232*stripe;edge[2]=edge[2]*(1-stripe)+207*stripe;
                    r=r*(1-coverage)+edge[0]*coverage;g=g*(1-coverage)+edge[1]*coverage;b=b*(1-coverage)+edge[2]*coverage;
                }
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
    if(type==='snow')return [16,17,18,19,11];
    if(type==='barren')return lat<35?[9,10,13,21]:[9,10,13];
    if(type==='scrub')return lat<35?[8,10,13,21]:[8,10,13];
    if(type==='wetland')return lat<30?[6,7,15,23]:lat<50?[6,7,22]:[6,7];
    if(type==='crops')return [20,20,20,7,lat>50?2:0];
    if(type==='urban')return [4,7,12,lat>50?2:0];
    if(type==='forest')return lat<30?[0,1,4,5,8,14,15]:lat>50?[2,5,8,14]:[0,2,3,4,5,8,14];
    if(type==='grass')return lat<30?[0,1,4,7,9,12,15]:lat>50?[2,4,7,8,12]:[0,3,4,7,8,12];
    return [];
}
// Dense forest trees use the same climate bands as scattered decorations.
export function earthTreeFrames(type,latitude){
    return earthDecorationFrames(type,latitude).filter(earthDecorationIsTree);
}
export const earthDecorationIsTree=frame=>frame<4||[16,17,22,23].includes(frame);
export function earthDecorationStyle(type,frame){
    return type==='snow'?{snow:true,earthDecoVariant:frame===16||frame===17?'snowTree':frame===18?'snowBush':frame===19?'snowMound':'snowRock'}:
        type==='crops'&&frame===20?{earthDecoVariant:'wheat'}:{};
}
