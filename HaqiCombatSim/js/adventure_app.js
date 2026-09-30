import {awardDailySpeech,localBuffDay,DAILY_BUFF_NAMES} from './language_daily_buff_core.js';
import {pauseBackgroundScene} from './adventure_scene_pause_core.js';
import {createDungeonStory} from './adventure_dungeon_story.js';
import {createArenaClock} from './adventure_arena_clock.js';
import {heroPortrait} from './hero_renderer.js';
import {createCharacterConversation} from './character_conversation.js';
import {characterProfile} from './character_relationship_core.js';
import {ownedPetRecords} from './adventure_pet_files_core.js';
import {initializePetWorld} from './adventure_pet_world_core.js';
import {createPetScene} from './adventure_pet_scene.js';
import {createIslandSocial} from './adventure_social_controller.js';
import {BattleReviewSession} from './battle_ai/session_core.js';
import {recommendProgression} from './battle_ai/review_core.js';
import {adventureProgressionRoutes} from './battle_ai/adventure_adapter_core.js';
import {BattleAIClient} from './battle_ai/client.js';
import {observeBattle,haqiRulesAdapter} from './battle_ai/haqi_adapter_core.js';
const battleAIClient=new BattleAIClient();
const battleAdvisors=new WeakMap();
function advisorFor(value){if(!battleAdvisors.has(value))battleAdvisors.set(value,{session:new BattleReviewSession(),muted:false});return battleAdvisors.get(value);}
import {startCoopRun} from './adventure_coop_core.js';
import {learningParams} from './language_adventure_core.js';
import {mapDialogue} from './dialogue_mapping.js';
import {captureBattlePresentation,battleStatusChanges} from './view_battle_presentation.js';
import {createLanguageAdventure} from './language_adventure.js';
import {createLearningVoice} from './language_adventure_voice.js';
import {createAutoSave} from './adventure_autosave.js';
import {npcOffers} from './adventure_npc_core.js';
import {renderDungeonJourney} from './view_dungeon_journey.js';
import {claimTowerReward,journeyParty} from './adventure_dungeon_journeys_core.js';
import {coopParty as journeyCoopParty} from './adventure_coop_core.js';
import {partySpecs as journeyPetParty} from './adventure_pets_core.js';
import {dungeonFor,enterDungeon,leaveDungeon} from './adventure_dungeons_core.js';
import {catalogGoalEncounter} from './adventure_island_encounters_core.js';
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
import { tickCare, productPrice } from './adventure_pets_core.js';
import { updatePetStatus } from './view_adventure_pet_status.js';
// Browser controller: input, rendering, audio and persistence live outside the pure rules.
import { createSpellSound } from './spell_sound.js';
import {rewardSound,battleEventSound} from './game_sound_core.js';
import { castHitReactions } from './actor_animation_core.js';
import { withBattlePointer,nextBattlePointer } from './battle_pointer_core.js';
import { presentationEventDurationMs } from './battle_presentation_core.js';
import {presentedEnvironment} from './spell_environment_core.js';
import * as A from './adventure_core.js';
import {catalogAcceptBlock,catalogGoalRows,catalogQuestReady,trackedQuestIds} from './adventure_catalog_quests_core.js';
import * as W from './adventure_world_core.js';
import { SOCIAL_DEFAULTS } from './adventure_social_core.js';
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
import { fill, setText, tr } from './locale_runtime.js';
import { isOcean } from './adventure_fishing_core.js';
import { createSceneFishing } from './view_adventure_scene_fishing.js';
import { fishingSpot } from './adventure_fishing_spot_core.js';
import { createRoleStore } from './adventure_roles.js';
import { createHeroDraft } from './hero_body_core.js';
import { MAX_ROLES, directSignInRequested, startupRoleId } from './adventure_roles_core.js';
import { renderRoles } from './view_adventure_roles.js';
import { createCreationPreview, tutorialCards } from './adventure_creation_preview.js';
import { localeIdsToLoad, isLocaleId } from './locale_core.js';
import { loadLocaleFiles, configureLocale, hasLocale, installLocaleTooltip, setGlossAligner, speakText, textFor, displayLocale } from './locale.js';
import { createTutor } from './language_learning.js';

const $=id=>document.getElementById(id);
const nodes={world:$('world'),hud:$('hud'),entry:$('entry'),overlay:$('overlay'),battle:$('battle-layer'),toast:$('toast')};
let assets,renderer,save,world,battle,stage='loading',panel=null,dialog=null,dialogDone=null;
let selectedQuestId=null,pinJournalQuest=false;
let dungeonLoading=null;
let journeyId=null,journeyRestart=false;
const dungeonStory=createDungeonStory({root:nodes.overlay,getState:()=>({save,assets,sceneCanvas:nodes.world,owner:roleStore?.owner,role:roleStore?.catalog.activeId}),onLogin:({dungeon,index})=>loginForCharacterChat(null,null,()=>{if(save.zone===dungeon.id){panel='dungeon-story';nodes.hud.hidden=true;dungeonStory.open(dungeon,{index});}else openJourney(dungeon.id);}),award:awardLanguageSpeech,onDone:()=>{if(panel==='dungeon-story')panel=null;nodes.hud.hidden=stage!=='world';if(stage==='world'){persist();paintHud();nodes.world.focus({preventScroll:true});}}});
function openJourney(id,restart=false){journeyId=id;journeyRestart=restart;openPanel('dungeon-journey');}
function pickDungeonLobby(id,restart=false){const d=dungeonFor(assets.content,id);if(d?.kind){openJourney(id,restart);return;}islandSocial.pickPartyDungeon(id,{restart});}
let teleportEffect=null;
let path=[],destination=null,moving=false,lastFrame=0,lastSave=0,toastTimer=0;
let fishingApproach=null,talkApproach=null;
let fishingLoadEpoch=0;
let selected=null,discarded=[],animation=null,music=null,storageWarning=false;
let petCardsOpen=false;
let runeCardsOpen=false;
let cloudClient;
let roleStore,roleStorage=null,roleEpoch=0,lastRoleSync=0;
const roles={busy:'',error:'',message:'',conflict:null};
let titleView='create',roleDraft=null,creationPreview=null;
const LAST_ACCOUNT_KEY='haqi.roles.last-account.v1';
// 本机显示语言偏好：首页与设置窗每次切换都会写入；优先于角色存档里的 locale，
// 让未进入世界的标题页选择在刷新后仍然生效。
const LOCALE_PREF_KEY='haqi.locale.v1';
const SECOND_LOCALE_KEY='haqi.locale.second.v1';
function storedLocalePref(){try{const pref=localStorage.getItem(LOCALE_PREF_KEY);return isLocaleId(pref)?pref:null;}catch{return null;}}
function storedSecondLocale(){try{const pref=localStorage.getItem(SECOND_LOCALE_KEY);return isLocaleId(pref)?pref:null;}catch{return null;}}
function rememberSecondLocale(locale){try{localStorage.setItem(SECOND_LOCALE_KEY,locale);}catch{}}
// 未单独选过时默认 English；与母语相同时改为另一种。
function secondLocaleFor(native){
    const pref=storedSecondLocale();
    if(pref&&pref!==native)return pref;
    const saved=save?.languageLearning?.target;
    if(isLocaleId(saved)&&saved!==native)return saved;
    return native==='en'?'zh-CN':'en';
}
const cloud={owner:null,busy:'',error:'',message:'',paths:[],preview:null};
const autoSave=createAutoSave({
    eligible:()=>stage==='world'&&!save?.pendingEncounter&&roleStore?.owner&&roleStore.dirty&&!roles.busy&&!cloud.busy&&!roles.conflict,
    save:async()=>{roles.busy='正在自动保存…';try{persist();if(storageWarning)throw Error('本地存档失败，云端同步已暂停');await syncRoles();cloud.error='';}finally{roles.busy='';}},
    onError:error=>{if(cloud.error!==error.message)toast('云存档暂未完成，本地进度已保留，将自动重试。');cloud.error=error.message;},
});
function queueCloudSave(){autoSave.request();}
const petLoads=new Map();
async function loadPet(id){
    if(save.pets[id]||save.petWorld?.[id])return save.pets[id]||save.petWorld[id];
    const current=save,roleId=roleStore.catalog.activeId,owner=roleStore.owner,ref=save.petFileRefs?.[id];if(!ref)throw Error('找不到宠物引用');
    const key=JSON.stringify([owner,roleId,id,ref.path]);if(petLoads.has(key))return petLoads.get(key);
    const task=(async()=>{try{roleStore.petFileIO(roleId).read(ref.path);}catch(error){if(!owner||cloudClient.owner!==owner)throw error;await cloudClient.petFile(roleId,ref.path);}
        if(save!==current||roleStore.catalog.activeId!==roleId||roleStore.owner!==owner)return null;
        const next=roleStore.loadPet(current,id),pet=next[ref.group][id];current[ref.group][id]=pet;return pet;
    })().finally(()=>petLoads.delete(key));petLoads.set(key,task);return task;
}
const petScene=createPetScene({sound:name=>spellSound.play(name),getState:()=>({loadPet,save,world,content:assets?.content,socialActors:islandSocial.actors,scope:`${roleStore?.owner||'guest'}:${roleStore?.catalog.activeId}`,locked:stage!=='world'||document.hidden||!!save?.pendingEncounter}),commit:next=>{saveLocal(next,roleStorage);save=roleStore.catalog.roles.find(r=>r.id===roleStore.catalog.activeId).save;queueCloudSave();paintHud();if(panel)paintPanel();},noteMeeting:meetings=>{if(!save)return;save.petMeetings=meetings;persist();},toast:message=>toast(message)});
setInterval(()=>{void autoSave.tick();if(stage==='world')islandSocial.tick();},15000);

const membership=createMembershipClient({onChange:()=>{if(!assets||!save)return;if(stage==='world'&&!save.pendingEncounter)maybeExchangeMagicBeans();if(stage==='world'){paintHud();if(['shop','npc-services','membership','recharge','checkin'].includes(panel))paintPanel();}}});
let buyingVip=false;
const membershipView={tab:'attributes'};
const rechargeView={amount:'4'};
async function rechargeMembership(amount){
    try{
        await membership.openRecharge(amount,roleStore?.owner);
        toast('已刷新会员状态，魔豆按实际新增到期日兑换。');
    }catch(error){toast(error.message);}
}
const refreshMembership=(force=false)=>membership.refresh({force}).catch(error=>toast(error.message));
const keys=new Set();
const spellSound=createSpellSound({defaultEnabled:true});
const arenaPickClock=createArenaClock({onSecond:seconds=>{
    const badge=nodes.battle.querySelector('[data-arena-countdown]');
    if(badge){badge.textContent=`选牌剩余 ${seconds} 秒`;badge.classList.toggle('urgent',seconds<=5);}
    if(seconds>0&&seconds<=5)spellSound.play(seconds===1?'countdownFinal':'countdown');
},onExpire:()=>{if(stage==='battle'&&battle?.redMushroom&&!animation&&!battle.finished)playRound({pass:true});}});
function enterArenaCombat(match){
    close();path=[];destination=null;keys.clear();animation=null;selected=null;discarded=[];petCardsOpen=false;runeCardsOpen=false;
    battle=match.arena;stage='battle';nodes.hud.hidden=true;
    void spellSound.unlock();arenaPickClock.start(battle.resolved.redMushroom.pickMs);paintBattle();updateMusic();
}
function leaveArenaCombat(){arenaPickClock.stop();islandSocial.leaveArena();enterWorld(save,null,{announceBeans:false});openPanel('social-pvp');}

document.addEventListener('pointerdown',()=>spellSound.unlock());
document.addEventListener('keydown',()=>spellSound.unlock());
document.addEventListener('click',event=>{const button=event.target.closest?.('button');if(button&&!button.disabled&&button.getAttribute('aria-disabled')!=='true')spellSound.play('click');});
async function toggleSound(){const requested=!spellSound.enabled,ok=await spellSound.setEnabled(requested);if(requested&&!ok)toast('浏览器暂时无法启用音效，请重试。');paintPanel();if(stage==='battle')paintBattle();}
let lastCare=0;
let joystick={x:0,y:0},heldPointer=null;
function resetMovementInput(){keys.clear();joystick={x:0,y:0};heldPointer=null;touchMovement.reset();}
const touchIndicator=V.el('div','touch-joystick floating-joystick active',V.el('span','joystick-stick'));
touchIndicator.hidden=true;touchIndicator.setAttribute('aria-hidden','true');nodes.world.parentElement.append(touchIndicator);
const sceneFishing=createSceneFishing(nodes.world.parentElement,{
    activeChanged:active=>{renderer?.setFishingCamera(active);if(active){clearTimeout(toastTimer);nodes.toast.classList.remove('visible');}},
    isWater:point=>world&&!dungeonFor(assets.content,world.zone)&&isOcean(world,point.x,point.y),
    vibrate:pattern=>{try{if(!document.hidden)navigator.vibrate?.(pattern);}catch{}},
    sound:name=>spellSound.play(name),action:value=>performAction(value),focus:()=>nodes.world.focus({preventScroll:true}),
},{el:V.el,button:V.button});
const touchMovement=bindTouchMovement(nodes.world,touchIndicator,{enabled:()=>stage==='world'&&!panel&&!dialog&&!languageAdventure.active,steer:(x,y)=>{languageAdventure.close();talkApproach=null;joystick={x,y};path=[];destination=null;heldPointer=null;},zoom:factor=>renderer?.zoomBy(factor),tap:(x,y)=>clickWorld(x,y)});
const shopView={category:'pet',query:'',school:'',slot:'',ownership:'',page:0},petView={selected:null};
const equipmentView={tab:'gear',slot:0,item:null,query:''};
const gemView={guid:null,gemId:null,runes:[null,null,null],runeIndex:0,step:'equipment',filter:0,page:0,mode:'mount',removeIds:[],message:'',confirm:false};
const strengtheningView={guid:null,filter:0,page:0,pending:false,message:''};
let serviceNpc=null;
const npcServiceView={query:'',page:0};
const islandSocial=createIslandSocial({onArenaEnter:enterArenaCombat,onArenaCountdown:seconds=>{const label=nodes.overlay.querySelector('[data-arena-ready]');if(label)label.textContent=`准备好迎战！${seconds} 秒后自动进入战斗法阵。`;},onTalk:p=>void characterChat.open(p,{returnPanel:'social-profile'}),onDetails:p=>void characterChat.open(p,{returnPanel:'social-profile',detailsOnly:true}),onRelationshipActivity:event=>recordRelationshipActivity(event),onPetDialogue:owner=>petScene.dialogue(owner),getState:()=>({save,world,assets,roleId:roleStore?.catalog.activeId,loadPet,membership:membership.state,paused:stage!=='world'||document.hidden||!!panel||!!dialog||characterChat.active,locked:!!panel||!!dialog||characterChat.active}),getOwner:()=>roleStore?.owner,onChange:()=>{if(stage==='world'&&save){paintHud();if(['mail','chat','social-party','social-profile','social-pvp'].includes(panel))paintPanel();}},onPersist:()=>{persist();queueCloudSave();},onOpen:openPanel,onClose:close,onLogin:()=>void loginRoles(),toast,onDepart:(id,restart)=>void loadAndEnterDungeon(id,!!restart),onTeleport:(x,y)=>teleportToPosition(x,y)});
const model=()=>({assets,save,social:islandSocial.state(),displayLocale:displayLocale(),dungeonLoading,serviceNpc,npcServiceView,membership:membership.state,membershipView,rechargeView,accountOwner:roleStore?.owner,magicBeanExchange:roleStore?.catalog?.magicBeanExchange||null,now:Date.now(),storageWarning,arenaCountdown:arenaPickClock.remaining(),battle,selected,discarded,hand:animation?.hand,presentation:animation?{hp:animation.hp,status:animation.status}:null,animating:!!animation,equipmentView,strengtheningView,gemView,shopView,petView,debugBackup:roleStorage&&hasDebugBackup(roleStorage),soundEnabled:spellSound.enabled,soundVolume:spellSound.volume,learningProgress:battle?.learningProgress||0,autoWalk:!!destination});
const characterChat=createCharacterConversation({onSpeech:awardLanguageSpeech,
    getState:()=>({save,assets,owner:roleStore?.owner,role:roleStore?.catalog.activeId}),membership,
    getPortrait:source=>{if(source.kind&&source.kind!=='npc')return heroPortrait(assets,source,220,270,{facing:0,lookAround:false});const npc=assets.content.npcs[source.id]||source;return npc.portrait?V.art(assets,npc.portrait,220,270,'camp-chat-character-art'):null;},
    commit:next=>{saveLocal(next,roleStorage);save=roleStore.catalog.roles.find(r=>r.id===roleStore.catalog.activeId).save;queueCloudSave();paintHud();},
    onClose:options=>{if(options?.returnPanel)openPanel(options.returnPanel);else if(options?.npc){dialog={npcId:options.npc.id,npc:options.npc};paintDialogue();}},
    onLogin:loginForCharacterChat,onSettings:()=>openPanel('settings'),onUpgrade:()=>openPanel('membership'),onDialogue:id=>petScene.dialogue(id),notify:toast,
});
function recordRelationshipActivity(event){
    if(event.flushOnly){void characterChat.syncActivities();return;}
    if(save.relationshipEvents?.some(row=>row.id===event.id))return;
    const next=structuredClone(save);next.relationshipEvents=[...(next.relationshipEvents||[]),{...event,peer:characterProfile(event.peer)}];next.revision++;
    saveLocal(next,roleStorage);save=roleStore.catalog.roles.find(r=>r.id===roleStore.catalog.activeId).save;queueCloudSave();void characterChat.syncActivities();
}
const languageAdventure=createLanguageAdventure({onSpeech:awardLanguageSpeech,onFreeTalk:npc=>openFreeTalk(npc),
    saveSettings:next=>{const before=save.languageLearning;save.languageLearning={...before,...next};persist();if(storageWarning){save.languageLearning=before;throw Error('设置未能保存，请重试。');}queueCloudSave();},
    openSettings:()=>openPanel('settings'),
    useReward:(kind,guid)=>openPanel(kind==='food'?'shop':'upgrade',kind==='food'?{category:'supply'}:{guid}),
    getState:()=>({save,content:assets?.content,role:roleStorage,identity:roleStore?.owner,stage,battle,animating:!!animation,npcs:world?.npcs||[],busy:characterChat.active||!!panel||!!dialog||!!animation||document.hidden||!!document.querySelector('dialog[open]'),near:world&&save&&stage==='world'&&!panel&&!dialog?W.nearestInteraction(world,save.position):null}),
    commit:completion=>{
        const committed=persistReward(save,assets.content,{type:'language-complete',completion},{learningCompletion:completion},roleStorage);
        const before=rewardSnapshot(save);save=committed.save;storageWarning=false;showRewards(before);queueCloudSave();islandSocial.activity('learning');if(stage==='world')paintHud();return committed.result;
    },notify:message=>toast(message),
});
const tutor=createTutor();
setGlossAligner((top,bottom)=>tutor.requestLLM([
    {role:'system',content:'Pair corresponding words between the two lines. Return JSON only: {"groups":[{"color":0,"top":"Back","bottom":"回到"}]}. Use the same color number for a matching pair. Keep each fragment exactly as it appears. Do not translate or explain.'},
    {role:'user',content:`Top:\n${top}\nBottom:\n${bottom}`},
],{model:'keepwork-lite'}));
// 显示语言词典 = 角色存档语言（含学习母语/目标）∪ 本机偏好，两者可能不同。
function localeFilesToLoad(){
    const ids=new Set(localeIdsToLoad(save));
    const pref=storedLocalePref();
    if(pref&&pref!=='zh-CN')ids.add(pref);
    return [...ids];
}
function applyLocale(){
    if(!save)return Promise.resolve();
    const ids=localeFilesToLoad();
    const finish=()=>configureLocale({locale:storedLocalePref()||save.locale,languageLearning:save.languageLearning});
    if(ids.every(hasLocale)){finish();return Promise.resolve();}
    return loadLocaleFiles(ids).then(finish);
}
function setLocale(locale){languageAdventure.close();save.locale=locale;try{localStorage.setItem(LOCALE_PREF_KEY,locale);}catch{}
    applyLocale().then(()=>{
        document.title=tr('魔法哈奇 · 初心之旅');
        if(stage==='title')paintTitle();
        else{persist();paintHud();if(panel)paintPanel();}
        toast('界面语言已更新');
    });}
// 首页第一行是母语：界面语言与学习母语一起改，并避开与第二语言相同。
function setEntryNative(locale){
    if(!isLocaleId(locale))return;
    if(storedSecondLocale()===locale)rememberSecondLocale(locale==='en'?'zh-CN':'en');
    const target=secondLocaleFor(locale);
    if(save?.languageLearning)save.languageLearning={...save.languageLearning,native:locale,target};
    setLocale(locale);
}
function setSecondLocale(locale){
    const native=displayLocale();
    if(!isLocaleId(locale)||locale===native)return;
    languageAdventure.close();rememberSecondLocale(locale);
    if(save?.languageLearning)save.languageLearning={...save.languageLearning,native,target:locale,selectionConfirmed:true};
    applyLocale().then(()=>{
        if(stage==='title')paintTitle();
        else{persist();paintHud();if(panel)paintPanel();}
    });
}
function setLearning(next){if(next.target!==save.languageLearning.target||next.native!==save.languageLearning.native)next={...next,selectionConfirmed:true};languageAdventure.close();save.languageLearning={...save.languageLearning,...next};applyLocale().then(()=>{persist();paintHud();paintPanel();});}
async function applyLearningMode(draft){
    languageAdventure.close();
    const previous={locale:save.locale,learning:save.languageLearning};
    save.locale=draft.locale;save.languageLearning={...save.languageLearning,enabled:true,target:draft.target,native:draft.native,selectionConfirmed:true,showChinese:true};
    persist();if(storageWarning){save.locale=previous.locale;save.languageLearning=previous.learning;return;}
    try{localStorage.setItem(LOCALE_PREF_KEY,draft.locale);}catch{}
    await applyLocale();queueCloudSave();close();paintHud();
}
function openFreeTalk(npc){close();void characterChat.open({...npc,kind:'npc'},{npc});}
function openLanguageTest(){void languageAdventure.open();}
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
function showRewards(before,actionType=''){
    const event=rewardChanges(before,save,assets.content);
    queueCloudSave();
    for(const item of event.items)if(item.kind==='card')item.name=assets.dataset.cards[item.key]?.name||item.name;
    rewardFeedback.push(event);
    if(!storageWarning){const cue=rewardSound(event,actionType);if(cue)spellSound.play(cue);}
}
function toast(message, vars) {
    const filled = vars ? fill(message, vars) : { zh: String(message ?? ''), text: tr(message) };
    if (nodes.toast.dataset) nodes.toast.dataset.zh = filled.zh;
    nodes.toast.textContent = filled.text;
    nodes.toast.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>nodes.toast.classList.remove('visible'),4200);
}
function safely(fn) {try{return fn();}catch(e){toast(e.message);return false;}}
let persistTimer=0;
function queuePersist() {
    if(persistTimer)return;
    persistTimer=setTimeout(()=>{persistTimer=0;persist();},0);
}
function awardLanguageSpeech(eventId,preferredKey=null){
    const result=awardDailySpeech(save,assets.content,eventId,Date.now(),preferredKey);
    if(result){persist();paintHud();toast(`语言学习：${DAILY_BUFF_NAMES[result.key]} +1%（今日 +${result.total} 层）`);}
    return result;
}
let lastLanguageDayCheck=0;
function persist() {
    if(!save||stage==='title')return;
    try {if(!roleStorage)throw Error('尚未选择角色');saveLocal(save,roleStorage);if(save.petInstanceVersion===1){const stored=roleStore.catalog.roles.find(r=>r.id===roleStore.catalog.activeId).save;save.petFileRefs=stored.petFileRefs;save.petPages=stored.petPages;}storageWarning=false;}catch {if(!storageWarning)toast('进度未能保存，可能是其他页面已更新。请勿关闭页面，检查存储后重试。');storageWarning=true;}
    const indicator=document.querySelector('.save-indicator');if(indicator){setText(indicator,storageWarning?'存档未保存':'');indicator.hidden=!storageWarning;}
    lastSave=performance.now();
}
function close({silent=false}={}) {dungeonStory.close();if(stage==='world')nodes.hud.hidden=false;if(!silent&&(panel||dialog))spellSound.play('close');characterChat.close();islandSocial.close();fishingLoadEpoch++;languageAdventure.close();fishingApproach=null;talkApproach=null;sceneFishing.stop();nodes.overlay.disposeDialogue?.();panel=null;dialog=null;dialogDone=null;nodes.overlay.replaceChildren();nodes.overlay.className='overlay';resetMovementInput();nodes.world.focus({preventScroll:true});}
function paintHud() {resetMovementInput();V.renderHud(nodes.hud,model(),{panel:openPanel,membership:()=>openPanel('membership'),cloud:()=>void loginRoles(),track,untrack,leaveDungeon:exitDungeon,interact:interactNearest,mountToggle:()=>performAction({type:'mount-visibility',hidden:!save?.mountHidden})});}
function paintPanel() {
    if(['mail','chat','social-party','social-profile','social-pvp'].includes(panel)){islandSocial.paint(nodes.overlay,panel);return;}
    if(['map','worldmap','localmap'].includes(panel)&&world.layout){renderMaps(nodes.overlay,world,{...model(),socialActors:islandSocial.actors},{close,track,travel,draw:(canvas,options)=>renderer.minimap(canvas,world,save,options),teleport:teleportToLandmark,teleportToPosition,switchMap:view=>openPanel(view==='world'?'worldmap':'map')},panel==='worldmap'?'world':'local');return;}
    if(panel==='cloud'){paintCloud();return;}
    if(panel==='dungeon-story')return;
    if(panel==='dungeon-journey'){renderDungeonJourney(nodes.overlay,{...model(),dungeon:dungeonFor(assets.content,journeyId)},{close,prepare:()=>safely(()=>{void loadAndEnterDungeon(journeyId,journeyRestart);}),claim:floor=>safely(()=>{const next=structuredClone(save),coins=claimTowerReward(next,assets.content,journeyId,floor);saveLocal(next,roleStorage);Object.assign(save,next);queueCloudSave();paintHud();paintPanel();toast(`已领取 ${coins} 奇豆`);})});return;}
    if(panel==='dungeons'){renderDungeons(nodes.overlay,model(),{close:()=>{if(islandSocial.state().pickingDungeon){islandSocial.cancelDungeonPick();openPanel('social-party');return;}close();},enter:loadAndEnterDungeon,leave:exitDungeon,pick:id=>{try{pickDungeonLobby(id);}catch(e){toast(e.message);}},lobby:(id,restart=false)=>{try{pickDungeonLobby(id,restart);}catch(e){toast(e.message);}}});return;}
    if(!panel)return;
    const equipment=['equipment','inventory','shop','pet'].includes(panel);
    const scroll=equipment?nodes.overlay.querySelector('.modal-body')?.scrollTop||0:0;
    const focusLabel=equipment&&nodes.overlay.contains(document.activeElement)?document.activeElement.getAttribute('aria-label')||document.activeElement.textContent:null;
    const focusedMount=panel==='pet'&&nodes.overlay.contains(document.activeElement)?document.activeElement.dataset.mountId:null;
    V.renderPanel(nodes.overlay,panel,{...model(),selectedQuestId,pinJournalQuest},{close,action,seenGuide,deleteRole:deleteCurrentRole,loadPet:id=>loadPet(id).catch(e=>{toast(e.message);return null;}),track,travel,refresh:paintPanel,encounter:id=>interact({kind:'encounter',id}),panel:openPanel,applyDebug,restoreDebug,learningEvent:(event,context)=>languageAdventure.emit(event,event,context),cloud:()=>void loginRoles(),music:toggleMusic,sound:toggleSound,soundVolume:value=>spellSound.setVolume(value),soundPreview:async()=>{await spellSound.unlock();spellSound.play('heal');},title:()=>showTitle(),roles:()=>showTitle(),refreshMembership:()=>refreshMembership(true),becomeVip:()=>openPanel('recharge'),recharge:rechargeMembership,setLocale,setLearning,applyLearningMode,disableLearning:()=>{setLearning({enabled:false});close();paintHud();},languageTest:openLanguageTest});
    if(equipment){
        nodes.overlay.querySelector('.modal-body').scrollTop=scroll;
        if(focusLabel){
            const buttons=[...nodes.overlay.querySelectorAll('button')];
            (buttons.find(b=>focusedMount?b.dataset.mountId===focusedMount:(b.getAttribute('aria-label')||b.textContent)===focusLabel)||nodes.overlay.querySelector('.equipment-detail button:not(:disabled)'))?.focus({preventScroll:true});
        }
    }
}
function openPanel(kind,options={}) {
    if(stage!=='world')return;
    close({silent:true});path=[];destination=null;panel=kind;spellSound.play('open');
    if(kind==='pet')petView.tab='follow';
    if(kind==='settings')V.settingsView.tab='journey';
    if(kind==='shop'&&options.category){
        Object.assign(shopView,{category:options.category,subcategory:options.subcategory??0,subcategoryCategory:options.category,page:0,query:'',ownership:'',level:'',school:'',slot:''});
    }
    if(kind==='npc-services'){serviceNpc=options.npc;Object.assign(npcServiceView,{query:'',page:0,kind:'',category:''});}
    if(kind==='quests'){pinJournalQuest=options.questId!=null;selectedQuestId=options.questId??A.currentQuest(save,assets.content)?.id??assets.content.quests.at(-1)?.id;}
    if(kind==='gems')Object.assign(gemView,{guid:options.guid||null,gemId:null,runes:[null,null,null],runeIndex:0,step:options.guid?'gems':'equipment',filter:0,page:0,mode:'mount',removeIds:[],message:'',confirm:false});
    if(kind==='upgrade')Object.assign(strengtheningView,{guid:initialStrengtheningSelection(save,assets.content,options.itemId,options.guid),filter:0,page:0,pending:false,message:'',offsetX:0,offsetY:0});
    if(['equipment','inventory'].includes(kind)){equipmentView.tab='gear';equipmentView.slot=0;equipmentView.query='';equipmentView.item=null;equipmentView.guid=null;}
    paintPanel();
    if(['inventory','equipment'].includes(kind))languageAdventure.emit('inventory','inventory');
    if(['shop','membership','recharge','checkin'].includes(kind))refreshMembership();
    if(kind==='mail'&&roleStore?.owner)void islandSocial.loadMail();
    // 私聊默认「场景中的玩家」；friendships / friendBlacklists / friendApply 仅在切到「我的好友」时拉取。
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
async function loginForCharacterChat(source,options,resume=()=>characterChat.open(source,options)) {
    if(roles.busy||cloud.busy)return;
    persist();if(storageWarning){toast('当前进度尚未保存，请先重试保存。');return;}
    let transfer;
    try{transfer=roleStore.guestTransfer();}catch(e){toast(e.message);return;}
    const originalId=roleStore.catalog.activeId;
    await showTitle();if(stage!=='title')return;
    await connectRoles(true,{enter:true,transfer});
    if(roles.error||roles.conflict){
        // Cancellation leaves the guest untouched and returns to the same encounter.
        if(!roleStore.owner&&roleStore.catalog.activeId===originalId){await activateRole(originalId);await resume();}
        return;
    }
    if(stage==='world'&&roleStore.owner)await resume();
}
async function loginRoles() {
    if(stage!=='title'){await showTitle();if(stage!=='title')return;}
    // 先停在角色选择；账号里还没有角色时才进入新建。
    await connectRoles(true,{enter:false});
}
function paintCloud() {
    if(panel!=='cloud')return;
    renderCloud(nodes.overlay,{...cloud,local:cloudLocal(),localUpdatedAt:roleStorage&&localUpdatedAt(roleStorage),hasBackup:roleStorage&&!!readBackup(roleStorage)},{close,
        connect:()=>void loginRoles(),
        logout:()=>changeCloudAccount(false),switchAccount:()=>changeCloudAccount(true),
        refresh:()=>cloudAction('正在读取云端目录…',async()=>{cloud.paths=await cloudClient.list();cloud.message=cloud.paths.length?'云端目录已刷新。':'未找到云端记录，可刷新重试。';}),
        upload:()=>cloudAction('正在保存云端进度…',async()=>{const current=cloudLocal();if(!current)throw new Error('请先开始一段冒险。');const result=await cloudClient.upload(current,{roleId:roleStore.catalog.activeId});cloud.paths=[result.path,...cloud.paths.filter(p=>p!==result.path)].sort().reverse().slice(0,30);cloud.message='已保存到云端。';}),
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
    showTitle();if(stage!=='title')return;
    let disconnected=false;
    await roleOperation('正在退出账号…',async()=>{
        let pending=false;try{await syncRoles();}catch{pending=true;}
        await cloudClient.disconnect();resetRoleAccount();localStorage.removeItem(LAST_ACCOUNT_KEY);
        disconnected=true;
        roles.message=pending?'已退出账号。未同步进度保留在原账号的本机缓存。':'已退出账号，本地进度已保留。';
    });
    if(reconnect&&disconnected)await connectRoles();
}
function missingRewardPets(quest){if(!quest)return [];const species=new Set(A.rewardsFor(save,assets.content,quest).filter(r=>r.kind==='pet').map(r=>r.petId));return Object.values(ownedPetRecords(save)).filter(p=>species.has(p.speciesId)&&!save.pets[p.id]).map(p=>p.id);}
function action(value) {
    if(value.type==='feed'){const legacy=Object.values(ownedPetRecords(save)).find(p=>p.speciesId==='legacy_gululu');if(legacy&&!save.pets[legacy.id]){const current=save;return loadPet(legacy.id).then(()=>{if(save===current)return action(value);}).catch(e=>toast(e.message));}}
    if(value.type==='claim'){const ids=missingRewardPets(assets.content.quests.find(q=>q.id===value.questId));if(ids.length){const current=save;return Promise.all(ids.map(loadPet)).then(()=>{if(save===current)return action(value);}).catch(e=>toast(e.message));}}
    if(panel==='quests'&&(value?.type==='abandon-quest'||(value?.type==='track-catalog'&&value.remove)))selectedQuestId=Number(value.questId);
    const product=value.type==='buy'&&assets.content.shop.find(item=>item.id===value.productId);
    const resident=value.type==='npc-purchase'&&assets.content.npcCatalog?.npcs.find(npc=>npc.instanceId===value.npcInstanceId);
    const offer=resident&&npcOffers(assets.content,resident).find(row=>row.id===value.offerId);
    const memberOffer=offer&&assets.content.items[offer.itemId]?.stats?.[180];
    if(!product?.vipOnly&&!memberOffer&&value.type!=='magic-star-claim'&&!(value.type==='checkin'&&value.bonus===true))return performAction(value);
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
// Cosmetic preference only: written to this device's IndexedDB runtime record through
// persist(), stripped by durableSave so it never reaches the cloud or marks progress dirty.
function setMagicStarFollow(follow) {
    if(!save||stage!=='world')return false;
    save.magicStarFollow = follow === true;
    persist();paintPanel();
    toast(save.magicStarFollow ? '魔法星会继续跟随主角。' : '已取消跟随，场景中不再显示魔法星。');
    return true;
}
// Same device-local cosmetic preference; only the roaming scene hides the mount, combat always shows it.
// One click retires the camp deck or strengthening hand. The flag lives on the save so reopening the panel stays quiet.
function seenGuide(key) {
    if(!save||(key!=='teachDeck'&&key!=='teachUpgrade')||save.tips[key])return;
    save.tips[key]=true;persist();
}
function setMountVisibility(hidden) {
    if(!save||stage!=='world')return false;
    save.mountHidden = hidden === true;
    persist();paintHud();
    toast(save.mountHidden ? '坐骑已在场景中隐藏，战斗时仍会出现。' : '坐骑会跟随主角一起行动。');
    return true;
}
function performAction(value,access={}) {return safely(()=>{if(value.type==='pet-feed'&&save.petInstanceVersion===1){petScene.feed(value.petId);paintPanel();return true;}if(value.type==='magic-star-follow')return setMagicStarFollow(value.follow!==false);if(value.type==='mount-visibility')return setMountVisibility(value.hidden===true);const sceneFeedback=value.type==='fish'&&sceneFishing.active;const before=rewardSnapshot(save);const request=value.type==='checkin'?{...value,now:Date.now()}:value;let result;if(['npc-purchase','checkin','magic-star-claim','choose-totem','use-totem-item','fish','stamina-potion'].includes(value.type)){const committed=persistReward(save,assets.content,request,access,roleStorage);save=committed.save;result=committed.result;storageWarning=false;}else{result=A.applyAction(save,assets.content,request,access);persist();if(storageWarning)return false;}if(!sceneFeedback)showRewards(before,value.type);if(['claim','claim-catalog'].includes(value.type))islandSocial.activity('quest');queueCloudSave();paintHud();paintPanel();const text={checkin:'领取成功，奖励已放入背包！',unequip:'装备已卸下，属性与配卡已更新。',equip:'已经装备。属性将在下一场战斗中生效。',ride:'已经骑上坐骑。属性将在下一场战斗中生效。',dismount:'已经下来了。',upgrade:'装备强化成功！',hatch:'咕噜噜从蛋里探出了头，开始跟随你。',feed:'咕噜噜吃饱了，获得了经验！',deck:'卡包已保存。'};if(!sceneFeedback)toast(result?.message||text[value.type]||'进度已保存');if(value.type==='fish')languageAdventure.emit('fish','camp-coast',{caught:!!result?.caught,itemId:result?.items?.[0]?.id});else if(['equip','unequip','ride','dismount'].includes(value.type))languageAdventure.emit('equipment','equipment',{itemId:value.itemId});else if(['buy','npc-purchase','claim','claim-catalog'].includes(value.type))languageAdventure.emit('item-gained','inventory');return result?.message?result:true;});}
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
        toast('会员剩余 {days} 天已兑换为 {beans} 魔豆',{days:quote.days,beans:quote.beans});
        if(announce)showRewards(before);
        paintHud();
        if(panel)paintPanel();
    }catch(error){toast(error.message);}finally{exchangingBeans=false;}
}
function enterWorld(newSave,restoredBattle=null,{announceBeans=true}={}) {
    arenaPickClock.stop();
    teleportEffect=null;
    rewardFeedback.reset();
    petCardsOpen=false;
    runeCardsOpen=false;
    creationPreview?.stop();
    save=newSave;
    initializePetWorld(save,assets.content);
    const reveal=()=>{
    if(assets.content.pets)tickCare(save,assets.content,A.playerSpec(save,assets.content),Date.now(),false);world=W.createWorld(save.zone,assets.content,save);stage='world';path=[];destination=null;animation=null;close();
    if(!W.walkable(world,save.position.x,save.position.y))save.position={...world.center};
    W.updateEncounterVisibility(world,save,Date.now());
    W.resetAutoInteraction(world,save.position);
    void assets.warmScenery?.(world);
    nodes.entry.replaceChildren();nodes.entry.className='';nodes.entry.hidden=true;nodes.hud.hidden=false;
    nodes.battle.disposeHandGesture?.();nodes.battle.replaceChildren();nodes.battle.className='battle-layer';battle=null;paintHud();void islandSocial.enter().catch(e=>toast(e.message));
    if(save.pendingEncounter){battle=restoredBattle||P.restorePveBattle(assets.dataset,assets.content,save.pendingEncounter);stage='battle';nodes.hud.hidden=true;paintBattle();}
    else maybeExchangeMagicBeans({announce:announceBeans});
    persist();queueCloudSave();updateMusic();
    };
    const ids=localeFilesToLoad();
    if(ids.every(hasLocale)){configureLocale({locale:storedLocalePref()||save.locale,languageLearning:save.languageLearning});reveal();return;}
    return loadLocaleFiles(ids).then(()=>{if(save!==newSave)return;configureLocale({locale:storedLocalePref()||save.locale,languageLearning:save.languageLearning});reveal();});
}
async function showTitle() {
    spellSound.stop();
    persist();if(storageWarning&&stage!=='title'){toast('当前进度尚未保存，请勿关闭页面。请检查浏览器存储或重试。');return;}close();rewardFeedback.reset();stage='title';keys.clear();path=[];destination=null;animation=null;battle=null;
    music?.pause();nodes.hud.hidden=true;nodes.battle.disposeHandGesture?.();nodes.battle.replaceChildren();nodes.battle.className='battle-layer';
    save=roleStore.catalog.roles.find(row=>row.id===roleStore.catalog.activeId)?.save||A.createAdventure(assets.content);
    await applyLocale();
    if(stage!=='title')return;
    nodes.entry.hidden=false;
    world=W.createWorld(save.zone,assets.content,save);
    void assets.warmScenery?.(world);
    titleView=roleStore.catalog.roles.length?'roles':'create';
    if(titleView==='create')roleDraft=null;paintTitle();
}
function deleteCurrentRole() {
    if (roles.busy || cloud.busy || roles.conflict || stage !== 'world' || save?.pendingEncounter) {
        toast('当前无法删除角色，请结束战斗或处理云端同步后重试。');return;
    }
    return roleOperation('正在删除角色…', async () => {
        roleStore.remove(roleStore.catalog.activeId);
        autoSave.reset();roleEpoch++;roleStorage=null;stage='title';
        await showTitle();
        try {
            await syncRoles();
            roles.message=roleStore.owner&&roleStore.dirty?'角色已从本机删除，云端删除尚未同步，请在角色列表重试同步。':'角色已删除。';
        } catch (error) {
            throw Error(`${tr('角色已从本机删除，云端删除尚未同步，请在角色列表重试同步。')} ${error.message}`);
        }
    });
}
function paintTitle() {
    if(stage!=='title')return;
    if(roles.conflict || (roleStore.owner && roleStore.dirty && !roleStore.catalog.roles.length))titleView='roles';
    if(titleView==='create')paintCreation();else paintRoles();
}
function paintRoles() {
    if(stage!=='title')return;
    creationPreview?.stop();
    renderRoles(nodes.entry,assets,{...roles,owner:roleStore.owner,catalog:roleStore.catalog,dirty:roleStore.dirty,locale:displayLocale()},{
        setLocale:setEntryNative,setSecondLocale,secondLocale:secondLocaleFor(displayLocale()),
        select:id=>roleOperation('正在进入角色…',async()=>{await activateRole(id);await syncRoles();}),
        create:newRoleForm,login:()=>void loginRoles(),logout:()=>roleOperation('正在退出…',async()=>{
            let pending=false;try{await syncRoles();}catch{pending=true;}
            await cloudClient.disconnect();resetRoleAccount();localStorage.removeItem(LAST_ACCOUNT_KEY);
            if(pending)roles.message='已退出账号。未同步进度仍保留在该账号的本机缓存，下次登录可继续。';
        }),
        sync:()=>roleOperation('正在保存角色…',syncRoles),
        refresh:()=>roleOperation('正在读取角色…',async()=>{const remote=await cloudClient.roles({refresh:true});await reconcileRoles(remote);if(!roles.conflict&&remote.partsStale?.length)await syncRoles(true);}),
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
    return enterWorld(restored.save,restored.battle);
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
    roleDraft||=createHeroDraft(assets.hero?.manifest);
    V.renderEntry(nodes.entry,assets,null,{
        draft:roleDraft,busy:roles.busy,owner:roleStore.owner,
        setLocale:setEntryNative,setSecondLocale,locale:displayLocale(),secondLocale:secondLocaleFor(displayLocale()),
        roles:roleStore.catalog.roles.length?()=>{titleView='roles';paintRoles();}:null,
        accountChoice:!roleStore.owner&&!roleStore.catalog.roles.length,
        login:()=>void loginRoles(),cloud:()=>void loginRoles(),
        importOriginal:beginOriginalImport,
        previewChoices:school=>tutorialCards(assets,school),
        preview:(...args)=>creationPreview.play(...args),stopPreview:()=>creationPreview.stop(),pausePreview:()=>creationPreview.togglePause(),
        create:options=>roleOperation('正在创建角色…',async()=>{
            if(roleStore.owner){await reconcileRoles(await cloudClient.roles());if(roles.conflict)throw Error('请先处理角色云端冲突，再新建角色。');}
            const next=A.createAdventure(assets.content,{...options,seed:Date.now()});
            const native=displayLocale(),target=secondLocaleFor(native);
            next.locale=native;
            next.languageLearning={...next.languageLearning,native,target,selectionConfirmed:true};
            const id=roleStore.create(next);activateRole(id);await syncRoles();
        })
    },roles.error);
}
async function syncRoles(force = false) {
    // force rewrites cloud part files whose old-format witnesses failed the strict join,
    // even when durable progress is unchanged; normal saves stay gated on dirty.
    if(!roleStore.owner||(!force&&!roleStore.dirty)||roleStore.catalog.roles.some(row=>row.save.pendingEncounter))return;
    if(roles.conflict)throw Error('角色有云端冲突，本地进度已保留。请在角色列表处理。');
    const epoch=roleEpoch,captured=roleStore.checkpoint(),owner=roleStore.owner;
    const revision=await cloudClient.saveRoles(JSON.parse(captured),roleStore.base,{onProgress:({done,total})=>{
        if(done!==1&&done!==total&&done%5)return;
        const label=`正在同步云端宠物 ${done}/${total}…`;
        if(roles.busy===label)return;
        roles.busy=label;if(stage==='title')paintTitle();
    }});
    if(epoch!==roleEpoch||owner!==roleStore.owner)throw Error('账号已切换，请重新连接。');
    roleStore.markSynced(revision,captured);lastRoleSync=performance.now();roles.message='角色已保存到云端。';
}
async function reconcileRoles(remote) {
    const epoch=roleEpoch;
    if(remote.owner!==roleStore.owner||remote.owner!==cloudClient.owner)throw Error('账号已变化，请重新登录。');
    if(roleStore.dirty&&roleStore.base!==remote.revision){roles.conflict=remote;roles.error='本地有未同步进度，与本次读取的云端版本不同，请先备份再加载云端。';return;}
    if(epoch!==roleEpoch)throw Error('账号已变化，请重新登录。');
    if(!roleStore.dirty)roleStore.replace(remote.catalog,remote.revision);
    roleStorage=roleStore.catalog.activeId?roleStore.scoped():null;roles.conflict=null;
}
function connectRoles(interactive=true, {enter=false,transfer=null}={}) {
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
        const stale=remote.partsStale?.length>0;
        const id=transfer?roleStore.adoptGuest(transfer):startupRoleId(roleStore.catalog,{direct:enter});
        if(transfer){await syncRoles(true);if(roleStore.dirty)throw Error('角色尚未完成云端同步，请重试。');}
        if(id){await activateRole(id);await syncRoles(stale);return;}
        titleView=roleStore.catalog.roles.length?'roles':'create';
        if(titleView==='create')roleDraft=null;
        if(stale)await syncRoles(true);
    });
}
function resetRoleAccount() {
    // Persist against the old scope before changing identity. Never assign an
    // account's active save to the guest namespace on logout/auth expiration.
    persist();autoSave.reset();roleEpoch++;roleStore.open(null);roleStorage=roleStore.catalog.activeId?roleStore.scoped():null;
    roles.conflict=null;roles.message='';cloud.owner=null;cloud.paths=[];cloud.preview=null;
    stage='title';showTitle();
}
function updateMusic() {
    if(!assets||!save)return;
    if(!music){music=new Audio(assets.urlFor(assets.content.extras.music.id));music.loop=true;music.volume=.24;music.onerror=()=>{if(save.music)toast('背景音乐暂时不可用，可以继续游玩。');};}
    if(save.music&&stage!=='title')music.play().catch(()=>{if(music.error)toast('背景音乐暂时不可用，可以继续游玩。');});else music.pause();
}
function toggleMusic(){save.music=!save.music;persist();updateMusic();paintPanel();}
function showTeleportEffect(){
    if(!storageWarning)spellSound.play('teleport');
    resetMovementInput();path=[];destination=null;moving=false;
    teleportEffect={...save.position,started:performance.now()};
}
function teleportToLandmark(id){safely(()=>{
    if(stage!=='world'||save.pendingEncounter)throw Error('请先完成当前战斗');
    const target=world.landmarks.find(mark=>mark.id===id);
    if(!target||!W.walkable(world,target.x,target.y))throw Error('此地点暂时无法抵达');
    close();path=[];destination=null;save.position={x:target.x,y:target.y};save.revision++;persist();paintHud();showTeleportEffect();
});}
function teleportToPosition(x,y){safely(()=>{
    if(stage!=='world'||save.pendingEncounter)throw Error('请先完成当前战斗');
    const clearance=SOCIAL_DEFAULTS.separation;
    const target=W.clearTeleportSpot(world,x,y,islandSocial.actors,clearance);
    if(!target)throw Error('此地点暂时无法抵达');
    // Face the nearest NPC/actor so map teleports can look at each other side-by-side.
    let nearest=null,nearestDist=Infinity;
    for(const o of [...(world.npcs||[]),...islandSocial.actors]){
        const p=o?.position&&Number.isFinite(o.position.x)?o.position:o;
        if(!Number.isFinite(p?.x)||!Number.isFinite(p?.y))continue;
        const d=Math.hypot(p.x-target.x,p.y-target.y);
        if(d<nearestDist){nearestDist=d;nearest=p;}
    }
    if(nearest&&nearestDist<SOCIAL_DEFAULTS.approachRadius){
        const dx=nearest.x-target.x,dy=nearest.y-target.y;
        save.facing=Math.abs(dx)>Math.abs(dy)?(dx<0?1:2):(dy<0?3:0);
    }
    close();path=[];destination=null;save.position={x:target.x,y:target.y};save.revision++;persist();paintHud();showTeleportEffect();
});}
async function loadAndEnterDungeon(id,restart=false){
    if(dungeonLoading||stage!=='world')return;
    if(restart&&!dungeonFor(assets.content,id)?.kind&&!confirm(tr('重新开启会重置该副本的清怪进度，确定继续吗？')))return;
    const target=save,epoch=roleEpoch,zone=save.zone,fromParty=panel==='social-party';
    dungeonLoading=id;paintPanel();
    try{
        await assets.dungeons.load(id);
        if(save!==target||epoch!==roleEpoch||stage!=='world'||!['dungeons','social-party','dungeon-journey'].includes(panel)||save.zone!==zone)return;
        if(save.coopRun&&save.coopRun.dungeonId!==id)throw Error('请先暂离当前组队副本');
        const next=structuredClone(save);
        if(islandSocial.team.length&&!next.coopRun){if(dungeonFor(assets.content,next.zone))leaveDungeon(next,assets.content);startCoopRun(next,islandSocial.preparedTeam(),assets.dataset,dungeonFor(assets.content,id),A.playerSpec(next,assets.content));next.coopRun.relationshipRunId=crypto.randomUUID();}
        if(restart&&next.coopRun){const members=next.coopRun.members.map(m=>m.profile),hero=next.coopRun.hero;leaveDungeon(next,assets.content);startCoopRun(next,members,assets.dataset,dungeonFor(assets.content,id),hero);next.coopRun.relationshipRunId=crypto.randomUUID();}
        const d=dungeonFor(assets.content,id);
        const party=journeyCoopParty(next,A.playerSpec(next,assets.content))||journeyPetParty(next,assets.content,A.playerSpec(next,assets.content));
        if(d.kind==='tower')next.dungeonMode=Math.max(1,Math.min(4,party?.length||1));
        journeyParty(next,d,party);
        enterDungeon(next,assets.content,id,{restart});delete save.dungeonLanguageBuff;Object.assign(save,next);await enterWorld(save);queueCloudSave();
        if(fromParty)close();
        if(d.kind&&d.story?.length&&save===target&&epoch===roleEpoch&&save.zone===id){
            renderer.render(world,save,performance.now(),{socialActors:islandSocial.actors});
            panel='dungeon-story';nodes.hud.hidden=true;dungeonStory.open(d);
        }
    }catch(error){toast('副本加载失败：{message}，请重试。',{message:error.message});if(error.message.includes('出战单位')&&dungeonFor(assets.content,id)?.kind)islandSocial.pickPartyDungeon(id,{restart});}
    finally{dungeonLoading=null;if(panel==='dungeons')paintPanel();}
}
function exitDungeon(){safely(()=>{leaveDungeon(save,assets.content);enterWorld(save);queueCloudSave();});}
function travel(zone){safely(()=>{
    const status=travelStatus(save,assets.content,zone);
    if(status.allowed&&status.requiresConfirmation&&!window.confirm(tr('那里很危险，确定还要前往吗？')))return;
    if(dungeonFor(assets.content,save.zone))leaveDungeon(save,assets.content);
    A.applyAction(save,assets.content,{type:'travel',zone});enterWorld(save);showTeleportEffect();toast('已抵达{name}。',{name:islandName(zone)});
});}
const dialogueVoice=createLearningVoice({getSettings:()=>save?.languageLearning||{}});
function finishTrackedDialogue() {
    if(!dialog?.fromQuestTracking)return false;
    close();
    if(rewardFeedback.hasPendingItems)return true;
    const content=assets.content;
    const ids=trackedQuestIds(save).filter(id=>content.quests.some(quest=>quest.id===id)||content.catalogQuests?.byId[id]);
    if(!ids.length){const quest=A.currentQuest(save,content);if(quest)ids.push(quest.id);}
    if(ids.length===1)track(ids[0],{pin:false});
    return true;
}
function paintDialogue(){if(dialog)V.renderDialogue(nodes.overlay,model(),dialog,{close,mapDialogue,readDialogue:(text,locale,signal)=>dialogueVoice.speak(text,locale,signal),next:nextDialogue,startQuest:q=>startLines(q.startDialog,'接取任务',()=>{
    const result=A.applyAction(save,assets.content,{type:'accept',questId:q.id,npcId:q.startNpc});toast(result.full?'已接取：{title}。追踪已满3个，请先取消一条。':'已接取：{title}',{title:q.title});
}),finishQuest:q=>startLines(q.endDialog,'领取奖励',()=>{
    const before=rewardSnapshot(save);
    A.applyAction(save,assets.content,{type:'claim',questId:q.id,npcId:q.endNpc});islandSocial.activity('quest');
    persist();showRewards(before,'claim');return 'reward';
}),startCatalog:q=>{
    const result=A.applyAction(save,assets.content,{type:'accept-catalog',questId:q.id,npcId:q.startNpc});persist();toast(result.full?'已接取：{title}。追踪已满3个，请先取消一条。':'已接取：{title}',{title:q.title});paintHud();if(!finishTrackedDialogue())paintDialogue();
},finishCatalog:q=>{
    const before=rewardSnapshot(save);
    A.applyAction(save,assets.content,{type:'claim-catalog',questId:q.id,npcId:q.endNpc});
    persist();islandSocial.activity('quest');showRewards(before,'claim-catalog');toast('已完成：{title}',{title:q.title});paintHud();if(!finishTrackedDialogue())close();
},questTalk:(q,talk)=>startQuestTalk(talk),panel:openPanel,travel,track});}
function startQuestTalk(talk) {
    startLines(talk.dialog,talk.dialog.at(-1)?.buttons?.[0]?.label||'谢谢你',()=>{
        A.applyAction(save,assets.content,{type:'talk',npcId:talk.npcId});
        return true;
    });
}
function startLines(lines,finishLabel,done) {
    dialog.lines=lines;dialog.index=0;dialog.finishLabel=finishLabel;dialogDone=done;
    if(!lines.length)nextDialogue();else paintDialogue();
}
async function nextDialogue() {
    if(!dialog)return;
    if(dialog.index+1<dialog.lines.length){dialog.index++;paintDialogue();return;}
    const current=dialog;try{await Promise.all(missingRewardPets(A.currentQuest(save,assets.content)).map(loadPet));}catch(error){toast(error.message);return;}if(dialog!==current)return;
    safely(()=>{
        const npcId=dialog.npcId,advance=dialogDone?.();petScene.dialogue(`resident:${npcId}`);dialogDone=null;persist();queueCloudSave();paintHud();
        if(finishTrackedDialogue())return;
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
        if((target.id===36205||target.name==='法斯特船长')&&!(save.zone==='camp'&&save.languageLearning?.enabled)){openPanel('worldmap');return;}
        close();dialog={npcId:target.id,npc:target,questDialogue:target.questDialogue===true,fromQuestTracking:target.questDialogue===true};
        const talk=target.questDialogue&&A.pendingQuestTalk(save,A.currentQuest(save,assets.content),target.id);
        if(talk)startQuestTalk(talk);else paintDialogue();
    }
    if(target.kind==='portal'&&(target.id===world.entrancePortal?.id||!world.portal.hidden)){if(dungeonFor(assets.content,save.zone))exitDungeon();else openPanel('worldmap');}
    if(target.kind==='landmark'&&target.dungeonId){openJourney(target.dungeonId);return;}
    if(target.kind==='landmark')toast('{name}：{description}',{name:target.name,description:target.description});
    if(target.kind==='encounter')safely(()=>{
        A.beginEncounter(save,assets.content,target.id,{keepworkVip:membership.state.isVip,expiresAt:membership.state.expiresAt,now:Date.now()});persist();
        battle=P.restorePveBattle(assets.dataset,assets.content,save.pendingEncounter);stage='battle';close();nodes.hud.hidden=true;
        selected=null;discarded=[];animation=null;petCardsOpen=false;runeCardsOpen=false;paintBattle();
    });
}
function interactNearest(){if(!panel&&!dialog&&!characterChat.active)interact(W.nearestInteraction(world,save.position));}
function walkTo(target,autoInteract=false) {
    close();path=W.findPath(world,save.position,target);destination=autoInteract?target:null;
    if(autoInteract&&W.distance(save.position,target)<85){interact(target);return;}
    if(!path.length)toast('这里暂时走不过去，试试旁边的小路。');
}
// The pet leads the way: walk to the story contact named by the bubble, then open the chat there.
function approachInvite() {
    const invite=languageAdventure.invitation;
    if(!invite||stage!=='world')return false;
    const npc=world.npcs.find(n=>invite.instanceId?n.instanceId===invite.instanceId:String(n.id)===String(invite.npcId));
    if(!npc)return false;
    const target={...npc,kind:'npc'};
    close();path=[];destination=null;
    void languageAdventure.prepare(target).then(prepared=>{
        if(!prepared||!languageAdventure.preparedValid(prepared))return;
        if(W.distance(save.position,target)<=learningParams(assets.content).interactionRange){languageAdventure.greet(prepared,performance.now());return;}
        path=W.findPath(world,save.position,target);
        if(!path.length){toast('这里暂时走不过去，试试旁边的小路。');return;}
        talkApproach=prepared;
    }).catch(error=>toast(error.message));
    return true;
}
function untrack(questId){safely(()=>{A.applyAction(save,assets.content,{type:'track-catalog',questId:questId??null,remove:questId!=null});paintHud();});}
function trackCatalog(id) {
    const c=assets.content,quest=c.catalogQuests.byId[id],snap=A.catalogStatSnapshot(save,c);
    const state=A.questState(save,id),ready=catalogQuestReady(save,c,quest,snap);
    const goal=catalogGoalRows(save,c,quest,snap).find(g=>g.value<g.count);
    const npcId=!state.accepted?quest.startNpc:ready?quest.endNpc:goal?.kind==='talk'?goal.id:0;
    if(!state.accepted&&catalogAcceptBlock(save,c,quest,snap)){toast(catalogAcceptBlock(save,c,quest,snap));return;}
    if(!state.accepted&&(!c.npcs[quest.startNpc]||quest.startNpc===-1)){A.applyAction(save,c,{type:'accept-catalog',questId:id,npcId:quest.startNpc});toast('已接取：{title}',{title:quest.title});paintHud();return;}
    if(ready&&(!c.npcs[quest.endNpc]||quest.endNpc===-1)){
        const before=rewardSnapshot(save);
        A.applyAction(save,c,{type:'claim-catalog',questId:id,npcId:quest.endNpc});
        persist();showRewards(before,'claim-catalog');toast('已完成：{title}',{title:quest.title});paintHud();return;
    }
    if(npcId&&c.npcs[npcId]){
        if(save.zone!==c.npcs[npcId].zone){travel(c.npcs[npcId].zone);if(save.zone!==c.npcs[npcId].zone)return;}
        const placed=world.npcs.find(n=>n.id===npcId);
        if(placed){walkTo({...placed,kind:'npc',questDialogue:true},true);return;}
        if(!state.accepted){A.applyAction(save,c,{type:'accept-catalog',questId:id,npcId:quest.startNpc});toast('已接取：{title}',{title:quest.title});paintHud();return;}
        if(ready){const before=rewardSnapshot(save);A.applyAction(save,c,{type:'claim-catalog',questId:id,npcId:quest.endNpc});persist();showRewards(before,'claim-catalog');toast('已完成：{title}',{title:quest.title});paintHud();return;}
    }
    if(goal&&(goal.kind==='kill'||goal.kind==='loot')){
        const encounter=catalogGoalEncounter(c,goal,save.zone,quest.region);
        if(encounter&&!dungeonFor(c,encounter.zone)&&save.zone!==encounter.zone){
            travel(encounter.zone);if(save.zone!==encounter.zone)return;
        }
        const placed=encounter&&world.encounters.find(e=>e.id===encounter.id);
        if(placed){walkTo({...placed,kind:'encounter'},true);return;}
        if(encounter){toast('前往副本挑战{name}',{name:goal.name});openPanel('dungeons');return;}
        const blocked=catalogGoalEncounter(c,goal,save.zone,quest.region,true);
        if(blocked?.blocked?.length){toast(blocked.blocked.join('；'));return;}
        toast('{name}不在当前已开放的遭遇里。',{name:goal.name});return;
    }
    if(goal?.kind==='custom'&&[79016,79025].includes(goal.id)){openPanel('upgrade');return;}
    if(goal?.kind==='custom'&&[79017,79026].includes(goal.id)){openPanel('inventory');return;}
    if(goal?.kind==='custom'&&goal.id===79019){openPanel('pet');return;}
    if(goal?.kind==='custom'&&goal.id===79037){openPanel('deck');return;}
    toast(goal?'{name}需要在冒险中继续完成。':'任务已记录在手记中。',goal?{name:goal.name}:undefined);
    paintHud();
}
function track(questId, options={}) {
    if(stage!=='world')return;close();
    const c=assets.content,id=Number(questId);
    const quest=id&&(c.catalogQuests?.byId[id]||c.quests.find(item=>item.id===id));
    if(quest&&options.pin!==false){
        const result=safely(()=>A.applyAction(save,c,{type:'track-catalog',questId:id}));
        if(result===false)return;
        if(result?.full)toast('最多同时追踪3个任务，请先取消一条。');
        if(result?.changed){persist();paintHud();}
    }
    if(c.catalogQuests?.byId[id]){trackCatalog(id);return;}
    if(dungeonFor(c,save.zone)&&!quest)return;
    const chapter=c.quests.find(item=>item.id===id)||(!quest&&A.currentQuest(save,c));
    if(!chapter){walkTo({...world.portal,kind:'portal'},true);return;}
    if(save.zone!==c.npcs[chapter.startNpc].zone){travel(c.npcs[chapter.startNpc].zone);if(save.zone!==c.npcs[chapter.startNpc].zone)return;}
    const npc=nid=>({...world.npcs.find(n=>n.id===nid),kind:'npc',questDialogue:true}),state=A.questState(save,chapter.id);
    if(!state.accepted){walkTo(npc(chapter.startNpc),true);return;}
    if(A.questReady(save,chapter)){walkTo(npc(chapter.endNpc),true);return;}
    const goal=A.questProgress(save,chapter).find(g=>g.value<g.count);
    if(!goal)return;
    if(goal.kind==='talk')walkTo(npc(goal.id),true);
    if(goal.kind==='defeat') {
        const monster=Object.values(c.monsters).find(m=>m.goalId===goal.id);
        walkTo({...world.encounters.find(e=>e.monsterId===monster.id),kind:'encounter'},true);
    }
    if(goal.kind==='action')openPanel(goal.id===79016?'upgrade':goal.id==='hatch-pet'||goal.id===79019?'pet':goal.id===79037&&save.equipment[24]===24003?'deck':'inventory');
}
function refreshPetHint(){
    if(battle?.redMushroom)return;
    if(!battle||battle.finished||animation)return;
    const current=battle,advisor=advisorFor(current);
    if(advisor.muted)return;
    const observation=observeBattle(current,current.sides.near[0].id),stateId=haqiRulesAdapter.stateId(observation);
    if(advisor.hintState===stateId||advisor.hintLoading===stateId)return;
    advisor.hintAnalysis=null;advisor.hintLoading=stateId;
    battleAIClient.analyze(observation,{difficulty:'expert',memory:advisor.strategyMemory||{}}).then(analysis=>{
        if(advisor.hintLoading===stateId)advisor.hintLoading=null;
        if(stage!=='battle'||battle!==current||battle.finished||animation||advisor.muted||haqiRulesAdapter.stateId(observeBattle(current,current.sides.near[0].id))!==stateId)return;
        advisor.hintState=stateId;advisor.hintAnalysis=analysis;advisor.strategyMemory=analysis.memory;paintBattle();
    }).catch(()=>{if(advisor.hintLoading===stateId)advisor.hintLoading=null;advisor.hintState=stateId;});
}
function paintBattle(){
    refreshPetHint();
    const advisor=advisorFor(battle),aiReview=battle.finished&&!battle.redMushroom?advisor.session.review(battle):null;
    const growth=aiReview?recommendProgression(aiReview,{routes:adventureProgressionRoutes(save,assets.content)}):[];
    const hero=battle.sides.near[0],hand=[...selectableCards(hero),...P.runeCardsInHand(battle)];
    for(const card of Object.values(battle.resolved.cards||{})){const base=assets.effects.cards[card.key]?.base;if(base)assets.skillArt.ensure(base).catch(()=>{});}
    if(selected&&(discarded.includes(selected.seq)||!hand.some(h=>h.seq===selected.seq&&h.key===selected.key)))selected=null;
    V.renderBattle(nodes.battle,{...model(),aiReview,aiHintsMuted:advisor.muted,aiHint:advisor.dismissedHintState===advisor.hintState?null:advisor.hintAnalysis?.candidates.find(row=>!discarded.includes(row.action.seq)),aiGrowth:growth,petCardsOpen,runeCardsOpen,runeHand:P.runeCardsInHand(battle)},{aiHintsToggle:()=>{advisor.muted=!advisor.muted;advisor.dismissedHintState=null;paintBattle();},aiHintDismiss:()=>{advisor.dismissedHintState=advisor.hintState;},aiNavigate:entry=>{if(!battle.finished)return;const before=rewardSnapshot(save);const settle=A.settleEncounter(save,assets.content,battle,{now:Date.now()});islandSocial.settled(battle);enterWorld(save,null,{announceBeans:false});showRewards(before);if(settle?.insufficientStamina)toast('你的精力值不足，无法得到这场战斗的战利品。');openPanel(entry);},toggleRunes:()=>{if(animation||battle.finished)return;runeCardsOpen=!runeCardsOpen;petCardsOpen=false;selected=null;paintBattle();},togglePetCards:()=>{if(animation||battle.finished)return;petCardsOpen=!petCardsOpen;runeCardsOpen=false;selected=null;paintBattle();},sound:toggleSound,cloud:openCloud,swipePlay:h=>{
        if(animation)return;
        const intent=resolveHandSwipe(battle,h,discarded);
        if(!intent)return;
        selected=h;
        if(intent.decision)playRound(intent.decision);
        else {paintBattle();toast(intent.message);}
    },reselect:()=>{if(animation||battle.finished)return;selected=null;paintBattle();},select:h=>{if(animation||battle.finished||!h||discarded.includes(h.seq))return;selected=h;spellSound.play('select');paintBattle();},discard:seq=>{
    if(animation||battle.finished||seq<0||seq>=PET_CARD_SEQ_BASE||discarded.includes(seq)||!hand.some(h=>h.seq===seq))return;spellSound.play('discard');discarded=[...discarded,seq];if(selected?.seq===seq)selected=null;paintBattle();
},target:id=>{
    if(!selected||animation||battle.finished)return;
    const card=battle.resolved.cards[selected.key];
    const message=discarded.includes(selected.seq)?'这张卡牌已弃掉':castBlockedMessage(hero,card,battle.resolved);
    if(message){toast(message);return;}
    if(!validTargets(battle,hero,card).some(t=>t.id===id)){toast('请选择这张卡牌可施放的目标。');return;}
    playRound({...selected,targetId:id,discardSeqs:discarded});
},openRunes:()=>{if(animation||battle.finished)return;runeCardsOpen=true;petCardsOpen=false;selected=null;paintBattle();},pass:()=>playRound({pass:true,discardSeqs:discarded}),retreat:()=>{
    if(battle.redMushroom){leaveArenaCombat();return;}
    if(assets.content.pets)A.settleParty(save,assets.content,battle,{retreat:true});
    const result=A.applyAction(save,assets.content,{type:'retreat'});save.careAt=Date.now();enterWorld(save);toast(result?.message||'你撤到了怪物附近。已保留物品与任务进度。');
},finish:()=>safely(()=>{if(battle.redMushroom){leaveArenaCombat();return;}const before=rewardSnapshot(save);const settle=A.settleEncounter(save,assets.content,battle,{now:Date.now()});islandSocial.settled(battle);if(battle.winner==='near')islandSocial.activity('battle');save.careAt=Date.now();enterWorld(save,null,{announceBeans:false});showRewards(before);if(settle?.insufficientStamina)toast('你的精力值不足，无法得到这场战斗的战利品。');if(save.coopRun&&save.coopRun.runs[save.zone]?.cleared.length===dungeonFor(assets.content,save.zone)?.arenas.length)openPanel('social-party');}),battleTalk:()=>void languageAdventure.open()});}
function playRound(decision,readyAnalysis=null) {
    if(animation||battle.finished)return;
    const advisor=advisorFor(battle);
    if(battle.redMushroom){
        if(arenaPickClock.claim().expired)decision={pass:true};
        readyAnalysis={candidates:[],evaluated:[],settings:battle.resolved.battleAI};
    }
    if(!readyAnalysis&&advisor.hintAnalysis?.stateId===haqiRulesAdapter.stateId(observeBattle(battle,battle.sides.near[0].id)))readyAnalysis=advisor.hintAnalysis;
    if(!readyAnalysis){
        if(advisor.analyzing)return;
        const currentBattle=battle,observation=observeBattle(battle,battle.sides.near[0].id);
        advisor.analyzing=true;
        battleAIClient.analyze(observation,{difficulty:'expert',memory:advisor.strategyMemory||{}}).then(analysis=>{
            advisor.analyzing=false;
            if(battle!==currentBattle||battle.finished||animation||haqiRulesAdapter.stateId(observeBattle(battle,battle.sides.near[0].id))!==analysis.stateId)return;
            playRound(decision,analysis);
        }).catch(()=>{advisor.analyzing=false;if(battle===currentBattle&&!animation&&!battle.finished){toast('分析暂时不可用，按原选择继续。');playRound(decision,{candidates:[],evaluated:[],settings:battle.resolved.battleAI});}});
        return;
    }
    safely(()=>{
        const analysis=readyAnalysis;advisor.strategyMemory=analysis.memory||advisor.strategyMemory;
        if(!battle.redMushroom)advisor.session.record(battle,analysis,decision);
        decision={...decision,aiVersion:1};
        const hp=Object.fromEntries(Object.values(battle.unitsById).map(u=>[u.id,u.hp])),aura=battle.aura?{...battle.aura}:null;
        const hand=cardsInHand(battle.sides.near[0]),previous=nextBattlePointer(battle);
        const playback=captureBattlePresentation(battle,()=>battle.redMushroom?islandSocial.playArena(decision):P.playPveRound(battle,decision));
        if(!battle.redMushroom){A.recordDecision(save,battle.lastDecision||decision,battle);persist();}selected=null;discarded=[];petCardsOpen=false;runeCardsOpen=false;
        const events=playback.events;
        // Preserve surviving hand IDs while hidden, so only new cards deal in after ALL events.
        animation={events:withBattlePointer(events.map(e=>({...e,periodic:e.type==='dot'||e.type==='hot',type:e.type==='dot'?'damage':e.type==='hot'?'heal':e.type})),previous,nextBattlePointer(battle)),pointer:previous,index:0,start:performance.now(),hp,aura,status:playback.initial,statusFeedback:[],entered:-1,hand:hand.filter(h=>(decision.pass||decision.capture||h.seq!==decision.seq)&&!decision.discardSeqs?.includes(h.seq))};paintBattle();
    });
}
function tickAnimation(now) {
    if(!animation){spellSound.stopCast();return null;}
    const a=animation,e=a.events[a.index];
    if(now<a.start)return {hp:a.hp,aura:a.aura,status:a.status,statusFeedback:a.statusFeedback};
    if(!e){spellSound.stopCast();animation=null;if(battle.redMushroom&&!battle.finished)arenaPickClock.start(battle.resolved.redMushroom.pickMs);if(battle.finished)spellSound.play(battle.winner==='near'?'victory':'defeat');paintBattle();return null;}
    if(a.entered!==a.index){a.entered=a.index;
        const cue=battleEventSound(a.events,a.index);if(cue&&a.index>(a.silentThrough??-1))spellSound.play(cue);
        if(e.status){
            a.statusFeedback.push(...battleStatusChanges(a.status,e.status,e).map(change=>({...change,start:now})));
            a.status=e.status;
        }
        if(e.type==='damage')a.hp[e.target]=Math.max(0,a.hp[e.target]-e.amount);
        if(e.type==='heal')a.hp[e.target]=Math.min(battle.unitsById[e.target].maxHp,a.hp[e.target]+e.amount);
        const text=e.type==='speak'?'':V.eventLabel(e,battle,assets);if(text||e.type==='speak')$('cast-announcement').textContent=text;
    }
    a.statusFeedback=a.statusFeedback.filter(change=>now-change.start<700);
    const duration=presentationEventDurationMs(e,{effects:assets.effects,card:battle.resolved.cards[e.card],hp:a.hp[e.target],reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches});
    const progress=Math.min(1,(now-a.start)/duration);
    const card=battle.resolved.cards[e.card],spec=card&&assets.effects.bases[assets.effects.cards[card.key]?.base];
    const impact=spec?.kind==='summon'?assets.effects.timeline.summonImpact:assets.effects.timeline.impact;
    a.aura=presentedEnvironment(a.aura,a.events,a.index,progress,impact);
    const reactions=castHitReactions(a.events,a.index,progress,duration,impact);
    a.recoiledEvents??=new Set();for(const reaction of reactions)a.recoiledEvents.add(reaction.eventIndex);
    const recoilPlayed=a.recoiledEvents.has(a.index);
    if(e.type==='cast'||e.type==='fizzle')spellSound.track(assets.effects,battle.resolved.cards[e.card],progress,{active:!document.hidden&&a.index>(a.silentThrough??-1),failed:e.type==='fizzle',reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,instance:String(a.index)});
    else spellSound.stopCast();
    const pointer=e.type==='movearrow'?{from:e.from,to:e.caster,progress}:{from:a.pointer,to:a.pointer,progress:1};
    if(progress===1){if(e.type==='movearrow')a.pointer=e.caster;a.index++;a.start=now;}
    return{event:{...e,recoilPlayed,school:e.school||battle.resolved.cards[e.card]?.spellSchool},progress,hp:a.hp,aura:a.aura,status:a.status,statusFeedback:a.statusFeedback,reactions,pointer};
}
const directionKeys={w:'up',arrowup:'up',s:'down',arrowdown:'down',a:'left',arrowleft:'left',d:'right',arrowright:'right'};
window.addEventListener('keydown',e=>{
    if(languageAdventure.active)return;
    if(rewardRoot.contains(e.target))return;
    if(sceneFishing.key(e)){e.preventDefault();return;}
    if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;
    const key=e.key.toLowerCase();if(directionKeys[key]&&stage==='world'&&!panel&&!dialog){e.preventDefault();languageAdventure.close();talkApproach=null;heldPointer=null;keys.add(directionKeys[key]);path=[];destination=null;}
    if(e.repeat)return;
    if(key==='escape'){if(panel||dialog)close();else if(stage==='world')openPanel('settings');}
    if(stage!=='world'||panel||dialog)return;
    if(key==='e'){e.preventDefault();interactNearest();}
    if(key==='r')openPanel('equipment');if(key==='j')openPanel('quests');if(key==='b'||key==='i')openPanel('inventory');if(key==='c')openPanel('deck');if(key==='p')openPanel('pet');
});
window.addEventListener('keyup',e=>{keys.delete(directionKeys[e.key.toLowerCase()]);});
window.addEventListener('blur',()=>{if(!languageAdventure.active)languageAdventure.close();talkApproach=null;fishingLoadEpoch++;fishingApproach=null;sceneFishing.stop(false);resetMovementInput();path=[];destination=null;persist();});
window.addEventListener('pagehide',()=>{persist();void roleStore?.flushRuntime();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(animation)animation.silentThrough=animation.index;languageAdventure.suspend();characterChat.suspend();}spellSound.stop();if(document.hidden){fishingApproach=null;sceneFishing.stop(false);resetMovementInput();path=[];destination=null;persist();music?.pause();}else{languageAdventure.resume();if(stage==='world'&&save?.pets)tickCare(save,assets.content,A.playerSpec(save,assets.content),Date.now(),false);updateMusic();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)dungeonStory.suspend();});
window.addEventListener('pagehide',()=>{dungeonStory.suspend();spellSound.stop();});
async function startFishing(water) {
    const epoch=++fishingLoadEpoch, currentSave=save, currentWorld=world, position={...save.position};
    try {
        if(!assets.content.fishing)toast('正在准备钓鱼…');
        await assets.loadFishing();
        if(epoch!==fishingLoadEpoch||save!==currentSave||world!==currentWorld||stage!=='world'||panel||dialog||document.hidden||keys.size||path.length||W.distance(save.position,position)>1)return;
        sceneFishing.start(water,model());
    } catch(error) {if(epoch===fishingLoadEpoch)toast('钓鱼数据加载失败，请再次点击海面重试。');}
}
function clickWorld(clientX,clientY) {
    fishingLoadEpoch++;
    const {p,target}=pickWorldTarget(clientX,clientY);
    const babyId=stage==='world'&&petScene.pick(p);if(babyId){safely(()=>petScene.adopt(babyId));return false;}
    const socialTarget=islandSocial.pick(p);if(socialTarget){path=[];destination=null;islandSocial.select(socialTarget);return false;}
    if(languageAdventure.greeting){
        const rect=renderer.greetingTarget();
        if(rect&&p.x>=rect.x&&p.x<=rect.x+rect.w&&p.y>=rect.y&&p.y<=rect.y+rect.h){languageAdventure.enterGreeting();return false;}
        languageAdventure.close();
    }
    const bubble=renderer.bubbleTarget();
    if(bubble&&p.x>=bubble.x&&p.x<=bubble.x+bubble.w&&p.y>=bubble.y&&p.y<=bubble.y+bubble.h){approachInvite();return false;}
    // While the invite bubble is up, clicking the pet itself opens the same chat;
    // without a bubble the click falls through to the ground as usual.
    if(bubble){
        const pet=save.petInstanceVersion===1?petScene.pets.find(row=>row.pet.ownerId===save.petOwnerId)?.position:renderer.companionTarget&&renderer.companionTarget();
        if(pet&&Math.abs(p.x-pet.x)<22&&p.y>pet.y-56&&p.y<pet.y+12){approachInvite();return false;}
    }
    if(!target&&!dungeonFor(assets.content,world.zone)&&isOcean(world,p.x,p.y)){
        if(sceneFishing.active)sceneFishing.aim(p);
        else{
            const spot=fishingSpot(world,save.position,p);
            if(!spot){toast('这里离水边太远，换一处海岸试试。');return false;}
            close();path=[];destination=null;
            if(W.distance(save.position,spot.shore)>8){
                path=W.findPath(world,save.position,spot.shore);
                if(!path.length){toast('这处岸边暂时走不到，换个位置吧。');return false;}
                fishingApproach=spot;
            }else startFishing(spot.water);
        }
        return false;
    }
    if(sceneFishing.active)sceneFishing.stop();
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
    // Defer target picking and pathfinding until release, after gesture detection.
    if(e.pointerType==='mouse'){heldPointer={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,since:performance.now(),active:false};nodes.world.setPointerCapture(e.pointerId);}
});
nodes.world.addEventListener('pointermove',e=>{if(heldPointer?.id===e.pointerId){heldPointer.x=e.clientX;heldPointer.y=e.clientY;if(Math.hypot(e.clientX-heldPointer.startX,e.clientY-heldPointer.startY)>6){if(!heldPointer.active){languageAdventure.close();talkApproach=null;}heldPointer.active=true;path=[];destination=null;}}});
function releaseWorldPointer(e){
    if(heldPointer?.id!==e.pointerId)return;
    const clicked=e.type==='pointerup'&&!heldPointer.active&&performance.now()-heldPointer.since<180
        &&Math.hypot(e.clientX-heldPointer.startX,e.clientY-heldPointer.startY)<=6;
    heldPointer=null;
    if(nodes.world.hasPointerCapture(e.pointerId))nodes.world.releasePointerCapture(e.pointerId);
    if(!clicked){path=[];destination=null;return;}
    if(stage==='world'&&!panel&&!dialog&&!languageAdventure.active&&!characterChat.active)clickWorld(e.clientX,e.clientY);
}
for(const event of ['pointerup','pointercancel','lostpointercapture'])nodes.world.addEventListener(event,releaseWorldPointer);
function backgroundScenePaused(){return pauseBackgroundScene({stage,hidden:document.hidden,panel,dialog,learning:languageAdventure.active,conversation:characterChat.active,fullscreen:!!document.fullscreenElement&&!document.fullscreenElement.contains(nodes.world)});}
function frame(now) {
    requestAnimationFrame(frame);if(!renderer||!save)return;
    if(now-lastLanguageDayCheck>1000){lastLanguageDayCheck=now;if(save.dailyLanguageBuff&&save.dailyLanguageBuff.day!==localBuffDay()){delete save.dailyLanguageBuff;persist();paintHud();if(panel==='learning-mode')paintPanel();}}
    void autoSave.tick();
    dungeonStory.tick();
    let scenePaused=backgroundScenePaused();
    languageAdventure.tick(now);
    if(stage==='world'&&!document.hidden&&now-lastCare>1000){lastCare=now;setTimeout(()=>{
        if(stage!=='world'||!save||document.hidden)return;
        tickCare(save,assets.content,A.playerSpec(save,assets.content),Date.now(),true);updatePetStatus(document,save,assets.content);V.updateHeroHealth(nodes.hud,save,assets.content);V.updateCheckin(nodes.hud,model());if(panel==='checkin')V.updateCheckin(nodes.overlay,model());if(performance.now()-lastSave>10000)persist();
    },0);}
    if((stage==='world'||stage==='battle')&&!document.hidden)tickCheckin(save,Date.now(),Math.min(1000,Math.max(0,now-lastFrame)));
    const dt=Math.min(.055,(now-lastFrame)/1000||0);lastFrame=now;const wasMoving=moving;moving=false;
    if(stage==='world')V.syncTeachPointer(nodes.hud,!!(destination||dialog||panel));
    if(stage==='world'&&!panel&&!dialog&&!languageAdventure.active&&!characterChat.active) {
        let dx=Number(keys.has('right'))-Number(keys.has('left')),dy=Number(keys.has('down'))-Number(keys.has('up'));
        if(!dx&&!dy){dx=joystick.x;dy=joystick.y;}
        if(heldPointer&&(heldPointer.active||now-heldPointer.since>=180)){
            if(!heldPointer.active){languageAdventure.close();talkApproach=null;}heldPointer.active=true;path=[];destination=null;
            const rect=nodes.world.getBoundingClientRect(),target=renderer.screenToWorld(heldPointer.x-rect.left,heldPointer.y-rect.top);
            const x=target.x-save.position.x,y=target.y-save.position.y,distance=Math.hypot(x,y);
            const travel=W.WALK_SPEED*(save.mountId?assets.content.balanceParams?.adventure?.mountSpeed||1.35:1)*dt;
            if(!dx&&!dy&&distance>6){const scale=Math.min(1,(distance-6)/(travel||1));dx=x/distance*scale;dy=y/distance*scale;}
        }
        if(!dx&&!dy&&path.length){
            const travel=W.WALK_SPEED*(save.mountId?assets.content.balanceParams?.adventure?.mountSpeed||1.35:1)*dt;
            const previous=save.position,next=W.followPath(world,save.position,path,travel);
            save.position=next.position;path=next.path;dx=save.position.x-previous.x;dy=save.position.y-previous.y;moving=Math.hypot(dx,dy)>.01;
            if(next.blocked&&destination)path=W.findPath(world,save.position,destination);
        }else if(dx||dy){
            const length=Math.max(1,Math.hypot(dx,dy)),previous=save.position;
            const travel=W.WALK_SPEED*(save.mountId?assets.content.balanceParams?.adventure?.mountSpeed||1.35:1)*dt;
            save.position=W.movePosition(world,save.position,dx/length*travel,dy/length*travel);moving=W.distance(previous,save.position)>.01;
        }
        if(moving)save.facing=Math.abs(dx)>Math.abs(dy)?(dx<0?1:2):(dy<0?3:0);
        W.updateDungeonExploration(world,save);
        W.updateEncounterVisibility(world,save,Date.now());
        const auto=W.takeAutoInteraction(world,save.position);
        if(auto)interact(auto);
        else if(destination&&W.distance(save.position,destination)<82)interact(destination);
        const near=W.nearestInteraction(world,save.position),button=$('interact');
        if(world.layout){const label=nodes.hud.querySelector('.location-label small'),region=regionAt(world,save.position);if(label&&label.dataset.zh!==region.name)setText(label,region.name);}
        if(button){
            button.hidden=!near;
            if(near){
                const monster=assets.content.monsters[near.monsterId]?.name||'待迁移怪物';
                const next=near.kind==='npc'?['与{name}交谈',{name:near.name}]:near.kind==='landmark'?['查看{name}',{name:near.name}]:near.kind==='portal'?[near.name,null]:['挑战{name}',{name:monster}];
                const zh=next[1]?fill(next[0],next[1]).zh:next[0];
                if(button.dataset.zh!==zh){if(next[1])setText(button,next[0],next[1]);else setText(button,next[0]);}
            }
        }
        if((wasMoving&&!moving)||(moving&&now-lastSave>3000))queuePersist();
    }
    const rewardEffect=rewardFeedback.tick(now,stage==='world'&&!panel&&!dialog&&!sceneFishing.active);
    const bagButton=nodes.hud.querySelector('[data-ui-icon=bag]')?.closest('button');bagButton?.classList.toggle('reward-glow',!rewardRoot.hidden&&!!rewardRoot.querySelector('.reward-popup:not([hidden]) strong'));
    if(teleportEffect&&(stage!=='world'||now-teleportEffect.started>=TELEPORT_EFFECT_MS))teleportEffect=null;
    if(fishingApproach){
        if(stage!=='world'||panel||dialog||keys.size||joystick.x||joystick.y||heldPointer||document.hidden)fishingApproach=null;
        else if(!path.length){
            const spot=fishingApproach;fishingApproach=null;
            if(W.distance(save.position,spot.shore)<24){moving=false;startFishing(spot.water);}
            else toast('没能走到水边，换个位置再试试。');
        }
    }
    if(talkApproach){
        if(!languageAdventure.preparedValid(talkApproach)||panel||dialog||keys.size||joystick.x||joystick.y||heldPointer||document.hidden){talkApproach=null;languageAdventure.close();}
        else if(W.distance(save.position,talkApproach.npc)<=learningParams(assets.content).interactionRange){
            const prepared=talkApproach;talkApproach=null;path=[];moving=false;languageAdventure.greet(prepared,now);
        }else if(!path.length){talkApproach=null;toast('这里暂时走不过去，试试旁边的小路。');}
    }
    characterChat.tick();
    scenePaused=backgroundScenePaused();
    if(!scenePaused)islandSocial.step(Math.min(.1,(now-(islandSocial.lastFrame||now))/1000),{view:renderer.viewRect?.()});islandSocial.lastFrame=now;
    if(stage==='world'&&!scenePaused)try{petScene.step(Math.min(.055,(now-(petScene.lastFrame||now))/1000));}catch(error){if(petScene.error!==error.message){toast(error.message);petScene.error=error.message;}}petScene.lastFrame=now;
    // One scene gate for battle, cinematic and every blocking UI; retain the last frame.
    if(!scenePaused)renderer.render(world,save,now,{petScene:save.petInstanceVersion===1&&stage==='world'?petScene:null,socialActors:islandSocial.actors,moving,path,title:stage==='title',rewardEffect,teleportEffect,fishingPose:sceneFishing.pose(now),membership:membership.state,motionHidden:stage!=='world'||document.hidden,learningGreeting:languageAdventure.greeting,companionBubble:stage==='world'&&!panel&&!dialog&&!languageAdventure.active&&!characterChat.active&&!sceneFishing.active?languageAdventure.bubble:null});
    if(sceneFishing.active){
        if(stage!=='world'||panel||dialog||moving||keys.size||joystick.x||joystick.y||heldPointer?.active||document.hidden)sceneFishing.stop(false);
        else{
            const origin=renderer.screenToWorld(0,0),unit=renderer.screenToWorld(1,1);
            sceneFishing.update(model(),now,p=>({x:(p.x-origin.x)/(unit.x-origin.x),y:(p.y-origin.y)/(unit.y-origin.y)}));
        }
    }
    if(stage==='battle'){const speechEvent=animation?.events[animation.index],presentation=tickAnimation(now),canvas=$('battle-canvas');V.updateBattleRoster(nodes.battle.battleStatusEntries,presentation);if(canvas){canvas.battlePositions=renderer.renderBattle(canvas,battle,save,now,presentation);V.updateBattleSpeech(nodes.battle,battle,canvas,now,speechEvent);V.updateBattlePetHint(nodes.battle,battle,save,assets.content,canvas);}}
}
async function boot(){
    try {
        assets=await loadResources(({label,detail='',value})=>{
            const bar=$('load-progress');
            if(!bar)return;
            if(value===null)bar.removeAttribute('value');else bar.value=value;
            const status=String(label).endsWith('…')?label:`${label}…`;
            bar.setAttribute('aria-label',tr(status));
            setText($('load-status'),status);
            setText($('load-detail'),detail);
        });
        setText($('load-status'),'正在初始化世界…');
        setText($('load-detail'),'');
        $('load-progress').removeAttribute('value');
        if(assets.content.schemaVersion!==1||!assets.content.quests?.length||!assets.dataset.cards)throw new Error('章节数据格式不正确，请重新导出并检查资源。');
        installLocaleTooltip();
        roleStore=createRoleStore({content:assets.content,dataset:assets.dataset,prepareSaves:assets.dungeons.prepareSaves});await roleStore.prepareOpen();roleStore.open();
        roleStorage=roleStore.catalog.activeId?roleStore.scoped():null;
        cloudClient=createCloudClient({petFileStore:id=>roleStore?.petFileIOFor(cloudClient.owner,id),content:assets.content,dataset:assets.dataset,prepareSaves:assets.dungeons.prepareSaves,onAccountChange:()=>{resetRoleAccount();cloud.message='登录状态已变化，请重新连接。';}});
        creationPreview=createCreationPreview(assets);
        renderer=createRenderer(nodes.world,assets);requestAnimationFrame(frame);
        // Keep the loading screen until session restoration chooses the final screen.
        // Rendering the guest title first briefly exposes creation/role selection.
        const direct=directSignInRequested(location.search);
        if(localStorage.getItem(LAST_ACCOUNT_KEY)){
            setText($('load-status'),'正在恢复账号与角色…');
            await connectRoles(false,{enter:direct});
        }
        if(stage==='loading'){
            const resume=!localStorage.getItem(LAST_ACCOUNT_KEY)&&startupRoleId(roleStore.catalog,{direct,blocked:!!roles.conflict||!!roles.error});
            if(resume){try{await activateRole(resume);}catch(error){roles.error=error.message;await showTitle();}}
            else await showTitle();
        }
    }catch(e){stage='error';nodes.entry.replaceChildren(V.el('section','loading-card',V.el('h1','','冒险暂时无法开始'),V.el('p','',e.message),V.el('p','muted','请通过 HTTP 静态服务器打开游戏；恢复 data/adventure 中的章节文件，并运行 npm run assets:adventure 检查美术资源。'),V.button('重新尝试',()=>location.reload(),'primary')));}
}
boot();
