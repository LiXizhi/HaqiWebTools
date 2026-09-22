import {createMonsterArtRenderer} from './adventure_monster_art.js';
import {createQuestJournalLoader} from './adventure_quest_journal.js';
import {installDungeonIndex} from './adventure_dungeons_core.js';
import {createDungeonLoader} from './adventure_dungeons.js';
import {installNpcCatalog} from './adventure_npc_core.js';
import {installFishing} from './adventure_fishing_core.js';
import {installNpcArt} from './adventure_npc_art_core.js';
import {loadEnvironmentArt} from './adventure_environment_art.js';
import { installExpansion } from './adventure_expansion_core.js';
// Browser IO for the self-contained adventure package.
import { validateSpellEffects } from './spell_effects_core.js';
import { validateAdventureContent } from './adventure_content_core.js';
import { assetMode, assetUrl, validateMediaManifest } from './adventure_media_core.js';
import { loadSkillArt } from './skill_art.js';
import { loadUiArt } from './adventure_ui_art.js';
export const SAVE_KEY = 'haqi.adventure.kids.v1';
import { createJsonReader } from './runtime_data.js';
function loadImage(url) { return new Promise((resolve,reject)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>resolve(i);i.onerror=()=>reject(new Error(`无法加载图片 ${url}`));i.src=url;}); }
export async function loadResources(progress) {
    const downloads = new Map();
    const json = createJsonReader({ onProgress: event => {
        downloads.set(event.url, event);
        const rows = [...downloads.values()], active = rows.filter(row => !row.done);
        const loaded = rows.reduce((sum, row) => sum + row.loaded, 0);
        const total = active.every(row => row.total && row.loaded <= row.total)
            ? rows.reduce((sum, row) => sum + (row.done ? row.loaded : row.total), 0) : null;
        progress?.({ label: '正在下载游戏配置', detail: `已读取 ${(loaded / 1048576).toFixed(2)} MB`, value: active.length && total ? loaded / total : null });
    } });
    progress?.({ label: '正在连接资源服务器', value: null });
    const [content,dataset,manifest,media,effects]=await Promise.all(['chapter','combat','assets','media','spell-effects'].map(n=>json(`data/adventure/${n}.json`)));
    validateAdventureContent(content,dataset,manifest);
    content.worldMaps=Object.fromEntries(await Promise.all(Object.entries(content.worldMapIndex.islands).map(async([id,info])=>[id,await json(info.file)])));
    validateSpellEffects(effects,dataset.cards);
    const mode=assetMode(location.hostname,location.search);
    // A failed cosmetic download must not block local saves or gameplay.
    const environmentReady=loadEnvironmentArt(mode,json).catch(error=>{console.warn('使用基础场景素材：',error.message);return null;});
    const uiArtReady=loadUiArt(mode,json).catch(error=>console.warn('使用基础界面：',error.message));
    validateMediaManifest(media,manifest,mode);
    const images=new Map(),bounds=new Map(),failures=[],lazyImages=new Map(),imageLoading=new Map();
    const cardImages=new Set(Object.values(dataset.cards).map(card=>card.art?.id).filter(Boolean));
    const otherImages=new Set(Object.values(content.items).map(item=>item.art?.id).filter(Boolean));
    const oldNpcImages=new Set(Object.values(content.npcs).map(n=>n.portrait?.id).filter(Boolean));
    const rows=Object.entries(media.entries).filter(([id,a])=>!oldNpcImages.has(id)&&a.local.endsWith('.webp')&&(!cardImages.has(id)||otherImages.has(id)));
    progress?.({ label: '正在加载卡牌与场景', value: null });
    const skillArt=await loadSkillArt(effects,mode,json);
    await skillArt.preload(dataset.cards);
    let cursor=0,done=0;
    const worker=async()=>{while(cursor<rows.length){const[id,a]=rows[cursor++];try{images.set(id,await loadImage(assetUrl(a,mode)));}catch(e){if(!a.optional)failures.push(e.message);}done++;progress?.({label:'正在加载场景图片',detail:`${done} / ${rows.length}`,value:done/rows.length});}};
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
    function draw(ctx,ref,x,y,w,h,trim=true,repaint=true) {
        const id=typeof ref==='string'?ref:ref?.id,img=images.get(id);
        if(!img){
            if(lazyImages.has(id)){
                if(!imageLoading.has(id))imageLoading.set(id,loadImage(assetUrl(lazyImages.get(id),mode)).then(image=>{images.set(id,image);return image;}).catch(()=>null));
                if(repaint)imageLoading.get(id).then(image=>{if(image&&ctx.canvas.isConnected){ctx.clearRect(x,y,w,h);draw(ctx,ref,x,y,w,h,trim);}});
            }
            return false;
        }
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
    const [catalog,candidates,kidsCards,kidsCharms,cardNames]=await Promise.all([json('data/adventure/pets.json'),json('data/adventure/shop-candidates.json'),json('data/kids/cards.json'),json('data/kids/charms.json'),json('data/kids/card_names.json')]);
    installExpansion(content,dataset,catalog,candidates,kidsCards,kidsCharms,cardNames);
    const dungeonJson=createJsonReader({packed:false});
    installDungeonIndex(content,await json('data/adventure/dungeon-index.json'));
    const dungeons=createDungeonLoader({content,dataset,cards:kidsCards,names:cardNames,readJson:dungeonJson});
    installNpcCatalog(content,await json('data/adventure/npc-catalog.json'));
    const npcArt=await json('data/adventure/npc-art.json');
    installNpcArt(content,npcArt);
    for(const [id,entry] of Object.entries(npcArt.entries))lazyImages.set(id,entry);
    content.shopConfig=await json('data/adventure/shop.json');
    content.magicStar=await json('data/adventure/magic-star.json');
    content.progressionBonuses=await json('data/adventure/progression-bonuses.json');
    const {installDragonTotemItems}=await import('./adventure_progression_bonuses_core.js');
    installDragonTotemItems(content);
    installFishing(content,await json('data/adventure/fishing.json'));
    content.checkinConfig=await json('data/adventure/checkin.json');
    for(const [id,item] of Object.entries(content.checkinConfig.items))content.items[id]??=item;
    for(const [id,item] of Object.entries(content.progressionBonuses.giftItems||{}))content.items[id]??=item;
    content.gemCatalog=await json('data/adventure/gems.json');
    Object.assign(content.items,content.gemCatalog.items);
    for(const [id,entry] of Object.entries(content.strengtheningIcons||{}))lazyImages.set(id,entry);
    const shopIcons=await json('data/adventure/shop-icons.json');
    for(const [id,entry] of Object.entries(shopIcons.entries))lazyImages.set(id,entry);
    for(const [id,ref] of Object.entries(shopIcons.items))if(content.items[id]&&!content.items[id].art){content.items[id].art=ref;content.items[id].iconFallback=!!shopIcons.fallbacks[id];}
    progress?.({ label: '正在准备世界与角色资源', value: null });
    await skillArt.preload(dataset.cards);
    const petLoading=new Set();
    function drawPet(ctx,id,stage,x,y,w,h){const art=content.pets[id]?.art;if(!art)return false;const key='pet:'+id;const img=images.get(key);if(!img){if(!petLoading.has(id)){petLoading.add(id);loadImage(mode==='local'?art.local:art.cdn).then(image=>images.set(key,image)).catch(()=>petLoading.delete(id));}return false;}const sw=img.width/4,sh=img.height/4;ctx.drawImage(img,0,stage*sh,sw,sh,x,y,w,h);return true;}
    const monsterArt=await json('data/adventure/monster-art.json');
    for(const [id,entry] of Object.entries(monsterArt.entries))lazyImages.set('monster:'+id,entry);
    const drawMonster=createMonsterArtRenderer(monsterArt,content,draw,drawPet);
    await uiArtReady;
    const environmentArt=await environmentReady;
    return {drawMonster,monsterArt,loadQuestJournal:createQuestJournalLoader(),dungeons,environmentArt,drawPet,content,dataset,previewCards:kidsCards,manifest,effects,images,draw,tile,getBounds,mode,media,skillArt,urlFor:id=>assetUrl(media.entries[id],mode)};
}
export const BACKUP_KEY = `${SAVE_KEY}.before-cloud`;
export function saveLocal(save, storage = localStorage) {
    const text=JSON.stringify(save);
    if(storage.getItem(SAVE_KEY)!==text){storage.setItem(SAVE_KEY,text);try{storage.setItem(`${SAVE_KEY}.updated`,new Date().toISOString());}catch{/* Metadata is optional; the checkpoint was saved. */}}
}
export function localUpdatedAt(storage = localStorage) {try{return storage.getItem(`${SAVE_KEY}.updated`);}catch{return null;}}
export function replaceLocalWithBackup(save, storage = localStorage, expectedRaw = undefined) {
    const previous=storage.getItem(SAVE_KEY);
    if(expectedRaw!==undefined&&previous!==expectedRaw)throw new Error('本地进度已在其他页面变化，请重新查看云端记录后再恢复。');
    // Quota/security failures abort before overwriting the existing progress.
    if(previous)storage.setItem(BACKUP_KEY,previous);
    saveLocal(save,storage);
}
export function readBackup(storage = localStorage) {try{return storage.getItem(BACKUP_KEY);}catch{return null;}}
export function readLocal(storage = localStorage) {return storage.getItem(SAVE_KEY);}
export function downloadSave(save) {
    const blob=new Blob([JSON.stringify(save,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='魔法哈奇-冒险存档.json';a.hidden=true;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
