import {earthCityBlock} from './adventure_earth_city_layout_core.js';
import {createRng,hashSeed} from './rng_core.js';
import {earthPoint,landRoadSegments} from './adventure_earth_core.js';

export function earthCityProfile(population,rules){
    const level=population>=rules.cityPopulationLarge?2:population>=rules.cityPopulationMedium?1:0;
    return {level,density:rules.cityDensities[level],frames:level===2?[0,1,2,3,4,5,6,7,12,13,14,15]:level===1?[4,5,6,7,8,9,12,13,14,15]:[8,9,10,11,12,14,15]};
}
// Fixed geographic cells make placement independent of camera/chunk visitation order.
export function generateEarthUrbanChunk(cx,cy,cities,rules,terrainAt,blocked=()=>false){
    const width=360*rules.unitsPerDegree,nx=((cx%(width/rules.chunkSize))+width/rules.chunkSize)%(width/rules.chunkSize);
    const center={x:(cx+.5)*rules.chunkSize,y:(cy+.5)*rules.chunkSize};
    let nearest=null,distance=rules.cityInfluenceRadius;
    for(const city of cities){const q=earthPoint(city.lon,city.lat,rules),dx=((q.x-center.x+width*1.5)%width)-width/2,d=Math.hypot(dx,q.y-center.y);if(d<distance||(d===distance&&String(city.id)<String(nearest?.id))){distance=d;nearest=city;}}
    const profile=earthCityProfile(nearest?.population||0,rules),out=[],cells=rules.cityCellsPerChunk,step=rules.chunkSize/cells;
    for(let row=0;row<cells;row++)for(let col=0;col<cells;col++){
        const rng=createRng(hashSeed(`earth-city:${rules.generationVersion}:${nx}:${cy}:${row}:${col}`));
        const axis=n=>Math.floor(n/3)*rules.cityBlockSize+rules.cityBlockInset+(n%3)*(rules.cityBlockSize-2*rules.cityBlockInset)/2;
        const at={x:cx*rules.chunkSize+axis(col),y:cy*rules.chunkSize+axis(row)+rules.cityBuildingSetback},block=earthCityBlock(at.x,at.y,rules.cityBlockSize,width);
        if(rng.float()>profile.density||terrainAt(at.x,at.y)!=='urban'||blocked(at,rules.cityBuildingClearance))continue;
        if([[-step*.3,0],[step*.3,0],[0,-step*.3]].some(([x,y])=>terrainAt(at.x+x,at.y+y)!=='urban'))continue;
        const street=block.zone==='park',pool=block.zone==='commercial'?(profile.level===2?[0,1,2,3,5,7,14,15]:[5,7,12,14,15]):profile.level===0?[8,9,10,11]:[4,5,6,8,9];
        const frame=street?((row%3===1&&col%3===1)?5:((row+col)%2?7:9)):rng.pick(pool),size=street?140:frame<4?185:155;
        // Street furniture uses its own cell anchor and remains reproducible across chunks.
        const pole={x:cx*rules.chunkSize+Math.floor(col/3)*rules.cityBlockSize+rules.cityLaneWidth/2+rules.citySidewalkWidth/2,y:at.y};
        if(col%3===0&&terrainAt(pole.x,pole.y)==='urban'&&!blocked(pole,0))out.push({...pole,id:`earth-street:${nx}:${cy}:${row}:${col}`,tile:2,earthCityAtlas:'street',earthCityFrame:(row+col)%4===0?1:0,w:80,h:80,decorationOnly:true});
        out.push({...at,id:`earth-urban:${nx}:${cy}:${row}:${col}`,tile:2,atlas:'town',frame:'house',earthCityAtlas:street?'street':'buildings',earthCityFrame:frame,w:size,h:size,decorationOnly:street,cityId:nearest?.id||null,populationLevel:profile.level,district:block.zone});
    }
    return out;
}

export function generateEarthUrbanRoads(cx,cy,rules,sample,blocked=()=>false){
    const out=[];
    for(let offset=0;offset<rules.chunkSize;offset+=rules.cityBlockSize){
        const x=cx*rules.chunkSize,y=cy*rules.chunkSize;
        for(const road of [{a:{x:x+offset,y},b:{x:x+offset,y:y+rules.chunkSize}},{a:{x,y:y+offset},b:{x:x+rules.chunkSize,y:y+offset}}]){
            out.push(...landRoadSegments({...road,width:rules.cityLaneWidth,urban:true},(x,y)=>sample(x,y)==='urban'&&!blocked({x,y},rules.cityLaneWidth/2)?'urban':null,rules.roadSampleStep));
        }
    }
    return out;
}
