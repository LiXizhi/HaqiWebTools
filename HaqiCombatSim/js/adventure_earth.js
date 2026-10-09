import {streamEarthWild} from './adventure_earth_wild_stream_core.js';
import {generateEarthCityConnections} from './adventure_earth_transport_core.js';
import {paintBridges} from './adventure_bridge.js';
// Browser IO boundary. Constructing this service performs no requests.
import {earthRules,earthMapInfo,earthPoint,earthGeo,terrainKey,terrainBounds,terrainUrl,cityKey,parseEarthCatalog,inGeoBounds,earthNearest} from './adventure_earth_core.js';
import {seamlessEarthAtlas} from './adventure_earth_surface_core.js';
import {createEarthSurfacePainter} from './adventure_earth_surface.js';
import {assetMode,assetUrl} from './adventure_media_core.js';
import {validateEarthCity} from './adventure_earth_city_config_core.js';
import {earthWildSpecies} from './adventure_earth_wild_core.js';
import {buildEarthScene,createEarthSceneCache} from './adventure_earth_scene_core.js';
import {classifyEarthTerrain} from './adventure_earth_decode_core.js';
import {reuseEarthObjectsSteps,prepareEarthCollisionIndex,adoptEarthCollisionIndex,parseEarthCitiesSteps} from './adventure_earth_core.js';
import {prepareWorldObjectIndex,adoptWorldObjectIndex} from './adventure_world_core.js';
import {createEarthWorkScheduler} from './earth_work_scheduler.js';
import {createEarthStreamWorker} from './adventure_earth_stream.js';
import {performanceDiagnostics as perf} from './performance_diagnostics.js';

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
    pump(){while(this.active<this.concurrency&&this.queue.length){const job=this.queue.shift();this.active++;let inserted=null;
        Promise.resolve().then(job.load).then(value=>{
            if(job.epoch!==this.epoch){value?.dispose?.();throw Error('已取消地图加载');}
            const bytes=value.bytes||0;if(bytes>this.budget){value.dispose?.();throw Error('地图文件超出内存预算');}
            inserted={value,bytes};this.entries.set(job.key,inserted);this.bytes+=bytes;
            const group=Object.keys(this.groups).find(prefix=>job.key.startsWith(prefix));
            while(this.entries.size>this.limit||this.bytes>this.budget||(group&&[...this.entries.keys()].filter(k=>k.startsWith(group)).length>this.groups[group])){const keys=[...this.entries.keys()],overflow=group&&keys.filter(k=>k.startsWith(group)).length>this.groups[group];const key=keys.find(k=>!this.pinned.has(k)&&(overflow?k.startsWith(group):k!=='overview'))||keys.find(k=>!this.pinned.has(k));if(!key)throw Error('当前场景已占满地图缓存预算');const row=this.entries.get(key);this.entries.delete(key);this.bytes-=row.bytes;row.value.dispose?.();}
            if(!this.entries.has(job.key))throw Error('目的地超出当前可用地图缓存预算');job.resolve(value);
        }).catch(error=>{if(inserted&&this.entries.get(job.key)===inserted){this.entries.delete(job.key);this.bytes-=inserted.bytes;inserted.value.dispose?.();}job.reject(error);}).finally(()=>{this.active--;if(job.epoch===this.epoch)this.pending.delete(job.key);this.pump();});
    }}
    cancelPending(){this.epoch++;for(const job of this.queue)job.reject(Error('已取消地图加载'));this.queue=[];this.pending.clear();}
    clear(){this.cancelPending();this.pinned.clear();for(const row of this.entries.values())row.value.dispose?.();this.entries.clear();this.bytes=0;}
}

export function createEarthService({content,getPlayerLevel=()=>1,getPlayerPower=null,fetcher=globalThis.fetch,decode=decodeTerrain,decodeOverview=decodeMapOverview,registerImage,releaseImage,prepareAssets,workerFactory,scheduler=null}={}){
    let surface=null;const registeredCityArt=new Set();
    function registerCityArt(art){if(art&&!registeredCityArt.has(art.id)){registerImage?.(art.id,art);registeredCityArt.add(art.id);}}
    function releaseCityArt(id){if(registeredCityArt.delete(id))releaseImage?.(id);}
    const rules=earthRules(content),cache=new EarthCache({limit:rules.maxTiles+rules.maxCityTiles+24,bytes:rules.maxDecodedBytes,concurrency:rules.maxConcurrent,maxQueue:rules.maxQueuedRequests,groups:{'terrain:':rules.maxTiles,'cities:':rules.maxCityTiles}});
    let work=scheduler||createEarthWorkScheduler({budgetMs:rules.streamBuildBudgetMs}),background=createEarthStreamWorker({workerFactory,scheduler:work,timeoutMs:rules.requestTimeoutMs});
    const sceneCache=createEarthSceneCache(rules.streamCacheChunks);let terrainVersion=0,pendingPins=new Set(),prefetchedFromKey='';
    function syncPins(){cache.pinned=new Set([...(world?.cacheKeys||[]),...pendingPins,...surfaceArtKeys]);}
    let index,geography,generation,world,region,chapter,epoch=0,controllers=new Set(),lastStreamKey='',lastStreamPosition=null,streamTask=null,streamDirection=null,nextRetry=0;
    async function request(url,kind='json'){
        const controller=new AbortController();controllers.add(controller);const timer=setTimeout(()=>controller.abort(),rules.requestTimeoutMs);
        try{const response=await fetcher(url,{signal:controller.signal});if(!response.ok)throw Error(`地图数据暂不可用（${response.status}）`);const result=await response[kind]();perf.event('earth-request',{kind});return result;}
        finally{clearTimeout(timer);controllers.delete(controller);}
    }
    const json=url=>cache.get(url,()=>request(url));
    async function ready(){
        const token=epoch,nextIndex=index||await json('data/adventure/earth/index.json');if(token!==epoch)throw Error('已取消地图加载');index=nextIndex;
        const nextGeography=geography||await json(`data/adventure/earth/${index.geography}`);if(token!==epoch)throw Error('已取消地图加载');geography=nextGeography;
        return {index,geography,generation};
    }
    async function tile(key){await ready();return cache.get(`terrain:${key}`,async()=>{
        const token=epoch,blob=await request(terrainUrl(geography.terrainBase,key),'blob');let data;
        if(decode===decodeTerrain&&typeof OffscreenCanvas!=='undefined')try{data=await background.run('terrain',{blob,palette:geography.palette,key},{epoch:token});}catch(error){if(token!==epoch)throw error;}
        if(!data)data=await decode(blob,geography.palette,key,{scheduler:work,valid:()=>token===epoch});
        if(token!==epoch){data.dispose?.();data.image?.close?.();throw Error('已取消地图加载');}
        if(!data.dispose)data.dispose=()=>data.image?.close?.();data.version=++terrainVersion;
        perf.event('earth-terrain-ready',{key});const b=terrainBounds(key);surface?.invalidate({x:(b.west+180)*rules.unitsPerDegree,y:(90-b.north)*rules.unitsPerDegree,w:2*rules.unitsPerDegree,h:2*rules.unitsPerDegree});return data;
    });}
    async function cities(lon,lat){await ready();const key=cityKey(lon,lat);return cache.get(`cities:${key}`,async()=>{
        const token=epoch;
        const text=await request(`${geography.cityBase}${geography.cityLanguage}/world_cities_${key}.${geography.cityLanguage}.csv?ver=${geography.cityVersion}`,'text');
        if(token!==epoch)throw Object.assign(Error('已取消城市数据加载'),{name:'AbortError'});
        let rows;try{rows=await background.run('cities',{text},{epoch:token});}catch(error){if(token!==epoch)throw error;}
        return {rows:rows||await work.run(parseEarthCitiesSteps(text),{valid:()=>token===epoch,name:'earth-cities'}),bytes:text.length*4};
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
        if(world){world.cacheKeys.push(...surfaceArtKeys);syncPins();}
        return Object.fromEntries(entries.map(([kind,value])=>[kind,value]));
    }
    const surfaceArtKeys=new Set();
    async function prepareImageBounds(image,rect){
        if(typeof createImageBitmap==='undefined'||typeof OffscreenCanvas==='undefined')return null;
        const token=epoch,bitmap=await createImageBitmap(image);
        try{
            if(token!==epoch)throw Object.assign(Error('已取消图集预热'),{name:'AbortError'});
            const result=await background.run('bounds',{image:bitmap,rect},{epoch:token,transfer:[bitmap]});
            if(token!==epoch)throw Object.assign(Error('已取消图集预热'),{name:'AbortError'});return result;
        }catch(error){if(token!==epoch)throw error;return null;}
        finally{bitmap.close();}
    }
    function makeWorld(p){
        const info=earthMapInfo(content),params=content.balanceParams;
        return {zone:'earth',isEarth:true,earthBoating:true,w:info.w,h:info.h,earthRules:rules,terrainAt:typeAt,interactionParams:params?.adventure,monsterSceneParams:params?.monsterScene,
            center:{...p},npcs:[],encounters:[],paths:[],buildings:[],trees:[],landmarks:[],decorations:[],portal:{id:'portal',hidden:true,x:p.x,y:p.y},
            layout:{name:'现实世界',earth:true,w:info.w,h:info.h,spawn:{...p},regions:[],bridges:[],rivers:[],lakes:[],rules:{terrain:{ocean:'#438b9b'}},coast:[]},
            terrainPainter:paint,earthScheduler:work,prepareImageBounds,drawEarthDecoration:(ctx,o)=>surface?.decoration(ctx,o),earthDecorationBaked:o=>surface?.isBaked(o),get surfaceStats(){return surface?.stats;},error:'',revision:0};
    }
    async function build(target,p,cityRows,auth,token){
        const terrain=[...cache.entries.values()].map(row=>row.value).filter(t=>t.indices).map(({key,width,height,indices,types,version})=>({key,width,height,indices,types,version}));
        const input={target:{isEarth:true,earthBoating:target.earthBoating,w:target.w,h:target.h,earthRules:rules,portal:target.portal,revision:target.revision,layout:{...target.layout,paths:undefined,buildings:undefined,trees:undefined,landmarks:undefined}},p,cityRows,auth,rules,content:{balanceParams:content?.balanceParams},species:earthWildSpecies(content),playerLevel:getPlayerLevel(),playerPower:getPlayerPower?.(),terrain,terrainVersion:terrain.map(t=>`${t.key}:${t.version}`).sort().join('|')};
        let result;perf.event('earth-scene-start',{x:Math.floor(p.x/rules.chunkSize),y:Math.floor(p.y/rules.chunkSize)});
        try{result=await background.run('scene',input,{epoch:token,version:input.terrainVersion});}catch(error){if(token!==epoch)throw error;}
        if(!result)result=await work.run(buildEarthScene({...input,target:input.target,typeAt,cache:sceneCache}),{valid:()=>token===epoch,name:'earth-scene'});
        if(token!==epoch)return false;Object.assign(target,result);target.terrainAt=typeAt;
        for(const key of ['paths','buildings','trees','landmarks'])target.layout[key]=target[key];
        perf.event('earth-scene-ready',result.streamCacheStats);return true;
    }
    async function loadAround(p,target,token,direction=null){
        await ready();generation??=await json(`data/adventure/earth/${index.generation}`);if(token!==epoch)return false;const geo=earthGeo(p,rules),delta=rules.chunkSize*rules.prefetchRadius/rules.unitsPerDegree;
        const keys=new Set(),cityKeys=new Map();
        for(const dx of [-delta,0,delta])for(const dy of [-delta,0,delta]){keys.add(terrainKey(geo.lon+dx,geo.lat+dy));cityKeys.set(cityKey(geo.lon+dx,geo.lat+dy),[geo.lon+dx,geo.lat+dy]);}
        const terrainDelta=Math.max(delta,(rules.chunkSize*(rules.activeRadius+1)+rules.wildFarDistance)/rules.unitsPerDegree);
        for(const dx of [-terrainDelta,0,terrainDelta])for(const dy of [-terrainDelta,0,terrainDelta])keys.add(terrainKey(geo.lon+dx,geo.lat+dy));
        if(direction){const ahead=earthGeo({x:p.x+direction.x*rules.chunkSize*rules.prefetchRadius,y:p.y+direction.y*rules.chunkSize*rules.prefetchRadius},rules);keys.add(terrainKey(ahead.lon,ahead.lat));cityKeys.set(cityKey(ahead.lon,ahead.lat),[ahead.lon,ahead.lat]);}
        const nextCacheKeys=[...[...keys].map(key=>`terrain:${key}`),...[...cityKeys.keys()].map(key=>`cities:${key}`),...surfaceArtKeys];pendingPins=new Set(nextCacheKeys);syncPins();
        const terrain=await Promise.allSettled([...keys].map(tile));
        if(token!==epoch)return false;
        if(!cache.peek(`terrain:${terrainKey(geo.lon,geo.lat)}`))throw Error('当前位置的地形未能读取，请重试');
        const rows=await Promise.allSettled([...cityKeys.values()].map(([lon,lat])=>cities(lon,lat)));
        if(token!==epoch)return false;
        const auth=await authored(geo);if(token!==epoch)return false;let artError=false,nextDraw=null;
        if(auth?.art.atlas){
            const url=new URLSearchParams(globalThis.location?.search||'').get('assets')==='local'?auth.art.local:auth.art.atlas;nextCacheKeys.push(url);pendingPins.add(url);syncPins();
            try{await cache.get(url,async()=>{const image=await createImageBitmap(await request(url,'blob'));return {image,bytes:image.width*image.height*4,dispose(){image.close();}};});}catch{artError=true;}
            if(token!==epoch)return false;
            nextDraw=(ctx,b)=>{const image=cache.peek(url)?.image,frame=auth.art.frames?.[b.earthFrame];if(!image||!frame)return false;ctx.drawImage(image,...frame,b.x-b.w/2,b.y-b.h,b.w,b.h);return true;};
        }
        const staged={...target,layout:{...target.layout},authored:auth};
        if(!await build(staged,p,[...new Map(rows.flatMap(r=>r.status==='fulfilled'?r.value.rows:[]).map(c=>[c.id,c])).values()],auth,token)||token!==epoch)return false;
        // Prepare new portraits/crops before making their static objects visible.
        registerCityArt(auth?.city.art.npcs);
        await prepareAssets?.(staged);if(token!==epoch)return false;
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
                    nextCacheKeys.push(url);pendingPins.add(url);syncPins();
                    await cache.get(url,async()=>{const image=await createImageBitmap(await request(url,'blob'));if(image.width!==row.width||image.height!==row.height){image.close();throw Error('City atlas dimensions mismatch');}return {image,bytes:image.width*image.height*4,dispose(){image.close();}};});
                    return [kind,{row,url}];
                }));
                if(token!==epoch)return false;
                const atlases=Object.fromEntries(entries);
                nextDraw=(ctx,b)=>{if(!b.earthCityAtlas)return landmarkDraw?.(ctx,b)||false;const art=atlases[b.earthCityAtlas],image=cache.peek(art.url)?.image,frame=art.row.frames[b.earthCityFrame];if(!image||!frame)return false;ctx.drawImage(image,...frame,b.x-b.w/2,b.y-b.h*.9375,b.w,b.h);return true;};
            }catch{artError=true;}
        }
        if(token!==epoch)return false;
        let preparedSurface=null;
        await work.run((function*(){
            staged.wildAuthored=yield* reuseEarthObjectsSteps(target.wildAuthored||[],staged.wildAuthored||[]);
            staged.safeAreas=yield* reuseEarthObjectsSteps(target.safeAreas||[],staged.safeAreas||[]);
            if(target===world)staged.encounters=target.encounters;
            for(const key of ['paths','buildings','npcs','landmarks','trees','encounters','mapCities','wildSpawns'])staged[key]=yield* reuseEarthObjectsSteps(target[key]||[],staged[key]||[]);
            for(const key of ['paths','buildings','trees','landmarks'])staged.layout[key]=staged[key];
            yield* prepareEarthCollisionIndex(staged);yield* prepareWorldObjectIndex(staged,target);
            if(surface)preparedSurface=yield* surface.prepare(staged);
        })(),{valid:()=>token===epoch,name:'earth-indexes'});
        if(target===world&&typeof requestAnimationFrame==='function')await new Promise(resolve=>requestAnimationFrame(resolve));
        if(token!==epoch)return false;
        // Wild actors may enter/retire while indexes are being prepared. Never restore an older live list.
        if(target===world){staged.encounters=target.encounters;staged.revision=Math.max(staged.revision,target.revision)+1;}
        const commitStart=performance.now();perf.event('earth-commit-start');
        const objectsChanged=['paths','buildings','npcs','landmarks','trees','encounters'].some(key=>target[key]!==staged[key])||target.earthSocialId!==staged.earthSocialId;
        const socialChanged=target.earthSocialId!==staged.earthSocialId||target.npcs!==staged.npcs||target.landmarks!==staged.landmarks;
        for(const key of ['safeAreas','docks','railways','paths','buildings','npcs','landmarks','trees','encounters','center','portal','layout','earthSocialId','art','city','earthRegion','mapCities','revision','authored','wildSpawns','wildAuthored','wildSpecies','streamCacheStats'])target[key]=staged[key];target.drawEarthBuilding=nextDraw;
        target.cacheKeys=[...new Set([...nextCacheKeys,...surfaceArtKeys])];adoptEarthCollisionIndex(target,staged);adoptWorldObjectIndex(target,staged);
        if(preparedSurface)surface?.adopt(target,preparedSurface);
        if(objectsChanged)target.onObjectsChanged?.({prepared:true,staticChanged:true,collisionChanged:true,socialChanged});
        perf.record('earth-commit',performance.now()-commitStart);perf.event('earth-commit-end');
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
        target.center={...arrival};target.layout.spawn={...arrival};world=target;updateVisible(arrival,null,0);pendingPins.clear();syncPins();setRegion(target.authored);lastStreamKey=`${Math.floor(p.x/rules.chunkSize)}:${Math.floor(p.y/rules.chunkSize)}:${getPlayerLevel()}:${getPlayerPower?.()??0}`;prefetchedFromKey='';lastStreamPosition={...arrival};return {world:target,position:arrival};
    }
    function updateVisible(p,view,dt=0){
        if(!world)return;
        world.wildView=view||world.wildView||{x:p.x-500,y:p.y-400,w:1000,h:800};
        streamEarthWild(world,content,p,world.wildView,dt);
    }
    function update(p,now){
        if(!world||now<nextRetry)return;
        if(streamTask){
            const dx=lastStreamPosition?((p.x-lastStreamPosition.x+world.w*1.5)%world.w)-world.w/2:0,dy=lastStreamPosition?p.y-lastStreamPosition.y:0;
            if(streamDirection&&dx*streamDirection.x+dy*streamDirection.y< -rules.streamTurnCancelDistance){perf.event('earth-direction-cancel');cancelPending();}
            else{lastStreamPosition={...p};nextRetry=now+rules.streamIntervalMs;return;}
        }
        nextRetry=now+rules.streamIntervalMs;
        const growth=`${getPlayerLevel()}:${getPlayerPower?.()??0}`,keyFor=at=>`${Math.floor(at.x/rules.chunkSize)}:${Math.floor(at.y/rules.chunkSize)}:${growth}`,currentKey=keyFor(p);
        const token=epoch,target=world,growthChanged=lastStreamKey.split(':').slice(2).join(':')!==growth;nextRetry=now+rules.streamIntervalMs;
        const dx=lastStreamPosition?((p.x-lastStreamPosition.x+world.w*1.5)%world.w)-world.w/2:0,dy=lastStreamPosition?p.y-lastStreamPosition.y:0,length=Math.hypot(dx,dy),direction=length?{x:dx/length,y:dy/length}:null;lastStreamPosition={...p};
        const ahead={...p};if(direction)for(const axis of ['x','y']){
            const d=direction[axis],cell=Math.floor(p[axis]/rules.chunkSize),edge=(cell+(d>0?1:0))*rules.chunkSize;
            if(Math.abs(d)>.25&&Math.abs(edge-p[axis])<rules.streamPrefetchDistance)ahead[axis]=edge+Math.sign(d);
        }
        const key=keyFor(ahead);
        if(!world.error&&(key===lastStreamKey||currentKey===prefetchedFromKey&&key===currentKey))return;
        perf.event('earth-stream',{key,prefetch:key!==currentKey});
        streamDirection=direction;
        const task=loadAround(ahead,target,token,direction).then(ok=>{if(ok&&token===epoch){pendingPins.clear();syncPins();setRegion(target.authored);lastStreamKey=key;prefetchedFromKey=key!==currentKey?currentKey:'';if(growthChanged)updateVisible(p,target.wildView);if(target.error)nextRetry=now+5000;}}).catch(e=>{if(token===epoch){pendingPins.clear();syncPins();target.error=e.message;nextRetry=now+5000;}}).finally(()=>{if(streamTask===task)streamTask=null;});streamTask=task;
        return streamTask;
    }
    function paint(ctx,target,rect){
        surface??=createEarthSurfacePainter({rules,sample:typeAt,loadArt:loadSurfaceArt,scheduler:work});
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
        paintBridges(ctx,target.layout.bridges,{edge:'#695334'},rect.w>rules.chunkSize*2,rect);
    }
    function setRegion(next){
        const previous=region?.city?.art.npcs,nextArt=next?.city?.art.npcs;
        if(previous?.id!==nextArt?.id){if(previous)releaseCityArt(previous.id);registerCityArt(nextArt);}
        for(const id of registeredCityArt)if(id!==nextArt?.id)releaseCityArt(id);
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
    function cancelPending(){epoch++;background.cancel();for(const id of registeredCityArt)if(id!==region?.city?.art.npcs?.id)releaseCityArt(id);cache.cancelPending();controllers.forEach(c=>c.abort());controllers.clear();pendingPins.clear();syncPins();streamTask=null;}
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
    function cancel(){releaseImage?.('earth-boat');surface?.dispose();surface=null;surfaceArtKeys.clear();epoch++;background.cancel();if(!scheduler){work.dispose();work=createEarthWorkScheduler({budgetMs:rules.streamBuildBudgetMs});background=createEarthStreamWorker({workerFactory,scheduler:work,timeoutMs:rules.requestTimeoutMs});}sceneCache.clear();pendingPins.clear();controllers.forEach(c=>c.abort());controllers.clear();cache.clear();for(const id of registeredCityArt)releaseCityArt(id);world=null;region=null;chapter=null;index=null;geography=null;generation=null;lastStreamKey='';streamTask=null;}
    return {ready,tile,cities,prepare,update,updateVisible,story,atlas,viewport,localViewport,cancel,cancelPending,cache,get streamStats(){return {...background.stats,scheduler:work.stats,scene:world?.streamCacheStats};},get world(){return world;},get chapter(){return chapter;},get rules(){return rules;}};
}

export function sampleTerrain(data,geo){const b=terrainBounds(data.key),x=Math.max(0,Math.min(data.width-1,Math.floor((geo.lon-b.west)/2*data.width))),y=Math.max(0,Math.min(data.height-1,Math.floor((b.north-geo.lat)/2*data.height)));return data.types[data.indices[y*data.width+x]];}
// The political atlas is display art: preserve its country colors, never classify/recolor it as terrain.
export async function decodeMapOverview(blob){
    const image=await createImageBitmap(blob);
    return {key:'overview',image,width:image.width,height:image.height,bytes:image.width*image.height*4,dispose(){image.close();}};
}
export async function decodeTerrain(blob,palette,key,{scheduler=null,valid=()=>true}={}){
    const started=performance.now();
    const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(bitmap,0,0);bitmap.close();
    const pixels=c.getImageData(0,0,canvas.width,canvas.height),work=scheduler||createEarthWorkScheduler();let indices;
    try{indices=await work.run(classifyEarthTerrain(pixels.data,palette),{valid,name:'earth-decode'});}catch(error){canvas.width=canvas.height=0;throw error;}finally{if(!scheduler)work.dispose();}
    perf.record('earth-decode',performance.now()-started);
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
