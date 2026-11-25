// Browser controller: input, rendering, audio and persistence live outside the pure rules.
import {button,el,syncOverlayInert} from './ui/dom.js';
import * as W from './adventure_world_core.js';
import {createAppBus} from './adventure/app_bus.js';
import {createAppServices} from './adventure/app_services.js';
import {createActionRewardController} from './adventure/action_reward_controller.js';
import {createBattleController} from './adventure/battle_controller.js';
import {createConversationLearningController} from './adventure/conversation_learning_controller.js';
import {createDungeonController} from './adventure/dungeon_controller.js';
import {createEarthController} from './adventure/earth_controller.js';
import {secondLocaleFor as resolveSecondLocale} from './adventure/locale_prefs.js';
import {createOpeningController} from './adventure/opening_controller.js';
import {createPanelController} from './adventure/panel_controller.js';
import {createPrologueController} from './adventure/prologue_controller.js';
import {createQuestDialogueController} from './adventure/quest_dialogue_controller.js';
import {createRoleCloudController,LAST_ACCOUNT_KEY,KICKED_SESSION_KEY} from './adventure/role_cloud_controller.js';
import {createAdventureSessionState} from './adventure/session_state.js';
import {createWordLearningController} from './adventure/word_learning_controller.js';
import {createWorldInteractionController} from './adventure/world_interaction_controller.js';
import {createWorldSessionController} from './adventure/world_session_controller.js';
import {createRenderer} from './adventure/renderer/scene_renderer.js';
import {loadResources,saveLocal} from './adventure_assets.js';
import {createSaveCommitter} from './adventure_reward_persistence.js';
import {createAutoSave} from './adventure_autosave.js';
import {createCloudClient} from './adventure_cloud.js';
import {createCreationPreview} from './adventure_creation_preview.js';
import {hasDebugBackup} from './adventure_debug.js';
import {dungeonFor} from './adventure_dungeons_core.js';
import {isOcean} from './adventure_fishing_core.js';
import {createGameServerSession,GAME_SERVER_URL,normalizeGameServerUrl} from './adventure_game_server.js';
import {createMembershipController} from './adventure/membership_controller.js';
import {releaseFieldPursuit} from './adventure_monster_motion_core.js';
import {createPetScene} from './pets/adventure_pet_scene.js';
import {createPetLoader} from './pets/pet_loader.js';
import {createRoleStore} from './adventure_roles.js';
import {directSignInRequested,familyPadSignInRequested,startupRoleId} from './adventure_roles_core.js';
import {createIslandSocial} from './social/adventure_social_controller.js';
import {timeScrollCity} from './adventure_time_scroll_core.js';
import {createAudioSamples} from './audio/audio_samples.js';
import {withBattlePointer,nextBattlePointer} from './battle_pointer_core.js';
import {mapDialogue} from './learning/dialogue_mapping.js';
import {createFramePacer} from './frame_meter_core.js';
import {createGameSettings,legacyLocalMusic} from './game_settings.js';
import {createAdaptiveGraphics} from './game_settings_core.js';
import {createIslandHeroNavigation} from './island_hero_navigation.js';
import {createIslandSceneLoading} from './island_scene_loading.js';
import {createLearningVoice} from './audio/language_adventure_voice.js';
import {createLanguageQuestJournal} from './learning/language_quest.js';
import {learningModeForced} from './learning/learning_mode_policy.js';
import {installLocaleTooltip,displayLocale} from './locale.js';
import {fill,setText,tr} from './locale_runtime.js';
import {performanceDiagnostics as perf} from './performance_diagnostics.js';
import {createPhotoHeadFeature} from './photo_head/photo_head_feature.js';
import {createLocalPlay} from './social/local_play_controller.js';
import {createSpellSound} from './audio/spell_sound.js';
import {GlobalRewardNotice} from './ui/global_reward_notice.js';
import {bindTouchMovement} from './views/adventure/view_adventure_movement.js';
import {updatePetStatus} from './views/adventure/view_adventure_pet_status.js';
import {createSceneFishing} from './views/adventure/view_adventure_scene_fishing.js';
import {createIslandSceneLoadingView} from './views/adventure/view_island_scene_loading.js';
import {mountMapServers} from './views/adventure/view_map_servers.js';

const $=id=>document.getElementById(id);
const nodes={world:$('world'),hud:$('hud'),entry:$('entry'),overlay:$('overlay'),battle:$('battle-layer'),toast:$('toast')};
const syncBackgroundInert=()=>syncOverlayInert(nodes.overlay,[nodes.world,nodes.hud,nodes.battle,nodes.entry]);
if(typeof MutationObserver==='function'&&nodes.overlay){
    new MutationObserver(syncBackgroundInert).observe(nodes.overlay,{attributes:true,attributeFilter:['class']});
}
syncBackgroundInert();
const gameSettings=createGameSettings(),adaptiveGraphics=createAdaptiveGraphics(),framePacer=createFramePacer();
const spellSound=createSpellSound({defaultEnabled:false,persistPreferences:false,samples:createAudioSamples()});
const globalReward=new GlobalRewardNotice();
const state=createAdventureSessionState({
    learningForced:learningModeForced(globalThis.location?.search),
    perf,
    spellSound,
    updatePetStatus,
    onResetMovement:()=>resetMovementInput(),
    onUntrack:(...args)=>untrack(...args),
    onStartLanguageTask:(...args)=>startLanguageTask(...args),
});
const getContext=()=>state;
const dialogueVoice=createLearningVoice({getSettings:()=>state.save?.languageLearning||{}});
const secondLocaleFor=native=>resolveSecondLocale(native,state.save);

function attachMapServers(){
    state.mapServersDispose?.();
    state.mapServersDispose=mountMapServers(nodes.overlay,{
        state:()=>state.gameServerSession?.state,
        subscribe:listener=>state.gameServerSession?.subscribe(listener)||(()=>{}),
        list:(page,options)=>state.gameServerSession.listInstances(page,options),
        switchInstance:id=>{if(state.battle)throw Error('战斗中无法切换服务器');state.gameServerSession.switchInstance(id);},
    });
}

const autoSave=createAutoSave({
    eligible:()=>roleCloud.canAutoSave(),
    save:async()=>{roles.busy='正在自动保存…';try{persist();if(state.storageWarning)throw Error('本地存档失败，云端同步已暂停');await syncRoles();cloud.error='';}finally{roles.busy='';}},
    onError:error=>{if(cloud.error!==error.message)toast(state.storageWarning?'进度未能保存，可能是其他页面已更新。请勿关闭页面，检查存储后重试。':'云存档暂未完成，本地进度已保留，将自动重试。');cloud.error=error.message;},
});
function queueCloudSave(){autoSave.request();}

const loadPet=createPetLoader({getState:()=>state});

const petScene=createPetScene({
    isFriend:owner=>islandSocial.isFriend(owner),
    sound:name=>spellSound.play(name),
    getState:()=>({loadPet,save:state.save,world:state.world,content:state.assets?.content,socialActors:islandSocial.actors,team:islandSocial.team.map(p=>p.id),scope:`${state.roleStore?.owner||'guest'}:${state.roleStore?.catalog.activeId}`,locked:state.stage!=='world'||document.hidden||!!state.save?.pendingEncounter}),
    commit:next=>saveCommitter.commitSave(next,{paint:state.panel?'both':'hud',setWarning:false}),
    toast:message=>toast(message),
});
setInterval(()=>{void autoSave.tick();if(state.stage==='world')islandSocial.tick();},15000);

const bus=createAppBus();
const membership=createMembershipController({
    getContext,
    bus,
    toast:(message,vars)=>toast(message,vars),
    onTitleDirty:()=>paintTitle(),
    onLocalShopsDirty:()=>localPlay.refreshShops(),
    maybeExchangeMagicBeans:()=>maybeExchangeMagicBeans(),
});
const {accountIsVip,rechargeMembership,refreshMembership}=membership;
const saveCommitter=createSaveCommitter({
    getContext,
    saveLocal,
    queueCloudSave:()=>queueCloudSave(),
    paintHud:()=>paintHud(),
    paintPanel:()=>paintPanel(),
});
const services=createAppServices({
    persist:()=>persist(),
    persistRuntime:()=>persistRuntime(),
    saveLocal,
    queueCloudSave:()=>queueCloudSave(),
    commitSave:saveCommitter.commitSave,
    commitReward:saveCommitter.commitReward,
    close:options=>close(options),
    openPanel:(name,options)=>openPanel(name,options),
    paintHud:()=>paintHud(),
    paintPanel:()=>paintPanel(),
    paintDialogue:()=>paintDialogue(),
    paintBattle:()=>paintBattle(),
    enterWorld:(nextSave,restoredBattle,options)=>enterWorld(nextSave,restoredBattle,options),
    showTitle:()=>showTitle(),
    toast:(message,vars)=>toast(message,vars),
    safely:fn=>safely(fn),
    spellSound,
    globalReward,
    gameSettings,
    adaptiveGraphics,
    framePacer,
});

const earth=createEarthController({
    nodes,getContext,services,bus,
    showTeleportEffect:()=>showTeleportEffect(),
    attachMapServers:()=>attachMapServers(),
    openFreeTalk:(profile,options)=>openFreeTalk(profile,options),
    awardLanguageSpeech:(...args)=>awardLanguageSpeech(...args),
    membership:()=>membership,
    islandSocial:()=>islandSocial,
});
const {openEarthNpc}=earth;

const dungeon=createDungeonController({
    nodes,getContext,services,bus,
    showTeleportEffect:()=>showTeleportEffect(),
    loginForCharacterChat:(...args)=>loginForCharacterChat(...args),
    awardLanguageSpeech:(...args)=>awardLanguageSpeech(...args),
    earth,
    islandSocial:()=>islandSocial,
    localPlay:()=>localPlay,
    dialogueVoice:()=>dialogueVoice,
});
const {dungeonStory,openJourney,loadAndEnterDungeon,travel}=dungeon;

const battleController=createBattleController({
    nodes,getContext,services,bus,
    model:()=>model(),
    loadPet:id=>loadPet(id),
    interact:target=>interact(target),
    finishTacticsFight:options=>finishTacticsFight(options),
    updateMusic:()=>updateMusic(),
    toggleSound:()=>toggleSound(),
    openCloud:()=>openCloud(),
    wordLearning:()=>wordLearning,
    hanziMemory:()=>hanziMemory,
    languageTasks:()=>languageTasks,
    islandSocial:()=>islandSocial,
    localPlay:()=>localPlay,
});
const {battleIntro,arenaPickClock,enterArenaCombat,stopBattleChatVoice,paintBattle,playRound,tickAnimation}=battleController;

const prologue=createPrologueController({
    getContext,secondLocaleFor,toast:message=>toast(message),
});
const {runPrologue}=prologue;

const wordLearning=createWordLearningController({
    nodes,getContext,services,bus,
    clearMovementPath:state.clearMovementPath,
    resetMovementInput:()=>resetMovementInput(),
    playRound:(decision,readyAnalysis)=>playRound(decision,readyAnalysis),
    dialogueVoice,
});
const {wordPractice,hanziMemory,refreshWordGoals,stopWordAudio,openDictionary}=wordLearning;
document.addEventListener('visibilitychange',()=>{if(document.hidden){wordLearning.suspend();state.hanziIsland?.suspend();}});

const actionReward=createActionRewardController({
    nodes,getContext,services,bus,
    loadPet:id=>loadPet(id),
    openDictionary:(tab,id)=>openDictionary(tab,id),
    setSelectedQuestId:id=>panels.setSelectedQuestId(id),
    setFirstWelcomePetId:id=>panels.setFirstWelcomePetId(id),
    paintFirstPetWelcome:()=>paintFirstPetWelcome(),
    membership:()=>membership,
    petScene:()=>petScene,
    sceneFishing:()=>sceneFishing,
    islandSocial:()=>islandSocial,
    languageAdventure:()=>languageAdventure,
});
const {rewardRoot,rewardFeedback,showRewards,missingRewardPets,action,seenGuide,performAction,maybeExchangeMagicBeans}=actionReward;

const roleCloud=createRoleCloudController({
    nodes,getContext,services,bus,autoSave,
    applyLocale:()=>applyLocale(),
    setEntryNative:(...args)=>setEntryNative(...args),
    setSecondLocale:(...args)=>setSecondLocale(...args),
    secondLocaleFor,
    updateMusic:()=>updateMusic(),
    accountIsVip:()=>accountIsVip(),
    earth,wordLearning,prologue,rewardFeedback,
    localPlay:()=>localPlay,
    membership:()=>membership,
});
const {roles,cloud,openCloud,loginForCharacterChat,loginRoles,showTitle,deleteCurrentRole,paintTitle,refreshRoleCache,activateRole,syncRoles,connectRoles,resetRoleAccount}=roleCloud;

const opening=createOpeningController({
    nodes,getContext,services,bus,
    model:()=>model(),
    performAction:(value,access)=>performAction(value,access),
    openJourney:(id,restart)=>openJourney(id,restart),
    walkTo:(target,autoInteract)=>walkTo(target,autoInteract),
    track:(questId,options)=>track(questId,options),
    awardLanguageSpeech:(...args)=>awardLanguageSpeech(...args),
    petScene:()=>petScene,
    dialogueVoice:()=>dialogueVoice,
});
const {finishTacticsFight}=opening;
Object.defineProperty(state,'tacticsPractice',{get:()=>opening.getTacticsPractice(),enumerable:true});

const heroNavigation=createIslandHeroNavigation();
function resetMovementInput(){heroNavigation.cancel();state.keys.clear();state.joystick={x:0,y:0};state.heldPointer=null;touchMovement.reset();}
const sceneLoadingView=createIslandSceneLoadingView({retry:()=>sceneLoading.retry(),exit:()=>{sceneLoading.cancel();void showTitle();}});
const sceneLoading=createIslandSceneLoading({
    identity:()=>JSON.stringify([state.roleStore?.owner,state.roleStore?.catalog.activeId]),
    warm:target=>state.assets.warmScenery?.(target),
    prepare:(target,player)=>state.renderer.prepareScene(target,player,{visibleOnly:true,localSecond:localPlay.second,localSecondFollowing:localPlay.secondFollowing,low:adaptiveGraphics.reduced}),
    show:stateArg=>sceneLoadingView.show(stateArg,{assets:state.assets,save:state.save,scope:state.world,roleId:state.roleStore?.catalog.activeId}),
    hide:()=>sceneLoadingView.hide(),
    onStart:()=>{resetMovementInput();localPlay.clearKeys();state.path=[];state.destination=null;state.moving=false;},
    onReady:()=>{resetMovementInput();localPlay.clearKeys();adaptiveGraphics.suspend(performance.now());resumeSceneIntro();},
});
const touchIndicator=el('div','touch-joystick floating-joystick active',el('span','joystick-stick'));
touchIndicator.hidden=true;touchIndicator.setAttribute('aria-hidden','true');nodes.world.parentElement.append(touchIndicator);
const sceneFishing=createSceneFishing(nodes.world.parentElement,{
    activeChanged:active=>{state.renderer?.setFishingCamera(active);if(active){clearTimeout(state.toastTimer);nodes.toast.classList.remove('visible');}},
    isWater:point=>state.world&&!dungeonFor(state.assets.content,state.world.zone)&&isOcean(state.world,point.x,point.y),
    vibrate:pattern=>{try{if(!document.hidden)navigator.vibrate?.(pattern);}catch{}},
    sound:name=>spellSound.play(name),action:value=>performAction(value),focus:()=>nodes.world.focus({preventScroll:true}),
},{el,button});
// HUD refresh resets steering to zero; only actual movement may dismiss a conversation.
const touchMovement=bindTouchMovement(nodes.world,touchIndicator,{
    enabled:()=>state.stage==='world'&&!state.panel&&!state.dialog&&!languageAdventure.active,
    steer:(x,y)=>{state.joystick={x,y};if(!x&&!y)return;heroNavigation.cancel();questDialogue.cancelRewardFollow();languageAdventure.close();state.talkApproach=null;state.path=[];state.destination=null;state.heldPointer=null;},
    zoom:factor=>state.renderer?.zoomBy(factor),
    tap:(x,y)=>clickWorld(x,y),
});

const islandSocial=createIslandSocial({
    onArenaEnter:enterArenaCombat,
    onArenaCountdown:seconds=>{const label=nodes.overlay.querySelector('[data-arena-ready]');if(label)setText(label,'准备好迎战！{seconds} 秒后自动进入战斗法阵。',{seconds});},
    onTalk:p=>void characterChat.open(p,{returnPanel:'social-profile'}),
    onDetails:p=>void characterChat.open(p,{returnPanel:'social-profile',detailsOnly:true}),
    onRelationshipActivity:event=>recordRelationshipActivity(event),
    getAffinity:p=>characterChat.affinity(p),
    onPetDialogue:(owner,actionType,settle)=>petScene.dialogue(owner,actionType,settle),
    getState:()=>({
        save:state.save,world:state.world,assets:state.assets,
        remotePlayerCount:state.gameServerSession?.remoteCount(`haqi:${String(state.save?.zone||'camp').slice(0,48)}`)||0,
        localSecond:localPlay.second,
        roleId:state.roleStore?.catalog.activeId,
        loadPet,
        membership:membership.state,
        paused:state.stage!=='world'||document.hidden||!!state.panel||!!state.dialog||characterChat.active||!!getSecondCharacterChat()?.active||localPlay.hasPersonal,
        locked:!!state.panel||!!state.dialog||characterChat.active||!!getSecondCharacterChat()?.active||localPlay.hasPersonal,
    }),
    getOwner:()=>state.roleStore?.owner,
    onChange:()=>{if(state.stage==='world'&&state.save){paintHud();if(['mail','chat','social-party','social-actions','social-profile','social-pvp'].includes(state.panel))paintPanel();}},
    onPersist:()=>{persist();queueCloudSave();},
    onOpen:(...args)=>openPanel(...args),
    onClose:close,
    onLogin:()=>void loginRoles(),
    toast,
    onDepart:(id,restart)=>void loadAndEnterDungeon(id,!!restart),
    onTeleport:(x,y)=>teleportToPosition(x,y),
});

const localPlay=createLocalPlay({
    state:()=>({save:state.save,world:state.world,battle:state.battle,stage:state.stage,assets:state.assets,store:state.roleStore,settings:gameSettings.value,renderer:state.renderer,animating:!!state.animation,battleRoot:nodes.battle,globalPaused:!!state.panel||!!state.dialog||document.hidden||characterChat.active||getSecondCharacterChat()?.active||languageAdventure.active}),
    onLeaderMovementIntent:()=>{heroNavigation.cancel();questDialogue.cancelRewardFollow();state.path=[];state.destination=null;state.heldPointer=null;},
    control:(...args)=>controllerAction(...args),model:()=>model(),replaceSave:value=>{state.save=value;},activate:activateRole,toast,paintHud:()=>paintHud(),track:(...args)=>track(...args),travel,interact:(...args)=>interact(...args),sound:()=>toggleSound(),login:()=>void loginRoles(),mapDialogue,
    loadPetFile:(roleId,filePath)=>state.cloudClient.petFile(roleId,filePath),
    onCoreChange:()=>{persist();queueCloudSave();},
    openMap:()=>openPanel('map'),openAccountPanel:(...args)=>openPanel(...args),refreshMembership:()=>membership.refresh(),onSpeech:(...args)=>awardLanguageSpeech(...args),
    socialTeam:()=>islandSocial.team,prepareSocialTeam:()=>islandSocial.preparedTeam(),socialActors:()=>islandSocial.actors,socialGesture:()=>islandSocial.gesture,socialAccount:(p,kind)=>islandSocial.select(p,kind),
    characterAffinity:(owner,p)=>roleConversation(owner).affinity(p),
    characterTalk:(owner,p,options={})=>void roleConversation(owner).open(p,{...options,localSocialProfile:p}),
    readDialogue:(owner,text,locale,signal,speaker)=>dialogueVoice.speak(text,locale,signal,speaker),
    enterBattle:value=>{state.battle=value;state.stage='battle';updateMusic();state.animation=null;close();nodes.hud.hidden=true;localPlay.paintBattle();},
    leaveBattle:()=>{state.battle=null;void enterWorld(state.save,null,{announceBeans:false});},
    presentLocal:(playback,previous,hp,aura)=>{state.animation={events:withBattlePointer(playback.events.map(e=>({...e,periodic:e.type==='dot'||e.type==='hot',type:e.type==='dot'?'damage':e.type==='hot'?'heal':e.type})),previous,nextBattlePointer(state.battle)),pointer:previous,index:0,start:performance.now(),hp,aura,status:playback.initial,pips:playback.initialPips,statusFeedback:[],entered:-1};},
    walkTo:point=>{state.destination=null;requestHeroPath(point);},
});

const languageTasks=createLanguageQuestJournal({getSave:()=>state.save,onChange:()=>{if(state.stage==='world'){paintHud();if(state.panel==='quests'&&!state.courseView)paintPanel();}}});
const model=()=>({
    assets:state.assets,save:state.save,languageTasks:languageTasks.snapshot(),gameServer:state.gameServerSession?.state,learningForced:state.learningForced,
    timeCity:timeScrollCity(state.world,state.save),localSecond:localPlay.second,
    locationName:state.world?.isEarth||state.world?.isCityDungeon?state.world.layout.name:null,
    earthChapter:earth.getChapter(),gameSettings:gameSettings.value,effectiveGraphics:adaptiveGraphics.effects(gameSettings.value),
    social:islandSocial.state(),displayLocale:displayLocale(),dungeonLoading:dungeon.getState().dungeonLoading,
    serviceNpc:state.serviceNpc,npcServiceView:state.npcServiceView,membership:membership.state,membershipView:state.membershipView,rechargeView:state.rechargeView,
    accountOwner:state.roleStore?.owner,magicBeanExchange:state.roleStore?.catalog?.magicBeanExchange||null,
    now:Date.now(),storageWarning:state.storageWarning,arenaCountdown:arenaPickClock.remaining(),
    battle:state.battle,selected:state.selected,discarded:state.discarded,hand:state.animation?.hand,
    presentation:state.animation?{hp:state.animation.hp,status:state.animation.status}:null,animating:!!state.animation,
    equipmentView:state.equipmentView,strengtheningView:state.strengtheningView,gemView:state.gemView,shopView:state.shopView,petView:state.petView,
    debugBackup:state.roleStorage&&hasDebugBackup(state.roleStorage),
    soundEnabled:spellSound.enabled,soundVolume:spellSound.volume,
    learningProgress:state.battle?.learningProgress||0,autoWalk:!!state.destination,
});

const conversationLearning=createConversationLearningController({
    getContext,services,bus,
    paintTitle:()=>paintTitle(),
    loginForCharacterChat:(...args)=>loginForCharacterChat(...args),
    openEarthNpc:npc=>openEarthNpc(npc),
    showRewards:(before,actionType)=>showRewards(before,actionType),
    secondLocaleFor,
    islandSocial:()=>islandSocial,
    localPlay:()=>localPlay,
    membership:()=>membership,
    petScene:()=>petScene,
    wordLearning:()=>wordLearning,
});
const {roleConversation,characterChat,getSecondCharacterChat,recordRelationshipActivity,languageAdventure,localeFilesToLoad,applyLocale,setLocale,setEntryNative,setSecondLocale,setLearning,applyLearningMode,openFreeTalk,awardLanguageSpeech}=conversationLearning;
Object.defineProperties(state,{
    characterChat:{get:()=>characterChat,enumerable:true},
    secondCharacterChat:{get:()=>getSecondCharacterChat(),enumerable:true},
});

function toast(message,vars){
    const filled=vars?fill(message,vars):{zh:String(message??''),text:tr(message)};
    if(nodes.toast.dataset)nodes.toast.dataset.zh=filled.zh;
    nodes.toast.textContent=filled.text;
    nodes.toast.classList.add('visible');clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>nodes.toast.classList.remove('visible'),4200);
}
function safely(fn){try{const value=fn();return value?.catch?value.catch(e=>{toast(e.message);return false;}):value;}catch(e){toast(e.message);return false;}}
function persistRuntime(){
    if(!state.save||state.stage==='title')return;
    try{
        if(localPlay.active)localPlay.storeSaves(undefined,{runtimeOnly:true});
        else state.roleStore.saveRuntime({[state.roleStore.catalog.activeId]:state.save});
        state.lastRuntimeSave=performance.now();
    }catch{if(!state.storageWarning)toast('本机状态未能保存，请检查存储后重试。');state.storageWarning=true;}
}
function persist(){
    if(!state.save||state.stage==='title')return;
    if(localPlay.active){try{localPlay.storeSaves();state.storageWarning=false;}catch(error){state.storageWarning=true;toast(error.message);}state.lastRuntimeSave=performance.now();return;}
    try{
        if(!state.roleStorage)throw Error('尚未选择角色');
        state.roleStore.commitRoles({[state.roleStore.catalog.activeId]:state.save});
        if(state.save.petInstanceVersion===1){
            const stored=state.roleStore.catalog.roles.find(r=>r.id===state.roleStore.catalog.activeId).save;
            state.save.petFileRefs=stored.petFileRefs;
            state.save.petPages=stored.petPages;
        }
        state.storageWarning=false;
    }catch{
        if(!state.storageWarning)toast('进度未能保存，可能是其他页面已更新。请勿关闭页面，检查存储后重试。');
        state.storageWarning=true;
    }
    const indicator=document.querySelector('.save-indicator');
    if(indicator){setText(indicator,state.storageWarning?'存档未保存':'');indicator.hidden=!state.storageWarning;}
    state.lastRuntimeSave=performance.now();
}
function close({silent=false}={}){
    opening.closeAll();
    if(state.stage==='world'&&state.world&&state.save){releaseFieldPursuit(state.world,state.save.position);W.resetAutoInteraction(state.world,state.save.position);}
    state.disposeCourseView();
    state.mapServersDispose?.();state.mapServersDispose=null;
    if(!silent&&!worldSession.canCloseHome())return;
    worldSession.closeSessionOverlays();
    earth.closeAll();
    wordLearning.closeAll();
    state.hanziTicket++;state.hanziIsland?.close();
    nodes.overlay.disposeMap?.();
    panels.closeAtlas();
    battleIntro.close();
    dungeonStory.close();
    if(state.stage==='world')nodes.hud.hidden=false;
    if(!silent&&(state.panel||state.dialog))spellSound.play('close');
    characterChat.close();
    getSecondCharacterChat()?.close();
    islandSocial.close();
    state.fishingLoadEpoch++;
    languageAdventure.close();
    state.fishingApproach=null;
    state.talkApproach=null;
    sceneFishing.stop();
    nodes.overlay.disposeDialogue?.();
    state.panel=null;state.dialog=null;state.dialogDone=null;
    nodes.overlay.replaceChildren();
    nodes.overlay.className='overlay';
    syncBackgroundInert();
    resetMovementInput();
    nodes.world.focus({preventScroll:true});
}

const panels=createPanelController({
    nodes,getContext,services,bus,
    model:()=>model(),
    showTitle:()=>showTitle(),
    loginRoles:()=>loginRoles(),
    deleteCurrentRole:()=>deleteCurrentRole(),
    loadPet:id=>loadPet(id),
    action:value=>action(value),
    seenGuide:key=>seenGuide(key),
    performAction:(value,access)=>performAction(value,access),
    interact:target=>interact(target),
    interactNearest:()=>interactNearest(),
    track:(questId,options)=>track(questId,options),
    travel:zone=>travel(zone),
    teleportToLandmark:id=>teleportToLandmark(id),
    teleportToPosition:(x,y)=>teleportToPosition(x,y),
    openHomePanel:options=>openHomePanel(options),
    openTimeScroll:()=>openTimeScroll(),
    refreshMembership:force=>refreshMembership(force),
    rechargeMembership:amount=>rechargeMembership(amount),
    setLocale:locale=>setLocale(locale),
    setLearning:next=>setLearning(next),
    applyLearningMode:draft=>applyLearningMode(draft),
    toggleMusic:()=>toggleMusic(),
    toggleSound:()=>toggleSound(),
    attachMapServers:()=>attachMapServers(),
    disposeMapServers:()=>{state.mapServersDispose?.();state.mapServersDispose=null;},
    earth,dungeon,wordLearning,opening,roleCloud,
    islandSocial:()=>islandSocial,
    localPlay:()=>localPlay,
    languageTasks,languageAdventure,
});
const {paintHud,paintFirstPetWelcome,paintPanel,openPanel}=panels;

const questDialogue=createQuestDialogueController({
    nodes,getContext,services,bus,
    model:()=>model(),
    loadPet:id=>loadPet(id),
    missingRewardPets:quest=>missingRewardPets(quest),
    showRewards:(before,actionType)=>showRewards(before,actionType),
    openFreeTalk:(npc,options)=>openFreeTalk(npc,options),
    performAction:(value,access)=>performAction(value,access),
    walkTo:(target,autoInteract)=>walkTo(target,autoInteract),
    travel:zone=>travel(zone),
    opening,wordLearning,rewardFeedback,languageTasks,languageAdventure,
    islandSocial:()=>islandSocial,
    petScene:()=>petScene,
    dialogueVoice,
});
const {paintDialogue,startQuestTalk,startLanguageTask,tryLanguageScene,untrack,track}=questDialogue;

const worldSession=createWorldSessionController({
    nodes,getContext,services,bus,
    localeFilesToLoad:()=>localeFilesToLoad(),
    awardLanguageSpeech:(...args)=>awardLanguageSpeech(...args),
    maybeExchangeMagicBeans:options=>maybeExchangeMagicBeans(options),
    heroNavigation,sceneLoading,earth,opening,panels,wordLearning,arenaPickClock,rewardFeedback,
    islandSocial:()=>islandSocial,
    localPlay:()=>localPlay,
    roles,perf,
});
const {openHomePanel,toggleSound,resumeSceneIntro,enterWorld,updateMusic,toggleMusic,showTeleportEffect,teleportToLandmark,teleportToPosition,openTimeScroll}=worldSession;

bus.on('hud:dirty',()=>paintHud());
bus.on('panel:dirty',()=>paintPanel());
bus.on('dialogue:dirty',()=>paintDialogue());
bus.on('battle:dirty',()=>paintBattle());
bus.on('cloud:queued',()=>queueCloudSave());
bus.on('word-goals:refresh',()=>refreshWordGoals());
bus.on('audio:stop-word',()=>stopWordAudio());
bus.on('audio:stop-battle-voice',()=>stopBattleChatVoice());
bus.on('rewards:show',({before,actionType}={})=>showRewards(before,actionType));

const worldInteraction=createWorldInteractionController({
    nodes,getContext,services,bus,
    onMovementIntent:()=>questDialogue.cancelRewardFollow(),
    model:()=>model(),
    playRound:(decision,readyAnalysis)=>playRound(decision,readyAnalysis),
    tickAnimation:now=>tickAnimation(now),
    startQuestTalk:(talk,catalog)=>startQuestTalk(talk,catalog),
    tryLanguageScene:target=>tryLanguageScene(target),
    performAction:(value,access)=>performAction(value,access),
    updateMusic:()=>updateMusic(),
    heroNavigation,sceneLoading,sceneFishing,autoSave,earth,dungeon,opening,wordLearning,languageTasks,languageAdventure,
    islandSocial:()=>islandSocial,
    petScene:()=>petScene,
    localPlay:()=>localPlay,
    membership:()=>membership,
    battleIntro,rewardFeedback,rewardRoot,perf,
});
const {interact,interactNearest,requestHeroPath,walkTo,controllerAction,clickWorld,frame}=worldInteraction;
worldInteraction.bindEvents();

// Opt-in, local diagnostics. Include counts and transient scene state, never account/save contents.
if(perf.enabled)globalThis.haqiPerformanceReport=()=>({
    version:2,browser:navigator.userAgent,dpr:window.devicePixelRatio,visibility:document.visibilityState,stage:state.stage,
    scene:state.world&&state.save&&{zone:state.world.zone,position:{...state.save.position},trees:state.world.trees.length,npcs:state.world.npcs.length,encounters:state.world.encounters.length,socialActors:islandSocial.actors.length,pets:petScene.pets.length,quests:Object.keys(state.save.quests||{}).length,inventory:Object.keys(state.save.inventory||{}).length},
    viewport:{w:nodes.world.clientWidth,h:nodes.world.clientHeight,pixelsW:nodes.world.width,pixelsH:nodes.world.height},graphics:adaptiveGraphics.effects(gameSettings.value),
    feedback:{idleGuide:state.renderer?.idleGuide.active,particles:state.renderer?.interactionFeedback.particles.items.length,flyingRewards:state.renderer?.interactionFeedback.floating.items.length,toys:state.renderer?.campToys.rows.map(row=>({id:row.id,x:row.x,y:row.y,hits:row.hits,screen:state.renderer.worldToScreen(row)}))},
    navigation:{...heroNavigation.stats(),pathLength:state.path.length,destination:state.destination&&{kind:state.destination.kind,x:state.destination.x,y:state.destination.y},blocked:{panel:!!state.panel,dialog:!!state.dialog,encounter:state.encounterStarting,language:languageAdventure.active,chat:characterChat.active,paused:localPlay.paused}},
    audio:{samples:spellSound.sampleCount,musicPlaying:!!state.music&&!state.music.paused,musicTime:state.music?.element.currentTime||0},
    meter:state.renderer?.frameStats(),cache:state.renderer?.terrainStats(),metrics:perf.summary(),timeline:perf.timeline(),
});
// Readable through the browser's console-log API when direct runtime evaluation is unavailable.
if(perf.enabled)setInterval(()=>{if(state.stage==='world'&&!document.hidden)console.info('[Haqi performance] '+JSON.stringify(globalThis.haqiPerformanceReport()));},5000);

async function boot(){
    perf.start('startup');
    const settingsReady=gameSettings.open({music:legacyLocalMusic(localStorage)});
    try{
        state.assets=await loadResources(({label,detail='',value})=>{
            const bar=$('load-progress');
            if(!bar)return;
            if(value===null)bar.removeAttribute('value');else bar.value=value;
            const status=String(label).endsWith('…')?label:`${label}…`;
            bar.setAttribute('aria-label',tr(status));
            setText($('load-status'),status);
            setText($('load-detail'),detail);
        });
        state.assets.photoHeads=createPhotoHeadFeature({assets:state.assets,getOwner:()=>state.roleStore?.owner,membership,onLogin:()=>loginRoles()});
        setText($('load-status'),'正在初始化世界…');
        setText($('load-detail'),'');
        $('load-progress').removeAttribute('value');
        if(state.assets.content.schemaVersion!==1||!state.assets.content.quests?.length||!state.assets.dataset.cards)throw new Error('章节数据格式不正确，请重新导出并检查资源。');
        installLocaleTooltip();
        state.roleStore=createRoleStore({content:state.assets.content,dataset:state.assets.dataset,prepareSaves:state.assets.dungeons.prepareSaves});
        await state.roleStore.prepareOpen(null,{recover:true});
        state.roleStore.open(null,{recover:true});
        await settingsReady;
        spellSound.configure(gameSettings.value);
        state.roleStorage=state.roleStore.catalog.activeId?state.roleStore.scoped():null;
        state.cloudClient=createCloudClient({
            petFileStore:id=>state.roleStore?.petFileIOFor(state.cloudClient.owner,id),
            content:state.assets.content,
            dataset:state.assets.dataset,
            prepareSaves:state.assets.dungeons.prepareSaves,
            onAccountChange:()=>{resetRoleAccount();cloud.message='登录状态已变化，请重新连接。';},
        });
        let gatewayUrl=GAME_SERVER_URL;
        try{gatewayUrl=normalizeGameServerUrl(localStorage.getItem('haqi.gameServer')||GAME_SERVER_URL);}catch{/* Ignore invalid legacy preference. */}
        state.gameServerSession=createGameServerSession({
            gatewayUrl,
            getCredentials:()=>state.cloudClient.gameServerCredentials(),
            getState:()=>{
                const role=state.joiningRoleId?state.roleStore?.catalog.roles.find(row=>row.id===state.joiningRoleId)?.save:state.save;
                return {
                    owner:state.roleStore?.owner,
                    roleId:state.joiningRoleId||(state.stage!=='title'?state.roleStore?.catalog.activeId:'lobby'),
                    roomId:state.stage==='title'?'haqi:lobby':`haqi:${String(role?.zone||'camp').slice(0,48)}`,
                    name:role?.name||'哈奇玩家',
                    appearance:role||{},
                    facing:role?.facing||0,
                    x:Number(role?.position?.x)||0,
                    y:Number(role?.position?.y)||0,
                };
            },
            onStatus:message=>{if(state.roleStore?.owner)toast(message);},
            onReplaced:()=>{
                // Reload cancels old callbacks without logging out the shared SDK account.
                sessionStorage.setItem(KICKED_SESSION_KEY,'1');
                state.roleStorage=null;autoSave.reset();state.stage='title';state.joiningRoleId=null;
                state.gameServerSession.stop();location.reload();
            },
        });
        state.gameServerSession.start();
        window.addEventListener('pagehide',()=>state.gameServerSession.stop());
        window.addEventListener('pageshow',()=>state.gameServerSession.start());
        window.addEventListener('storage',()=>{if(state.stage==='title'&&!roles.busy)void refreshRoleCache().catch(error=>{roles.error=error.message;paintTitle();});});
        window.addEventListener('online',()=>state.gameServerSession.resume());
        document.addEventListener('visibilitychange',()=>{if(!document.hidden)state.gameServerSession.resume();});
        state.creationPreview=createCreationPreview(state.assets);
        state.renderer=createRenderer(nodes.world,state.assets);
        requestAnimationFrame(frame);
        // Keep the loading screen until session restoration chooses the final screen.
        // Rendering the guest title first briefly exposes creation/role selection.
        const familyPad=familyPadSignInRequested(location.search);
        const kicked=sessionStorage.getItem(KICKED_SESSION_KEY)==='1';
        const direct=!kicked&&directSignInRequested(location.search);
        const query=new URLSearchParams(location.search);
        if(query.has('prologue')){
            setText($('load-status'),'正在准备序章…');
            await runPrologue({fromUrl:true,scene:query.get('scene'),lang:query.get('lang'),second:query.get('second')});
        }
        if(!kicked&&(familyPad||localStorage.getItem(LAST_ACCOUNT_KEY))){
            setText($('load-status'),'正在恢复账号与角色…');
            await connectRoles(false,{enter:direct});
        }
        if(state.stage==='loading'){
            const resume=!kicked&&!familyPad&&!localStorage.getItem(LAST_ACCOUNT_KEY)&&startupRoleId(state.roleStore.catalog,{direct,blocked:!!roles.conflict||!!roles.error||state.roleStore.recovering});
            if(resume){try{await localPlay.guardSolo();await activateRole(resume);}catch(error){roles.error=error.message;await showTitle();}}
            else await showTitle();
        }
        if(kicked){roles.error='该角色已在其他页面登录，你已被踢下线，请重新登录。';paintTitle();toast(roles.error);}
    }catch(e){
        console.error('游戏初始化失败',e);
        state.stage='error';
        nodes.entry.replaceChildren(el('section','loading-card',el('h1','','游戏资源暂时未能加载'),el('p','','请检查网络连接后重试，你的角色存档不会被删除。'),button('重新加载',()=>location.reload(),'primary')));
    }
}
boot();
