// Browser-only, bounded high-detail Canvas chunks. No global bitmap or IO here.
import {createEarthSurfaceRaster} from './adventure_earth_surface_core.js';
import {earthGroundDecoration,earthGroundBounds,earthSurfaceObjectKey,drawEarthSurfaceObject,bakeEarthSurfaceObjects} from './adventure_earth_surface_objects.js';
export function createEarthSurfacePainter({rules,sample,loadArt,canvasFactory=()=>document.createElement('canvas'),clock=()=>performance.now(),workerFactory=()=>typeof Worker!=='undefined'?new Worker(new URL('./adventure_earth_surface_worker.js',import.meta.url),{type:'module'}):null}){
    const emptyObjects=[],objectKeyCache=new WeakMap();let visibleKeys=new Set();
    let worker=null,workerBusy=null,workerSequence=0,workerFailed=false;
    let currentRoads=[],currentObjects=[],objectBuckets=new Map(),scheduleKey=null,visibleTiles=[],wantedTiles=new Set(),scheduledTiles=[],queueDirty=true,queueBuilds=0;
    const tiles=new Map();let pending=[],active=null,frame=0,disposed=false,art=null,loading=null,retryAt=0,lastTarget=null,maxSliceMs=0,built=0;
    const mobile=typeof navigator!=='undefined'&&((navigator.hardwareConcurrency||8)<=4||(navigator.deviceMemory||8)<=4),size=rules.surfaceChunkSize,resolution=mobile?Math.min(rules.surfaceResolution,rules.surfaceMobileResolution):rules.surfaceResolution,padded=resolution+2,gutter=size/resolution;
    function discard(row){if(row?.canvas?.close)row.canvas.close();else if(row?.canvas)row.canvas.width=row.canvas.height=0;}
    function clearTiles(){for(const row of tiles.values())discard(row);tiles.clear();active=null;pending=[];scheduleKey=null;queueDirty=true;}
    function invalidate(bounds=null){
        // Keep old pixels visible while their replacement is built. Source tiles
        // only invalidate chunks whose sampling footprint intersects new data.
        const margin=gutter+rules.unitsPerDegree*2/512*3;
        const worldWidth=rules.unitsPerDegree*360;
        const affected=row=>!bounds||row.y-margin<bounds.y+bounds.h&&row.y+size+margin>bounds.y&&[-worldWidth,0,worldWidth].some(offset=>row.x+offset-margin<bounds.x+bounds.w&&row.x+offset+size+margin>bounds.x);
        for(const row of tiles.values())if(affected(row))row.stale=true;
        if(active&&affected(active))active=null;
        scheduleKey=null;
        queueDirty=true;
    }
    function startArt(){if(disposed||art||loading||clock()<retryAt)return;
        loading=loadArt().then(value=>{if(disposed)return;art=value;invalidate();startWorker();}).catch(()=>{retryAt=clock()+5000;}).finally(()=>{loading=null;});
    }
    async function startWorker(){
        if(worker||workerFailed||!art)return;
        const workerArt={};let transferred=false;
        try{
            if(typeof OffscreenCanvas!=='undefined'&&typeof createImageBitmap==='function'){
                for(const name of ['decorations','biomeDecorations'])if(art[name]?.image)workerArt[name]={width:art[name].width,frames:art[name].frames,image:await createImageBitmap(art[name].image)};
            }
            if(disposed){Object.values(workerArt).forEach(a=>a.image.close());return;}
            worker=workerFactory();if(!worker){Object.values(workerArt).forEach(a=>a.image.close());workerFailed=true;return;}
            worker.onmessage=({data})=>{const job=workerBusy;workerBusy=null;if(disposed||!job){data.bitmap?.close();return;}if(data.error){failWorker();return;}
                if(active?.id===data.id){finish(active,data.pixels,data.bitmap,data.baked);active=null;}
                else data.bitmap?.close();
                if(!frame&&(active||pending.length))frame=requestAnimationFrame(pump);
            };
            worker.onerror=()=>failWorker();worker.postMessage({type:'atlas',atlas:art.terrain,cityGround:art.cityGround,art:workerArt,composite:typeof OffscreenCanvas!=='undefined'&&typeof createImageBitmap==='function'},Object.values(workerArt).map(a=>a.image));transferred=true;
        }catch{if(!transferred)Object.values(workerArt).forEach(a=>a.image.close());failWorker();}
    }
    function failWorker(){worker?.terminate();worker=null;workerBusy=null;workerFailed=true;if(active)active.job=createEarthSurfaceRaster({...active.options,sample,atlas:art?.terrain,cityGround:art?.cityGround});if(!disposed&&!frame)frame=requestAnimationFrame(pump);}
    function finish(job,data,bitmap=null,baked=null){
        let canvas=bitmap,objects;
        if(!canvas){
            canvas=canvasFactory();canvas.width=canvas.height=padded;const c=canvas.getContext('2d'),pixels=c.createImageData(padded,padded);pixels.data.set(data);c.putImageData(pixels,0,0);
            objects=bakeEarthSurfaceObjects(c,job.objects,art,job.options);
        }else objects=(baked||[]).map(i=>job.objects[i]);
        discard(tiles.get(job.key));tiles.set(job.key,{canvas,x:job.x,y:job.y,stale:false,objects:new Set(objects.map(earthSurfaceObjectKey))});built++;
        while(tiles.size>rules.surfaceMaxChunks){const key=tiles.keys().next().value;discard(tiles.get(key));tiles.delete(key);}
        queueDirty=true;
    }
    function objectKeys(o){
        const cached=objectKeyCache.get(o);if(cached)return cached;
        const b=earthGroundBounds(o),keys=[];
        for(let cy=Math.floor((b.y-gutter)/size);cy<=Math.floor((b.y+b.h+gutter)/size);cy++)
            for(let cx=Math.floor((b.x-gutter)/size);cx<=Math.floor((b.x+b.w+gutter)/size);cx++)keys.push(`${cx}:${cy}`);
        objectKeyCache.set(o,keys);return keys;
    }
    function updateObjects(target){
        const next=target.trees||emptyObjects;if(currentObjects===next)return;
        const previous=new Set(currentObjects.filter(earthGroundDecoration)),incoming=new Set(next.filter(earthGroundDecoration));
        const changed=[...previous].filter(o=>!incoming.has(o)).concat([...incoming].filter(o=>!previous.has(o)));
        currentObjects=next;objectBuckets=new Map();
        queueDirty=true;
        for(const o of incoming)for(const key of objectKeys(o)){if(!objectBuckets.has(key))objectBuckets.set(key,[]);objectBuckets.get(key).push(o);}
        for(const o of changed)for(const key of objectKeys(o)){
            const tile=tiles.get(key);if(tile)tile.stale=true;
            if(active?.key===key)active=null;
        }
    }
    function dispatch(job){
        const o=job.options,west=Math.floor(o.x/o.cellSize)-2,north=Math.floor(o.y/o.cellSize)-2,count=Math.ceil(o.size/o.cellSize)+6,grid={};
        for(let gy=0;gy<count;gy++)for(let gx=0;gx<count;gx++){const x=(((west+gx+.5)*o.cellSize)%o.worldWidth+o.worldWidth)%o.worldWidth,y=(north+gy+.5)*o.cellSize;grid[`${Math.floor(x/o.cellSize)}:${Math.floor(y/o.cellSize)}`]=sample(x,y);}
        workerBusy=job;try{worker.postMessage({id:job.id,options:o,grid,objects:job.objects});}catch{failWorker();}
    }
    function pump(){frame=0;if(disposed||workerBusy)return;const started=clock(),deadline=started+Math.min(rules.surfaceFrameBudgetMs,rules.surfaceFallbackBudgetMs);
        do{
            if(!active){const next=pending.shift();if(!next)break;const [key,x,y]=next;
                const options={x:x-gutter,y:y-gutter,size:size+gutter*2,resolution:padded,cellSize:rules.unitsPerDegree*2/512,period:rules.surfaceTexturePeriod,cityBlockSize:rules.cityBlockSize,cityGroundPeriod:rules.cityGroundPeriod,vegetationTint:rules.surfaceVegetationTint,detailStrength:rules.surfaceDetailStrength,detailSpacing:rules.surfaceDetailSpacing,detailDensity:rules.surfaceDetailDensity,roads:currentRoads.filter(road=>Math.max(road.a.x,road.b.x)>=x-size/2&&Math.min(road.a.x,road.b.x)<=x+size*1.5&&Math.max(road.a.y,road.b.y)>=y-size/2&&Math.min(road.a.y,road.b.y)<=y+size*1.5),roadStyle:{width:rules.cityConnectionWidth,blendWidth:rules.cityConnectionBlendWidth,shoulderWidth:rules.cityConnectionShoulderWidth,textureOpacity:rules.cityConnectionTextureOpacity},worldWidth:rules.unitsPerDegree*360};
                active={id:++workerSequence,key,x,y,options,objects:[...(objectBuckets.get(key)||[])].sort((a,b)=>a.y-b.y)};
                if(worker){dispatch(active);break;}
                active.job=createEarthSurfaceRaster({...options,sample,atlas:art?.terrain,cityGround:art?.cityGround});
            }
            if(active.job.rows(1)){finish(active,active.job.pixels);active=null;}
        }while(clock()<deadline);
        maxSliceMs=Math.max(maxSliceMs,clock()-started);
        if(!workerBusy&&(active||pending.length))frame=requestAnimationFrame(pump);
    }
    function draw(ctx,target,rect){
        if(disposed)return;if(lastTarget!==target){lastTarget=target;currentRoads=target.paths||[];currentObjects=[];clearTiles();}
        else if(target.paths&&currentRoads!==target.paths){
            const old=new Set(currentRoads),next=new Set(target.paths);
            const changed=[...currentRoads.filter(r=>!next.has(r)),...target.paths.filter(r=>!old.has(r))];currentRoads=target.paths;
            for(const r of changed){const pad=(r.width??rules.cityConnectionWidth)/2+rules.cityConnectionShoulderWidth+rules.cityConnectionBlendWidth;
                invalidate({x:Math.min(r.a.x,r.b.x)-pad,y:Math.min(r.a.y,r.b.y)-pad,w:Math.abs(r.b.x-r.a.x)+pad*2,h:Math.abs(r.b.y-r.a.y)+pad*2});}
        }
        updateObjects(target);startArt();
        // Low-detail minimaps never enqueue thousands of detailed chunks.
        const west=Math.floor(rect.x/size),east=Math.floor((rect.x+rect.w)/size),north=Math.floor(rect.y/size),south=Math.floor((rect.y+rect.h)/size);
        if((east-west+1)*(south-north+1)>rules.surfaceMaxChunks){visibleTiles=[];visibleKeys.clear();scheduleKey=null;pending=[];active=null;return;}
        const key=`${west}:${east}:${north}:${south}`;
        if(scheduleKey!==key){
            scheduleKey=key;
            queueDirty=true;
            const candidates=[],ring=rules.surfacePrefetchRing??1;
            for(let cy=north-ring;cy<=south+ring;cy++)for(let cx=west-ring;cx<=east+ring;cx++){
                const visible=cx>=west&&cx<=east&&cy>=north&&cy<=south;
                candidates.push({cx,cy,visible,d:Math.hypot(cx-(west+east)/2,cy-(north+south)/2)});
            }
            candidates.sort((a,b)=>Number(b.visible)-Number(a.visible)||a.d-b.d);
            scheduledTiles=candidates.slice(0,rules.surfaceMaxChunks).map(({cx,cy,visible})=>({key:`${cx}:${cy}`,x:cx*size,y:cy*size,visible}));
            visibleTiles=scheduledTiles.filter(t=>t.visible);visibleKeys=new Set(visibleTiles.map(t=>t.key));wantedTiles=new Set(scheduledTiles.map(t=>t.key));
            if(active&&!wantedTiles.has(active.key))active=null;
            // Touch the working set only when the viewport changes. Stable
            // frames read cached bitmaps without rewriting the LRU map.
            for(const row of scheduledTiles){const tile=tiles.get(row.key);if(tile){tiles.delete(row.key);tiles.set(row.key,tile);}}
        }
        for(const row of visibleTiles){const tile=tiles.get(row.key);if(tile)ctx.drawImage(tile.canvas,row.x-gutter,row.y-gutter,size+gutter*2,size+gutter*2);}
        if(queueDirty){pending=scheduledTiles.filter(row=>row.key!==active?.key&&(!tiles.has(row.key)||tiles.get(row.key).stale)).map(row=>[row.key,row.x,row.y]);queueDirty=false;queueBuilds++;}
        if(!frame&&!workerBusy&&(active||pending.length))frame=requestAnimationFrame(pump);
    }
    function covers(target,rect){
        if(target!==lastTarget)return false;
        const west=Math.floor(rect.x/size),east=Math.floor((rect.x+rect.w)/size),north=Math.floor(rect.y/size),south=Math.floor((rect.y+rect.h)/size);
        if((east-west+1)*(south-north+1)>rules.surfaceMaxChunks)return false;
        for(let cy=north;cy<=south;cy++)for(let cx=west;cx<=east;cx++)if(!tiles.has(`${cx}:${cy}`))return false;
        return true;
    }
    function isBaked(o){
        if(!earthGroundDecoration(o))return false;
        let visible=false;const id=earthSurfaceObjectKey(o);
        for(const key of objectKeys(o))if(visibleKeys.has(key)){visible=true;if(!tiles.get(key)?.objects.has(id))return false;}
        return visible;
    }
    function decoration(ctx,o){
        if(!earthGroundDecoration(o))return drawEarthSurfaceObject(ctx,o,art);
        // Draw only the portions not yet baked, including sprites crossing chunks.
        const id=earthSurfaceObjectKey(o),missing=objectKeys(o).filter(key=>!tiles.get(key)?.objects.has(id));
        if(!missing.length)return true;
        ctx.save();ctx.beginPath();for(const key of missing){const [x,y]=key.split(':').map(Number);ctx.rect(x*size,y*size,size,size);}ctx.clip();
        const drawn=drawEarthSurfaceObject(ctx,o,art);ctx.restore();return drawn;
    }
    return {draw,covers,decoration,isBaked,invalidate,dispose(){disposed=true;worker?.terminate();worker=null;workerBusy=null;if(frame)cancelAnimationFrame(frame);frame=0;clearTiles();objectBuckets.clear();currentObjects=[];visibleTiles=[];art=null;},get stats(){return {worker:!!worker,resolution,chunks:tiles.size,queued:pending.length,active:!!active,bytes:tiles.size*padded*padded*4,artReady:!!art,built,queueBuilds,maxSliceMs:Math.round(maxSliceMs*10)/10};}};
}
