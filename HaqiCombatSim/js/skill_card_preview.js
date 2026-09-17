// Optional simulator presentation: async artwork never blocks headless combat.
import {loadSkillArt} from './skill_art.js';
import {assetMode} from './adventure_media_core.js';
let library;
async function load(){
    if(!library)library=(async()=>{
        const response=await fetch('data/adventure/spell-effects.json');
        if(!response.ok)throw new Error('技能配置加载失败');
        const effects=await response.json();
        return {effects,art:await loadSkillArt(effects,assetMode(location.hostname,location.search))};
    })().catch(error=>{library=null;throw error;});
    return library;
}
export function skillCardPreview(card,version){
    if(version!=='kids')return null;
    const canvas=document.createElement('canvas');canvas.width=302;canvas.height=460;
    canvas.className='shared-skill-card';canvas.setAttribute('role','img');canvas.setAttribute('aria-label','卡牌图片加载中');
    load().then(async({effects,art})=>{
        const ref=effects.cards[card.key];if(!ref){canvas.remove();return;}
        await art.ensure(ref.base);art.drawCard(canvas.getContext('2d'),card);
        canvas.setAttribute('aria-label',ref.name);
    }).catch(()=>{canvas.remove();});
    return canvas;
}
