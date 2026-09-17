import { assetUrl } from './adventure_media_core.js';
// Lazy cache: the chapter does not preload the full card library.
export async function loadSpellArt(assets) {
    const response=await fetch('data/kids/spell-art.json');
    if(!response.ok)throw new Error('基础卡面清单读取失败');
    const manifest=await response.json(),pending=new Map();
    if(manifest.version!==1||!manifest.bases)throw new Error('基础卡面清单版本无效');
    for(const base of Object.keys(assets.effects.bases)) {
        const row=manifest.bases[base];
        if(!row)throw new Error('基础卡面定义缺失：'+base);
        if(!row.system)assetUrl(row,assets.mode);
    }
    assets.spellArt=manifest.bases;
    assets.ensureSpellArt=base=>{
        const row=manifest.bases[base];
        if(!row?.local)return Promise.resolve(null);
        if(!pending.has(base))pending.set(base,new Promise((resolve,reject)=>{
            const image=new Image();image.crossOrigin='anonymous';
            image.onload=()=>{assets.images.set('spell:'+base,image);resolve(image);};
            image.onerror=()=>{pending.delete(base);reject(new Error('卡面加载失败，请重试'));};
            image.src=assetUrl(row,assets.mode);
        }));
        return pending.get(base);
    };
}
