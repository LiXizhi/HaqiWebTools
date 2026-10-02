import {createRng,hashSeed} from './rng_core.js';
import {earthPoint} from './adventure_earth_core.js';

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
        const at={x:(cx+(col+.5)/cells)*rules.chunkSize+rng.int(-15,15),y:(cy+(row+.5)/cells)*rules.chunkSize+rng.int(-15,15)};
        if(rng.float()>profile.density||terrainAt(at.x,at.y)!=='urban'||blocked(at,step*.35))continue;
        if([[-step*.3,0],[step*.3,0],[0,-step*.3]].some(([x,y])=>terrainAt(at.x+x,at.y+y)!=='urban'))continue;
        const street=rng.float()<rules.cityStreetFraction,frame=street?rng.int(0,15):rng.pick(profile.frames),size=street?rng.int(80,135):frame<4?rng.int(180,220):rng.int(140,185);
        // Street furniture uses its own cell anchor and remains reproducible across chunks.
        const pole={x:(cx+(col+.08)/cells)*rules.chunkSize,y:(cy+(row+.85)/cells)*rules.chunkSize};
        if(terrainAt(pole.x,pole.y)==='urban'&&!blocked(pole,0))out.push({...pole,id:`earth-street:${nx}:${cy}:${row}:${col}`,tile:2,earthCityAtlas:'street',earthCityFrame:(row+col)%4===0?1:0,w:80,h:80,decorationOnly:true});
        out.push({...at,id:`earth-urban:${nx}:${cy}:${row}:${col}`,tile:2,atlas:'town',frame:'house',earthCityAtlas:street?'street':'buildings',earthCityFrame:frame,w:size,h:size,decorationOnly:street,cityId:nearest?.id||null,populationLevel:profile.level});
    }
    return out;
}
