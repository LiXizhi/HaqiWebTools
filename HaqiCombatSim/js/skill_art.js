import {assetUrl} from './adventure_media_core.js';
import {skillFrame, validateSkillArt} from './skill_art_core.js';
import {CardRenderer} from './card_renderer.js';
export {cardDescription} from './card_renderer.js';

import { fetchJson as read } from './runtime_data.js';
export async function loadSkillArt(effects, mode) {
    const [manifest,frames]=await Promise.all([read('data/adventure/skill-art.json'),read('data/adventure/card-frames.json')]);
    validateSkillArt(manifest,effects);
    const images=new Map(),pending=new Map(),subjectFrames=new Map();
    for(const [base,entry]of Object.entries(manifest.bases)){
        subjectFrames.set(base,{card:skillFrame(manifest,base),animation:entry.effectAtlas?entry.effectFrames.map((_,i)=>skillFrame(manifest,base,(i+.5)/entry.effectFrames.length)):null});
    }
    function load(id,row){
        if(!pending.has(id))pending.set(id,new Promise((resolve,reject)=>{
            const image=new Image();image.crossOrigin='anonymous';
            const fail=()=>{clearTimeout(timer);image.onload=image.onerror=null;pending.delete(id);reject(new Error('技能图集加载失败：'+id));};
            const timer=setTimeout(fail,12000);
            image.onload=()=>{clearTimeout(timer);image.onload=image.onerror=null;images.set(id,image);resolve(image);};
            image.onerror=fail;
            image.src=assetUrl(row,mode);
        }));
        return pending.get(id);
    }
    // Frames/subjects are cosmetic. Failed requests remain retryable in load().
    async function optionalImages(requests){
        const results=await Promise.allSettled(requests);
        for(const result of results)if(result.status==='rejected')console.warn('卡牌图片暂不可用：',result.reason);
    }
    await optionalImages(Object.entries(frames.entries).map(([school,row])=>load('frame:'+school,row)));
    function ensure(base){
        const row=manifest.bases[base];if(!row)return Promise.reject(new Error('缺少技能主体：'+base));
        const id=row.effectAtlas||row.atlas;
        return load(id,manifest.sheets[id]);
    }
    function drawSubject(c,base,x,y,w,h,progress=null){
        const cached=subjectFrames.get(base);
        if(!cached)throw new Error('缺少技能主体：'+base);
        const frames=cached.animation;
        const frame=progress===null||!frames?cached.card:frames[Math.min(frames.length-1,Math.floor(Math.max(0,Math.min(1,progress))*frames.length))],image=images.get(frame.atlas);
        if(!image)return false;
        const size=Math.min(w,h);c.drawImage(image,...frame.rect,x+(w-size)/2,y+(h-size)/2,size,size);return true;
    }
    const renderer=new CardRenderer({images,effects,drawSubject});
    const drawCard=renderer.draw.bind(renderer);
    return {manifest,images,ensure,drawSubject,renderer,drawCard,async preload(cards){await optionalImages([...new Set(Object.values(cards).map(c=>effects.cards[c.key]?.base).filter(Boolean))].map(ensure));}};
}
