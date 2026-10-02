import {earthPoint,landRoadSegments,clipEarthRoad} from './adventure_earth_core.js';

// A small settlement overlay compensates for coarse land-cover, never for missing data.
export function createEarthSettlementSampler(sample,cities,rules){
    const width=360*rules.unitsPerDegree,centers=cities.map(c=>({...earthPoint(c.lon,c.lat,rules),radius:c.population>=rules.cityPopulationLarge?rules.settlementRadiusLarge:c.population>=rules.cityPopulationMedium?rules.settlementRadiusMedium:rules.settlementRadiusSmall}));
    return (x,y)=>{const type=sample(x,y);if(!['grass','crops','barren'].includes(type))return type;
        return centers.some(c=>Math.hypot(((x-c.x+width*1.5)%width)-width/2,y-c.y)<=c.radius)?'urban':type;};
}

// Nearest-neighbour connections use real city coordinates; curves are game scenery.
export function generateEarthCityConnections(cities,center,radius,rules,sample,blocked=()=>false){
    const worldWidth=360*rules.unitsPerDegree;
    const points=cities.map(c=>({...c,...earthPoint(c.lon,c.lat,rules)})).map(c=>({...c,x:center.x+((c.x-center.x+worldWidth*1.5)%worldWidth)-worldWidth/2})).filter(c=>Math.hypot(c.x-center.x,c.y-center.y)<=radius+rules.cityConnectionDistance).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
    const edges=new Map(),out=[];
    for(const a of points){
        const neighbours=points.filter(b=>b.id!==a.id).map(b=>({b,d:Math.hypot(a.x-b.x,a.y-b.y)})).filter(v=>v.d>0&&v.d<=rules.cityConnectionDistance).sort((u,v)=>u.d-v.d||String(u.b.id).localeCompare(String(v.b.id))).slice(0,rules.cityConnectionNeighbours);
        for(const {b} of neighbours){const pair=[a,b].sort((u,v)=>String(u.id).localeCompare(String(v.id)));edges.set(pair.map(c=>c.id).join('|'),pair);}
    }
    for(const [id,[a,b]] of edges){
        // Omit a redundant triangle side when a closer city connects both ends.
        // This keeps dense settlements from becoming a fan of overlapping roads.
        const length=Math.hypot(b.x-a.x,b.y-a.y);
        if(points.some(c=>c.id!==a.id&&c.id!==b.id&&Math.hypot(c.x-a.x,c.y-a.y)<length&&Math.hypot(c.x-b.x,c.y-b.y)<length&&edges.has([a.id,c.id].sort().join('|'))&&edges.has([b.id,c.id].sort().join('|'))))continue;
        const dx=b.x-a.x,dy=b.y-a.y,control={x:(a.x+b.x)/2-dy*rules.cityConnectionBend,y:(a.y+b.y)/2+dx*rules.cityConnectionBend};
        const count=Math.max(2,Math.ceil(Math.hypot(dx,dy)/rules.cityConnectionSegment));let previous=a;
        for(let i=1;i<=count;i++){
            const t=i/count,u=1-t,next={x:u*u*a.x+2*u*t*control.x+t*t*b.x,y:u*u*a.y+2*u*t*control.y+t*t*b.y};
            const road=clipEarthRoad({id:`city-link:${id}:${i}`,a:previous,b:next,width:rules.cityConnectionWidth,connection:true},center,radius);previous=next;if(!road)continue;
            out.push(...landRoadSegments(road,(x,y)=>blocked({x,y},rules.cityConnectionWidth/2)?null:sample(x,y),rules.roadSampleStep));
        }
    }
    return out;
}
