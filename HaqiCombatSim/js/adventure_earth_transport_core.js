import {earthPoint,clipEarthRoad} from './adventure_earth_core.js';
import {earthRoadCrossings} from './adventure_earth_bridge_core.js';

// A small settlement overlay compensates for coarse land-cover, never for missing data.
export function createEarthSettlementSampler(sample,cities,rules){
    const width=360*rules.unitsPerDegree,centers=cities.map(c=>({...earthPoint(c.lon,c.lat,rules),radius:c.population>=rules.cityPopulationLarge?rules.settlementRadiusLarge:c.population>=rules.cityPopulationMedium?rules.settlementRadiusMedium:rules.settlementRadiusSmall}));
    return (x,y)=>{const type=sample(x,y);if(!['grass','crops','barren'].includes(type))return type;
        return centers.some(c=>Math.hypot(((x-c.x+width*1.5)%width)-width/2,y-c.y)<=c.radius)?'urban':type;};
}

// Relative-neighbourhood graph: keep an edge unless a city is closer to both ends.
// This contains a Euclidean minimum spanning forest within the distance limit,
// unlike fixed nearest-neighbour counts which can isolate nearby city clusters.
// Topology uses city positions only, so terrain streaming does not choose new edges.
export function generateEarthCityConnections(cities,center,radius,rules,sample,blocked=()=>false){
    const worldWidth=360*rules.unitsPerDegree;
    const points=cities.map(c=>({...c,...earthPoint(c.lon,c.lat,rules)})).map(c=>({...c,x:center.x+((c.x-center.x+worldWidth*1.5)%worldWidth)-worldWidth/2})).filter(c=>Math.hypot(c.x-center.x,c.y-center.y)<=radius+rules.cityConnectionDistance).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
    const out=[];
    for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){
        const a=points[i],b=points[j],id=[a.id,b.id].join('|');
        const length=Math.hypot(b.x-a.x,b.y-a.y);
        if(a.id===b.id||length===0||length>rules.cityConnectionDistance)continue;
        if(points.some(c=>c.id!==a.id&&c.id!==b.id&&Math.hypot(c.x-a.x,c.y-a.y)<length&&Math.hypot(c.x-b.x,c.y-b.y)<length))continue;
        const dx=b.x-a.x,dy=b.y-a.y,control={x:(a.x+b.x)/2-dy*rules.cityConnectionBend,y:(a.y+b.y)/2+dx*rules.cityConnectionBend};
        const route=[],count=Math.max(2,Math.ceil(Math.hypot(dx,dy)/rules.cityConnectionSegment));let previous=a;
        for(let i=1;i<=count;i++){
            const t=i/count,u=1-t,next={x:u*u*a.x+2*u*t*control.x+t*t*b.x,y:u*u*a.y+2*u*t*control.y+t*t*b.y};
            route.push({id:`city-link:${id}:${i}`,a:previous,b:next,width:rules.cityConnectionWidth,connection:true});previous=next;
        }
        for(const segment of earthRoadCrossings(route,(x,y)=>blocked({x,y},rules.cityConnectionWidth/2)?null:sample(x,y),rules)){
            const clipped=clipEarthRoad(segment,center,radius);if(clipped)out.push(clipped);
        }
    }
    return out;
}
