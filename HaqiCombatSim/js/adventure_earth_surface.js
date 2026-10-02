// Browser-only, bounded high-detail Canvas chunks. No global bitmap or IO here.
import {createEarthSurfaceRaster} from './adventure_earth_surface_core.js';
export function createEarthSurfacePainter({rules,sample,loadArt,canvasFactory=()=>document.createElement('canvas'),clock=()=>performance.now()}){
    const tiles=new Map();let roadCanvas=null;const roadPatterns=new WeakMap();let pending=[],active=null,frame=0,disposed=false,art=null,loading=null,retryAt=0,revision=0,lastTarget=null,maxSliceMs=0,built=0;
    const size=rules.surfaceChunkSize,resolution=rules.surfaceResolution,padded=resolution+2,gutter=size/resolution;
    function discard(row){if(row?.canvas)row.canvas.width=row.canvas.height=0;}
    function clearTiles(){for(const row of tiles.values())discard(row);tiles.clear();active=null;pending=[];}
    function startArt(){if(disposed||art||loading||clock()<retryAt)return;
        loading=loadArt().then(value=>{if(disposed)return;art=value;revision++;clearTiles();}).catch(()=>{retryAt=clock()+5000;}).finally(()=>{loading=null;});
    }
    function pump(){frame=0;if(disposed)return;const started=clock(),deadline=started+rules.surfaceFrameBudgetMs;
        do{
            if(!active){const next=pending.shift();if(!next)break;const [key,x,y]=next;active={key,x,y,job:createEarthSurfaceRaster({x:x-gutter,y:y-gutter,size:size+gutter*2,resolution:padded,cellSize:rules.unitsPerDegree*2/512,sample,atlas:art?.terrain,period:rules.surfaceTexturePeriod,worldWidth:rules.unitsPerDegree*360})};}
            if(active.job.rows(2)){
                const canvas=canvasFactory();canvas.width=canvas.height=padded;const c=canvas.getContext('2d'),pixels=c.createImageData(padded,padded);pixels.data.set(active.job.pixels);c.putImageData(pixels,0,0);
                const {key,x,y}=active;tiles.set(key,{canvas,x,y});active=null;built++;
                while(tiles.size>rules.surfaceMaxChunks){const key=tiles.keys().next().value;discard(tiles.get(key));tiles.delete(key);}
            }
        }while(clock()<deadline);
        maxSliceMs=Math.max(maxSliceMs,clock()-started);
        if(active||pending.length)frame=requestAnimationFrame(pump);
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
    return {draw,decoration,road,invalidate(){revision++;clearTiles();},dispose(){disposed=true;if(frame)cancelAnimationFrame(frame);frame=0;clearTiles();if(roadCanvas)roadCanvas.width=roadCanvas.height=0;roadCanvas=null;art=null;},get stats(){return {chunks:tiles.size,queued:pending.length,active:!!active,bytes:tiles.size*padded*padded*4,artReady:!!art,built,maxSliceMs:Math.round(maxSliceMs*10)/10};}};
}
