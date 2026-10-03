import {streamEarthWild} from './adventure_earth_wild_stream_core.js';
import {createEarthSettlementSampler,generateEarthCityConnections} from './adventure_earth_transport_core.js';
import {earthRoadBridges} from './adventure_earth_bridge_core.js';
import {earthRoadDocks} from './adventure_earth_boat_core.js';
import {paintBridges} from './adventure_bridge.js';
import {generateEarthUrbanChunk} from './adventure_earth_city_core.js';
// Browser IO boundary. Constructing this service performs no requests.
import {reuseEarthObjects,earthLandmarkSize,placeEarthLandmark,earthRules,earthMapInfo,earthPoint,earthGeo,terrainKey,terrainBounds,terrainUrl,cityKey,parseEarthCities,parseEarthCatalog,inGeoBounds,earthSafe,earthNearest} from './adventure_earth_core.js';
import {earthDecorationFrames,earthTreeFrames,earthDecorationIsTree,earthDecorationStyle,seamlessEarthAtlas} from './adventure_earth_surface_core.js';
import {createEarthSurfacePainter} from './adventure_earth_surface.js';
import {createRng,hashSeed} from './rng_core.js';
import {assetMode,assetUrl} from './adventure_media_core.js';
import {validateEarthCity} from './adventure_earth_city_config_core.js';
import {cityNodeForSource} from './adventure_city_dungeons_core.js';
import {generatedCityDungeonId} from './adventure_city_generated_core.js';
import {socialNavigationWorld} from './adventure_social_motion_core.js';
import {earthWildSpecies,earthWildLevel,earthWildTargetPower} from './adventure_earth_wild_core.js';

export class EarthCache {
    constructor({limit=12,bytes=33554432,concurrency=4,maxQueue=48,groups={}}={}){this.pinned=new Set();this.maxQueue=maxQueue;this.groups=groups;this.limit=limit;this.budget=bytes;this.concurrency=concurrency;this.entries=new Map();this.pending=new Map();this.queue=[];this.active=0;this.bytes=0;this.epoch=0;}
    peek(key){const row=this.entries.get(key);if(!row)return null;this.entries.delete(key);this.entries.set(key,row);return row.value;}
    get(key,load){
        const cached=this.peek(key);if(cached)return Promise.resolve(cached);if(this.pending.has(key))return this.pending.get(key);
        if(this.queue.length>=this.maxQueue)return Promise.reject(Error('地图加载繁忙，请稍后重试'));
        const epoch=this.epoch;
        const task=new Promise((resolve,reject)=>{this.queue.push({key,load,resolve,reject,epoch});});
        this.pending.set(key,task);this.pump();return task;
    }
    pump(){while(this.active<this.concurrency&&this.queue.length){const job=this.queue.shift();this.active++;
        Promise.resolve().then(job.load).then(value=>{
            if(job.epoch!==this.epoch){value?.dispose?.();throw Error('已取消地图加载');}
            const bytes=value.bytes||0;if(bytes>this.budget){value.dispose?.();throw Error('地图文件超出内存预算');}
            this.entries.set(job.key,{value,bytes});this.bytes+=bytes;
            const group=Object.keys(this.groups).find(prefix=>job.key.startsWith(prefix));
            while(this.entries.size>this.limit||this.bytes>this.budget||(group&&[...this.entries.keys()].filter(k=>k.startsWith(group)).length>this.groups[group])){const keys=[...this.entries.keys()],overflow=group&&keys.filter(k=>k.startsWith(group)).length>this.groups[group];const key=keys.find(k=>!this.pinned.has(k)&&(overflow?k.startsWith(group):k!=='overview'))||keys.find(k=>!this.pinned.has(k));if(!key)throw Error('当前场景已占满地图缓存预算');const row=this.entries.get(key);this.entries.delete(key);this.bytes-=row.bytes;row.value.dispose?.();}
            if(!this.entries.has(job.key))throw Error('目的地超出当前可用地图缓存预算');job.resolve(value);
        }).catch(job.reject).finally(()=>{this.active--;if(job.epoch===this.epoch)this.pending.delete(job.key);this.pump();});
    }}
    cancelPending(){this.epoch++;for(const job of this.queue)job.reject(Error('已取消地图加载'));this.queue=[];this.pending.clear();}
    clear(){this.cancelPending();this.pinned.clear();for(const row of this.entries.values())row.value.dispose?.();this.entries.clear();this.bytes=0;}
}

export function createEarthService({content,getPlayerLevel=()=>1,getPlayerPower=null,fetcher=globalThis.fetch,decode=decodeTerrain,decodeOverview=decodeMapOverview,registerImage,releaseImage}={}){
    let surface=null;
    const rules=earthRules(content),cache=new EarthCache({limit:rules.maxTiles+rules.maxCityTiles+24,bytes:rules.maxDecodedBytes,concurrency:rules.maxConcurrent,maxQueue:rules.maxQueuedRequests,groups:{'terrain:':rules.maxTiles,'cities:':rules.maxCityTiles}});
    let index,geography,generation,world,region,chapter,epoch=0,controllers=new Set(),lastStreamKey='',lastStreamPosition=null,streamTask=null,nextRetry=0;
    async function request(url,kind='json'){
        const controller=new AbortController();controllers.add(controller);const timer=setTimeout(()=>controller.abort(),rules.requestTimeoutMs);
        try{const response=await fetcher(url,{signal:controller.signal});if(!response.ok)throw Error(`地图数据暂不可用（${response.status}）`);return await response[kind]();}
        finally{clearTimeout(timer);controllers.delete(controller);}
    }
    const json=url=>cache.get(url,()=>request(url));
    async function ready(){
        const token=epoch,nextIndex=index||await json('data/adventure/earth/index.json');if(token!==epoch)throw Error('已取消地图加载');index=nextIndex;
        const nextGeography=geography||await json(`data/adventure/earth/${index.geography}`);if(token!==epoch)throw Error('已取消地图加载');geography=nextGeography;
        return {index,geography,generation};
    }
    async function tile(key){await ready();return cache.get(`terrain:${key}`,async()=>{const data=await decode(await request(terrainUrl(geography.terrainBase,key),'blob'),geography.palette,key);const b=terrainBounds(key);surface?.invalidate({x:(b.west+180)*rules.unitsPerDegree,y:(90-b.north)*rules.unitsPerDegree,w:2*rules.unitsPerDegree,h:2*rules.unitsPerDegree});return data;});}
    async function cities(lon,lat){await ready();const key=cityKey(lon,lat);return cache.get(`cities:${key}`,async()=>{
        const text=await request(`${geography.cityBase}${geography.cityLanguage}/world_cities_${key}.${geography.cityLanguage}.csv?ver=${geography.cityVersion}`,'text');
        return {rows:parseEarthCities(text),bytes:text.length*4};
    });}
    function typeAt(x,y){const geo=earthGeo({x,y},rules),key=terrainKey(geo.lon,geo.lat),data=cache.entries.get(`terrain:${key}`)?.value;if(!data)return null;return sampleTerrain(data,geo);}
    async function authored(geo){
        const row=index.regions.find(r=>inGeoBounds(geo,{west:r.bounds.west-.1,east:r.bounds.east+.1,south:r.bounds.south-.1,north:r.bounds.north+.1}));
        if(!row)return null;
        const city=validateEarthCity(await json(`data/adventure/earth/${row.manifest}`));
        if(city.id!==row.id)throw Error('城市配置与索引不匹配');
        const files={buildings:{buildings:city.buildings},npcs:{npcs:city.npcs},encounters:{encounters:city.encounters,safeAreas:city.safeAreas},art:city.art.landmarks};
        validateRegion(files,content);
        return {row,city,...files};
    }
    async function loadSurfaceArt(){
        const token=epoch,manifest=await json('data/adventure/earth/surface-art.json');
        const entries=await Promise.all(['terrain','decorations','cityGround','biomeDecorations'].filter(kind=>manifest[kind]).map(async kind=>{
            const localMode=new URLSearchParams(globalThis.location?.search||'').get('assets')==='local';
            if(kind==='cityGround'&&manifest[kind].tiles){
                const row=manifest[kind],key=`city-ground:${row.sourceSha256}`;
                const result=await cache.get(key,async()=>{
                    const canvas=document.createElement('canvas');canvas.width=row.width;canvas.height=row.height;const c=canvas.getContext('2d',{willReadFrequently:true});
                    for(const tile of row.tiles){const image=await createImageBitmap(await request(localMode?tile.local:tile.cdn,'blob'));try{if(image.width!==tile.width||image.height!==tile.height)throw Error('城市背景尺寸不匹配');c.drawImage(image,tile.x,tile.y);}finally{image.close();}}
                    const data=c.getImageData(0,0,row.width,row.height).data;canvas.width=canvas.height=0;return {data,width:row.width,height:row.height,bytes:data.byteLength};
                });
                return [kind,result,key];
            }
            const row=manifest[kind],url=new URLSearchParams(globalThis.location?.search||'').get('assets')==='local'?row.local:row.cdn;
            const result=await cache.get(url,async()=>{
                const image=await createImageBitmap(await request(url,'blob'));
                if(image.width!==row.width||image.height!==row.height){image.close();throw Error('地表图集尺寸不匹配');}
                if(kind==='decorations'||kind==='biomeDecorations')return {image,frames:row.frames,width:image.width,height:image.height,bytes:image.width*image.height*4,dispose(){image.close();}};
                const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(image,0,0);image.close();const raw=c.getImageData(0,0,canvas.width,canvas.height).data,data=kind==='terrain'?seamlessEarthAtlas(raw,canvas.width):raw;canvas.width=canvas.height=0;
                return {data,width:row.width,height:row.height,bytes:data.byteLength};
            });
            return [kind,result,url];
        }));
        if(token!==epoch)throw Error('已取消地表美术加载');
        for(const [,,url] of entries)surfaceArtKeys.add(url);
        if(world){world.cacheKeys.push(...surfaceArtKeys);cache.pinned=new Set(world.cacheKeys);}
        return Object.fromEntries(entries.map(([kind,value])=>[kind,value]));
    }
    const surfaceArtKeys=new Set();
    function makeWorld(p){
        const info=earthMapInfo(content),params=content.balanceParams;
        return {zone:'earth',isEarth:true,earthBoating:true,w:info.w,h:info.h,earthRules:rules,terrainAt:typeAt,interactionParams:params?.adventure,monsterSceneParams:params?.monsterScene,
            center:{...p},npcs:[],encounters:[],paths:[],buildings:[],trees:[],landmarks:[],decorations:[],portal:{id:'portal',hidden:true,x:p.x,y:p.y},
            layout:{name:'现实世界',earth:true,w:info.w,h:info.h,spawn:{...p},regions:[],bridges:[],rivers:[],lakes:[],rules:{terrain:{ocean:'#438b9b'}},coast:[]},
            terrainPainter:paint,drawEarthDecoration:(ctx,o)=>surface?.decoration(ctx,o),earthDecorationBaked:o=>surface?.isBaked(o),get surfaceStats(){return surface?.stats;},error:'',revision:0};
    }
    async function build(target,p,cityRows,auth,token){
        let work=0,lastYield=performance.now();const yieldWork=async()=>{if(typeof window!=='undefined')await new Promise(resolve=>setTimeout(resolve,0));lastYield=performance.now();};
        const radius=rules.chunkSize*(rules.activeRadius+1),local=q=>({...q,x:p.x+((q.x-p.x+target.w*1.5)%target.w)-target.w/2}),near=q=>Math.abs(local(q).x-p.x)<=radius&&Math.abs(q.y-p.y)<=radius;
        target.safeAreas=[];target.railways=[];target.paths=[];target.buildings=[];target.npcs=[];target.landmarks=[];target.trees=[];target.encounters=[];target.wildSpawns=[];
        const localCities=cityRows.filter(c=>near(earthPoint(c.lon,c.lat,rules))),settlementAt=createEarthSettlementSampler(typeAt,localCities,rules);
        const nearestCity=localCities.reduce((best,city)=>{const at=local(earthPoint(city.lon,city.lat,rules)),distance=Math.hypot(at.x-p.x,at.y-p.y);return distance<best.distance?{city,distance}:best;},{city:null,distance:rules.cityInfluenceRadius}).city;
        const place=auth?.row||nearestCity,geo=earthGeo(p,rules);
        target.layout.name=place?[place.country,place.name].filter(Boolean).join('.'):`${geo.lat.toFixed(3)}, ${geo.lon.toFixed(3)}`;
        target.mapCities=localCities.map(city=>({...city,...local(earthPoint(city.lon,city.lat,rules))}));
        const wildSpecies=earthWildSpecies(content),playerLevel=getPlayerLevel(),playerPower=getPlayerPower?.();
        // Sample the actual loaded land-cover, never city CSV centers or settlement overlays.
        const urbanPoints=[],step=rules.wildUrbanSampleStep,extent=radius+rules.wildFarDistance;
        for(let y=Math.max(0,Math.floor((p.y-extent)/step)*step);y<=Math.min(target.h,p.y+extent);y+=step){
            if(performance.now()-lastYield>=rules.streamBuildBudgetMs){await yieldWork();if(token!==epoch)return false;}
            for(let x=Math.floor((p.x-extent)/step)*step;x<=p.x+extent;x+=step)if(typeAt(x,y)==='urban')urbanPoints.push({x,y});
        }
        target.wildSpecies=wildSpecies;
        for(const city of cityRows.filter(c=>near(earthPoint(c.lon,c.lat,rules))).sort((a,b)=>Math.hypot(earthPoint(a.lon,a.lat,rules).x-p.x,earthPoint(a.lon,a.lat,rules).y-p.y)-Math.hypot(earthPoint(b.lon,b.lat,rules).x-p.x,earthPoint(b.lon,b.lat,rules).y-p.y)).slice(0,rules.maxSceneCities)){const at=local(earthPoint(city.lon,city.lat,rules));if(!near(at))continue;
            target.landmarks.push({...at,id:`city:${city.id}`,name:city.name,cityDungeon:true,cityLevel:city.level,dungeonId:generatedCityDungeonId(city),cityFallback:{id:city.id,name:city.name,lon:city.lon,lat:city.lat,level:city.level},description:'来自真实城市位置的探索区。建筑和道路为游戏改编。'});
        }
        if(auth){
            target.safeAreas=(auth.encounters.safeAreas||[]).map(a=>({...a,...earthPoint(a.lon,a.lat,rules)})).filter(near);
            const authoredRoads=generateEarthCityConnections(cityRows,p,radius,rules,typeAt);
            for(const b of auth.buildings.buildings){const origin=earthPoint(b.lon,b.lat,rules);if(!near(origin))continue;const placed=placeEarthLandmark({...b,...origin,...earthLandmarkSize(b,auth.art.frames[b.frame])},authoredRoads,typeAt,rules);if(!placed)continue;const at=placed;target.buildings.push({...placed,tile:2,earthFrame:b.frame});target.landmarks.push({...at,y:at.y+65,id:b.id,name:b.name,description:'深圳地标，建筑与景观为游戏美术改编。'});}
            for(const n of auth.npcs.npcs){const at=earthPoint(n.lon,n.lat,rules);if(!near(at))continue;const safe=earthNearest({...target,npcs:[]},at.x,at.y,{safe:true,landOnly:true});if(!safe)continue;const npc={...n,...safe,cityId:auth.row.id,hidden:false,artVisible:true,zone:'earth',earthNpc:true};target.npcs.push(npc);}
            for(const e of auth.encounters.encounters){const at=earthPoint(e.lon,e.lat,rules);if(near(at)&&typeAt(at.x,at.y)&&!['water','ocean'].includes(typeAt(at.x,at.y))&&!earthSafe(target,at,rules.monsterClearance))target.encounters.push({...e,...at,zone:'earth'});}
        }
        const gx=Math.floor(p.x/rules.chunkSize),gy=Math.floor(p.y/rules.chunkSize),activeRadius=Math.min(rules.activeRadius,Math.floor((Math.sqrt(rules.maxChunks)-1)/2));
        const protectedWorld={...target,paths:[...target.paths],buildings:[...target.buildings]};
        // Landmarks may overlap the road visually; only terrain can cut a route.
        target.paths.push(...generateEarthCityConnections(cityRows,p,radius,rules,typeAt));
        protectedWorld.paths=[...target.paths];
        target.layout.bridges=earthRoadBridges(target.paths);
        target.docks=earthRoadDocks(target.paths).filter(near);
        let urbanCount=0;
        for(let cy=gy-activeRadius;cy<=gy+activeRadius;cy++)for(let cx=gx-activeRadius;cx<=gx+activeRadius;cx++){
            if(++work&&performance.now()-lastYield>=rules.streamBuildBudgetMs){await yieldWork();if(token!==epoch)return false;}
            if(cy<0||cy>=target.h/rules.chunkSize)continue;
            const objects=generateEarthUrbanChunk(cx,cy,cityRows,rules,settlementAt,(at,padding)=>earthSafe(protectedWorld,at,padding));
            const selected=objects.slice(0,Math.max(0,rules.maxUrbanObjects-urbanCount));target.buildings.push(...selected);urbanCount+=selected.length;
        }
        for(let cy=gy-activeRadius;cy<=gy+activeRadius;cy++)for(let cx=gx-activeRadius;cx<=gx+activeRadius;cx++){
            if(++work&&performance.now()-lastYield>=rules.streamBuildBudgetMs){await yieldWork();if(token!==epoch)return false;}
            if(cy<0||cy>=Math.ceil(target.h/rules.chunkSize))continue;const nx=((cx%(target.w/rules.chunkSize))+target.w/rules.chunkSize)%(target.w/rules.chunkSize);
            const rng=createRng(hashSeed(`earth:${rules.generationVersion}:${nx}:${cy}`));
            for(let i=0;i<rules.treesPerChunk+rules.monstersPerChunk;i++){
                if(i%16===0&&performance.now()-lastYield>=rules.streamBuildBudgetMs){await yieldWork();if(token!==epoch)return false;}
                const slot=i-rules.treesPerChunk,grid=Math.ceil(Math.sqrt(rules.monstersPerChunk));
                const at=i<rules.treesPerChunk?{x:(cx+rng.float())*rules.chunkSize,y:(cy+rng.float())*rules.chunkSize}:{x:(cx+(slot%grid+.2+.6*rng.float())/grid)*rules.chunkSize,y:(cy+(Math.floor(slot/grid)+.2+.6*rng.float())/grid)*rules.chunkSize},type=typeAt(at.x,at.y);if(!type||['water','ocean','urban'].includes(type))continue;
                if(i<rules.treesPerChunk){if(type==='forest'&&!earthSafe(target,at)){const pool=earthTreeFrames(type,earthGeo(at,rules).lat),size=110+rng.int(0,45),frame=createRng(hashSeed(`earth-tree:${nx}:${cy}:${i}`)).pick(pool);target.trees.push({...at,tile:0,earthDecoFrame:frame,size});}}
                else if(!earthSafe(target,at,rules.wildSpawnClearance)){
                    const id=`earth-spawn:${nx}:${cy}:${slot}`;
                    target.wildSpawns.push({id,profile:{id},position:at,chunkX:nx,chunkY:cy,slot,
                        level:earthWildLevel(content,playerLevel,at,urbanPoints,rules),targetPower:playerPower===undefined?null:earthWildTargetPower(content,playerPower,at,urbanPoints,rules),version:rules.generationVersion});
                }
            }
        }
        // A separate stream keeps visual additions from altering encounter identities.
        for(let cy=gy-activeRadius;cy<=gy+activeRadius;cy++)for(let cx=gx-activeRadius;cx<=gx+activeRadius;cx++){
            if(++work&&performance.now()-lastYield>=rules.streamBuildBudgetMs){await yieldWork();if(token!==epoch)return false;}
            const nx=((cx%(target.w/rules.chunkSize))+target.w/rules.chunkSize)%(target.w/rules.chunkSize),decoRng=createRng(hashSeed(`earth-deco:1:${nx}:${cy}`));
            for(let i=0;i<rules.decorationsPerChunk+rules.forestDecorationsPerChunk;i++){
                if(i%16===0&&performance.now()-lastYield>=rules.streamBuildBudgetMs){await yieldWork();if(token!==epoch)return false;}
                const at={x:(cx+decoRng.float())*rules.chunkSize,y:(cy+decoRng.float())*rules.chunkSize},type=typeAt(at.x,at.y);
                if(!type||['water','ocean'].includes(type)||(i>=rules.decorationsPerChunk&&type!=='forest')||earthSafe(target,at,12))continue;
                const latitude=earthGeo(at,rules).lat,pool=i>=rules.decorationsPerChunk?earthTreeFrames(type,latitude):earthDecorationFrames(type,latitude);if(!pool.length)continue;
                const frame=decoRng.pick(pool),size=earthDecorationIsTree(frame)?90+decoRng.int(0,60):28+decoRng.int(0,34);
                target.trees.push({...at,tile:0,earthDecoFrame:frame,...earthDecorationStyle(type,frame),size});
            }
        }
        target.center={...p};target.portal={...target.portal,...p};target.layout.spawn={...p};target.layout.regions=[{...p,rx:radius,ry:radius,name:auth?`${auth.row.name} · 与世界同行`:target.landmarks[0]?.name||'地球旷野'}];
        if(auth?.city.entrance){
            // The explicitly configured city entrance takes precedence over its CSV duplicate.
            target.landmarks=target.landmarks.filter(mark=>!(mark.cityFallback&&mark.name===auth.city.name&&Math.hypot(mark.x-earthPoint(auth.city.entrance.lon,auth.city.entrance.lat,rules).x,mark.y-earthPoint(auth.city.entrance.lon,auth.city.entrance.lat,rules).y)<rules.cityRadius));
            const city=auth.city,entries=[{...city.entrance,id:`city:${city.id}:entrance`,name:city.name,dungeonId:city.entrance.dungeonId},...city.nodes.map(node=>({...node,dungeonId:node.dungeon.id,cityNodeEntrance:true}))];
            for(const entry of entries){
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
        for(const mark of target.landmarks.filter(m=>m.cityFallback)){const at=earthNearest(target,mark.x,mark.y,{landOnly:true});if(at)Object.assign(mark,at);else mark.hidden=true;target.safeAreas.push({...mark,radius:80});}
        // Entrances are finalized after authored NPC placement. Keep residents beside
        // them using the same actor-only clearance as roaming AI; players can enter.
        const residentWorld=socialNavigationWorld(target);
        target.npcs=target.npcs.flatMap(npc=>{
            const at=earthNearest(residentWorld,npc.x,npc.y,{safe:true});
            return at?[{...npc,...at}]:[];
        });
        target.encounters=target.encounters.filter(e=>!target.landmarks.some(m=>m.cityFallback&&!m.hidden&&Math.hypot(m.x-e.x,m.y-e.y)<80+rules.monsterClearance));
        target.wildAuthored=target.encounters;target.wildSpawns=target.wildSpawns.filter(s=>!earthSafe(target,s.position,rules.wildSpawnClearance));
        target.layout.paths=target.paths;target.layout.buildings=target.buildings;target.layout.trees=target.trees;target.layout.landmarks=target.landmarks;
        target.earthSocialId=auth?.row.id||target.landmarks[0]?.id||`${gx}:${gy}`;target.art=auth?.art||null;target.city=auth?.city||null;target.earthRegion=auth?.row.id||null;target.revision++;return true;
    }
    async function loadAround(p,target,token,direction=null){
        await ready();generation??=await json(`data/adventure/earth/${index.generation}`);if(token!==epoch)return false;const geo=earthGeo(p,rules),delta=rules.chunkSize*rules.prefetchRadius/rules.unitsPerDegree;
        const keys=new Set(),cityKeys=new Map();
        for(const dx of [-delta,0,delta])for(const dy of [-delta,0,delta]){keys.add(terrainKey(geo.lon+dx,geo.lat+dy));cityKeys.set(cityKey(geo.lon+dx,geo.lat+dy),[geo.lon+dx,geo.lat+dy]);}
        const terrainDelta=Math.max(delta,(rules.chunkSize*(rules.activeRadius+1)+rules.wildFarDistance)/rules.unitsPerDegree);
        for(const dx of [-terrainDelta,0,terrainDelta])for(const dy of [-terrainDelta,0,terrainDelta])keys.add(terrainKey(geo.lon+dx,geo.lat+dy));
        if(direction){const ahead=earthGeo({x:p.x+direction.x*rules.chunkSize*rules.prefetchRadius,y:p.y+direction.y*rules.chunkSize*rules.prefetchRadius},rules);keys.add(terrainKey(ahead.lon,ahead.lat));cityKeys.set(cityKey(ahead.lon,ahead.lat),[ahead.lon,ahead.lat]);}
        target.cacheKeys=[...[...keys].map(key=>`terrain:${key}`),...surfaceArtKeys];
        const terrain=await Promise.allSettled([...keys].map(tile));
        if(token!==epoch)return false;
        if(!cache.peek(`terrain:${terrainKey(geo.lon,geo.lat)}`))throw Error('当前位置的地形未能读取，请重试');
        const rows=await Promise.allSettled([...cityKeys.values()].map(([lon,lat])=>cities(lon,lat)));
        if(token!==epoch)return false;
        const auth=await authored(geo);if(token!==epoch)return false;let artError=false,nextDraw=null;
        if(auth?.art.atlas){
            const url=new URLSearchParams(globalThis.location?.search||'').get('assets')==='local'?auth.art.local:auth.art.atlas;target.cacheKeys.push(url);
            try{await cache.get(url,async()=>{const image=await createImageBitmap(await request(url,'blob'));return {image,bytes:image.width*image.height*4,dispose(){image.close();}};});}catch{artError=true;}
            if(token!==epoch)return false;
            nextDraw=(ctx,b)=>{const image=cache.peek(url)?.image,frame=auth.art.frames?.[b.earthFrame];if(!image||!frame)return false;ctx.drawImage(image,...frame,b.x-b.w/2,b.y-b.h,b.w,b.h);return true;};
        }
        const staged={...target,layout:{...target.layout},authored:auth};
        if(!await build(staged,p,[...new Map(rows.flatMap(r=>r.status==='fulfilled'?r.value.rows:[]).map(c=>[c.id,c])).values()],auth,token)||token!==epoch)return false;
        const landmarkDraw=nextDraw;
        if(staged.buildings.some(b=>b.earthCityAtlas)){
            try{
                const manifest=await json('data/adventure/earth/city-art.json');
                const entries=await Promise.all([...new Set(staged.buildings.map(b=>b.earthCityAtlas).filter(Boolean))].map(async kind=>{
                    const localMode=new URLSearchParams(globalThis.location?.search||'').get('assets')==='local';
            if(kind==='cityGround'&&manifest[kind].tiles){
                const row=manifest[kind],key=`city-ground:${row.sourceSha256}`;
                const result=await cache.get(key,async()=>{
                    const canvas=document.createElement('canvas');canvas.width=row.width;canvas.height=row.height;const c=canvas.getContext('2d',{willReadFrequently:true});
                    for(const tile of row.tiles){const image=await createImageBitmap(await request(localMode?tile.local:tile.cdn,'blob'));try{if(image.width!==tile.width||image.height!==tile.height)throw Error('城市背景尺寸不匹配');c.drawImage(image,tile.x,tile.y);}finally{image.close();}}
                    const data=c.getImageData(0,0,row.width,row.height).data;canvas.width=canvas.height=0;return {data,width:row.width,height:row.height,bytes:data.byteLength};
                });
                return [kind,result,key];
            }
            const row=manifest[kind],url=new URLSearchParams(globalThis.location?.search||'').get('assets')==='local'?row.local:row.cdn;
                    target.cacheKeys.push(url);
                    await cache.get(url,async()=>{const image=await createImageBitmap(await request(url,'blob'));if(image.width!==row.width||image.height!==row.height){image.close();throw Error('City atlas dimensions mismatch');}return {image,bytes:image.width*image.height*4,dispose(){image.close();}};});
                    return [kind,{row,url}];
                }));
                if(token!==epoch)return false;
                const atlases=Object.fromEntries(entries);
                nextDraw=(ctx,b)=>{if(!b.earthCityAtlas)return landmarkDraw?.(ctx,b)||false;const art=atlases[b.earthCityAtlas],image=cache.peek(art.url)?.image,frame=art.row.frames[b.earthCityFrame];if(!image||!frame)return false;ctx.drawImage(image,...frame,b.x-b.w/2,b.y-b.h*.9375,b.w,b.h);return true;};
            }catch{artError=true;}
        }
        if(token!==epoch)return false;
        staged.wildAuthored=reuseEarthObjects(target.wildAuthored||[],staged.wildAuthored||[]);
        if(target===world)staged.encounters=target.encounters;
        for(const key of ['paths','buildings','npcs','landmarks','trees','encounters','mapCities','wildSpawns'])staged[key]=reuseEarthObjects(target[key]||[],staged[key]||[]);
        for(const key of ['paths','buildings','trees','landmarks'])staged.layout[key]=staged[key];
        const objectsChanged=['paths','buildings','npcs','landmarks','trees','encounters'].some(key=>target[key]!==staged[key])||target.earthSocialId!==staged.earthSocialId;
        for(const key of ['safeAreas','docks','railways','paths','buildings','npcs','landmarks','trees','encounters','center','portal','layout','earthSocialId','art','city','earthRegion','mapCities','revision','authored','wildSpawns','wildAuthored','wildSpecies'])target[key]=staged[key];target.drawEarthBuilding=nextDraw;if(objectsChanged)target.onObjectsChanged?.();
        if(target===world)updateVisible(p,target.wildView,0);
        target.error=[...terrain,...rows].some(r=>r.status==='rejected')?'部分地图数据未加载，靠近时将重试。':artError?'部分城市美术未加载，正在等待重试。':'';
        return true;
    }
    async function prepare(geo,{restore=false}={}){
        if(!Number.isFinite(geo.lon)||!Number.isFinite(geo.lat)||Math.abs(geo.lat)>90)throw Error('请输入有效经纬度');
        cancelPending();const token=epoch;await ready();const p=earthPoint(geo.lon,geo.lat,rules),target=makeWorld(p);
        const boatArt=await json('data/adventure/earth/boat-art.json');if(token!==epoch)throw Error('已取消地图加载');
        target.boatArt=boatArt;registerImage?.('earth-boat',boatArt);
        if(!await loadAround(p,target,token))throw Error('已取消地图加载');
        const arrival=earthNearest(target,p.x,p.y,{safe:true,landOnly:!restore});if(!arrival)throw Error('附近没有已加载的安全陆地，请选择陆地或城市');
        target.center={...arrival};target.layout.spawn={...arrival};world=target;updateVisible(arrival,null,0);cache.pinned=new Set(target.cacheKeys);setRegion(target.authored);lastStreamKey=`${Math.floor(p.x/rules.chunkSize)}:${Math.floor(p.y/rules.chunkSize)}:${getPlayerLevel()}:${getPlayerPower?.()??0}`;lastStreamPosition={...arrival};return {world:target,position:arrival};
    }
    function updateVisible(p,view,dt=0){
        if(!world)return;
        world.wildView=view||world.wildView||{x:p.x-500,y:p.y-400,w:1000,h:800};
        streamEarthWild(world,content,p,world.wildView,dt);
    }
    function update(p,now){
        if(!world||streamTask||now<nextRetry)return;
        nextRetry=now+rules.streamIntervalMs;
        const key=`${Math.floor(p.x/rules.chunkSize)}:${Math.floor(p.y/rules.chunkSize)}:${getPlayerLevel()}:${getPlayerPower?.()??0}`;
        if(key===lastStreamKey&&!world.error)return;const token=epoch,target=world;nextRetry=now+rules.streamIntervalMs;
        const dx=lastStreamPosition?((p.x-lastStreamPosition.x+world.w*1.5)%world.w)-world.w/2:0,dy=lastStreamPosition?p.y-lastStreamPosition.y:0,length=Math.hypot(dx,dy),direction=length?{x:dx/length,y:dy/length}:null;lastStreamPosition={...p};
        streamTask=loadAround({...p},target,token,direction).then(ok=>{if(ok){cache.pinned=new Set(target.cacheKeys);setRegion(target.authored);lastStreamKey=key;if(target.error)nextRetry=now+5000;}}).catch(e=>{if(token===epoch){target.error=e.message;nextRetry=now+5000;}}).finally(()=>{streamTask=null;});
        return streamTask;
    }
    function paint(ctx,target,rect){
        surface??=createEarthSurfacePainter({rules,sample:typeAt,loadArt:loadSurfaceArt});
        if(!surface.covers(target,rect)){
        ctx.fillStyle='#6f7775';ctx.fillRect(rect.x,rect.y,rect.w,rect.h);
        const a=earthGeo({x:rect.x,y:rect.y},rules),b=earthGeo({x:rect.x+rect.w,y:rect.y+rect.h},rules);
        const west=Math.floor((rect.x/rules.unitsPerDegree-180)/2)*2,east=Math.floor(((rect.x+rect.w)/rules.unitsPerDegree-180)/2)*2;
        for(let lon=west;lon<=east;lon+=2)for(let lat=Math.floor(b.lat/2)*2;lat<=Math.floor(a.lat/2)*2;lat+=2){
            const data=cache.peek(`terrain:${terrainKey(lon,lat)}`),x=(lon+180)*rules.unitsPerDegree,y=(90-lat-2)*rules.unitsPerDegree;
            if(data?.image)ctx.drawImage(data.image,x,y,2*rules.unitsPerDegree,2*rules.unitsPerDegree);
        }
        ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
        // Trace connected segments together: bends and crossings have no round-cap seams.
        const traceRoads=()=>{ctx.beginPath();let previous=null;for(const road of target.paths){
            const pad=rules.cityConnectionWidth+rules.cityConnectionBlendWidth*2;
            if(Math.max(road.a.x,road.b.x)<rect.x-pad||Math.min(road.a.x,road.b.x)>rect.x+rect.w+pad||Math.max(road.a.y,road.b.y)<rect.y-pad||Math.min(road.a.y,road.b.y)>rect.y+rect.h+pad){previous=null;continue;}
            if(!previous||Math.hypot(road.a.x-previous.x,road.a.y-previous.y)>.01)ctx.moveTo(road.a.x,road.a.y);
            ctx.lineTo(road.b.x,road.b.y);previous=road.b;
        }};
        for(const [color,extra] of [
            ['#d9d5bf22',2*(rules.cityConnectionShoulderWidth+rules.cityConnectionBlendWidth)],
            ['#d9d5bf44',2*rules.cityConnectionShoulderWidth+rules.cityConnectionBlendWidth],
            ['#dbd6be',2*rules.cityConnectionShoulderWidth],
            ['#c5c5b5',2],['#cacbc0',0]
        ]){ctx.strokeStyle=color;ctx.lineWidth=rules.cityConnectionWidth+extra;traceRoads();ctx.stroke();}
        ctx.strokeStyle='#f8f3db88';ctx.lineWidth=2;ctx.setLineDash([12,24]);traceRoads();ctx.stroke();ctx.restore();
        }
        surface.draw(ctx,target,rect);
        paintBridges(ctx,target.layout.bridges,{edge:'#695334'},rect.w>rules.chunkSize*2);
    }
    function setRegion(next){
        const previous=region?.city?.art.npcs,nextArt=next?.city?.art.npcs;
        if(previous?.id!==nextArt?.id){if(previous)releaseImage?.(previous.id);if(nextArt)registerImage?.(nextArt.id,nextArt);}
        region=next;chapter=next?.city.quests||null;
    }
    async function story(){
        if(!region)throw Error('这里没有城市章节');
        const current=region,token=epoch,currentWorld=world;
        const {quests,dialogue,learning}=current.city;
        await Promise.resolve();
        // Cached JSON can resolve after cancellation too; fetch abort alone is not a lifecycle guard.
        if(token!==epoch||currentWorld!==world||current.row.id!==region?.row.id)throw Error('已取消城市章节加载');
        validateStory(current,quests,dialogue,learning);chapter=quests;return {city:current.city,quests,dialogue,learning};
    }
    async function catalog(){return cache.get('catalog',async()=>{const text=await request(geography.catalog,'text');return {rows:parseEarthCatalog(text),bytes:text.length*4};});}
    async function atlas(){await ready();await catalog();const art=geography.overview,mode=assetMode(globalThis.location?.hostname,globalThis.location?.search),url=art.cdn?assetUrl(art,mode):art.url;const overview=await cache.get('overview',async()=>decodeOverview(await request(url,'blob')));return {index,geography,overview,rules};}
    async function viewport({center,span,height,atlasOnly=false}){
        await ready();if(span>10||atlasOnly){const source=await catalog();return {tiles:[],cities:source.rows.filter(c=>Math.abs(c.lat-center.lat)<=height/2&&Math.abs(((c.lon-center.lon+540)%360)-180)<=span/2).sort((a,b)=>a.level-b.level||b.population-a.population).filter((c,i)=>atlasOnly||i<60)};}
        const jobs=[],west=Math.floor((center.lon-span/2)/2)*2,east=Math.floor((center.lon+span/2)/2)*2;
        if(span<=4)for(let lon=west;lon<=east;lon+=2)for(let lat=Math.max(-90,Math.floor((center.lat-height/2)/2)*2);lat<=Math.min(88,Math.floor((center.lat+height/2)/2)*2);lat+=2){const key=terrainKey(lon,lat);jobs.push(tile(key).then(t=>({...t,west:lon,north:lat+2})));}
        const cityJobs=new Map();for(const dx of [-span/2,0,span/2])for(const dy of [-height/2,0,height/2]){const lon=center.lon+dx,lat=Math.max(-90,Math.min(90,center.lat+dy));cityJobs.set(cityKey(lon,lat),[lon,lat]);}
        const tileResults=await Promise.allSettled(jobs),cityResults=await Promise.allSettled([...cityJobs.values()].map(([lon,lat])=>cities(lon,lat)));
        return {tiles:tileResults.flatMap(r=>r.status==='fulfilled'?[r.value]:[]),cities:cityResults.flatMap(r=>r.status==='fulfilled'?r.value.rows:[]).filter(c=>Math.abs(c.lat-center.lat)<=height/2&&Math.abs(((c.lon-center.lon+540)%360)-180)<=span/2).slice(0,120),error:[...tileResults,...cityResults].some(r=>r.status==='rejected')?'部分数据暂不可用，可点击重试。':''};
    }
    function cancelPending(){epoch++;cache.cancelPending();controllers.forEach(c=>c.abort());controllers.clear();}
    async function localViewport(bounds){
        const centerPoint={x:bounds.x+bounds.w/2,y:bounds.y+bounds.h/2},center=earthGeo(centerPoint,rules);
        const data=await viewport({center,span:bounds.w/rules.unitsPerDegree,height:bounds.h/rules.unitsPerDegree});
        const cityRows=[...new Map(data.cities.map(city=>[city.id,city])).values()];
        const tiles=new Map(data.tiles.map(tile=>[tile.key,tile]));
        const sample=(x,y)=>{const geo=earthGeo({x,y},rules),tile=tiles.get(terrainKey(geo.lon,geo.lat));return tile?sampleTerrain(tile,geo):typeAt(x,y);};
        const worldWidth=360*rules.unitsPerDegree;
        return {cities:cityRows.map(city=>{const point=earthPoint(city.lon,city.lat,rules);return {...city,x:centerPoint.x+((point.x-centerPoint.x+worldWidth*1.5)%worldWidth)-worldWidth/2,y:point.y};}),
            paths:generateEarthCityConnections(cityRows,centerPoint,Math.hypot(bounds.w,bounds.h)/2,rules,sample),terrainAt:sample,error:data.error};
    }
    function cancel(){releaseImage?.('earth-boat');surface?.dispose();surface=null;surfaceArtKeys.clear();epoch++;controllers.forEach(c=>c.abort());controllers.clear();cache.clear();if(region?.city)releaseImage?.(region.city.art.npcs.id);world=null;region=null;chapter=null;index=null;geography=null;generation=null;lastStreamKey='';streamTask=null;}
    return {ready,tile,cities,prepare,update,updateVisible,story,atlas,viewport,localViewport,cancel,cancelPending,cache,get world(){return world;},get chapter(){return chapter;},get rules(){return rules;}};
}

export function sampleTerrain(data,geo){const b=terrainBounds(data.key),x=Math.max(0,Math.min(data.width-1,Math.floor((geo.lon-b.west)/2*data.width))),y=Math.max(0,Math.min(data.height-1,Math.floor((b.north-geo.lat)/2*data.height)));return data.types[data.indices[y*data.width+x]];}
// The political atlas is display art: preserve its country colors, never classify/recolor it as terrain.
export async function decodeMapOverview(blob){
    const image=await createImageBitmap(blob);
    return {key:'overview',image,width:image.width,height:image.height,bytes:image.width*image.height*4,dispose(){image.close();}};
}
export async function decodeTerrain(blob,palette,key){
    const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(bitmap,0,0);bitmap.close();
    const pixels=c.getImageData(0,0,canvas.width,canvas.height),indices=new Uint8Array(canvas.width*canvas.height),colors=palette.map(row=>({raw:[0,2,4].map(i=>parseInt(row.rgb.slice(i,i+2),16)),out:[1,3,5].map(i=>parseInt(row.color.slice(i,i+2),16))}));
    for(let i=0;i<indices.length;i++){
        if(i&&i%32768===0)await new Promise(resolve=>setTimeout(resolve,0));
        const offset=i*4;if(!pixels.data[offset+3]){indices[i]=255;pixels.data.set([111,119,117,255],offset);continue;}
        let best=0,min=Infinity;const r=pixels.data[offset],g=pixels.data[offset+1],b=pixels.data[offset+2];
        for(let n=0;n<colors.length;n++){const raw=colors[n].raw,d=(raw[0]-r)**2+(raw[1]-g)**2+(raw[2]-b)**2;if(d<min){best=n;min=d;}}
        indices[i]=best;pixels.data[offset]=colors[best].out[0];pixels.data[offset+1]=colors[best].out[1];pixels.data[offset+2]=colors[best].out[2];pixels.data[offset+3]=255;
    }
    c.putImageData(pixels,0,0);return {key,image:canvas,indices,types:palette.map(p=>p.type),width:canvas.width,height:canvas.height,bytes:canvas.width*canvas.height*5,dispose(){canvas.width=canvas.height=0;}};
}
export function validateRegion(files,content){
    const ids=new Set();for(const key of ['buildings','npcs','encounters'])for(const row of files[key]?.[key]||[]){if(ids.has(row.id)||!Number.isFinite(row.lon)||!Number.isFinite(row.lat))throw Error('城市内容编号或坐标无效');ids.add(row.id);}
    for(const b of files.buildings.buildings)if(!(b.w>0&&b.h>0)||!files.art.frames?.[b.frame])throw Error('城市建筑美术引用无效');
    if(content)for(const e of files.encounters.encounters)if(!content.monsters[e.monsterId])throw Error('城市怪物引用无效');
    for(const n of files.npcs.npcs)if(!n.dialogue)throw Error('居民缺少对话引用');
}
export function validateStory(region,quests,dialogue,learning){
    const ids=new Set();for(const step of quests.steps||[]){if(!step.id||ids.has(step.id)||!step.event)throw Error('城市章节编号无效');ids.add(step.id);}
    for(const n of region.npcs.npcs)if(!dialogue.stories?.[n.dialogue])throw Error('居民对话引用无效');
    for(const story of Object.values(dialogue.stories||{}))if(story.event&&!quests.steps.some(s=>s.event===story.event))throw Error('对话的章节引用无效');
    if(!learning.prompts?.length||learning.prompts.some(row=>!row.zh||!row.en))throw Error('城市学习内容无效');
}
