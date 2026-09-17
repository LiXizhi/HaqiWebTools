// Browser IO for the self-contained adventure package.
import { validateSpellEffects } from './spell_effects_core.js';
import { validateAdventureContent } from './adventure_content_core.js';
import { assetMode, assetUrl, validateMediaManifest } from './adventure_media_core.js';
export const SAVE_KEY = 'haqi.adventure.kids.v1';
async function json(url) { const r=await fetch(url);if(!r.ok)throw new Error(`无法读取 ${url}（${r.status}）`);return r.json(); }
function loadImage(url) { return new Promise((resolve,reject)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>resolve(i);i.onerror=()=>reject(new Error(`无法加载图片 ${url}`));i.src=url;}); }
export async function loadResources(progress) {
    const [content,dataset,manifest,media,effects]=await Promise.all(['chapter','combat','assets','media','spell-effects'].map(n=>json(`data/adventure/${n}.json`)));
    validateAdventureContent(content,dataset,manifest);
    validateSpellEffects(effects,dataset.cards);
    const mode=assetMode(location.hostname,location.search);
    validateMediaManifest(media,manifest,mode);
    const images=new Map(),bounds=new Map(),failures=[];
    const rows=Object.entries(media.entries).filter(([,a])=>a.local.endsWith('.webp'));
    let cursor=0,done=0;
    const worker=async()=>{while(cursor<rows.length){const[id,a]=rows[cursor++];try{images.set(id,await loadImage(assetUrl(a,mode)));}catch(e){if(!a.optional)failures.push(e.message);}progress?.(++done/rows.length);}};
    await Promise.all(Array.from({length:8},worker));
    if(failures.length)throw new Error(`冒险资源缺失，请重新准备资源后重试。${failures[0]}`);
    for(const card of Object.values(dataset.cards)) {
        const image=images.get(card.art?.id),base=effects.cards[card.key]?.base;
        if(image&&base)images.set('spell:'+base,image);
    }
    function getBounds(id,rect) {
        const img=images.get(id);if(!img)return null;
        const cacheKey=id+JSON.stringify(rect||null);if(bounds.has(cacheKey))return bounds.get(cacheKey);
        const [sx,sy,sw,sh]=rect||[0,0,img.width,img.height];
        const c=document.createElement('canvas');c.width=Math.ceil(sw);c.height=Math.ceil(sh);const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,sx,sy,sw,sh,0,0,c.width,c.height);
        const data=ctx.getImageData(0,0,c.width,c.height).data;let left=c.width,top=c.height,right=0,bottom=0;
        for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(data[(y*c.width+x)*4+3]>20){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
        const value=left>right?[sx,sy,sw,sh]:[sx+left,sy+top,right-left+1,bottom-top+1];bounds.set(cacheKey,value);return value;
    }
    function draw(ctx,ref,x,y,w,h,trim=true) {
        const id=typeof ref==='string'?ref:ref?.id,img=images.get(id);if(!img)return false;
        const source=(typeof ref==='object'&&ref.crop)||null;
        const rect=trim?getBounds(id,source):(source||[0,0,img.width,img.height]);
        const ratio=Math.min(w/rect[2],h/rect[3]),dw=rect[2]*ratio,dh=rect[3]*ratio;
        ctx.drawImage(img,...rect,x+(w-dw)/2,y+(h-dh)/2,dw,dh);return true;
    }
    function tile(ctx,sheet,index,x,y,w,h) {
        const img=images.get(sheet);if(!img)return;
        const cols=4,rows=sheet==='sprites'?4:2,cw=img.width/cols,ch=img.height/rows;
        const row=Math.floor(index/4), cuts=sheet==='sprites'?[0,323,650,929,1254].map(v=>v*img.height/1254):[0,ch,img.height];
        return draw(ctx,{id:sheet,crop:[(index%4)*cw,cuts[row],cw,cuts[row+1]-cuts[row]]},x,y,w,h,true);
    }
    return {content,dataset,manifest,effects,images,draw,tile,getBounds,mode,media,urlFor:id=>assetUrl(media.entries[id],mode)};
}
export const BACKUP_KEY = `${SAVE_KEY}.before-cloud`;
export function saveLocal(save, storage = localStorage) {
    const text=JSON.stringify(save);
    if(storage.getItem(SAVE_KEY)!==text){storage.setItem(SAVE_KEY,text);try{storage.setItem(`${SAVE_KEY}.updated`,new Date().toISOString());}catch{/* Metadata is optional; the checkpoint was saved. */}}
}
export function localUpdatedAt() {try{return localStorage.getItem(`${SAVE_KEY}.updated`);}catch{return null;}}
export function replaceLocalWithBackup(save, storage = localStorage, expectedRaw = undefined) {
    const previous=storage.getItem(SAVE_KEY);
    if(expectedRaw!==undefined&&previous!==expectedRaw)throw new Error('本地进度已在其他页面变化，请重新查看云端记录后再恢复。');
    // Quota/security failures abort before overwriting the existing progress.
    if(previous)storage.setItem(BACKUP_KEY,previous);
    saveLocal(save,storage);
}
export function readBackup() {try{return localStorage.getItem(BACKUP_KEY);}catch{return null;}}
export function readLocal() {return localStorage.getItem(SAVE_KEY);}
export function downloadSave(save) {
    const blob=new Blob([JSON.stringify(save,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='魔法哈奇-冒险存档.json';a.hidden=true;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
