// Browser-only, bounded high-detail Canvas chunks. No global bitmap or IO here.
import {createEarthSurfaceRaster} from './adventure_earth_surface_core.js';
export function createEarthSurfacePainter({rules,sample,loadArt,canvasFactory=()=>document.createElement('canvas'),clock=()=>performance.now(),workerFactory=()=>typeof Worker!=='undefined'?new Worker(new URL('./adventure_earth_surface_worker.js',import.meta.url),{type:'module'}):null}){
    let worker=null,workerBusy=null,workerSequence=0,workerFailed=false;
    const tiles=new Map();let roadCanvas=null;const roadPatterns=new WeakMap();let pending=[],active=null,frame=0,disposed=false,art=null,loading=null,retryAt=0,revision=0,lastTarget=null,maxSliceMs=0,built=0;
    const mobile=typeof navigator!=='undefined'&&((navigator.hardwareConcurrency||8)<=4||(navigator.deviceMemory||8)<=4),size=rules.surfaceChunkSize,resolution=mobile?Math.min(rules.surfaceResolution,rules.surfaceMobileResolution):rules.surfaceResolution,padded=resolution+2,gutter=size/resolution;
    function discard(row){if(row?.canvas)row.canvas.width=row.canvas.height=0;}
    function clearTiles(){for(const row of tiles.values())discard(row);tiles.clear();active=null;pending=[];}
    function startArt(){if(disposed||art||loading||clock()<retryAt)return;
        loading=loadArt().then(value=>{if(disposed)return;art=value;revision++;clearTiles();startWorker();}).catch(()=>{retryAt=clock()+5000;}).finally(()=>{loading=null;});
    }
    function startWorker(){
        if(worker||workerFailed||!art)return;
        try{worker=workerFactory();if(!worker){workerFailed=true;return;}
            worker.onmessage=({data})=>{const job=workerBusy;workerBusy=null;if(disposed||!job)return;if(data.error){failWorker();return;}
                if(active?.id===data.id){finish(active,data.pixels);active=null;}
                if(!frame&&(active||pending.length))frame=requestAnimationFrame(pump);
            };
            worker.onerror=()=>failWorker();worker.postMessage({type:'atlas',atlas:art.terrain,cityGround:art.cityGround});
        }catch{failWorker();}
    }
    function failWorker(){worker?.terminate();worker=null;workerBusy=null;workerFailed=true;if(active)active.job=createEarthSurfaceRaster({...active.options,sample,atlas:art?.terrain,cityGround:art?.cityGround});if(!disposed&&!frame)frame=requestAnimationFrame(pump);}
    function finish(job,data){
        const canvas=canvasFactory();canvas.width=canvas.height=padded;const c=canvas.getContext('2d'),pixels=c.createImageData(padded,padded);pixels.data.set(data);c.putImageData(pixels,0,0);
        tiles.set(job.key,{canvas,x:job.x,y:job.y});built++;
        while(tiles.size>rules.surfaceMaxChunks){const key=tiles.keys().next().value;discard(tiles.get(key));tiles.delete(key);}
    }
    function dispatch(job){
        const o=job.options,west=Math.floor(o.x/o.cellSize)-2,north=Math.floor(o.y/o.cellSize)-2,count=Math.ceil(o.size/o.cellSize)+6,grid={};
        for(let gy=0;gy<count;gy++)for(let gx=0;gx<count;gx++){const x=(((west+gx+.5)*o.cellSize)%o.worldWidth+o.worldWidth)%o.worldWidth,y=(north+gy+.5)*o.cellSize;grid[`${Math.floor(x/o.cellSize)}:${Math.floor(y/o.cellSize)}`]=sample(x,y);}
        workerBusy=job;try{worker.postMessage({id:job.id,options:o,grid});}catch{failWorker();}
    }
    function pump(){frame=0;if(disposed||workerBusy)return;const started=clock(),deadline=started+Math.min(rules.surfaceFrameBudgetMs,rules.surfaceFallbackBudgetMs);
        do{
            if(!active){const next=pending.shift();if(!next)break;const [key,x,y]=next;
                const options={x:x-gutter,y:y-gutter,size:size+gutter*2,resolution:padded,cellSize:rules.unitsPerDegree*2/512,period:rules.surfaceTexturePeriod,cityBlockSize:rules.cityBlockSize,cityGroundPeriod:rules.cityGroundPeriod,vegetationTint:rules.surfaceVegetationTint,worldWidth:rules.unitsPerDegree*360};
                active={id:++workerSequence,key,x,y,options};
                if(worker){dispatch(active);break;}
                active.job=createEarthSurfaceRaster({...options,sample,atlas:art?.terrain,cityGround:art?.cityGround});
            }
            if(active.job.rows(1)){finish(active,active.job.pixels);active=null;}
        }while(clock()<deadline);
        maxSliceMs=Math.max(maxSliceMs,clock()-started);
        if(!workerBusy&&(active||pending.length))frame=requestAnimationFrame(pump);
    }
    function draw(ctx,target,rect){
        if(disposed)return;if(lastTarget!==target){lastTarget=target;clearTiles();}startArt();
        // Low-detail minimaps never enqueue thousands of detailed chunks.
        const west=Math.floor(rect.x/size),east=Math.floor((rect.x+rect.w)/size),north=Math.floor(rect.y/size),south=Math.floor((rect.y+rect.h)/size);
        if((east-west+1)*(south-north+1)>rules.surfaceMaxChunks)return;
        const wanted=new Set(),jobs=[],candidates=[],ring=rules.surfacePrefetchRing??1;
        for(let cy=north-ring;cy<=south+ring;cy++)for(let cx=west-ring;cx<=east+ring;cx++){
            const visible=cx>=west&&cx<=east&&cy>=north&&cy<=south;
            candidates.push({cx,cy,visible,d:Math.hypot(cx*size+size/2-rect.x-rect.w/2,cy*size+size/2-rect.y-rect.h/2)});
        }
        candidates.sort((a,b)=>Number(b.visible)-Number(a.visible)||a.d-b.d);
        for(const {cx,cy,visible} of candidates.slice(0,rules.surfaceMaxChunks)){
            const key=`${revision}:${cx}:${cy}`,x=cx*size,y=cy*size;wanted.add(key);const tile=tiles.get(key);
            if(tile){tiles.delete(key);tiles.set(key,tile);if(visible)ctx.drawImage(tile.canvas,x-gutter,y-gutter,size+gutter*2,size+gutter*2);}else jobs.push([key,x,y]);
        }
        if(active&&!wanted.has(active.key))active=null;
        pending=jobs.filter(j=>j[0]!==active?.key);
        if(!frame&&(active||pending.length))frame=requestAnimationFrame(pump);
    }
    function road(ctx){
        if(!art?.terrain)return null;
        if(!roadCanvas){const atlas=art.terrain,cell=atlas.width/4;roadCanvas=canvasFactory();roadCanvas.width=roadCanvas.height=cell;const c=roadCanvas.getContext('2d'),pixels=c.createImageData(cell,cell);
            for(let y=0;y<cell;y++)pixels.data.set(atlas.data.subarray(((cell+y)*atlas.width)*4,((cell+y)*atlas.width+cell)*4),y*cell*4);c.putImageData(pixels,0,0);
        }
        if(!roadPatterns.has(ctx))roadPatterns.set(ctx,ctx.createPattern(roadCanvas,'repeat'));return roadPatterns.get(ctx);
    }
    function decoration(ctx,o){const atlas=art?.decorations;if(!atlas?.image)return false;const cell=atlas.width/4,i=o.earthDecoFrame;if(i===undefined)return false;ctx.drawImage(atlas.image,(i%4)*cell,Math.floor(i/4)*cell,cell,cell,o.x-o.size/2,o.y-o.size*.88,o.size,o.size);return true;}
    return {draw,decoration,road,invalidate(){revision++;clearTiles();},dispose(){disposed=true;worker?.terminate();worker=null;workerBusy=null;if(frame)cancelAnimationFrame(frame);frame=0;clearTiles();if(roadCanvas)roadCanvas.width=roadCanvas.height=0;roadCanvas=null;art=null;},get stats(){return {worker:!!worker,resolution,chunks:tiles.size,queued:pending.length,active:!!active,bytes:tiles.size*padded*padded*4,artReady:!!art,built,maxSliceMs:Math.round(maxSliceMs*10)/10};}};
}
