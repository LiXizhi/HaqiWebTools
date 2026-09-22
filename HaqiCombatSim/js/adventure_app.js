import {createAutoSave} from './adventure_autosave.js';
import {dungeonFor,enterDungeon,leaveDungeon} from './adventure_dungeons_core.js';
import {renderDungeons} from './view_adventure_dungeons.js';
import {openOriginalImport} from './haqi_import.js';
import {persistReward} from './adventure_reward_persistence.js';
import { createMembershipClient } from './adventure_membership.js';
import { magicBeanExchangeQuote, exchangeMagicBeans } from './adventure_magic_bean_exchange_core.js';
import { rewardSnapshot, rewardChanges } from './adventure_reward_feedback_core.js';
import { createRewardFeedback } from './view_adventure_rewards.js';
import { TELEPORT_EFFECT_MS } from './view_adventure_teleport.js';
import { islandName, travelStatus } from './adventure_world_map_core.js';
import { initialStrengtheningSelection } from './adventure_strengthening_core.js';
import { castBlockedMessage } from './adventure_cast_feedback_core.js';
import { tickCheckin } from './adventure_checkin_core.js';
import { prepareDebugEdit } from './adventure_debug_core.js';
import { DEBUG_BACKUP_KEY, hasDebugBackup, storeDebugEdit, restoreDebugBackup } from './adventure_debug.js';
import { tickCare } from './adventure_pets_core.js';
// Browser controller: input, rendering, audio and persistence live outside the pure rules.
import { effectDuration } from './spell_effects_core.js';
import { createSpellSound } from './spell_sound.js';
import { HIT_DURATION_MS,castHitReactions } from './actor_animation_core.js';
import {presentedEnvironment} from './spell_environment_core.js';
import * as A from './adventure_core.js';
import {catalogAcceptBlock,catalogGoalRows,catalogQuestReady} from './adventure_catalog_quests_core.js';
import * as W from './adventure_world_core.js';
import * as P from './combat_pve_core.js';
import { cardsInHand, selectableCards, PET_CARD_SEQ_BASE } from './combat_unit_core.js';
import { validTargets } from './combat_arena_core.js';
import { resolveHandSwipe } from './adventure_hand_core.js';
import * as V from './view_adventure.js';
import { bindTouchMovement } from './view_adventure_movement.js';
import { loadResources,saveLocal,readLocal,localUpdatedAt,replaceLocalWithBackup,readBackup } from './adventure_assets.js';
import { createRenderer } from './adventure_renderer.js';
import { createCloudClient } from './adventure_cloud.js';
import { checkedProgress } from './adventure_cloud_core.js';
import { renderCloud } from './view_adventure_cloud.js';
import {renderMaps} from './view_adventure_maps.js';
import { regionAt } from './adventure_island_layout_core.js';
import { isOcean } from './adventure_fishing_core.js';
import { createRoleStore } from './adventure_roles.js';
import { MAX_ROLES } from './adventure_roles_core.js';
import { renderRoles } from './view_adventure_roles.js';
import { createCreationPreview, tutorialCards } from './adventure_creation_preview.js';

const $=id=>document.getElementById(id);
const nodes={world:$('world'),hud:$('hud'),entry:$('entry'),overlay:$('overlay'),battle:$('battle-layer'),toast:$('toast')};
let assets,renderer,save,world,battle,stage='loading',panel=null,dialog=null,dialogDone=null;
let selectedQuestId=null;
let dungeonLoading=null;
let teleportEffect=null;
let path=[],destination=null,moving=false,lastFrame=0,lastSave=0,toastTimer=0;
let selected=null,discarded=[],animation=null,music=null,storageWarning=false;
let petCardsOpen=false;
let runeCardsOpen=false;
let cloudClient;
let roleStore,roleStorage=null,roleEpoch=0,lastRoleSync=0;
const roles={busy:'',error:'',message:'',conflict:null};
let titleView='create',roleDraft=null,creationPreview=null;
const LAST_ACCOUNT_KEY='haqi.roles.last-account.v1';
const cloud={owner:null,busy:'',error:'',message:'',paths:[],preview:null};
const autoSave=createAutoSave({
    eligible:()=>['world','battle'].includes(stage)&&roleStore?.owner&&roleStore.dirty&&!roles.busy&&!cloud.busy&&!roles.conflict,
    save:async()=>{roles.busy='正在自动保存…';try{persist();if(storageWarning)throw Error('本地存档失败，云端同步已暂停');await syncRoles();cloud.error='';}finally{roles.busy='';}},
    onError:error=>{if(cloud.error!==error.message)toast('云存档暂未完成，本地进度已保留，将自动重试。');cloud.error=error.message;},
});
function queueCloudSave(){autoSave.request();}
setInterval(()=>void autoSave.tick(),15000);

const membership=createMembershipClient({onChange:()=>{if(!assets||!save)return;if(stage==='world'&&!save.pendingEncounter)maybeExchangeMagicBeans();if(stage==='world'){paintHud();if(['shop','membership','checkin'].includes(panel))paintPanel();}}});
let buyingVip=false;
const membershipView={tab:'attributes'};
const refreshMembership=()=>membership.refresh().catch(error=>toast(error.message));
const keys=new Set();
const spellSound=createSpellSound({defaultEnabled:true});
document.addEventListener('pointerdown',()=>spellSound.unlock());
document.addEventListener('keydown',()=>spellSound.unlock());
async function toggleSound(){const requested=!spellSound.enabled,ok=await spellSound.setEnabled(requested);if(requested&&!ok)toast('浏览器暂时无法启用音效，请重试。');paintPanel();if(stage==='battle')paintBattle();}
let lastCare=0;
let joystick={x:0,y:0},heldPointer=null;
function resetMovementInput(){keys.clear();joystick={x:0,y:0};heldPointer=null;touchMovement.reset();}
const touchIndicator=V.el('div','touch-joystick floating-joystick active',V.el('span','joystick-stick'));
touchIndicator.hidden=true;touchIndicator.setAttribute('aria-hidden','true');nodes.world.parentElement.append(touchIndicator);
const fishingView={netId:null,message:''};
const touchMovement=bindTouchMovement(nodes.world,touchIndicator,{enabled:()=>stage==='world'&&!panel&&!dialog,steer:(x,y)=>{joystick={x,y};path=[];destination=null;heldPointer=null;},zoom:factor=>renderer?.zoomBy(factor),tap:(x,y)=>clickWorld(x,y)});
const shopView={category:'pet',query:'',school:'',slot:'',ownership:'',page:0},petView={selected:null};
const equipmentView={tab:'gear',slot:0,item:null,query:''};
const gemView={guid:null,gemId:null,runes:[null,null,null],runeIndex:0,step:'equipment',filter:0,page:0,mode:'mount',removeIds:[],message:'',confirm:false};
const strengtheningView={guid:null,filter:0,page:0,pending:false,message:''};
let serviceNpc=null;
const npcServiceView={query:'',page:0};
const model=()=>({assets,save,dungeonLoading,serviceNpc,npcServiceView,fishingView,membership:membership.state,membershipView,magicBeanExchange:roleStore?.catalog?.magicBeanExchange||null,now:Date.now(),storageWarning,battle,selected,discarded,hand:animation?.hand,presentation:animation?{hp:animation.hp}:null,animating:!!animation,equipmentView,strengtheningView,gemView,shopView,petView,debugBackup:roleStorage&&hasDebugBackup(roleStorage),soundEnabled:spellSound.enabled});
const rewardRoot=V.el('div','reward-feedback');nodes.world.parentElement.append(rewardRoot);
const rewardFeedback=createRewardFeedback(rewardRoot,{
    describe:reward=>{
        const item=assets.content.items[reward.id];
        const info={name:reward.kind==='card'?(assets.dataset.cards[reward.key]?.name||reward.name):reward.name,label:reward.kind==='card'?'立即配卡':reward.gear?'立即穿上':reward.kind==='pet'?'查看伙伴':'查看背包'};
        if(reward.gear)info.reason=A.equipmentBlockReason(save,item,assets.content);
        if(item?.art){const art=V.el('canvas');art.width=128;art.height=128;try{assets.draw(art.getContext('2d'),item.art,0,0,128,128);info.art=art;}catch{ /* Text remains usable when art fails. */ }}
        return info;
    },
    activate:reward=>{
        if(stage!=='world'||panel||dialog)return false;
        if(reward.gear)return action({type:'equip',itemId:reward.id});
        openPanel(reward.kind==='card'?'deck':reward.kind==='pet'?'pet':'inventory');
    },
});
function showRewards(before){
    const event=rewardChanges(before,save,assets.content);
    queueCloudSave();
    for(const item of event.items)if(item.kind==='card')item.name=assets.dataset.cards[item.key]?.name||item.name;
    rewardFeedback.push(event);
}
function toast(message) {nodes.toast.textContent=message;nodes.toast.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>nodes.toast.classList.remove('visible'),4200);}
function safely(fn) {try{return fn();}catch(e){toast(e.message);return false;}}
function persist() {
    if(!save||stage==='title')return;
    try {if(!roleStorage)throw Error('尚未选择角色');saveLocal(save,roleStorage);storageWarning=false;}catch {if(!storageWarning)toast('进度未能保存，可能是其他页面已更新。请勿关闭页面，检查存储后重试。');storageWarning=true;}
    const indicator=document.querySelector('.save-indicator');if(indicator){indicator.textContent=storageWarning?'存档未保存':'';indicator.hidden=!storageWarning;}
    lastSave=performance.now();
}
function close() {nodes.overlay.disposeDialogue?.();panel=null;dialog=null;dialogDone=null;nodes.overlay.replaceChildren();nodes.overlay.className='overlay';resetMovementInput();nodes.world.focus({preventScroll:true});}
function paintHud() {resetMovementInput();V.renderHud(nodes.hud,model(),{panel:openPanel,membership:()=>openPanel('membership'),cloud:openCloud,track,untrack,interact:interactNearest});}
function paintPanel() {
    if(['map','worldmap','localmap'].includes(panel)&&world.layout){renderMaps(nodes.overlay,world,model(),{close,track,travel,draw:(canvas,options)=>renderer.minimap(canvas,world,save,options),teleport:teleportToLandmark,switchMap:view=>openPanel(view==='world'?'worldmap':'map')},panel==='worldmap'?'world':'local');return;}
    if(panel==='cloud'){paintCloud();return;}
    if(panel==='dungeons'){renderDungeons(nodes.overlay,model(),{close,enter:loadAndEnterDungeon,leave:exitDungeon});return;}
    if(!panel)return;
    const equipment=['equipment','inventory','shop','pet'].includes(panel);
    const scroll=equipment?nodes.overlay.querySelector('.modal-body')?.scrollTop||0:0;
    const focusLabel=equipment&&nodes.overlay.contains(document.activeElement)?document.activeElement.getAttribute('aria-label')||document.activeElement.textContent:null;
    V.renderPanel(nodes.overlay,panel,{...model(),selectedQuestId},{close,action,track,travel,refresh:paintPanel,encounter:id=>interact({kind:'encounter',id}),panel:openPanel,applyDebug,restoreDebug,cloud:openCloud,music:toggleMusic,sound:toggleSound,title:()=>showTitle(),roles:()=>showTitle(true),refreshMembership,becomeVip:()=>membership.openProfile().catch(error=>toast(error.message))});
    if(equipment){
        nodes.overlay.querySelector('.modal-body').scrollTop=scroll;
        if(focusLabel){
            const buttons=[...nodes.overlay.querySelectorAll('button')];
            (buttons.find(b=>(b.getAttribute('aria-label')||b.textContent)===focusLabel)||nodes.overlay.querySelector('.equipment-detail button:not(:disabled)'))?.focus({preventScroll:true});
        }
    }
}
function openPanel(kind,options={}) {
    if(stage!=='world')return;
    close();path=[];destination=null;panel=kind;
    if(kind==='npc-services'){serviceNpc=options.npc;Object.assign(npcServiceView,{query:'',page:0,kind:'',category:''});}
    if(kind==='quests')selectedQuestId=options.questId??A.currentQuest(save,assets.content)?.id??assets.content.quests.at(-1)?.id;
    if(kind==='gems')Object.assign(gemView,{guid:options.guid||null,gemId:null,runes:[null,null,null],runeIndex:0,step:options.guid?'gems':'equipment',filter:0,page:0,mode:'mount',removeIds:[],message:'',confirm:false});
    if(kind==='upgrade')Object.assign(strengtheningView,{guid:initialStrengtheningSelection(save,assets.content,options.itemId,options.guid),filter:0,page:0,pending:false,message:'',offsetX:0,offsetY:0});
    if(['equipment','inventory'].includes(kind)){equipmentView.tab='gear';equipmentView.slot=0;equipmentView.query='';equipmentView.item=null;equipmentView.guid=null;}
    paintPanel();
    if(['shop','membership','checkin'].includes(kind))refreshMembership();
}
function applyDebug(patch) {safely(()=>{
    if(stage!=='world')throw Error('请先完成当前战斗');
    const result=prepareDebugEdit(save,assets.content,patch);
    if(!result.changes.length)return;
    storeDebugEdit(save,result.save,roleStorage);
    save=result.save;queueCloudSave();paintHud();paintPanel();toast('调试属性已保存，修改前的备份已保留。');
});}
async function restoreDebug() {
    const target=roleStorage,current=save,epoch=roleEpoch;
    try{
        if(stage!=='world')throw Error('请先完成当前战斗');
        const raw=target.getItem(DEBUG_BACKUP_KEY),localRaw=readLocal(target);
        if(!raw)throw Error('没有可恢复的调试备份');
        await assets.dungeons.prepareSaves([JSON.parse(raw)]);
        if(target!==roleStorage||save!==current||epoch!==roleEpoch||stage!=='world'||readLocal(target)!==localRaw||target.getItem(DEBUG_BACKUP_KEY)!==raw)throw Error('角色进度已变化，请重试');
        const restored=restoreDebugBackup(save,assets.content,target);
        enterWorld(restored);openPanel('debug');toast('已恢复上次调试修改前的存档。');
    }catch(error){toast(error.message);}
}
function cloudLocal() {if(stage!=='title')return save;try{const raw=roleStorage&&readLocal(roleStorage);return raw?A.parseSave(raw,assets.content):null;}catch{return null;}}
function openCloud() {persist();close();path=[];destination=null;if(!cloud.busy){cloud.preview=null;cloud.error='';cloud.message=cloud.owner?'请选择一份记录查看，或保存当前旅程。':'';}panel='cloud';paintCloud();}
function paintCloud() {
    if(panel!=='cloud')return;
    renderCloud(nodes.overlay,{...cloud,local:cloudLocal(),localUpdatedAt:roleStorage&&localUpdatedAt(roleStorage),hasBackup:roleStorage&&!!readBackup(roleStorage)},{close,
        connect:()=>{showTitle(true);if(stage==='title')connectRoles();},
        logout:()=>changeCloudAccount(false),switchAccount:()=>changeCloudAccount(true),
        refresh:()=>cloudAction('正在读取云端目录…',async()=>{cloud.paths=await cloudClient.list();cloud.message=cloud.paths.length?'云端目录已刷新。':'未找到云端记录，可刷新重试。';}),
        upload:()=>cloudAction('正在保存并核验云端进度…',async()=>{const current=cloudLocal();if(!current)throw new Error('请先开始一段冒险。');const result=await cloudClient.upload(current);cloud.paths=[result.path,...cloud.paths.filter(p=>p!==result.path)].sort().reverse().slice(0,30);cloud.message='已保存到云端，并核验远端内容。';}),
        preview:path=>cloudAction('正在校验存档与战斗记录…',async()=>{if(!roleStorage)throw Error('请先新建或选择一个角色。');const target=roleStorage,localRaw=readLocal(target);const preview=await cloudClient.read(path);if(roleStorage!==target||readLocal(target)!==localRaw)throw new Error('本地进度已变化，请重新查看这份记录。');cloud.preview={...preview,localRaw};cloud.message='请比较两份进度，确认后恢复。';}),
        cancelPreview:()=>{cloud.preview=null;paintCloud();},restore:()=>safely(()=>{
            cloudClient.assertPreview(cloud.preview);
            const restored=checkedProgress(cloud.preview.save,assets.content,assets.dataset);
            replaceLocalWithBackup(restored.save,roleStorage,cloud.preview.localRaw);cloud.preview=null;
            enterWorld(restored.save,restored.battle);toast('云端进度已恢复。原本地进度已保留为备份。');
        }),backup:()=>cloudAction('正在加载备份…',async()=>{const target=roleStorage,raw=readBackup(target),localRaw=readLocal(target);await assets.dungeons.prepareSaves([JSON.parse(raw)]);if(roleStorage!==target||readLocal(target)!==localRaw)throw Error('角色进度已变化，请重试');const restored=checkedProgress(raw,assets.content,assets.dataset);replaceLocalWithBackup(restored.save,target,localRaw);enterWorld(restored.save,restored.battle);toast('已恢复本地备份。');}),
    });
}
async function cloudAction(label,fn) {
    if(cloud.busy||roles.busy)return;
    cloud.busy=label;cloud.error='';cloud.message='';cloud.preview=null;paintCloud();
    try{await fn();}catch(e){cloud.error=e.message;}finally{cloud.busy='';cloud.owner=cloudClient.owner;paintCloud();}
}
async function changeCloudAccount(reconnect) {
    if(cloud.busy||roles.busy)return;
    showTitle(true);if(stage!=='title')return;
    let disconnected=false;
    await roleOperation('正在退出账号…',async()=>{
        let pending=false;try{await syncRoles();}catch{pending=true;}
        await cloudClient.disconnect();resetRoleAccount();localStorage.removeItem(LAST_ACCOUNT_KEY);
        disconnected=true;
        roles.message=pending?'已退出账号。未同步进度保留在原账号的本机缓存。':'已退出账号，本地进度已保留。';
    });
    if(reconnect&&disconnected)await connectRoles();
}
function action(value) {
    const product=value.type==='buy'&&assets.content.shop.find(item=>item.id===value.productId);
    if(!product?.vipOnly&&value.type!=='magic-star-claim'&&!(value.type==='checkin'&&value.bonus===true))return performAction(value);
    return buyVipProduct(value);
}
async function buyVipProduct(value) {
    if(buyingVip)return false;
    buyingVip=true;const target=save,epoch=roleEpoch;
    try {
        const status=await membership.refresh();
        if(target!==save||epoch!==roleEpoch||stage!=='world')throw Error('角色或游戏状态已变化，请重新操作。');
        if(status.status==='guest')throw Error('请先登录会员账号，再使用会员权益。');
        return performAction(value,{keepworkVip:status.isVip,expiresAt:status.expiresAt,now:Date.now()});
    }catch(error){toast(error.message);return false;}finally{buyingVip=false;}
}
function performAction(value,access={}) {return safely(()=>{const before=rewardSnapshot(save);const request=value.type==='checkin'?{...value,now:Date.now()}:value;let result;if(['npc-purchase','checkin','magic-star-claim','choose-totem','use-totem-item','fish','stamina-potion'].includes(value.type)){const committed=persistReward(save,assets.content,request,access,roleStorage);save=committed.save;result=committed.result;storageWarning=false;}else{result=A.applyAction(save,assets.content,request,access);persist();}if(value.type==='fish'||value.type==='stamina-potion'){fishingView.message=result?.message||'';fishingView.netId=value.netId||fishingView.netId;}showRewards(before);queueCloudSave();paintHud();paintPanel();const text={checkin:'领取成功，奖励已放入背包！',unequip:'装备已卸下，属性与配卡已更新。',equip:'已经装备。属性将在下一场战斗中生效。',upgrade:'装备强化成功！',hatch:'咕噜噜从蛋里探出了头，开始跟随你。',feed:'咕噜噜吃饱了，获得了经验！',deck:'卡包已保存。'};toast(result?.message||text[value.type]||'进度已保存');return result?.message?result:true;});}
let exchangingBeans=false;
function maybeExchangeMagicBeans({announce=true}={}) {
    if(exchangingBeans||!assets||!save||!roleStore?.owner||save.pendingEncounter)return;
    const member=membership.state;
    if(member.status!=='ready'||member.username!==roleStore.owner||member.isVip!==true)return;
    const now=Date.now(),record=roleStore.catalog.magicBeanExchange||null,owner=roleStore.owner,id=roleStore.catalog.activeId,epoch=roleEpoch;
    let quote;
    try{quote=magicBeanExchangeQuote(member,record,now);}catch(error){toast(error.message);return;}
    if(!quote.beans||roleStore.owner!==owner||roleStore.catalog.activeId!==id||roleEpoch!==epoch)return;
    exchangingBeans=true;
    try{
        const before=rewardSnapshot(save),next=structuredClone(save);
        exchangeMagicBeans(next,assets.content,member,record,now);
        save=roleStore.commitMagicBeanExchange(next,quote.until);
        storageWarning=false;
        toast(`会员剩余 ${quote.days} 天已兑换为 ${quote.beans} 魔豆`);
        if(announce)showRewards(before);
        paintHud();
        if(panel)paintPanel();
    }catch(error){toast(error.message);}finally{exchangingBeans=false;}
}
function enterWorld(newSave,restoredBattle=null,{announceBeans=true}={}) {
    teleportEffect=null;
    rewardFeedback.reset();
    petCardsOpen=false;
    runeCardsOpen=false;
    creationPreview?.stop();
    save=newSave;if(assets.content.pets)tickCare(save,assets.content,A.playerSpec(save,assets.content),Date.now(),false);world=W.createWorld(save.zone,assets.content,save);stage='world';path=[];destination=null;animation=null;close();
    if(!W.walkable(world,save.position.x,save.position.y))save.position={...world.center};
    nodes.entry.replaceChildren();nodes.entry.className='';nodes.entry.hidden=true;nodes.hud.hidden=false;
    nodes.battle.disposeHandGesture?.();nodes.battle.replaceChildren();nodes.battle.className='battle-layer';battle=null;paintHud();
    if(save.pendingEncounter){battle=restoredBattle||P.restorePveBattle(assets.dataset,assets.content,save.pendingEncounter);stage='battle';nodes.hud.hidden=true;paintBattle();}
    else maybeExchangeMagicBeans({announce:announceBeans});
    persist();queueCloudSave();updateMusic();
}
function showTitle(manage=false) {
    spellSound.stop();
    persist();if(storageWarning&&stage!=='title'){toast('当前进度尚未保存，请勿关闭页面。请检查浏览器存储或重试。');return;}close();rewardFeedback.reset();stage='title';keys.clear();path=[];destination=null;animation=null;battle=null;
    music?.pause();nodes.hud.hidden=true;nodes.battle.disposeHandGesture?.();nodes.battle.replaceChildren();nodes.battle.className='battle-layer';nodes.entry.hidden=false;
    save=roleStore.catalog.roles.find(row=>row.id===roleStore.catalog.activeId)?.save||A.createAdventure(assets.content);
    world=W.createWorld(save.zone,assets.content,save);
    if(manage!==true&&roleStore.catalog.roles.length===1&&!roles.busy&&!roles.conflict){
        try{activateRole(roleStore.catalog.roles[0].id);return;}catch(error){roles.error=error.message;}
    }
    titleView=roleStore.catalog.roles.length?'roles':'create';
    if(titleView==='create')roleDraft=null;paintTitle();
}
function paintTitle() {
    if(stage!=='title')return;
    if(roles.conflict)titleView='roles';
    if(titleView==='create')paintCreation();else paintRoles();
}
function paintRoles() {
    if(stage!=='title')return;
    creationPreview?.stop();
    renderRoles(nodes.entry,assets,{...roles,owner:roleStore.owner,catalog:roleStore.catalog,dirty:roleStore.dirty},{
        select:id=>roleOperation('正在进入角色…',async()=>{activateRole(id);await syncRoles();}),
        create:newRoleForm,login:openCloud,logout:()=>roleOperation('正在退出…',async()=>{
            let pending=false;try{await syncRoles();}catch{pending=true;}
            await cloudClient.disconnect();resetRoleAccount();localStorage.removeItem(LAST_ACCOUNT_KEY);
            if(pending)roles.message='已退出账号。未同步进度仍保留在该账号的本机缓存，下次登录可继续。';
        }),
        sync:()=>roleOperation('正在保存并核验角色…',syncRoles),
        refresh:()=>roleOperation('正在读取角色…',async()=>{await reconcileRoles(await cloudClient.roles());}),
        useRemote:()=>roleOperation('正在备份并加载云端…',async()=>{
            if(!roles.conflict)return;
            localStorage.setItem(`haqi.roles.conflict.${encodeURIComponent(roleStore.owner)}.${Date.now()}`,JSON.stringify(roleStore.catalog));
            roleStore.replace(roles.conflict.catalog,roles.conflict.revision);roles.conflict=null;roleStorage=roleStore.catalog.activeId?roleStore.scoped():null;
            roles.message='已加载云端角色，本地进度已备份。';
        }),
        importOriginal:beginOriginalImport,
    });
}
async function roleOperation(label,fn) {
    if(roles.busy||cloud.busy)return;
    roles.busy=label;roles.error='';roles.message='';paintTitle();
    try{await fn();}catch(e){roles.error=e.message;toast(e.message);}finally{roles.busy='';paintTitle();}
}
function activateRole(id) {
    const row=roleStore.catalog.roles.find(row=>row.id===id);
    if(!row)throw Error('角色不存在');
    const restored=checkedProgress(row.save,assets.content,assets.dataset);
    autoSave.reset();roleStore.select(id);roleStorage=roleStore.scoped();
    selected=null;discarded=[];shopView.page=0;petView.selected=null;
    enterWorld(restored.save,restored.battle);
}
function beginOriginalImport() {
    if(roles.busy||roles.conflict||cloud.busy)return;
    if(roleStore.catalog.roles.length>=MAX_ROLES){toast('最多可创建5个主角。');return;}
    creationPreview?.stop();
    const epoch=roleEpoch,owner=roleStore.owner;
    openOriginalImport({root:nodes.entry,overlay:nodes.overlay,assets,
        isCurrent:()=>stage==='title'&&epoch===roleEpoch&&owner===roleStore.owner&&!roles.conflict,
        commit:(imported,sourceOwner)=>{
            if(owner&&owner!==sourceOwner)throw Error('当前角色账号与原服账号不同，请切换账号后重试。');
            roleStore.create(imported);titleView='roles';toast('角色已导入并保存在本机，可从角色列表进入。');
        },onClose:()=>paintTitle()});
}
function newRoleForm() {
    if(roles.busy)return;
    if(roleStore.catalog.roles.length>=MAX_ROLES){toast('最多可创建5个主角。');return;}
    titleView='create';roleDraft=null;paintCreation();
}
function paintCreation() {
    creationPreview?.stop();
    roleDraft||={name:'小哈奇',school:'fire',appearance:'boy',starter:'dragon_green',step:1};
    V.renderEntry(nodes.entry,assets,null,{
        draft:roleDraft,busy:roles.busy,owner:roleStore.owner,
        roles:roleStore.catalog.roles.length?()=>{titleView='roles';paintRoles();}:null,
        login:openCloud,cloud:openCloud,
        importOriginal:beginOriginalImport,
        previewChoices:school=>tutorialCards(assets,school),
        preview:(...args)=>creationPreview.play(...args),stopPreview:()=>creationPreview.stop(),pausePreview:()=>creationPreview.togglePause(),
        create:options=>roleOperation('正在创建角色…',async()=>{
            if(roleStore.owner){await reconcileRoles(await cloudClient.roles());if(roles.conflict)throw Error('请先处理角色云端冲突，再新建角色。');}
            const next=A.createAdventure(assets.content,{...options,seed:Date.now()});
            const id=roleStore.create(next);activateRole(id);await syncRoles();
        })
    },roles.error);
}
async function syncRoles() {
    if(!roleStore.owner||!roleStore.dirty)return;
    if(roles.conflict)throw Error('角色有云端冲突，本地进度已保留。请在角色列表处理。');
    const epoch=roleEpoch,captured=roleStore.checkpoint(),owner=roleStore.owner;
    const revision=await cloudClient.saveRoles(JSON.parse(captured),roleStore.base);
    if(epoch!==roleEpoch||owner!==roleStore.owner)throw Error('账号已切换，请重新连接。');
    roleStore.markSynced(revision,captured);lastRoleSync=performance.now();roles.message='角色已保存到云端并核验。';
}
async function reconcileRoles(remote) {
    const epoch=roleEpoch;
    if(remote.owner!==roleStore.owner||remote.owner!==cloudClient.owner)throw Error('账号已变化，请重新登录。');
    if(roleStore.dirty&&roleStore.base!==remote.revision){roles.conflict=remote;roles.error='另一台设备更新了角色，本地进度尚未上传，请选择备份后加载云端。';return;}
    if(!roleStore.dirty&&roleStore.base&&roleStore.base!==remote.revision&&!await cloudClient.roleAncestor(roleStore.base,remote.revision)){
        if(epoch!==roleEpoch)throw Error('账号已变化，请重新登录。');
        roles.conflict=remote;roles.error='检测到不同设备的角色分支，请先备份本地角色再加载云端。';return;
    }
    if(epoch!==roleEpoch)throw Error('账号已变化，请重新登录。');
    if(!roleStore.dirty)roleStore.replace(remote.catalog,remote.revision);
    roleStorage=roleStore.catalog.activeId?roleStore.scoped():null;roles.conflict=null;
}
function connectRoles(interactive=true) {
    return roleOperation('正在登录并读取角色…',async()=>{
        const owner=await cloudClient.connect({interactive});
        cloud.owner=owner;cloud.preview=null;cloud.paths=[];
        refreshMembership();
        const remote=await cloudClient.roles();
        await roleStore.prepareOpen(owner);
        roleEpoch++;roleStore.open(owner);roleStorage=null;cloud.owner=owner;cloud.preview=null;cloud.paths=[];
        localStorage.setItem(LAST_ACCOUNT_KEY,owner);
        await reconcileRoles(remote);
        if(roles.conflict)return;
        if(roleStore.catalog.activeId){activateRole(roleStore.catalog.activeId);await syncRoles();}
        else {titleView='create';roleDraft=null;}
    });
}
function resetRoleAccount() {
    // Persist against the old scope before changing identity. Never assign an
    // account's active save to the guest namespace on logout/auth expiration.
    persist();autoSave.reset();roleEpoch++;roleStore.open(null);roleStorage=roleStore.catalog.activeId?roleStore.scoped():null;
    roles.conflict=null;roles.message='当前为访客角色。';cloud.owner=null;cloud.paths=[];cloud.preview=null;
    stage='title';showTitle();
}
function updateMusic() {
    if(!assets||!save)return;
    if(!music){music=new Audio(assets.urlFor(assets.content.extras.music.id));music.loop=true;music.volume=.24;music.onerror=()=>{if(save.music)toast('背景音乐暂时不可用，可以继续游玩。');};}
    if(save.music&&stage!=='title')music.play().catch(()=>{if(music.error)toast('背景音乐暂时不可用，可以继续游玩。');});else music.pause();
}
function toggleMusic(){save.music=!save.music;persist();updateMusic();paintPanel();}
function showTeleportEffect(){
    resetMovementInput();path=[];destination=null;moving=false;
    teleportEffect={...save.position,started:performance.now()};
}
function teleportToLandmark(id){safely(()=>{
    if(stage!=='world'||save.pendingEncounter)throw Error('请先完成当前战斗');
    const target=world.landmarks.find(mark=>mark.id===id);
    if(!target||!W.walkable(world,target.x,target.y))throw Error('此地点暂时无法抵达');
    close();path=[];destination=null;save.position={x:target.x,y:target.y};save.revision++;persist();paintHud();showTeleportEffect();
});}
async function loadAndEnterDungeon(id,restart=false){
    if(dungeonLoading||stage!=='world')return;
    if(restart&&!confirm('重新开启会重置该副本的清怪进度，确定继续吗？'))return;
    const target=save,epoch=roleEpoch,zone=save.zone;
    dungeonLoading=id;paintPanel();
    try{
        await assets.dungeons.load(id);
        if(save!==target||epoch!==roleEpoch||stage!=='world'||panel!=='dungeons'||save.zone!==zone)return;
        enterDungeon(save,assets.content,id,{restart});enterWorld(save);queueCloudSave();
    }catch(error){toast('副本加载失败：'+error.message+'，请重试。');}
    finally{dungeonLoading=null;if(panel==='dungeons')paintPanel();}
}
function exitDungeon(){safely(()=>{leaveDungeon(save,assets.content);enterWorld(save);queueCloudSave();});}
function travel(zone){safely(()=>{
    const status=travelStatus(save,assets.content,zone);
    if(status.allowed&&status.requiresConfirmation&&!window.confirm('那里很危险，确定还要前往吗？'))return;
    if(dungeonFor(assets.content,save.zone))leaveDungeon(save,assets.content);
    A.applyAction(save,assets.content,{type:'travel',zone});enterWorld(save);showTeleportEffect();toast(`已抵达${islandName(zone)}。`);
});}
function paintDialogue(){if(dialog)V.renderDialogue(nodes.overlay,model(),dialog,{close,next:nextDialogue,startQuest:q=>startLines(q.startDialog,'接取任务',()=>{
    A.applyAction(save,assets.content,{type:'accept',questId:q.id,npcId:q.startNpc});toast(`已接取：${q.title}`);
}),finishQuest:q=>startLines(q.endDialog,'领取奖励',()=>{
    const before=rewardSnapshot(save);
    A.applyAction(save,assets.content,{type:'claim',questId:q.id,npcId:q.endNpc});
    showRewards(before);return 'reward';
}),startCatalog:q=>{
    A.applyAction(save,assets.content,{type:'accept-catalog',questId:q.id,npcId:q.startNpc});persist();toast(`已接取：${q.title}`);paintDialogue();paintHud();
},finishCatalog:q=>{
    const before=rewardSnapshot(save);
    A.applyAction(save,assets.content,{type:'claim-catalog',questId:q.id,npcId:q.endNpc});
    persist();showRewards(before);toast(`已完成：${q.title}`);close();paintHud();
},questTalk:(q,talk)=>startQuestTalk(talk),panel:openPanel,travel,track});}
function startQuestTalk(talk) {
    startLines(talk.dialog,'谢谢你，我知道了',()=>{
        A.applyAction(save,assets.content,{type:'talk',npcId:talk.npcId});
        return true;
    });
}
function startLines(lines,finishLabel,done) {
    dialog.lines=lines;dialog.index=0;dialog.finishLabel=finishLabel;dialogDone=done;
    if(!lines.length)nextDialogue();else paintDialogue();
}
function nextDialogue() {
    if(!dialog)return;
    if(dialog.index+1<dialog.lines.length){dialog.index++;paintDialogue();return;}
    safely(()=>{
        const npcId=dialog.npcId,advance=dialogDone?.();dialogDone=null;persist();queueCloudSave();paintHud();
        if(advance){
            close();
            if(advance==='reward')return;
            const q=A.currentQuest(save,assets.content),goal=q&&A.questProgress(save,q).find(g=>g.value<g.count);
            if(q&&(A.questReady(save,q)||goal?.kind==='talk'))track();
            return;
        }
        dialog={npcId};paintDialogue();
    });
}
function interact(target) {
    if(stage!=='world'||!target)return;
    path=[];destination=null;keys.clear();persist();
    if(target.kind==='npc'){
        if(target.id===36205||target.name==='法斯特船长'){openPanel('worldmap');return;}
        close();dialog={npcId:target.id,npc:target};
        const talk=target.questDialogue&&A.pendingQuestTalk(save,A.currentQuest(save,assets.content),target.id);
        if(talk)startQuestTalk(talk);else paintDialogue();
    }
    if(target.kind==='portal'&&(target.id===world.entrancePortal?.id||!world.portal.hidden)){if(dungeonFor(assets.content,save.zone))exitDungeon();else openPanel('worldmap');}
    if(target.kind==='landmark')toast(`${target.name}：${target.description}`);
    if(target.kind==='encounter')safely(()=>{
        A.beginEncounter(save,assets.content,target.id,{keepworkVip:membership.state.isVip,expiresAt:membership.state.expiresAt,now:Date.now()});persist();
        battle=P.restorePveBattle(assets.dataset,assets.content,save.pendingEncounter);stage='battle';close();nodes.hud.hidden=true;
        selected=null;discarded=[];animation=null;petCardsOpen=false;runeCardsOpen=false;paintBattle();
    });
}
function interactNearest(){if(!panel&&!dialog)interact(W.nearestInteraction(world,save.position));}
function walkTo(target,autoInteract=false) {
    close();path=W.findPath(world,save.position,target);destination=autoInteract?target:null;
    if(autoInteract&&W.distance(save.position,target)<85){interact(target);return;}
    if(!path.length)toast('这里暂时走不过去，试试旁边的小路。');
}
function untrack(){safely(()=>{A.applyAction(save,assets.content,{type:'track-catalog',questId:null});paintHud();});}
function trackCatalog(id) {
    const c=assets.content,quest=c.catalogQuests.byId[id],snap=A.catalogStatSnapshot(save,c);
    A.applyAction(save,c,{type:'track-catalog',questId:id});
    const state=A.questState(save,id),ready=catalogQuestReady(save,c,quest,snap);
    const goal=catalogGoalRows(save,c,quest,snap).find(g=>g.value<g.count);
    const npcId=!state.accepted?quest.startNpc:ready?quest.endNpc:goal?.kind==='talk'?goal.id:0;
    if(!state.accepted&&catalogAcceptBlock(save,c,quest,snap)){toast(catalogAcceptBlock(save,c,quest,snap));return;}
    if(!state.accepted&&(!c.npcs[quest.startNpc]||quest.startNpc===-1)){A.applyAction(save,c,{type:'accept-catalog',questId:id,npcId:quest.startNpc});toast(`已接取：${quest.title}`);paintHud();return;}
    if(ready&&(!c.npcs[quest.endNpc]||quest.endNpc===-1)){
        const before=rewardSnapshot(save);
        A.applyAction(save,c,{type:'claim-catalog',questId:id,npcId:quest.endNpc});
        showRewards(before);toast(`已完成：${quest.title}`);paintHud();return;
    }
    if(npcId&&c.npcs[npcId]){
        if(save.zone!==c.npcs[npcId].zone){travel(c.npcs[npcId].zone);if(save.zone!==c.npcs[npcId].zone)return;}
        const placed=world.npcs.find(n=>n.id===npcId);
        if(placed){walkTo({...placed,kind:'npc',questDialogue:true},true);return;}
        if(!state.accepted){A.applyAction(save,c,{type:'accept-catalog',questId:id,npcId:quest.startNpc});toast(`已接取：${quest.title}`);paintHud();return;}
        if(ready){const before=rewardSnapshot(save);A.applyAction(save,c,{type:'claim-catalog',questId:id,npcId:quest.endNpc});showRewards(before);toast(`已完成：${quest.title}`);paintHud();return;}
    }
    if(goal&&(goal.kind==='kill'||goal.kind==='loot')){
        const goalIds=goal.kind==='kill'?[goal.id]:goal.producers;
        const encounter=c.encounters.find(e=>(e.monsterIds||[e.monsterId]).some(mid=>goalIds.includes(c.catalogQuests.paths[String(c.monsters[mid]?.source||'').toLowerCase()])));
        const placed=encounter&&world.encounters.find(e=>e.id===encounter.id);
        if(placed){walkTo({...placed,kind:'encounter'},true);return;}
        if(encounter){toast(`前往副本挑战${goal.name}`);openPanel('dungeons');return;}
        toast(`${goal.name}不在当前已开放的遭遇里。`);return;
    }
    if(goal?.kind==='custom'&&[79016,79025].includes(goal.id)){openPanel('upgrade');return;}
    if(goal?.kind==='custom'&&[79017,79026].includes(goal.id)){openPanel('inventory');return;}
    if(goal?.kind==='custom'&&goal.id===79019){openPanel('pet');return;}
    if(goal?.kind==='custom'&&goal.id===79037){openPanel('deck');return;}
    toast(goal?`${goal.name}需要在冒险中继续完成。`:'任务已记录在手记中。');
    paintHud();
}
function track(questId) {
    if(stage!=='world')return;close();
    const c=assets.content;
    if(questId&&c.catalogQuests?.byId[Number(questId)]){trackCatalog(Number(questId));return;}
    const q=A.currentQuest(save,c);
    if(dungeonFor(c,save.zone)){const next=world.encounters[0];walkTo(next?{...next,kind:'encounter'}:{...world.portal,kind:'portal'},true);return;}
    if(!q){walkTo({...world.portal,kind:'portal'},true);return;}
    if(save.zone!==c.npcs[q.startNpc].zone){travel(c.npcs[q.startNpc].zone);if(save.zone!==c.npcs[q.startNpc].zone)return;}
    const npc=id=>({...world.npcs.find(n=>n.id===id),kind:'npc',questDialogue:true}),state=A.questState(save,q.id);
    if(!state.accepted){walkTo(npc(q.startNpc),true);return;}
    if(A.questReady(save,q)){walkTo(npc(q.endNpc),true);return;}
    const goal=A.questProgress(save,q).find(g=>g.value<g.count);
    if(goal.kind==='talk')walkTo(npc(goal.id),true);
    if(goal.kind==='defeat') {
        const monster=Object.values(c.monsters).find(m=>m.goalId===goal.id);
        walkTo({...world.encounters.find(e=>e.monsterId===monster.id),kind:'encounter'},true);
    }
    if(goal.kind==='action')openPanel(goal.id===79016?'upgrade':goal.id==='hatch-pet'||goal.id===79019?'pet':goal.id===79037&&save.equipment[24]===24003?'deck':'inventory');
}
function paintBattle(){
    const hero=battle.sides.near[0],hand=[...selectableCards(hero),...P.runeCardsInHand(battle)];
    if(selected&&!hand.some(h=>h.seq===selected.seq&&h.key===selected.key))selected=null;
    V.renderBattle(nodes.battle,{...model(),petCardsOpen,runeCardsOpen,runeHand:P.runeCardsInHand(battle)},{toggleRunes:()=>{if(animation||battle.finished)return;runeCardsOpen=!runeCardsOpen;petCardsOpen=false;selected=null;paintBattle();},togglePetCards:()=>{if(animation||battle.finished)return;petCardsOpen=!petCardsOpen;runeCardsOpen=false;selected=null;paintBattle();},sound:toggleSound,cloud:openCloud,swipePlay:h=>{
        if(animation)return;
        const intent=resolveHandSwipe(battle,h,discarded);
        if(!intent)return;
        selected=h;
        if(intent.decision)playRound(intent.decision);
        else {paintBattle();toast(intent.message);}
    },reselect:()=>{if(animation||battle.finished)return;selected=null;paintBattle();},select:h=>{if(animation||battle.finished)return;selected=h;paintBattle();},discard:seq=>{
    if(animation||battle.finished||seq<0||seq>=PET_CARD_SEQ_BASE)return;discarded=discarded.includes(seq)?discarded.filter(x=>x!==seq):[...discarded,seq];if(selected?.seq===seq)selected=null;paintBattle();
},target:id=>{
    if(!selected||animation||battle.finished)return;
    const card=battle.resolved.cards[selected.key];
    const message=discarded.includes(selected.seq)?'请先撤销弃牌':castBlockedMessage(hero,card,battle.resolved);
    if(message){toast(message);return;}
    if(!validTargets(battle,hero,card).some(t=>t.id===id)){toast('请选择这张卡牌可施放的目标。');return;}
    playRound({...selected,targetId:id,discardSeqs:discarded});
},openRunes:()=>{if(animation||battle.finished)return;runeCardsOpen=true;petCardsOpen=false;selected=null;paintBattle();},pass:()=>playRound({pass:true,discardSeqs:discarded}),retreat:()=>{
    if(assets.content.pets)A.settleParty(save,assets.content,battle,{retreat:true});
    A.applyAction(save,assets.content,{type:'retreat'});save.careAt=Date.now();enterWorld(save);toast('你回到了安全地点。已保留物品与任务进度。');
},finish:()=>safely(()=>{const before=rewardSnapshot(save);A.settleEncounter(save,assets.content,battle);save.careAt=Date.now();enterWorld(save,null,{announceBeans:false});showRewards(before);})});}
function playRound(decision) {
    if(animation||battle.finished)return;
    safely(()=>{
        const start=battle.events.length,hp=Object.fromEntries(Object.values(battle.unitsById).map(u=>[u.id,u.hp])),aura=battle.aura?{...battle.aura}:null;
        const hand=cardsInHand(battle.sides.near[0]);
        P.playPveRound(battle,decision);A.recordDecision(save,decision,battle);persist();selected=null;discarded=[];petCardsOpen=false;runeCardsOpen=false;
        const events=battle.events.slice(start).filter(e=>['cast','damage','heal','dot','hot','speak','fizzle','pass','capture','aura'].includes(e.type));
        // Preserve surviving hand IDs while hidden, so only new cards deal in after ALL events.
        animation={events:events.map(e=>({...e,periodic:e.type==='dot'||e.type==='hot',type:e.type==='dot'?'damage':e.type==='hot'?'heal':e.type})),index:0,start:performance.now(),hp,aura,entered:-1,hand:hand.filter(h=>(decision.pass||decision.capture||h.seq!==decision.seq)&&!decision.discardSeqs?.includes(h.seq))};paintBattle();
    });
}
function tickAnimation(now) {
    if(!animation){spellSound.stop();return null;}
    const a=animation,e=a.events[a.index];
    if(now<a.start)return {hp:a.hp,aura:a.aura};
    if(!e){spellSound.stop();animation=null;paintBattle();return null;}
    if(a.entered!==a.index){a.entered=a.index;
        if(e.type==='damage')a.hp[e.target]=Math.max(0,a.hp[e.target]-e.amount);
        if(e.type==='heal')a.hp[e.target]=Math.min(battle.unitsById[e.target].maxHp,a.hp[e.target]+e.amount);
        const text=V.eventLabel(e,battle,assets);if(text)$('cast-announcement').textContent=text;
    }
    const duration=e.type==='aura'?1:e.type==='speak'?1300:e.type==='cast'?effectDuration(assets.effects,battle.resolved.cards[e.card],matchMedia('(prefers-reduced-motion: reduce)').matches):e.type==='pass'?300:e.type==='damage'&&a.hp[e.target]>0?HIT_DURATION_MS:600;
    const progress=Math.min(1,(now-a.start)/duration);
    const card=battle.resolved.cards[e.card],spec=card&&assets.effects.bases[assets.effects.cards[card.key]?.base];
    const impact=spec?.kind==='summon'?assets.effects.timeline.summonImpact:assets.effects.timeline.impact;
    a.aura=presentedEnvironment(a.aura,a.events,a.index,progress,impact);
    const reactions=castHitReactions(a.events,a.index,progress,duration,impact);
    a.recoiledEvents??=new Set();for(const reaction of reactions)a.recoiledEvents.add(reaction.eventIndex);
    const recoilPlayed=a.recoiledEvents.has(a.index);
    if(e.type==='cast'||e.type==='fizzle')spellSound.track(assets.effects,battle.resolved.cards[e.card],progress,{active:!document.hidden,failed:e.type==='fizzle',reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,instance:String(a.index)});
    else spellSound.stop();
    if(progress===1){a.index++;a.start=now;}
    return{event:{...e,recoilPlayed,school:e.school||battle.resolved.cards[e.card]?.spellSchool},progress,hp:a.hp,aura:a.aura,reactions};
}
const directionKeys={w:'up',arrowup:'up',s:'down',arrowdown:'down',a:'left',arrowleft:'left',d:'right',arrowright:'right'};
window.addEventListener('keydown',e=>{
    if(rewardRoot.contains(e.target))return;
    if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;
    const key=e.key.toLowerCase();if(directionKeys[key]&&stage==='world'&&!panel&&!dialog){e.preventDefault();heldPointer=null;keys.add(directionKeys[key]);path=[];destination=null;}
    if(e.repeat)return;
    if(key==='escape'){if(panel||dialog)close();else if(stage==='world')openPanel('settings');}
    if(stage!=='world'||panel||dialog)return;
    if(key==='e'){e.preventDefault();interactNearest();}
    if(key==='r')openPanel('equipment');if(key==='j')openPanel('quests');if(key==='b'||key==='i')openPanel('inventory');if(key==='c')openPanel('deck');if(key==='p')openPanel('pet');
});
window.addEventListener('keyup',e=>{keys.delete(directionKeys[e.key.toLowerCase()]);});
window.addEventListener('blur',()=>{resetMovementInput();path=[];destination=null;persist();});
window.addEventListener('pagehide',persist);
document.addEventListener('visibilitychange',()=>{spellSound.stop();if(document.hidden){resetMovementInput();path=[];destination=null;persist();music?.pause();}else{if(stage==='world'&&save?.pets)tickCare(save,assets.content,A.playerSpec(save,assets.content),Date.now(),false);updateMusic();}});
window.addEventListener('pagehide',()=>spellSound.stop());
function clickWorld(clientX,clientY) {
    const {p,target}=pickWorldTarget(clientX,clientY);
    if(!target&&isOcean(world,p.x,p.y)){openPanel('fishing');return false;}
    walkTo(target||p,!!target);
    return !target;
}
function pickWorldTarget(clientX,clientY) {
    const rect=nodes.world.getBoundingClientRect(),p=renderer.screenToWorld(clientX-rect.left,clientY-rect.top);
    const targets=[...world.npcs.map(n=>({...n,kind:'npc'})),...world.encounters.map(n=>({...n,kind:'encounter'})),...(world.landmarks||[]).map(n=>({...n,kind:'landmark'})),...(world.entrancePortal?[{...world.entrancePortal,kind:'portal'}]:[]),{...world.portal,kind:'portal'}];
    const target=targets.filter(n=>!n.hidden&&Math.abs(n.x-p.x)<48&&p.y>n.y-100&&p.y<n.y+35).sort((a,b)=>W.distance(a,p)-W.distance(b,p))[0];
    return {p,target};
}
nodes.world.addEventListener('pointerdown',e=>{
    if(e.pointerType==='touch'||e.pointerType==='pen')return;
    if(stage!=='world'||panel||dialog||e.button!==0)return;e.preventDefault();nodes.world.focus({preventScroll:true});
    if(e.pointerType==='mouse'&&clickWorld(e.clientX,e.clientY)){heldPointer={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,since:performance.now(),active:false};nodes.world.setPointerCapture(e.pointerId);}
});
nodes.world.addEventListener('pointermove',e=>{if(heldPointer?.id===e.pointerId){heldPointer.x=e.clientX;heldPointer.y=e.clientY;if(Math.hypot(e.clientX-heldPointer.startX,e.clientY-heldPointer.startY)>6){heldPointer.active=true;path=[];destination=null;}}});
function releaseWorldPointer(e){if(heldPointer?.id!==e.pointerId)return;if(heldPointer.active||e.type!=='pointerup'){path=[];destination=null;}heldPointer=null;}
for(const event of ['pointerup','pointercancel','lostpointercapture'])nodes.world.addEventListener(event,releaseWorldPointer);
function frame(now) {
    requestAnimationFrame(frame);if(!renderer||!save)return;
    void autoSave.tick();
    if(stage==='world'&&!document.hidden&&now-lastCare>1000){lastCare=now;tickCare(save,assets.content,A.playerSpec(save,assets.content),Date.now(),true);V.updateHeroHealth(nodes.hud,save,assets.content);V.updateCheckin(nodes.hud,model());if(panel==='checkin')V.updateCheckin(nodes.overlay,model());if(now-lastSave>10000)persist();}
    if((stage==='world'||stage==='battle')&&!document.hidden)tickCheckin(save,Date.now(),Math.min(1000,Math.max(0,now-lastFrame)));
    const dt=Math.min(.055,(now-lastFrame)/1000||0);lastFrame=now;const wasMoving=moving;moving=false;
    if(stage==='world'&&!panel&&!dialog) {
        let dx=Number(keys.has('right'))-Number(keys.has('left')),dy=Number(keys.has('down'))-Number(keys.has('up'));
        if(!dx&&!dy){dx=joystick.x;dy=joystick.y;}
        if(heldPointer&&(heldPointer.active||now-heldPointer.since>=180)){
            heldPointer.active=true;path=[];destination=null;
            const rect=nodes.world.getBoundingClientRect(),target=renderer.screenToWorld(heldPointer.x-rect.left,heldPointer.y-rect.top);
            const x=target.x-save.position.x,y=target.y-save.position.y,distance=Math.hypot(x,y);
            if(!dx&&!dy&&distance>6){const scale=Math.min(1,(distance-6)/(W.WALK_SPEED*dt||1));dx=x/distance*scale;dy=y/distance*scale;}
        }
        if(!dx&&!dy&&path.length){
            const previous=save.position,next=W.followPath(world,save.position,path,W.WALK_SPEED*dt);
            save.position=next.position;path=next.path;dx=save.position.x-previous.x;dy=save.position.y-previous.y;moving=Math.hypot(dx,dy)>.01;
            if(next.blocked&&destination)path=W.findPath(world,save.position,destination);
        }else if(dx||dy){
            const length=Math.max(1,Math.hypot(dx,dy)),previous=save.position;
            save.position=W.movePosition(world,save.position,dx/length*W.WALK_SPEED*dt,dy/length*W.WALK_SPEED*dt);moving=W.distance(previous,save.position)>.01;
        }
        if(moving)save.facing=Math.abs(dx)>Math.abs(dy)?(dx<0?1:2):(dy<0?3:0);
        const auto=W.dungeonAutoInteraction(world,save.position);
        if(!auto)world.autoContact=null;
        if(auto&&world.autoContact!==auto.id){world.autoContact=auto.id;interact(auto);}
        else if(destination&&W.distance(save.position,destination)<82)interact(destination);
        const near=W.nearestInteraction(world,save.position),button=$('interact');
        if(world.layout){const label=nodes.hud.querySelector('.location-label small'),region=regionAt(world,save.position);if(label&&label.textContent!==region.name)label.textContent=region.name;}
        if(button){button.hidden=!near;if(near)button.textContent=near.kind==='npc'?`与${near.name}交谈`:near.kind==='landmark'?`查看${near.name}`:near.kind==='portal'?near.name:`挑战${assets.content.monsters[near.monsterId]?.name||'待迁移怪物'}`;}
        if((wasMoving&&!moving)||(moving&&now-lastSave>3000))persist();
    }
    const rewardEffect=rewardFeedback.tick(now,stage==='world'&&!panel&&!dialog);
    const bagButton=nodes.hud.querySelector('[data-ui-icon=bag]')?.closest('button');bagButton?.classList.toggle('reward-glow',!rewardRoot.hidden&&!!rewardRoot.querySelector('.reward-popup:not([hidden]) strong'));
    if(teleportEffect&&(stage!=='world'||now-teleportEffect.started>=TELEPORT_EFFECT_MS))teleportEffect=null;
    renderer.render(world,save,now,{moving,path,title:stage==='title',rewardEffect,teleportEffect});
    if(stage==='battle'){const presentation=tickAnimation(now),canvas=$('battle-canvas');V.updateBattleRoster(nodes.battle.battleStatusEntries,presentation);if(canvas)canvas.battlePositions=renderer.renderBattle(canvas,battle,save,now,presentation);}
}
async function boot(){
    try {
        assets=await loadResources(({label,detail='',value})=>{
            const bar=$('load-progress');
            if(!bar)return;
            if(value===null)bar.removeAttribute('value');else bar.value=value;
            bar.setAttribute('aria-label',label);
            $('load-status').textContent=label+'…';
            $('load-detail').textContent=detail;
        });
        $('load-status').textContent='正在初始化世界…';
        $('load-detail').textContent='';
        $('load-progress').removeAttribute('value');
        if(assets.content.schemaVersion!==1||!assets.content.quests?.length||!assets.dataset.cards)throw new Error('章节数据格式不正确，请重新导出并检查资源。');
        roleStore=createRoleStore({content:assets.content,dataset:assets.dataset,prepareSaves:assets.dungeons.prepareSaves});await roleStore.prepareOpen();roleStore.open();
        roleStorage=roleStore.catalog.activeId?roleStore.scoped():null;
        cloudClient=createCloudClient({content:assets.content,dataset:assets.dataset,prepareSaves:assets.dungeons.prepareSaves,onAccountChange:()=>{resetRoleAccount();cloud.message='登录状态已变化，请重新连接。';}});
        creationPreview=createCreationPreview(assets);
        renderer=createRenderer(nodes.world,assets);requestAnimationFrame(frame);
        // Keep the loading screen until session restoration chooses the final screen.
        // Rendering the guest title first briefly exposes creation/role selection.
        if(localStorage.getItem(LAST_ACCOUNT_KEY)){
            $('load-status').textContent='正在恢复账号与角色…';
            await connectRoles(false);
        }
        if(stage==='loading')showTitle(!!roles.conflict||!!(roleStore.owner&&roles.error));
    }catch(e){stage='error';nodes.entry.replaceChildren(V.el('section','loading-card',V.el('h1','','冒险暂时无法开始'),V.el('p','',e.message),V.el('p','muted','请通过 HTTP 静态服务器打开游戏；恢复 data/adventure 中的章节文件，并运行 npm run assets:adventure 检查美术资源。'),V.button('重新尝试',()=>location.reload(),'primary')));}
}
boot();
