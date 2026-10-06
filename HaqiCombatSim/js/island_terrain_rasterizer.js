// Lazy worker preparation; tile scheduler discards old-world replies.
export function createIslandTerrainRasterizer(art){
    if(typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined'||typeof createImageBitmap!=='function')return null;
    let worker=null,scope=null,sources=[],sequence=0,ready=Promise.resolve(),failed=false;const pending=new Map();
    function fail(error){failed=true;worker?.terminate();worker=null;for(const row of pending.values()){clearTimeout(row.timer);row.reject(error);}pending.clear();}
    return async(world,rect,pixels,scale)=>{
        if(failed)throw Error('岛屿地表后台准备不可用');
        if(!worker){worker=new Worker(new URL('./island_terrain_worker.js',import.meta.url),{type:'module'});worker.onerror=()=>fail(Error('岛屿地表后台准备失败'));worker.onmessage=({data})=>{const row=pending.get(data.id);if(!row){data.bitmap?.close();return;}pending.delete(data.id);clearTimeout(row.timer);if(data.error)row.reject(Error(data.error));else row.resolve(data);};}
        const next=Object.entries(art?.images||{});
        if(scope!==world||next.length!==sources.length||next.some(([key,image],i)=>sources[i]?.[0]!==key||sources[i]?.[1]!==image)){
            scope=world;sources=next;const snapshot={zone:world.zone,w:world.w,h:world.h,layout:world.layout,center:world.center,paths:world.paths,trees:world.trees,buildings:world.buildings,npcs:world.npcs,encounters:world.encounters};
            ready=ready.then(async()=>{const images=Object.fromEntries(await Promise.all(next.map(async([key,image])=>[key,await createImageBitmap(image)])));if(!worker){for(const image of Object.values(images))image.close();throw Error('岛屿地表后台准备已结束');}try{worker.postMessage({type:'scene',world:snapshot,manifest:art?.manifest,images},Object.values(images));}catch(error){for(const image of Object.values(images))image.close();throw error;}}).catch(error=>{fail(error);throw error;});
        }
        await ready;if(!worker)throw Error('岛屿地表后台准备已结束');const id=++sequence;
        return new Promise((resolve,reject)=>{const timer=setTimeout(()=>fail(Error('岛屿地表后台准备超时')),15000);pending.set(id,{resolve,reject,timer});try{worker.postMessage({id,rect,pixels,scale});}catch(error){fail(error);}});
    };
}
