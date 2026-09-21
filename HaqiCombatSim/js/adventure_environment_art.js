import {fetchJson} from './runtime_data.js';
import {assetUrl} from './adventure_media_core.js';

export async function loadEnvironmentArt(mode,read=fetchJson){
    const manifest=await read('data/adventure/environment-art.json'),images={};
    await Promise.all(Object.entries(manifest.atlases).map(async([key,row])=>{
        if(row.size>200000)throw Error('场景图集超出大小限制');
        const image=new Image();image.crossOrigin='anonymous';
        await new Promise((resolve,reject)=>{
            const timeout=setTimeout(()=>reject(Error('场景图集加载超时')),10000);
            image.onload=()=>{clearTimeout(timeout);resolve();};image.onerror=()=>{clearTimeout(timeout);reject(Error('场景图集加载失败'));};
            image.src=assetUrl(row,mode);
        });
        if(image.naturalWidth!==row.width||image.naturalHeight!==row.height)throw Error('场景图集尺寸不符');
        images[key]=image;
    }));
    return {manifest,images,draw(c,atlas,name,x,y,w,h){
        const rect=manifest.atlases[atlas]?.frames[name]?.rect;
        if(!rect||!images[atlas])return false;
        const ratio=Math.min(w/rect[2],h/rect[3]),dw=rect[2]*ratio,dh=rect[3]*ratio;
        c.drawImage(images[atlas],...rect,x+(w-dw)/2,y+h-dh,dw,dh);return true;
    }};
}
