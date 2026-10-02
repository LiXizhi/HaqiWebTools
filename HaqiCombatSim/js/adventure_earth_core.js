// Geographic identity and deterministic world generation. No browser or network IO.
import {createRng,hashSeed} from './rng_core.js';
import {defaultParams} from './combat_params_core.js';

export const EARTH_ZONE='earth';
export const earthRules=content=>({...defaultParams('kids').earth,...content?.balanceParams?.earth});
export const wrapLongitude=lon=>((lon+180)%360+360)%360-180;
export function earthPoint(lon,lat,rules=earthRules()){
    return {x:(wrapLongitude(lon)+180)*rules.unitsPerDegree,y:(90-Math.max(-90,Math.min(90,lat)))*rules.unitsPerDegree};
}
export function earthGeo(p,rules=earthRules()){
    return {lon:wrapLongitude(p.x/rules.unitsPerDegree-180),lat:Math.max(-90,Math.min(90,90-p.y/rules.unitsPerDegree))};
}
export function earthMapInfo(content){
    const rules=earthRules(content),spawn=earthPoint(114.0579,22.5431,rules);
    return {name:'现实世界',w:360*rules.unitsPerDegree,h:180*rules.unitsPerDegree,spawn,initialSpawn:spawn,retainPreviousPosition:true};
}
export function terrainKey(lon,lat){return `${Math.floor(wrapLongitude(lon)/2)*2}_${Math.min(88,Math.floor(Math.max(-90,lat)/2)*2)}`;}
export function terrainBounds(key){const [west,south]=key.split('_').map(Number);return {west,south,east:west+2,north:south+2};}
export function terrainUrl(base,key){const b=terrainBounds(key);return `${base}terrain_${b.west}_${b.east}_${b.south}_${b.north}.png`;}
export function cityKey(lon,lat){return [Math.min(80,Math.floor(Math.max(-90,lat)/20)*20),Math.floor(wrapLongitude(lon)/20)*20].map(v=>v<0?`n${-v}`:String(v)).join('_');}
export function csvRows(text){
    const rows=[];let row=[],field='',quoted=false;
    for(let i=0;i<text.length;i++){
        const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
        else if(!quoted&&(c===','||c==='\n')){row.push(field.replace(/\r$/,''));field='';if(c==='\n'){rows.push(row);row=[];}}
        else field+=c;
    }
    if(field||row.length){row.push(field.replace(/\r$/,''));rows.push(row);}return rows;
}
export function parseEarthCities(text){return csvRows(text).flatMap(r=>{
    const lat=Number(r[3]),lon=Number(r[4]);if(!r[1]||r[3]===''||r[4]===''||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return [];
    return [{id:r[0]||`${lat}_${lon}`,name:r[1],country:r[2],lat,lon,population:Number(r[6])||0}];
});}
export function parseEarthCatalog(text){return csvRows(text).flatMap(r=>{
    const lat=Number(r[1]),lon=Number(r[2]);if(!r[0]||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return [];
    return [{id:`catalog:${lon}:${lat}`,name:r[0],lat,lon,population:Number(r[3])||0,level:Number(r[4])||1}];
});}
export function inGeoBounds(p,b){return p.lon>=b.west&&p.lon<=b.east&&p.lat>=b.south&&p.lat<=b.north;}
export function distanceToRoad(p,road){const {a,b}=road,dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
// Clip long authored routes to the active neighbourhood before navigation/social use.
export function clipEarthRoad(road,p,radius){
    let lo=0,hi=1;const dx=road.b.x-road.a.x,dy=road.b.y-road.a.y;
    for(const [d,q]of [[-dx,road.a.x-p.x+radius],[dx,p.x+radius-road.a.x],[-dy,road.a.y-p.y+radius],[dy,p.y+radius-road.a.y]]){
        if(!d){if(q<0)return null;continue;}const t=q/d;if(d<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return null;
    }
    return {...road,a:{x:road.a.x+lo*dx,y:road.a.y+lo*dy},b:{x:road.a.x+hi*dx,y:road.a.y+hi*dy}};
}
export function landRoadSegments(road,terrainAt,step){
    const out=[],length=Math.hypot(road.b.x-road.a.x,road.b.y-road.a.y),count=Math.max(1,Math.ceil(length/step));let start=null,last=null;
    for(let i=0;i<=count;i++){
        const p={x:road.a.x+(road.b.x-road.a.x)*i/count,y:road.a.y+(road.b.y-road.a.y)*i/count},type=terrainAt(p.x,p.y);
        if(type&&!['water','ocean'].includes(type)){start ||= p;last=p;}
        else if(start){if(Math.hypot(last.x-start.x,last.y-start.y)>step)out.push({...road,a:start,b:last});start=last=null;}
    }
    if(start&&Math.hypot(last.x-start.x,last.y-start.y)>step)out.push({...road,a:start,b:last});return out;
}
export function earthSafe(world,p,padding=0){
    const r=world.earthRules;
    return (world.safeAreas||[]).some(a=>Math.hypot(p.x-a.x,p.y-a.y)<=a.radius+padding)||world.paths.some(road=>distanceToRoad(p,road)<=road.width/2+r.roadSafeMargin+padding)
        ||world.buildings.some(b=>Math.abs(p.x-b.x)<b.w/2+r.buildingSafeMargin+padding&&Math.abs(p.y-b.y)<b.h/2+r.buildingSafeMargin+padding)
        ||world.npcs.some(n=>Math.hypot(p.x-n.x,p.y-n.y)<r.buildingSafeMargin+padding);
}
export function earthWalkable(world,x,y){
    if(!Number.isFinite(x)||!Number.isFinite(y)||y<0||y>world.h)return false;
    const type=world.terrainAt(x,y);if(type==null||type==='ocean'||type==='water')return false;
    if(world.paths.some(road=>distanceToRoad({x,y},road)<=road.width/2))return true;
    return !world.buildings.some(b=>!b.decorationOnly&&x>b.x-b.w*.3-10&&x<b.x+b.w*.3+10&&y>b.y-b.h*.42-10&&y<b.y+12);
}
// Fit source pixels uniformly; never squeeze a tall landmark into an unrelated box.
export function earthLandmarkSize(building,frame){
    const scale=Math.min(building.w/frame[2],building.h/frame[3]);
    return {w:frame[2]*scale,h:frame[3]*scale};
}
export function placeEarthLandmark(building,roads,sample,rules){
    const good=p=>{
        const center={x:p.x,y:p.y-building.h/2};
        if(roads.some(r=>distanceToRoad(center,r)<Math.hypot(building.w,building.h)/2+r.width/2+rules.landmarkRoadClearance))return false;
        return [[0,0],[-building.w/2,0],[building.w/2,0],[0,-building.h]].every(([dx,dy])=>{const t=sample(p.x+dx,p.y+dy);return t&&!['water','ocean'].includes(t);});
    };
    if(good(building))return building;
    for(let radius=rules.landmarkPlacementStep;radius<=rules.landmarkPlacementRadius;radius+=rules.landmarkPlacementStep)for(let i=0;i<16;i++){
        const p={...building,x:building.x+Math.cos(i*Math.PI/8)*radius,y:building.y+Math.sin(i*Math.PI/8)*radius};if(good(p))return p;
    }
    return null; // Unavailable placement must not obstruct a road or invent land.
}
export function earthNearest(world,x,y,{safe=false}={}){
    const good=p=>earthWalkable(world,p.x,p.y)&&(!safe||world.encounters.every(e=>Math.hypot(p.x-e.x,p.y-e.y)>world.earthRules.monsterClearance));
    const norm=p=>({x:((p.x%world.w)+world.w)%world.w,y:p.y});
    if(good(norm({x,y})))return norm({x,y});
    for(let r=world.earthRules.arrivalStep;r<=world.earthRules.arrivalRadius;r+=world.earthRules.arrivalStep)for(let i=0;i<24;i++){
        const p=norm({x:x+Math.cos(i*Math.PI/12)*r,y:y+Math.sin(i*Math.PI/12)*r});if(good(p))return p;
    }return null;
}
export function generateEarthCity(city,rules){
    const rng=createRng(hashSeed(`earth:${rules.generationVersion}:${city.id}`)),center=earthPoint(city.lon,city.lat,rules);
    const paths=[{a:{x:center.x-rules.cityRadius,y:center.y},b:{x:center.x+rules.cityRadius,y:center.y},width:rules.roadWidth},{a:{x:center.x,y:center.y-rules.cityRadius},b:{x:center.x,y:center.y+rules.cityRadius},width:rules.roadWidth}];
    const buildings=Array.from({length:rules.buildingsPerCity},(_,i)=>{
        const axis=i%2,side=i%4<2?-1:1,along=(Math.floor(i/4)+.5)*rules.buildingSpacing-rules.cityRadius*.65;
        return {id:`earth-building:${city.id}:${i}`,x:center.x+(axis?side*rules.buildingOffset:along),y:center.y+(axis?along:side*rules.buildingOffset),w:rng.int(105,145),h:rng.int(120,170),tile:2,atlas:'town',frame:'house',cityId:city.id};
    });return {center,paths,buildings};
}
export function earthEncounter(content,id){
    if(typeof id!=='string'||!id.startsWith('earth:'))return null;
    const match=/^earth:([\w-]+):(-?\d+):(-?\d+):(\d+)$/.exec(id);if(!match)return null;
    const monster=content.monsters?.[match[1]],rules=earthRules(content);
    if(!monster||Math.abs(Number(match[2]))>Math.ceil(360*rules.unitsPerDegree/rules.chunkSize)||Math.abs(Number(match[3]))>Math.ceil(180*rules.unitsPerDegree/rules.chunkSize)||Number(match[4])>rules.monstersPerChunk)return null;
    return {id,zone:EARTH_ZONE,monsterId:monster.id,monster};
}
export function earthChapterEvent(save,quests,event){
    const progress=save.earthProgress||{version:1,step:0};
    const step=quests.steps[progress.step];if(!step||step.event!==event)return false;
    save.earthProgress={version:1,step:progress.step+1};save.revision++;return true;
}
