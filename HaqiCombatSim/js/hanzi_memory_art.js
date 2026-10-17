import {assetMode,assetUrl} from './adventure_media_core.js';
let loading;
export function loadMemoryArt(){
    return loading??=(async()=>{
        const response=await fetch(new URL('../data/adventure/hanzi-memory-art.json',import.meta.url));
        if(!response.ok)throw Error('文字碎片资源配置加载失败');
        const manifest=await response.json(),image=new Image();image.crossOrigin='anonymous';
        image.src=new URL(assetUrl(manifest,assetMode(location.hostname,location.search)),new URL('../',import.meta.url)).href;
        await image.decode();return {image,frames:manifest.frames};
    })().catch(error=>{loading=null;throw error;});
}
