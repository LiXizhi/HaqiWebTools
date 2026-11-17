import * as A from '../adventure_core.js';
import * as P from '../combat_pve_core.js';
import * as W from '../adventure_world_core.js';
import {campArrivalPet,pendingCompanionWelcome} from '../adventure_arrival_core.js';
import {mapCoordinateVersion} from '../adventure_coordinates_core.js';
import { releaseFieldPursuit } from '../adventure_monster_motion_core.js';
import {tickCare,mergeOwnedPetSpecies} from '../adventure_pets_core.js';
import {initializePetWorld} from '../adventure_pet_world_core.js';
import {SOCIAL_DEFAULTS} from '../adventure_social_core.js';
import {timeScrollCity} from '../adventure_time_scroll_core.js';
import {backgroundMusicId,createBackgroundMusic} from '../background_music.js';
import {enforceLearningMode} from '../learning_mode_policy.js';
import {loadLocaleFiles,configureLocale,hasLocale} from '../locale.js';
import {openingJourney} from '../opening_journey_core.js';
import {renderEarthLoading} from '../view_adventure_earth.js';
import {playOpeningPetWelcome} from '../view_opening_journey.js';
import {storedLocalePref} from './locale_prefs.js';

export function createWorldSessionController({
    nodes,
    getContext,
    services,
    close=services?.navigation?.close,
    persist=services?.persistence?.persist,
    queueCloudSave=services?.persistence?.queueCloudSave,
    paintHud=services?.navigation?.paintHud,
    paintPanel=services?.navigation?.paintPanel,
    paintBattle=services?.navigation?.paintBattle,
    stopBattleChatVoice,
    stopWordAudio,
    refreshWordGoals,
    localeFilesToLoad,
    awardLanguageSpeech,
    maybeExchangeMagicBeans,
    toast=services?.feedback?.toast,
    safely=services?.feedback?.safely,
    heroNavigation,
    sceneLoading,
    gameSettings=services?.runtime?.gameSettings,
    spellSound=services?.feedback?.spellSound,
    earth,
    opening,
    panels,
    wordLearning,
    arenaPickClock,
    rewardFeedback,
    globalReward=services?.feedback?.globalReward,
    islandSocial,
    localPlay,
    roles,
    perf,
}){
    let homeView=null,homeTicket=0;
    let pendingSceneIntro=null;
    let timeScroll=null,timeScrollTicket=0,timeScrollLoad=null;

    function canCloseHome(){
        return !homeView||homeView.canClose();
    }

    function closeSessionOverlays(){
        homeTicket++;
        homeView?.dispose();
        homeView=null;
        timeScrollTicket++;
        timeScrollLoad?.abort();
        timeScrollLoad=null;
        timeScroll?.close();
        timeScroll=null;
    }

    async function openHomePanel({starterRoom=false,offerStarterRoom=false}={}){
        const {stage,assets,world,renderer,roleStore,setPanel}=getContext();
        if(stage!=='world')return;
        localPlay().closeAll();
        localPlay().clearKeys();
        close({silent:true});
        setPanel('home');
        const ticket=++homeTicket;
        try{
            const {openHomeSystem}=await import('../home/home_session_controller.js');
            if(ticket!==homeTicket||getContext().panel!=='home')return;
            const view=await openHomeSystem({
                root:nodes.overlay,
                close,
                starterRoom,
                offerStarterRoom,
                cloud:getContext().cloudClient,
                assetMode:assets.mode,
                loadingAssets:assets,
                warmHero:()=>Promise.all([getContext().save,localPlay().second].filter(Boolean).map(hero=>assets.hero.ensure(assets.hero.appearance(hero,{mounted:false})))),
                drawTree:(ctx,x,y,size,variant)=>assets.environmentArt?.draw(ctx,'campTrees',['tallPine','layeredPine','cypressPine','blossomTree'][variant%4],x-size*.56,y-size*1.06,size*1.12,size*1.08),
                drawHero:(ctx,hero,x,y,time,moving,scale,options)=>assets.hero.drawSave(ctx,hero,x,y,time,moving,scale,options),
                onScene:active=>{
                    nodes.hud.hidden=active;
                    nodes.world.hidden=active;
                    if(active){
                        sceneLoading.invalidate();
                        renderer.releaseScene();
                        world.releaseSurface?.();
                    }
                },
                getContext:()=>{
                    const current=getContext();
                    return {
                        owner:roleStore.owner,
                        roleId:roleStore.catalog.activeId,
                        save:current.save,
                        secondSave:localPlay().second,
                        secondFollowing:localPlay().secondFollowing,
                        mouseOwner:localPlay().mouseOwner,
                        settings:gameSettings.value,
                        content:assets.content,
                        active:current.panel==='home'&&current.stage==='world'&&ticket===homeTicket,
                    };
                },
            });
            if(ticket!==homeTicket||getContext().panel!=='home'){view.dispose();return;}
            homeView=view;
        }catch(e){
            if(ticket===homeTicket){close();toast(e.message);}
        }
    }

    async function toggleSound(){
        const requested=!spellSound.enabled;
        if(!requested){stopBattleChatVoice();stopWordAudio();}
        gameSettings.set({sound:requested});
        const ok=await spellSound.setEnabled(requested);
        if(requested&&!ok)toast('浏览器暂时无法启用音效，请重试。');
        paintPanel();
        if(getContext().stage==='battle')paintBattle();
    }

    function afterSceneReady(action){
        const {roleEpoch:epoch,world:entryWorld}=getContext();
        const run=()=>{
            const current=getContext();
            if(current.stage==='world'&&current.roleEpoch===epoch&&current.world===entryWorld)action();
        };
        if(sceneLoading.active)pendingSceneIntro=run;
        else run();
    }

    function resumeSceneIntro(){
        const run=pendingSceneIntro;
        pendingSceneIntro=null;
        run?.();
    }

    async function enterWorld(newSave,restoredBattle=null,{announceBeans=true}={}){
        heroNavigation.cancel();
        const {stage,world,save:prevSave,assets,creationPreview,learningForced,setSave,setWorld,setStage,setBattle,setPanel,setAnimation,setTeleportEffect,setPetCardsOpen,setRuneCardsOpen,clearMovementPath}=getContext();
        const resumedWorld=stage==='battle'&&W.canResumeWorld(world,prevSave,newSave,assets.content)?world:null;
        stopBattleChatVoice();
        arenaPickClock.stop();
        setTeleportEffect(null);
        rewardFeedback.reset();
        globalReward.reset();
        setPetCardsOpen(false);
        setRuneCardsOpen(false);
        creationPreview?.stop();
        if(stage==='battle')perf.start('combat-return');
        perf.start('world-ready');
        setSave(newSave);
        enforceLearningMode(newSave,learningForced);
        if(newSave.zone==='earth'){
            const ready=await earth.restoreEarthWorld(newSave,restoredBattle,{announceBeans});
            if(!ready)return;
        }
        initializePetWorld(newSave,assets.content);
        mergeOwnedPetSpecies(newSave,assets.content);
        const reveal=()=>{
            const save=getContext().save;
            if(assets.content.pets)tickCare(save,assets.content,A.playerSpec(save,assets.content),Date.now(),false);
            const nextWorld=resumedWorld||W.createWorld(save.zone,assets.content,save);
            setWorld(nextWorld);
            setStage('world');
            clearMovementPath();
            setAnimation(null);
            close();
            // Restored story panels can pause before the first world draw. Paint one prepared backdrop.
            nodes.world.sceneViewportDirty=true;
            if(!W.walkable(nextWorld,save.position.x,save.position.y)){
                save.position=nextWorld.zone==='camp'?(W.nearestWalkable(nextWorld,save.position.x,save.position.y)||{...nextWorld.layout.spawn}):{...nextWorld.center};
            }
            save.positionCoordinateVersion=mapCoordinateVersion(save.zone,assets.content);
            if(nextWorld.zone==='camp'){
                for(const pet of Object.values(save.petWorld||{})){
                    if(pet.birth?.zone==='camp'&&!W.walkable(nextWorld,pet.birth.anchor.x,pet.birth.anchor.y)){
                        pet.birth.anchor=W.nearestWalkable(nextWorld,pet.birth.anchor.x,pet.birth.anchor.y)||{...nextWorld.layout.spawn};
                    }
                }
            }
            localPlay().syncWorld();
            W.updateEncounterVisibility(nextWorld,save,Date.now());
            releaseFieldPursuit(nextWorld,save.position);
            W.resetAutoInteraction(nextWorld,save.position);
            void assets.warmScenery?.(nextWorld);
            void assets.warmNearby?.(nextWorld,save);
            nodes.entry.replaceChildren();
            nodes.entry.className='';
            nodes.entry.hidden=true;
            nodes.hud.hidden=false;
            nodes.battle.disposeHandGesture?.();
            nodes.battle.replaceChildren();
            nodes.battle.className='battle-layer';
            setBattle(null);
            paintHud();
            void islandSocial().enter().catch(e=>toast(e.message));
            if(!save.pendingEncounter){
                wordLearning.clearRecordings();
                stopWordAudio();
                refreshWordGoals();
            }
            if(save.pendingEncounter){
                setBattle(restoredBattle||P.restorePveBattle(assets.dataset,assets.content,save.pendingEncounter));
                setStage('battle');
                nodes.hud.hidden=true;
                paintBattle();
            }else{
                sceneLoading.update(nextWorld,save,performance.now());
                maybeExchangeMagicBeans({announce:announceBeans});
            }
            // Introduce the chosen dragon, then lead a new player straight to Qinglong.
            const shouldShowArrival=!localPlay().active&&!!campArrivalPet(save);
            const shouldLeadOpening=save.zone==='camp'&&!save.pendingEncounter&&!localPlay().active&&!shouldShowArrival&&!save.tips.campArrivalSeen&&openingJourney(save)?.phase==='offer'&&!save.openingJourney.introShown;
            if(shouldLeadOpening)save.openingJourney.introShown=true;
            persist();
            queueCloudSave();
            updateMusic();
            if(!save.pendingEncounter){
                void opening.drainOpeningPractice();
                void opening.drainWordplayPractice();
                void opening.drainForestPractice();
            }
            afterSceneReady(()=>{
                const currentSave=getContext().save,currentWorld=getContext().world;
                if(openingJourney(currentSave)?.phase==='done'&&!currentSave.openingJourney.celebrated&&!currentSave.pendingEncounter&&currentSave.zone==='camp')opening.openOpeningJourney();
                if(currentSave.timeScrollRuntime?.active&&!currentSave.pendingEncounter&&timeScrollCity(currentWorld,currentSave)?.id===currentSave.timeScrollRuntime.cityId)void openTimeScroll();
                else if(shouldShowArrival)panels.openCampArrival();
                else if(!currentSave.pendingEncounter&&!localPlay().active&&pendingCompanionWelcome(currentSave)){
                    panels.setFirstWelcomePetId(pendingCompanionWelcome(currentSave));
                    setPanel('first-pet-welcome');
                    panels.paintFirstPetWelcome();
                    if(playOpeningPetWelcome(nodes.overlay))spellSound.play('petJoin');
                }
                else if(!currentSave.pendingEncounter&&!localPlay().active&&openingJourney(currentSave)?.phase==='showcase'&&!currentSave.openingJourney.welcomeSeen)opening.openOpeningJourney();
                else if(shouldLeadOpening)opening.trackOpeningJourney();
            });
        };
        const ids=localeFilesToLoad();
        if(ids.every(hasLocale)){
            configureLocale({locale:storedLocalePref()||newSave.locale,languageLearning:newSave.languageLearning});
            reveal();
            return;
        }
        return loadLocaleFiles(ids).then(()=>{
            if(getContext().save!==newSave)return;
            configureLocale({locale:storedLocalePref()||newSave.locale,languageLearning:newSave.languageLearning});
            reveal();
        });
    }

    function updateMusic(){
        // Music belongs to the entry experience too, before a new character exists.
        // Autoplay rejection is harmless: pointer/key handlers retry on a real gesture.
        const {assets,stage,save,music,setMusic}=getContext();
        if(!assets)return;
        const url=assets.urlFor(backgroundMusicId(stage,save?.zone,assets.content.extras.music.id));
        let activeMusic=music;
        if(!activeMusic){
            activeMusic=createBackgroundMusic(url,{onError:()=>{if(gameSettings.value.music)toast('音乐暂不可用');}});
            setMusic(activeMusic);
        }else activeMusic.setTrack(url);
        if(gameSettings.value.music&&!document.hidden)void activeMusic.play();
        else activeMusic.pause();
    }

    function toggleMusic(){
        gameSettings.set({music:!gameSettings.value.music});
        updateMusic();
        paintPanel();
    }

    function showTeleportEffect(){
        const {save,storageWarning,resetMovementInput,clearMovementPath,setMoving,setTeleportEffect}=getContext();
        localPlay().syncWorld(true);
        if(!storageWarning)spellSound.play('teleport');
        resetMovementInput();
        clearMovementPath();
        setMoving(false);
        setTeleportEffect({...save.position,started:performance.now()});
    }

    function teleportToLandmark(id){
        safely(()=>{
            const {stage,save,world,clearMovementPath}=getContext();
            if(stage!=='world'||save.pendingEncounter)throw Error('请先完成当前战斗');
            const target=world.landmarks.find(mark=>mark.id===id);
            if(!target||!W.walkable(world,target.x,target.y))throw Error('此地点暂时无法抵达');
            close();
            clearMovementPath();
            save.position={x:target.x,y:target.y};
            save.revision++;
            persist();
            paintHud();
            showTeleportEffect();
        });
    }

    function teleportToPosition(x,y){
        safely(()=>{
            const {stage,save,world,clearMovementPath}=getContext();
            if(stage!=='world'||save.pendingEncounter)throw Error('请先完成当前战斗');
            const clearance=SOCIAL_DEFAULTS.separation;
            const target=W.clearTeleportSpot(world,x,y,islandSocial().actors,clearance);
            if(!target)throw Error('此地点暂时无法抵达');
            // Face the nearest NPC/actor so map teleports can look at each other side-by-side.
            let nearest=null,nearestDist=Infinity;
            for(const o of [...(world.npcs||[]),...islandSocial().actors]){
                const p=o?.position&&Number.isFinite(o.position.x)?o.position:o;
                if(!Number.isFinite(p?.x)||!Number.isFinite(p?.y))continue;
                const d=Math.hypot(p.x-target.x,p.y-target.y);
                if(d<nearestDist){nearestDist=d;nearest=p;}
            }
            if(nearest&&nearestDist<SOCIAL_DEFAULTS.approachRadius){
                const dx=nearest.x-target.x,dy=nearest.y-target.y;
                save.facing=Math.abs(dx)>Math.abs(dy)?(dx<0?1:2):(dy<0?3:0);
            }
            close();
            clearMovementPath();
            save.position={x:target.x,y:target.y};
            save.revision++;
            persist();
            paintHud();
            showTeleportEffect();
        });
    }

    async function openTimeScroll(){
        const {stage,world,save,assets,roleStore,setPanel,clearMovementPath}=getContext();
        const city=timeScrollCity(world,save);
        if(stage!=='world'||!city||save.pendingEncounter||save.coopRun){toast('请先进入现实城市并结束当前战斗。');return;}
        close({silent:true});
        clearMovementPath();
        setPanel('time-scroll');
        nodes.hud.hidden=true;
        const ticket=++timeScrollTicket,role=roleStore.catalog.activeId,owner=roleStore.owner,zone=save.zone;
        const valid=()=>{
            const current=getContext();
            return ticket===timeScrollTicket&&current.panel==='time-scroll'&&current.stage==='world'&&role===current.roleStore.catalog.activeId&&owner===current.roleStore.owner&&zone===current.save.zone;
        };
        const abort=new AbortController();
        timeScrollLoad=abort;
        const timeout=setTimeout(()=>abort.abort(),20000);
        renderEarthLoading(nodes.overlay,{close,message:'正在展开时光长卷…'});
        try{
            const module=await import('../adventure_time_scroll.js'),data=await module.loadTimeScroll(city,{signal:abort.signal});
            if(!valid())return;
            if(!document.getElementById('time-scroll-style')){
                const link=document.createElement('link');
                link.id='time-scroll-style';
                link.rel='stylesheet';
                link.href=new URL('../../css/time-scroll.css',import.meta.url).href;
                document.head.append(link);
            }
            timeScroll=module.createTimeScroll({
                root:nodes.overlay,
                data,
                city,
                assets,
                getState:()=>{
                    const current=getContext();
                    return {save:current.save,role:current.roleStore.catalog.activeId,owner:current.roleStore.owner,stage:current.panel==='time-scroll'?current.stage:'closed',online:!!current.roleStore.owner&&!roles.localOnly};
                },
                persist:core=>{
                    persist();
                    if(getContext().storageWarning)throw Error('探索进度未能保存，请重试。');
                    if(core)queueCloudSave();
                },
                award:awardLanguageSpeech,
                onClose:()=>close(),
            });
        }catch(error){
            if(valid())renderEarthLoading(nodes.overlay,{close,message:abort.signal.aborted?'时光长卷加载超时，原城市已保留。':error.message,retry:()=>void openTimeScroll()});
        }finally{
            clearTimeout(timeout);
            if(timeScrollLoad===abort)timeScrollLoad=null;
        }
    }

    if(typeof document!=='undefined'){
        document.addEventListener('visibilitychange',()=>{if(document.hidden)timeScroll?.suspend();else timeScroll?.resume();});
    }
    if(typeof window!=='undefined'){
        window.addEventListener('blur',()=>timeScroll?.suspend());
        window.addEventListener('focus',()=>timeScroll?.resume());
    }

    return {
        canCloseHome,
        closeSessionOverlays,
        openHomePanel,
        toggleSound,
        afterSceneReady,
        resumeSceneIntro,
        enterWorld,
        updateMusic,
        toggleMusic,
        showTeleportEffect,
        teleportToLandmark,
        teleportToPosition,
        openTimeScroll,
    };
}
