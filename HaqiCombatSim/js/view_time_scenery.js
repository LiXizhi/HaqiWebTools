import {timeScenery} from './adventure_time_scenery_core.js';
import {streetArtResource} from './adventure_city_art_core.js';
import {assetUrl} from './adventure_media_core.js';

// Optional art: failed images never block play or retry on every animation frame.
export function createTimeScenery({data,assets,read=()=>fetch(new URL('../data/adventure/earth/street-art.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('街景素材清单加载失败');return r.json();}),imageFactory=()=>new Image()}){
    let closed=false,manifest=assets.content?.cityStreetArt,last=-1,objects=[];
    const loaded=new Map(),pending=new Map(),failed=new Set();
    if(!manifest)Promise.resolve().then(read).then(value=>{if(!closed){manifest=value;last=-1;}}).catch(()=>{});
    function ensure(resource){
        if(!resource||loaded.has(resource.id)||pending.has(resource.id)||failed.has(resource.id))return;
        if(!(resource.bytes>0&&resource.bytes<=200000)){failed.add(resource.id);return;}
        const img=imageFactory();img.crossOrigin='anonymous';
        const finish=ok=>{clearTimeout(timer);img.onload=img.onerror=null;pending.delete(resource.id);if(closed)return;if(ok&&img.naturalWidth===resource.width&&img.naturalHeight===resource.height)loaded.set(resource.id,img);else failed.add(resource.id);};
        const timer=setTimeout(()=>finish(false),10000);
        pending.set(resource.id,()=>{clearTimeout(timer);img.onload=img.onerror=null;img.src='';});
        img.onload=()=>finish(true);img.onerror=()=>finish(false);
        try{const url=assetUrl(resource,assets.mode);img.src=assets.mode==='local'?new URL('../'+url,import.meta.url).href:url;}catch{finish(false);}
    }
    return {
        prepare(x){
            if(closed)return;
            const next=Math.round(x/data.spacing);if(next===last)return;last=next;objects=timeScenery(data,x);
            const resources=new Map(objects.map(o=>{const r=streetArtResource(manifest,o.art);return [r?.id,r];}).filter(([id])=>id));
            for(const [id,cancel]of pending)if(!resources.has(id)){cancel();pending.delete(id);}
            for(const id of loaded.keys())if(!resources.has(id))loaded.delete(id);
            for(const resource of resources.values())ensure(resource);
        },
        draw(ctx,layer,camera,floor,width){
            if(closed)return;
            for(const o of objects){
                const sx=o.x-camera;if(o.layer!==layer||sx+o.w/2<0||sx-o.w/2>width)continue;
                const entry=manifest?.entries?.[o.art],resource=streetArtResource(manifest,o.art),img=loaded.get(resource?.id);if(!img||!entry)continue;
                const crop=entry.crop||[0,0,resource.width,resource.height],scale=Math.min(o.w/crop[2],o.h/crop[3]),w=crop[2]*scale,h=crop[3]*scale;
                ctx.drawImage(img,...crop,sx-w/2,floor+o.dy-h,w,h);
            }
        },
        close(){closed=true;for(const cancel of pending.values())cancel();pending.clear();loaded.clear();objects=[];},
    };
}
