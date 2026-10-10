import {earthDecorationSize,earthSeasonAt,earthNatureMonth} from './adventure_earth_nature_core.js';
import {createEarthSettlementSampler,generateEarthCityConnectionsSteps} from './adventure_earth_transport_core.js';
import {earthRoadBridges} from './adventure_earth_bridge_core.js';
import {earthRoadDocks} from './adventure_earth_boat_core.js';
import {generateEarthUrbanChunkSteps} from './adventure_earth_city_core.js';
import {earthLandmarkSize,placeEarthLandmark,earthPoint,earthGeo,earthSafe,earthNearest} from './adventure_earth_core.js';
import {earthDecorationFrames,earthTreeFrames,earthDecorationStyle} from './adventure_earth_surface_core.js';
import {createRng,hashSeed} from './rng_core.js';
import {cityNodeForSource} from './adventure_city_dungeons_core.js';
import {generatedCityDungeonId} from './adventure_city_generated_core.js';
import {socialNavigationWorld} from './adventure_social_motion_core.js';
import {earthWildSpecies,earthWildLevel,earthWildTargetPower} from './adventure_earth_wild_core.js';
// Bounded cache of immutable generation inputs/results. Player growth is applied afterwards.
export function createEarthSceneCache(limit=192){
    const entries=new Map(),routes=new Map(),urban=new Map();let hits=0,misses=0,scope='',routeLimit=64,urbanLimit=8192;
    return {scope(key,max=limit,routeMax=routeLimit,urbanMax=urbanLimit){if(scope!==key){scope=key;entries.clear();routes.clear();urban.clear();}limit=max;routeLimit=routeMax;urbanLimit=urbanMax;},urban(x,y,sample){const key=`${x}:${y}`;if(urban.has(key))return urban.get(key);const value=sample(x,y)==='urban';urban.set(key,value);while(urban.size>urbanLimit)urban.delete(urban.keys().next().value);return value;},get(key,dependency){const map=key.startsWith('road:')?routes:entries,row=map.get(key);if(!row||row.dependency!==dependency){misses++;return null;}map.delete(key);map.set(key,row);hits++;return row.value;},set(key,dependency,value){const map=key.startsWith('road:')?routes:entries;map.delete(key);map.set(key,{dependency,value});while(map.size>(map===routes?routeLimit:limit))map.delete(map.keys().next().value);return value;},clear(){entries.clear();routes.clear();urban.clear();},get stats(){return {chunks:entries.size,routes:routes.size,urbanSamples:urban.size,hits,misses};}};
}
function chunkDependency(world,cx,cy,rules,base){
    const margin=rules.buildingSafeMargin+rules.roadSafeMargin+rules.monsterClearance,left=cx*rules.chunkSize-margin,top=cy*rules.chunkSize-margin,right=(cx+1)*rules.chunkSize+margin,bottom=(cy+1)*rules.chunkSize+margin;
    const near=o=>o.x+(o.w||o.radius||0)>=left&&o.x-(o.w||o.radius||0)<=right&&o.y+(o.h||o.radius||0)>=top&&o.y-(o.h||o.radius||0)<=bottom;
    return base+JSON.stringify([world.paths.filter(r=>Math.max(r.a.x,r.b.x)>=left&&Math.min(r.a.x,r.b.x)<=right&&Math.max(r.a.y,r.b.y)>=top&&Math.min(r.a.y,r.b.y)<=bottom),world.buildings.filter(near),world.npcs.filter(near),(world.safeAreas||[]).filter(near)],(key,value)=>key==='earthSignature'?undefined:value);
}
// Shared deterministic scene steps. Browser scheduler and Worker drive the same iterator.
export function* buildEarthScene({target,p,cityRows,auth,rules,content,typeAt,playerLevel,playerPower,cache=null,terrainVersion='',species=null,natureAt=Date.UTC(2000,6,1)}){
        target.terrainAt=typeAt;
        cache?.scope(JSON.stringify([rules,cityRows,terrainVersion,earthNatureMonth(natureAt,earthGeo(p,rules).lon)]),rules.streamCacheChunks,rules.streamRouteCacheEntries,rules.streamUrbanSampleEntries);const base='';
        const radius=rules.chunkSize*(rules.activeRadius+1),local=q=>({...q,x:p.x+((q.x-p.x+target.w*1.5)%target.w)-target.w/2}),near=q=>Math.abs(local(q).x-p.x)<=radius&&Math.abs(q.y-p.y)<=radius;
        target.safeAreas=[];target.railways=[];target.paths=[];target.buildings=[];target.npcs=[];target.landmarks=[];target.trees=[];target.encounters=[];target.wildSpawns=[];
        const localCities=cityRows.filter(c=>near(earthPoint(c.lon,c.lat,rules))),settlementAt=createEarthSettlementSampler(typeAt,localCities,rules);
        const nearestCity=localCities.reduce((best,city)=>{const at=local(earthPoint(city.lon,city.lat,rules)),distance=Math.hypot(at.x-p.x,at.y-p.y);return distance<best.distance?{city,distance}:best;},{city:null,distance:rules.cityInfluenceRadius}).city;
        const place=auth?.row||nearestCity,geo=earthGeo(p,rules);
        target.layout.name=place?[place.country,place.name].filter(Boolean).join('.'):`${geo.lat.toFixed(3)}, ${geo.lon.toFixed(3)}`;
        target.mapCities=localCities.map(city=>({...city,...local(earthPoint(city.lon,city.lat,rules))}));
        const wildSpecies=species||earthWildSpecies(content);
        // Sample the actual loaded land-cover, never city CSV centers or settlement overlays.
        const urbanPoints=[],step=rules.wildUrbanSampleStep,extent=radius+rules.wildFarDistance;
        for(let y=Math.max(0,Math.floor((p.y-extent)/step)*step);y<=Math.min(target.h,p.y+extent);y+=step){
            yield;
            for(let x=Math.floor((p.x-extent)/step)*step;x<=p.x+extent;x+=step){yield;if(cache?cache.urban(x,y,typeAt):typeAt(x,y)==='urban')urbanPoints.push({x,y});}
        }
        target.wildSpecies=wildSpecies;
        for(const city of cityRows.filter(c=>near(earthPoint(c.lon,c.lat,rules))).sort((a,b)=>Math.hypot(earthPoint(a.lon,a.lat,rules).x-p.x,earthPoint(a.lon,a.lat,rules).y-p.y)-Math.hypot(earthPoint(b.lon,b.lat,rules).x-p.x,earthPoint(b.lon,b.lat,rules).y-p.y)).slice(0,rules.maxSceneCities)){const at=local(earthPoint(city.lon,city.lat,rules));if(!near(at))continue;
            target.landmarks.push({...at,id:`city:${city.id}`,name:city.name,cityDungeon:true,cityLevel:city.level,dungeonId:generatedCityDungeonId(city),cityFallback:{id:city.id,name:city.name,lon:city.lon,lat:city.lat,level:city.level},description:'来自真实城市位置的探索区。建筑和道路为游戏改编。'});
        }
        let authoredRoadsCache=null;
        if(auth){
            target.safeAreas=(auth.encounters.safeAreas||[]).map(a=>({...a,...earthPoint(a.lon,a.lat,rules)})).filter(near);
            const authoredRoads=authoredRoadsCache=yield* generateEarthCityConnectionsSteps(cityRows,p,radius,rules,typeAt,undefined,cache);
            for(const b of auth.buildings.buildings){yield;const origin=earthPoint(b.lon,b.lat,rules);if(!near(origin))continue;const placed=placeEarthLandmark({...b,...origin,...earthLandmarkSize(b,auth.art.frames[b.frame])},authoredRoads,typeAt,rules);if(!placed)continue;const at=placed;target.buildings.push({...placed,tile:2,earthFrame:b.frame});target.landmarks.push({...at,y:at.y+65,id:b.id,name:b.name,description:'深圳地标，建筑与景观为游戏美术改编。'});}
            for(const n of auth.npcs.npcs){yield;const at=earthPoint(n.lon,n.lat,rules);if(!near(at))continue;const safe=earthNearest({...target,npcs:[]},at.x,at.y,{safe:true,landOnly:true});if(!safe)continue;const npc={...n,...safe,cityId:auth.row.id,hidden:false,artVisible:true,zone:'earth',earthNpc:true};target.npcs.push(npc);}
            for(const e of auth.encounters.encounters){const at=earthPoint(e.lon,e.lat,rules);if(near(at)&&typeAt(at.x,at.y)&&!['water','ocean'].includes(typeAt(at.x,at.y))&&!earthSafe(target,at,rules.monsterClearance))target.encounters.push({...e,...at,zone:'earth'});}
        }
        const gx=Math.floor(p.x/rules.chunkSize),gy=Math.floor(p.y/rules.chunkSize),activeRadius=Math.min(rules.activeRadius,Math.floor((Math.sqrt(rules.maxChunks)-1)/2));
        const protectedWorld={...target,paths:[...target.paths],buildings:[...target.buildings]};
        // Landmarks may overlap the road visually; only terrain can cut a route.
        target.paths.push(...(authoredRoadsCache||(yield* generateEarthCityConnectionsSteps(cityRows,p,radius,rules,typeAt,undefined,cache))));
        protectedWorld.paths=[...target.paths];
        target.layout.bridges=earthRoadBridges(target.paths);
        target.docks=earthRoadDocks(target.paths).filter(near);
        let urbanCount=0;
        for(let cy=gy-activeRadius;cy<=gy+activeRadius;cy++)for(let cx=gx-activeRadius;cx<=gx+activeRadius;cx++){
            yield;
            if(cy<0||cy>=target.h/rules.chunkSize)continue;
            const key=`urban:${cx}:${cy}`,dependency=chunkDependency(protectedWorld,cx,cy,rules,base);
            let objects=cache?.get(key,dependency);
            if(!objects){objects=yield* generateEarthUrbanChunkSteps(cx,cy,cityRows,rules,settlementAt,(at,padding)=>earthSafe(protectedWorld,at,padding));cache?.set(key,dependency,objects);}
            const selected=objects.slice(0,Math.max(0,rules.maxUrbanObjects-urbanCount));target.buildings.push(...selected);urbanCount+=selected.length;
        }
        for(let cy=gy-activeRadius;cy<=gy+activeRadius;cy++)for(let cx=gx-activeRadius;cx<=gx+activeRadius;cx++){
            yield;
            if(cy<0||cy>=Math.ceil(target.h/rules.chunkSize))continue;const nx=((cx%(target.w/rules.chunkSize))+target.w/rules.chunkSize)%(target.w/rules.chunkSize);
            const key=`forest:${cx}:${cy}`,dependency=chunkDependency(target,cx,cy,rules,base),cached=cache?.get(key,dependency),chunkTrees=[],spawns=[];
            if(cached){chunkTrees.push(...cached.trees);spawns.push(...cached.spawns);}else{
            const rng=createRng(hashSeed(`earth:${rules.generationVersion}:${nx}:${cy}`));
            for(let i=0;i<rules.treesPerChunk+rules.monstersPerChunk;i++){
                if(i%8===0)yield;
                const slot=i-rules.treesPerChunk,grid=Math.ceil(Math.sqrt(rules.monstersPerChunk));
                const at=i<rules.treesPerChunk?{x:(cx+rng.float())*rules.chunkSize,y:(cy+rng.float())*rules.chunkSize}:{x:(cx+(slot%grid+.2+.6*rng.float())/grid)*rules.chunkSize,y:(cy+(Math.floor(slot/grid)+.2+.6*rng.float())/grid)*rules.chunkSize},type=typeAt(at.x,at.y);if(!type||['water','ocean','urban'].includes(type))continue;
                if(i<rules.treesPerChunk){if(type==='forest'&&!earthSafe(target,at)){const geo=earthGeo(at,rules),pool=earthTreeFrames(type,geo.lat,geo.lon,earthSeasonAt(natureAt,geo.lon,geo.lat)),variation=rng.float(),frame=createRng(hashSeed(`earth-tree:${nx}:${cy}:${i}`)).pick(pool),size=earthDecorationSize(frame,variation);chunkTrees.push({...at,tile:0,earthDecoFrame:frame,...earthDecorationStyle(type,frame),size});}}
                else if(!earthSafe(target,at,rules.wildSpawnClearance)){
                    const id=`earth-spawn:${nx}:${cy}:${slot}`;
                    spawns.push({id,profile:{id},position:at,chunkX:nx,chunkY:cy,slot,version:rules.generationVersion});
                }
            }
            cache?.set(key,dependency,{trees:chunkTrees,spawns});}
            target.trees.push(...chunkTrees);
            for(const spawn of spawns){yield;target.wildSpawns.push({...spawn,level:earthWildLevel(content,playerLevel,spawn.position,urbanPoints,rules),targetPower:playerPower===undefined?null:earthWildTargetPower(content,playerPower,spawn.position,urbanPoints,rules)});}
        }
        // A separate stream keeps visual additions from altering encounter identities.
        for(let cy=gy-activeRadius;cy<=gy+activeRadius;cy++)for(let cx=gx-activeRadius;cx<=gx+activeRadius;cx++){
            yield;
            const nx=((cx%(target.w/rules.chunkSize))+target.w/rules.chunkSize)%(target.w/rules.chunkSize),decoRng=createRng(hashSeed(`earth-deco:1:${nx}:${cy}`));
            const key=`deco:${cx}:${cy}`,dependency=chunkDependency(target,cx,cy,rules,base),cached=cache?.get(key,dependency),objects=[];
            if(cached){target.trees.push(...cached);continue;}
            for(let i=0;i<rules.decorationsPerChunk+rules.forestDecorationsPerChunk;i++){
                if(i%8===0)yield;
                const at={x:(cx+decoRng.float())*rules.chunkSize,y:(cy+decoRng.float())*rules.chunkSize},type=typeAt(at.x,at.y);
                if(!type||['water','ocean'].includes(type)||(i>=rules.decorationsPerChunk&&type!=='forest')||earthSafe(target,at,12))continue;
                const geo=earthGeo(at,rules),season=earthSeasonAt(natureAt,geo.lon,geo.lat),pool=i>=rules.decorationsPerChunk?earthTreeFrames(type,geo.lat,geo.lon,season):earthDecorationFrames(type,geo.lat,geo.lon,season);if(!pool.length)continue;
                const frame=decoRng.pick(pool),size=earthDecorationSize(frame,decoRng.float());
                objects.push({...at,tile:0,earthDecoFrame:frame,...earthDecorationStyle(type,frame),size});
            }
            cache?.set(key,dependency,objects);target.trees.push(...objects);
        }
        target.center={...p};target.portal={...target.portal,...p};target.layout.spawn={...p};target.layout.regions=[{...p,rx:radius,ry:radius,name:auth?`${auth.row.name} · 与世界同行`:target.landmarks[0]?.name||'地球旷野'}];
        if(auth?.city.entrance){
            // The explicitly configured city entrance takes precedence over its CSV duplicate.
            target.landmarks=target.landmarks.filter(mark=>!(mark.cityFallback&&mark.name===auth.city.name&&Math.hypot(mark.x-earthPoint(auth.city.entrance.lon,auth.city.entrance.lat,rules).x,mark.y-earthPoint(auth.city.entrance.lon,auth.city.entrance.lat,rules).y)<rules.cityRadius));
            const city=auth.city,entries=[{...city.entrance,id:`city:${city.id}:entrance`,name:city.name,dungeonId:city.entrance.dungeonId},...city.nodes.map(node=>({...node,dungeonId:node.dungeon.id,cityNodeEntrance:true}))];
            for(const entry of entries){yield;
                let origin=earthPoint(entry.lon,entry.lat,rules);
                if(entry.source?.kind==='authored'){const mark=target.landmarks.find(m=>m.id===entry.source.id);if(!mark)continue;origin={x:mark.x,y:mark.y};}
                if(entry.source?.kind==='csv'){const source=cityRows.find(c=>cityNodeForSource(city,c)?.id===entry.id);if(!source)continue;origin=earthPoint(source.lon,source.lat,rules);}
                if(!near(origin))continue;
                const placed=earthNearest(target,origin.x,origin.y,{landOnly:true});if(!placed)continue;
                const sourceId=entry.source?.kind==='authored'?entry.source.id:entry.source?.kind==='csv'?`city:${entry.source.id}`:entry.id;
                target.landmarks=target.landmarks.filter(mark=>mark.id!==sourceId);
                target.landmarks.push({...placed,id:entry.id,name:entry.name,dungeonId:entry.dungeonId,cityDungeon:true,cityLevel:city.entrance.level,cityNodeEntrance:!!entry.cityNodeEntrance});
                target.safeAreas.push({...placed,id:`${entry.id}:safe`,radius:100});
            }
            target.encounters=target.encounters.filter(e=>!earthSafe(target,e,rules.monsterClearance));
        }
        for(const mark of target.landmarks.filter(m=>m.cityFallback)){yield;const at=earthNearest(target,mark.x,mark.y,{landOnly:true});if(at)Object.assign(mark,at);else mark.hidden=true;target.safeAreas.push({...mark,radius:80});}
        // Entrances are finalized after authored NPC placement. Keep residents beside
        // them using the same actor-only clearance as roaming AI; players can enter.
        const residentWorld=socialNavigationWorld(target);
        const residents=[];
        for(const npc of target.npcs){yield;const at=earthNearest(residentWorld,npc.x,npc.y,{safe:true});if(at)residents.push({...npc,...at});}
        target.npcs=residents;
        target.encounters=target.encounters.filter(e=>!target.landmarks.some(m=>m.cityFallback&&!m.hidden&&Math.hypot(m.x-e.x,m.y-e.y)<80+rules.monsterClearance));
        target.wildAuthored=target.encounters;target.wildSpawns=target.wildSpawns.filter(s=>!earthSafe(target,s.position,rules.wildSpawnClearance));
        target.layout.paths=target.paths;target.layout.buildings=target.buildings;target.layout.trees=target.trees;target.layout.landmarks=target.landmarks;
        target.earthSocialId=auth?.row.id||target.landmarks[0]?.id||`${gx}:${gy}`;target.art=auth?.art||null;target.city=auth?.city||null;target.earthRegion=auth?.row.id||null;target.revision++;
        for(const group of ['paths','buildings','npcs','landmarks','trees','encounters','mapCities','wildSpawns'])for(const row of target[group]){yield;if(!row.earthSignature)Object.defineProperty(row,'earthSignature',{value:JSON.stringify(row)});}
        target.streamCacheStats=cache?.stats||null;
        return target;
}
