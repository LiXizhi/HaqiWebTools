import {assetUrl} from './adventure_media_core.js';
import {skillFrame, validateSkillArt} from './skill_art_core.js';
import {CardRenderer} from './card_renderer.js';
export {cardDescription} from './card_renderer.js';

import { fetchJson as read } from './runtime_data.js';
export async function loadSkillArt(effects, mode) {
    const [manifest,frames]=await Promise.all([read('data/adventure/skill-art.json'),read('data/adventure/card-frames.json')]);
    validateSkillArt(manifest,effects);
    const images=new Map(),pending=new Map();
    function load(id,row){
        if(!pending.has(id))pending.set(id,new Promise((resolve,reject)=>{
            const image=new Image();image.crossOrigin='anonymous';
            image.onload=()=>{images.set(id,image);resolve(image);};
            image.onerror=()=>{pending.delete(id);reject(new Error('技能图集加载失败：'+id));};
            image.src=assetUrl(row,mode);
        }));
        return pending.get(id);
    }
    await Promise.all(Object.entries(frames.entries).map(([school,row])=>load('frame:'+school,row)));
    function ensure(base){
        const row=manifest.bases[base];if(!row)return Promise.reject(new Error('缺少技能主体：'+base));
        const id=row.effectAtlas||row.atlas;
        return load(id,manifest.sheets[id]);
    }
    function drawSubject(c,base,x,y,w,h,progress=null){
        const frame=skillFrame(manifest,base,progress),image=images.get(frame.atlas);
        if(!image)return false;
        const size=Math.min(w,h);c.drawImage(image,...frame.rect,x+(w-size)/2,y+(h-size)/2,size,size);return true;
    }
    const renderer=new CardRenderer({images,effects,drawSubject});
    const drawCard=renderer.draw.bind(renderer);
    return {manifest,images,ensure,drawSubject,renderer,drawCard,async preload(cards){await Promise.all([...new Set(Object.values(cards).map(c=>effects.cards[c.key]?.base).filter(Boolean))].map(ensure));}};
}
