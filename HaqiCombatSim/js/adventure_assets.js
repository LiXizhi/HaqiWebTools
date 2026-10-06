import {cardsInHand} from './combat_unit_core.js';
import {performanceDiagnostics as perf} from './performance_diagnostics.js';
import {imageAlphaBoundsSteps} from './image_bounds_core.js';
import {createImageBoundsPreparation} from './image_bounds_preparation.js';
import {earthRules} from './adventure_earth_core.js';
import {warmSceneActors} from './adventure_actor_assets.js';
import {createMonsterArtRenderer} from './adventure_monster_art.js';
import {installModelPets} from './adventure_monster_pets_core.js';
import {loadHeroLibrary} from './hero_renderer.js';
import {createQuestJournalLoader} from './adventure_quest_journal.js';
import {installDungeonIndex} from './adventure_dungeons_core.js';
import {installIslandEncounters} from './adventure_island_encounters_core.js';
import {createDungeonLoader} from './adventure_dungeons.js';
import {createCityDungeonLoader} from './adventure_city_dungeons.js';
import {installNpcCatalog} from './adventure_npc_core.js';
import {createFishingLoader} from './adventure_fishing_loader.js';
import {installRuneCatalog} from './adventure_runes_core.js';
import {installNpcArt} from './adventure_npc_art_core.js';
import {loadEnvironmentArt} from './adventure_environment_art.js';
import { sceneryAtlases } from './adventure_scenery_core.js';
import { installExpansion } from './adventure_expansion_core.js';
import {validateIslandPacks,installIslandPackActors,installIslandPackEncounters,installIslandPackQuests,islandPackJournal} from './adventure_island_packs_core.js';
import { installMountCatalog } from './adventure_mounts_core.js';
// Browser IO for the self-contained adventure package.
import { validateSpellEffects } from './spell_effects_core.js';
import { validateAdventureContent } from './adventure_content_core.js';
import { assetMode, assetUrl, validateMediaManifest } from './adventure_media_core.js';
import { loadSkillArt } from './skill_art.js';
import { loadUiArt } from './adventure_ui_art.js';
export const SAVE_KEY = 'haqi.adventure.kids.v1';
import { createJsonReader } from './runtime_data.js';
const ESSENTIAL_SHEETS=new Set(['sprites']);
function loadImage(url) { return new Promise((resolve,reject)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>{if(i.decode)i.decode().then(()=>resolve(i),()=>resolve(i));else resolve(i);};i.onerror=()=>reject(new Error(`无法加载图片 ${url}`));i.src=url;}); }
export function registerLazyImage(lazyImages,id,entry,releaseImage){
    if(!id||!entry?.local?.endsWith('.webp')||!entry.cdn||new URL(entry.cdn).hostname!=='cdn.keepwork.com')throw Error('城市角色图集无效');
    const previous=lazyImages.get(id);
    // Earth and street manifests share resident atlases. Preserve the entry
    // identity checked by in-flight loads when both register the same image.
    if(previous&&previous.cdn===entry.cdn&&previous.local===entry.local&&previous.sha256===entry.sha256)return;
    if(previous)releaseImage(id);
    lazyImages.set(id,entry);
}
export async function loadResources(progress) {
    const downloads = new Map();
    const read = createJsonReader({ onProgress: event => {
        downloads.set(event.url, event);
        const rows = [...downloads.values()], active = rows.filter(row => !row.done);
        const loaded = rows.reduce((sum, row) => sum + row.loaded, 0);
        const total = active.every(row => row.total && row.loaded <= row.total)
            ? rows.reduce((sum, row) => sum + (row.done ? row.loaded : row.total), 0) : null;
        progress?.({ label: '正在下载游戏配置', detail: `${(loaded / 1048576).toFixed(2)} MB`, value: active.length && total ? loaded / total : null });
    } });
    const startupFiles = ["data/adventure/chapter.json", "data/adventure/combat.json", "data/adventure/assets.json", "data/adventure/media.json", "data/adventure/spell-effects.json", "data/adventure/pets.json", "data/adventure/shop-candidates.json", "data/kids/cards.json", "data/kids/charms.json", "data/kids/card_names.json", "data/adventure/island-encounters.json", "data/adventure/dungeon-index.json", "data/adventure/dungeon-journeys.json", "data/adventure/npc-catalog.json", "data/adventure/mount-catalog.json", "data/adventure/npc-art.json", "data/adventure/shop.json", "data/adventure/magic-star.json", "data/adventure/magic-star-art.json", "data/adventure/progression-bonuses.json", "data/adventure/fishing-items.json", "data/adventure/runes.json", "data/adventure/quest-runtime.json", "data/adventure/checkin.json", "data/adventure/gems.json", "data/adventure/currency-icons.json", "data/adventure/shop-icons.json", "data/adventure/monster-art.json"];
    const prepared=new Map();let startupCursor=0;
    for(const url of startupFiles){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});promise.catch(()=>{});prepared.set(url,{promise,resolve,reject});}
    const workerRead=async()=>{while(startupCursor<startupFiles.length){const url=startupFiles[startupCursor++],row=prepared.get(url);try{row.resolve(await read(url));}catch(error){row.reject(error);}}};
    for(let i=0;i<6;i++)void workerRead();
    const json=url=>prepared.has(url)?prepared.get(url).promise.then(value=>structuredClone(value)).finally(()=>prepared.delete(url)):read(url);
    progress?.({ label: '正在连接资源服务器', value: null });
    const [content,dataset,manifest,media,effects]=await Promise.all(['chapter','combat','assets','media','spell-effects'].map(n=>json(`data/adventure/${n}.json`)));
    validateAdventureContent(content,dataset,manifest);
    const packIndex=await json('data/adventure/island-packs/index.json');
    if(packIndex.version!==1)throw Error('岛屿扩展索引无效');
    const islandPacks=await Promise.all(packIndex.packs.filter(p=>p.enabled).map(p=>json(p.file)));
    const preparationRules=earthRules(content),imagePreparation=createImageBoundsPreparation({budgetMs:preparationRules.streamBuildBudgetMs,timeoutMs:preparationRules.requestTimeoutMs});
    const prepareBounds=(image,rect)=>imagePreparation.prepare(image,rect);
    content.worldMaps=Object.fromEntries(await Promise.all(Object.entries(content.worldMapIndex.islands).map(async([id,info])=>[id,await json(info.file)])));
    validateSpellEffects(effects,dataset.cards);
    const mode=assetMode(location.hostname,location.search);
    // Manifests only: island sheets and cards load when the current zone or UI needs them.
    const environmentReady=loadEnvironmentArt(mode,json).catch(error=>{console.warn('使用基础场景素材：',error.message);return null;});
    const buildingArtReady=loadEnvironmentArt(mode,json,'data/adventure/building-art.json').catch(error=>{console.warn('使用基础建筑素材：',error.message);return null;});
    const entranceArtReady=loadEnvironmentArt(mode,json,'data/adventure/entrance-art.json').catch(error=>{console.warn('使用基础副本入口：',error.message);return null;});
    const terrainDecorationsReady=loadEnvironmentArt(mode,json,'data/adventure/terrain-decoration-art.json').catch(error=>{console.warn('使用基础地表纹理：',error.message);return null;});
    const uiArtReady=loadUiArt(mode,json).catch(error=>console.warn('使用基础界面：',error.message));
    validateMediaManifest(media,manifest,mode);
    const images=new Map(),bounds=new Map(),failures=[],lazyImages=new Map(),imageLoading=new Map();
    const rows=Object.entries(media.entries).filter(([id,a])=>ESSENTIAL_SHEETS.has(id)&&a.local.endsWith('.webp'));
    for(const [id,a] of Object.entries(media.entries))if(!ESSENTIAL_SHEETS.has(id)&&a.local?.endsWith('.webp'))lazyImages.set(id,a);
    progress?.({ label: '正在加载场景基础图', value: null });
    const skillArt=await loadSkillArt(effects,mode,json);
    let cursor=0,done=0;
    const worker=async()=>{while(cursor<rows.length){const[id,a]=rows[cursor++];try{images.set(id,await loadImage(assetUrl(a,mode)+(mode==='local'?`?v=${a.sha256}`:'')));}catch(e){if(!a.optional)failures.push(e.message);}done++;progress?.({label:'正在加载场景图片',detail:`${done} / ${rows.length}`,value:done/rows.length});}};
    await Promise.all(Array.from({length:8},worker));
    if(failures.length)throw new Error(`冒险资源缺失，请重新准备资源后重试。${failures[0]}`);
    function getBounds(id,rect) {
        const steps=getBoundsSteps(id,rect);let result;do{result=steps.next();}while(!result.done);return result.value;
    }
    function* getBoundsSteps(id,rect,img=images.get(id)) {
        if(!img)return null;
        const cacheKey=id+JSON.stringify(rect||null);if(bounds.has(cacheKey))return bounds.get(cacheKey);
        const [sx,sy,sw,sh]=rect||[0,0,img.width,img.height];
        const c=document.createElement('canvas');c.width=Math.ceil(sw);c.height=Math.ceil(sh);const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,sx,sy,sw,sh,0,0,c.width,c.height);
        try{
            const started=performance.now(),data=ctx.getImageData(0,0,c.width,c.height).data;perf.record('earth-atlas-readback',performance.now()-started);yield;
            const value=yield* imageAlphaBoundsSteps(data,c.width,c.height,[sx,sy,sw,sh]);if(images.get(id)===img)bounds.set(cacheKey,value);return value;
        }finally{c.width=c.height=0;}
    }
    // Shared by lazy drawing and explicit scene preparation. Failed loads may be retried.
    function registerImage(id,entry){
        registerLazyImage(lazyImages,id,entry,releaseImage);
    }
    function releaseImage(id){
        lazyImages.delete(id);images.delete(id);imageLoading.delete(id);
        for(const key of bounds.keys())if(key.startsWith(id+'[')||key===id+'null')bounds.delete(key);
    }
    function ensureImage(id) {
        if(images.has(id))return Promise.resolve(images.get(id));
        if(!lazyImages.has(id))return Promise.reject(new Error(`角色图片未登记：${id}`));
        if(!imageLoading.has(id)){
            const entry=lazyImages.get(id),loading=loadImage(assetUrl(entry,mode)).then(async image=>{
                const world=content.earthWorld;
                await warmImageBounds(world||{},id,image);
                if(lazyImages.get(id)===entry)images.set(id,image);return image;
            });
            imageLoading.set(id,loading);
            loading.catch(()=>{if(imageLoading.get(id)===loading)imageLoading.delete(id);});
        }
        return imageLoading.get(id);
    }
    function draw(ctx,ref,x,y,w,h,trim=true,repaint=true) {
        const id=typeof ref==='string'?ref:ref?.id,img=images.get(id);
        if(!img){
            if(lazyImages.has(id)){
                const loading=ensureImage(id).catch(()=>null);
                if(repaint)loading.then(image=>{if(image&&ctx.canvas.isConnected){ctx.clearRect(x,y,w,h);draw(ctx,ref,x,y,w,h,trim);}});
            }
            return false;
        }
        const source=(typeof ref==='object'&&ref.crop)||null;
        const rect=trim?getBounds(id,source):(source||[0,0,img.width,img.height]);
        // Wide winged portraits opt into height fitting so the body matches other residents; wings may extend past the slot.
        const ratio=(typeof ref==='object'&&ref.fit==='height')?h/rect[3]:Math.min(w/rect[2],h/rect[3]),dw=rect[2]*ratio,dh=rect[3]*ratio;
        ctx.drawImage(img,...rect,x+(w-dw)/2,y+(h-dh)/2,dw,dh);return true;
    }
    let hero=null;
    function tileRect(sheet,index,img) {
        // Generated scenery is not aligned exactly to the legacy character grid.
        const art=media.entries[sheet],frame=art?.frames?.[index];
        if(frame)return frame;
        const row=Math.floor(index/4),ch=img.height/(sheet==='sprites'?4:2);
        const cuts=art?.rowCuts||(sheet==='sprites'?[0,323,650,929,1254].map(v=>v*img.height/1254):[0,ch,img.height]);
        return [(index%4)*img.width/4,cuts[row],img.width/4,cuts[row+1]-cuts[row]];
    }
    function tile(ctx,sheet,index,x,y,w,h) {
        if(hero&&sheet==='sprites'&&index>=8&&index<16)return hero.drawTile(ctx,index,x,y,w,h);
        const img=images.get(sheet)||media.entries[sheet];if(!img)return false;
        return draw(ctx,{id:sheet,crop:tileRect(sheet,index,img)},x,y,w,h,true);
    }
    if(typeof document!=='undefined')for(const sheet of ['sprites','creatures']){
        const img=images.get(sheet);if(!img)continue;
        const rows=sheet==='sprites'?4:2;
        for(let index=0;index<4*rows;index++)getBounds(sheet,tileRect(sheet,index,img));
    }
    const [catalog,candidates,kidsCards,kidsCharms,cardNames]=await Promise.all([json('data/adventure/pets.json'),json('data/adventure/shop-candidates.json'),json('data/kids/cards.json'),json('data/kids/charms.json'),json('data/kids/card_names.json')]);
    installExpansion(content,dataset,catalog,candidates,kidsCards,kidsCharms,cardNames);
    const islandEncounters=await json('data/adventure/island-encounters.json');
    installIslandEncounters(content,dataset,islandEncounters,kidsCards,cardNames);
    installIslandPackEncounters(content,dataset,islandPacks,islandEncounters.monsters,kidsCards,cardNames);
    const dungeonJson=createJsonReader({packed:false});
    const [dungeonIndex,dungeonJourneys]=await Promise.all([json('data/adventure/dungeon-index.json'),json('data/adventure/dungeon-journeys.json')]);
    content.dungeonJourneys={...dungeonJourneys,entries:[...dungeonJourneys.entries,...islandPacks.flatMap(p=>p.journeys)]};installDungeonIndex(content,dungeonIndex);
    const regularDungeons=createDungeonLoader({content,dataset,cards:kidsCards,names:cardNames,readJson:dungeonJson});
    const cityDungeons=createCityDungeonLoader({content,readJson:dungeonJson,registerImage});
    const dungeons={...regularDungeons,load:(id,options)=>id?.startsWith('city:')?cityDungeons.load(id,options):regularDungeons.load(id),prepareSaves:async saves=>{await cityDungeons.prepareSaves(saves);await regularDungeons.prepareSaves(saves);}};
    installNpcCatalog(content,await json('data/adventure/npc-catalog.json'));
    installMountCatalog(content,await json('data/adventure/mount-catalog.json'));
    for(const mount of content.mountCatalog.mounts)if(mount.art?.cdn)lazyImages.set(`mount:${mount.id}`,mount.art);
    for(const [id,art] of Object.entries(content.mountCatalog.sheets||{}))if(art?.cdn)lazyImages.set(`mount-sheet:${id}`,art);
    const npcArt=await json('data/adventure/npc-art.json');
    installNpcArt(content,npcArt);
    installIslandPackActors(content,islandPacks);
    for(const [id,entry] of Object.entries(npcArt.entries))lazyImages.set(id,entry);
    content.shopConfig=await json('data/adventure/shop.json');
    content.magicStar=await json('data/adventure/magic-star.json');
    content.magicStarArt=await json('data/adventure/magic-star-art.json');
    lazyImages.set('magic-star-companion',content.magicStarArt);
    content.progressionBonuses=await json('data/adventure/progression-bonuses.json');
    const {installDragonTotemItems}=await import('./adventure_progression_bonuses_core.js');
    installDragonTotemItems(content);
    const loadFishing=createFishingLoader(content,await json('data/adventure/fishing-items.json'),createJsonReader({packed:false}));
    installRuneCatalog(content,await json('data/adventure/runes.json'));
    const {installCatalogQuests}=await import('./adventure_catalog_quests_core.js');
    installCatalogQuests(content,await json('data/adventure/quest-runtime.json'));
    // Validate against the legacy content, before the new quest IDs are installed.
    validateIslandPacks(islandPacks,{...content,npcs:Object.fromEntries(Object.entries(content.npcs).filter(([,n])=>!n.instanceId?.startsWith('island-pack:'))),encounters:content.encounters.filter(e=>!e.id.startsWith('pack:'))});
    installIslandPackQuests(content,islandPacks);
    content.checkinConfig=await json('data/adventure/checkin.json');
    for(const [id,item] of Object.entries(content.checkinConfig.items))content.items[id]??=item;
    for(const [id,item] of Object.entries(content.progressionBonuses.giftItems||{}))content.items[id]??=item;
    content.gemCatalog=await json('data/adventure/gems.json');
    Object.assign(content.items,content.gemCatalog.items);
    for(const [id,entry] of Object.entries(content.strengtheningIcons||{}))lazyImages.set(id,entry);
    const currencyIcons=await json('data/adventure/currency-icons.json');
    for(const [id,entry] of Object.entries(currencyIcons.entries))lazyImages.set(id,entry);
    content.currencyIcons=currencyIcons.items;
    const shopIcons=await json('data/adventure/shop-icons.json');
    for(const [id,entry] of Object.entries(shopIcons.entries))lazyImages.set(id,entry);
    for(const [id,ref] of Object.entries(shopIcons.items))if(content.items[id]&&!content.items[id].art){content.items[id].art=ref;content.items[id].iconFallback=!!shopIcons.fallbacks[id];}
    progress?.({ label: '正在准备世界与角色资源', value: null });
    for(const [id,pet] of Object.entries(content.pets))if(pet.art)lazyImages.set('pet:'+id,pet.art);
    function drawPet(ctx,id,stage,x,y,w,h,column=0){const art=content.pets[id]?.art;if(!art)return false;const key='pet:'+id;if(!lazyImages.has(key))lazyImages.set(key,art);const img=images.get(key);if(!img){void ensureImage(key).catch(()=>{});return false;}if(art.static){ctx.drawImage(img,x,y,w,h);return true;}const sw=img.width/4,sh=img.height/4;ctx.drawImage(img,column*sw,stage*sh,sw,sh,x,y,w,h);return true;}
    const monsterArt=await json('data/adventure/monster-art.json');
    content.monsterArt=monsterArt;
    installModelPets(content,monsterArt,dataset.cards);
    for(const [id,pet] of Object.entries(content.pets))if(pet.staticAppearance&&pet.art)lazyImages.set('pet:'+id,pet.art);
    for(const [id,entry] of Object.entries(monsterArt.entries))lazyImages.set('monster:'+id,entry);
    const drawMonster=createMonsterArtRenderer(monsterArt,content,draw,drawPet);
    await uiArtReady;
    const environmentArt=await environmentReady;
    const buildingArt=await buildingArtReady;
    const entranceArt=await entranceArtReady;
    const terrainDecorationArt=await terrainDecorationsReady;
    async function warmScenery(world){
        const needed=sceneryAtlases(world);
        await Promise.all([
            world.landmarks?.some(o=>o.dungeonId)?entranceArt?.warm(['shared']):null,
            buildingArt?.warm(needed.building),
            environmentArt?.warm(needed.environment),
            terrainDecorationArt?.warm(needed.terrain),
        ]);
    }
    hero=await loadHeroLibrary(json,content.mountCatalog,{local:mode==='local',sprites:media.entries.sprites.legacyCharacterSource||media.entries.sprites,prepareBounds});
    function sceneryTile(ctx,index,x,y,w,h){
        return draw(ctx,{id:'sprites',crop:tileRect('sprites',index,media.entries.sprites)},x,y,w,h,true,false);
    }
    async function warmImageBounds(world,id,image){
        if(id.startsWith('pet:'))return; // Pet animation uses fixed cells and never trims alpha.
        const entry=lazyImages.get(id);
        const rects=id==='creatures'?Array.from({length:8},(_,i)=>tileRect(id,i,image)):[null];
        for(const rect of rects){const key=id+JSON.stringify(rect);if(bounds.has(key))continue;
            let value=await prepareBounds(image,rect);
            if(!value)value=await (world.earthScheduler||imagePreparation.scheduler).run(getBoundsSteps(id,rect,image),{valid:()=>lazyImages.get(id)===entry,name:'image-atlas-bounds'});
            if(value&&lazyImages.get(id)===entry)bounds.set(key,value);
        }
    }
    async function warmActors(world,save,socialActors=[]){
        const ids=await warmSceneActors({world,save,socialActors,content,monsterArt,hero,ensureImage});
        for(const id of ids){const image=images.get(id);if(image)await warmImageBounds(world,id,image);}
        return ids;
    }
    async function warmPortraitBounds(world,npcs){
        for(const npc of npcs){const ref=npc.portrait,id=typeof ref==='string'?ref:ref?.id,image=images.get(id);if(!image)continue;
            const key=id+JSON.stringify(ref?.crop||null);if(bounds.has(key))continue;
            const value=await prepareBounds(image,ref?.crop);if(images.get(id)!==image)continue;
            if(value)bounds.set(key,value);else await (world.earthScheduler||imagePreparation.scheduler).run(getBoundsSteps(id,ref?.crop),{valid:()=>images.get(id)===image,name:'image-atlas-bounds'});
        }
    }
    async function prepareEarthScene(world,save){
        const nearby={...world,npcs:(world.npcs||[]).filter(n=>Math.hypot(n.x-world.center.x,n.y-world.center.y)<1400),encounters:[]};
        try{await warmActors(nearby,save);await warmPortraitBounds(world,nearby.npcs);}catch{/* Failed art retains existing drawing fallbacks. */}
    }
    let warming=false;
    async function warmNearby(world,save){
        if(warming)return;warming=true;const warmStarted=performance.now();if(world.isEarth)perf.event('earth-warm-start');
        const near=rows=>[...(rows||[])].filter(row=>Math.hypot(row.x-save.position.x,row.y-save.position.y)<1000).sort((a,b)=>Math.hypot(a.x-save.position.x,a.y-save.position.y)-Math.hypot(b.x-save.position.x,b.y-save.position.y)).slice(0,10);
        const nearby={...world,npcs:near(world.npcs),encounters:near(world.encounters)};
        try{await warmActors(nearby,save);for(const npc of nearby.npcs){const ref=npc.portrait,id=typeof ref==='string'?ref:ref?.id;if(id&&images.has(id)){
            await warmPortraitBounds(world,[npc]);
        }}}catch{/* Drawing retains its retry/fallback path. */}finally{warming=false;if(world.isEarth)perf.event('earth-warm-end',{elapsed:performance.now()-warmStarted});}
    }
    let battleWarmVersion=0;
    async function warmBattle(battle){
        const version=++battleWarmVersion,keys=new Set(cardsInHand(battle.sides.near[0]).map(row=>row.key));
        for(const unit of [...battle.sides.near,...battle.sides.far])for(const entry of unit.deckSpec||[])if(keys.size<24)keys.add(entry.key);
        const rows=[...keys].map(key=>battle.resolved.cards[key]).filter(Boolean);
        for(let i=0;i<rows.length&&version===battleWarmVersion;i+=4)await skillArt.preload(rows.slice(i,i+4));
    }

    const loadLegacyJournal=createQuestJournalLoader(json);
    const loadQuestJournal=async()=>{const journal=await loadLegacyJournal();return {...journal,quests:[...journal.quests,...islandPackJournal(islandPacks)]};};
    return {registerImage,releaseImage,ensureImage,prepareEarthScene,warmNearby,warmBattle,warmActors,hero,sceneryTile,loadFishing,drawMonster,monsterArt,loadQuestJournal,dungeons,environmentArt,buildingArt,entranceArt,terrainDecorationArt,warmScenery,drawPet,content,dataset,previewCards:kidsCards,manifest,effects,images,draw,tile,getBounds,mode,media,skillArt,urlFor:id=>assetUrl(media.entries[id],mode)};
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
