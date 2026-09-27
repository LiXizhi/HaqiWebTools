import {fetchJson} from './runtime_data.js';
import {assetUrl} from './adventure_media_core.js';

// Manifest only at load; sheets download when ensure/warm/draw needs them.
export async function loadEnvironmentArt(mode,read=fetchJson,path='data/adventure/environment-art.json'){
    const manifest=await read(path),images={},pending=new Map();
    let onAtlas=null;
    function ensure(atlas){
        const row=manifest.atlases[atlas];
        if(!row)return Promise.reject(Error('缺少场景图集：'+atlas));
        if(images[atlas])return Promise.resolve(images[atlas]);
        if(!pending.has(atlas))pending.set(atlas,new Promise((resolve,reject)=>{
            if(row.size>200000){pending.delete(atlas);reject(Error('场景图集超出大小限制'));return;}
            const image=new Image();image.crossOrigin='anonymous';
            const fail=()=>{clearTimeout(timer);image.onload=image.onerror=null;pending.delete(atlas);reject(Error('场景图集加载失败'));};
            const timer=setTimeout(fail,10000);
            image.onload=()=>{
                clearTimeout(timer);image.onload=image.onerror=null;
                if(image.naturalWidth!==row.width||image.naturalHeight!==row.height){pending.delete(atlas);reject(Error('场景图集尺寸不符'));return;}
                images[atlas]=image;pending.delete(atlas);onAtlas?.(atlas);resolve(image);
            };
            image.onerror=fail;image.src=assetUrl(row,mode);
        }));
        return pending.get(atlas);
    }
    async function warm(keys){
        const list=[...new Set(keys||[])].filter(key=>manifest.atlases[key]);
        const results=await Promise.allSettled(list.map(ensure));
        for(const result of results)if(result.status==='rejected')console.warn('场景图集暂不可用：',result.reason);
    }
    return {manifest,images,ensure,warm,set onAtlas(fn){onAtlas=fn;},draw(c,atlas,name,x,y,w,h){
        const rect=manifest.atlases[atlas]?.frames[name]?.rect;
        if(!rect)return false;
        if(!images[atlas]){ensure(atlas).catch(()=>{});return false;}
        const ratio=Math.min(w/rect[2],h/rect[3]),dw=rect[2]*ratio,dh=rect[3]*ratio;
        c.drawImage(images[atlas],...rect,x+(w-dw)/2,y+h-dh,dw,dh);return true;
    }};
}
