import * as A from '../adventure_core.js';
import {
    syncCareHud,
    syncInteractPrompt,
    syncRewardGlow,
    syncTeachPointer,
    updateLocationLabel as renderLocationLabel,
} from '../views/adventure/view_hud.js';
import { syncBattleFrame } from '../views/adventure/view_battle_layer.js';
import * as W from '../adventure_world_core.js';
import {tickCheckin} from '../adventure_checkin_core.js';
import {regionAt} from '../adventure_island_layout_core.js';
import {tickCare} from '../adventure_pets_core.js';
import {pauseBackgroundScene} from '../adventure_scene_pause_core.js';
import {timeScrollCity} from '../adventure_time_scroll_core.js';
import {campDetour} from '../camp_detour_core.js';
import {learningParams} from '../language_adventure_core.js';
import {localBuffDay} from '../language_daily_buff_core.js';
import {TELEPORT_EFFECT_MS} from '../views/adventure/view_adventure_teleport.js';
import {hanziAnimationActive} from '../hanzi/view_hanzi_animation.js';

export function updateLocationLabel(world,save,hud){
    const regionName = world?.layout ? regionAt(world, save.position)?.name || '' : '';
    renderLocationLabel(hud, world, save, regionName);
}

export function stepWorldMovement(nowCtx,nodes,dt,now,languageAdventure,requestHeroPath){
    let dx=Number(nowCtx.keys.has('right'))-Number(nowCtx.keys.has('left'));
    let dy=Number(nowCtx.keys.has('down'))-Number(nowCtx.keys.has('up'));
    if(!dx&&!dy){
        dx=nowCtx.joystick.x;
        dy=nowCtx.joystick.y;
    }
    if(nowCtx.heldPointer&&(nowCtx.heldPointer.active||now-nowCtx.heldPointer.since>=180)){
        if(!nowCtx.heldPointer.active){
            languageAdventure.close();
            nowCtx.setTalkApproach(null);
        }
        nowCtx.heldPointer.active=true;
        nowCtx.clearMovementPath();
        const rect=nowCtx.heldPointer.bounds??(nowCtx.heldPointer.bounds=nodes.world.getBoundingClientRect());
        const target=nowCtx.renderer.screenToWorld(nowCtx.heldPointer.x-rect.left,nowCtx.heldPointer.y-rect.top);
        const x=target.x-nowCtx.save.position.x;
        const y=target.y-nowCtx.save.position.y;
        const distance=Math.hypot(x,y);
        const travel=W.WALK_SPEED*(nowCtx.save.mountId?nowCtx.assets.content.balanceParams?.adventure?.mountSpeed||1.35:1)*dt;
        if(!dx&&!dy&&distance>6){
            const scale=Math.min(1,(distance-6)/(travel||1));
            dx=(x/distance)*scale;
            dy=(y/distance)*scale;
        }
    }
    if(!dx&&!dy&&nowCtx.path.length){
        const travel=W.WALK_SPEED*(nowCtx.save.mountId?nowCtx.assets.content.balanceParams?.adventure?.mountSpeed||1.35:1)*dt;
        const previous=nowCtx.save.position;
        const next=W.followPath(nowCtx.world,nowCtx.save.position,nowCtx.path,travel);
        nowCtx.save.position=next.position;
        nowCtx.setPath(next.path);
        dx=nowCtx.save.position.x-previous.x;
        dy=nowCtx.save.position.y-previous.y;
        nowCtx.setMoving(Math.hypot(dx,dy)>0.01);
        if(next.blocked&&nowCtx.destination)requestHeroPath(nowCtx.destination);
    }else if(dx||dy){
        const length=Math.max(1,Math.hypot(dx,dy));
        const previous=nowCtx.save.position;
        const travel=W.WALK_SPEED*(nowCtx.save.mountId?nowCtx.assets.content.balanceParams?.adventure?.mountSpeed||1.35:1)*dt;
        nowCtx.save.position=W.movePosition(nowCtx.world,nowCtx.save.position,(dx/length)*travel,(dy/length)*travel);
        nowCtx.setMoving(W.distance(previous,nowCtx.save.position)>0.01);
    }
    if(nowCtx.isMoving?nowCtx.isMoving():nowCtx.moving){
        nowCtx.save.facing=Math.abs(dx)>Math.abs(dy)?(dx<0?1:2):dy<0?3:0;
    }
}

export function createFrameLoopController({
    nodes,
    getContext,
    model,
    services,
    persist=services?.persistence?.persist,
    persistRuntime=services?.persistence?.persistRuntime,
    queueCloudSave=services?.persistence?.queueCloudSave,
    paintHud=services?.navigation?.paintHud,
    paintPanel=services?.navigation?.paintPanel,
    tickAnimation,
    toast=services?.feedback?.toast,
    heroNavigation,
    sceneLoading,
    sceneFishing,
    framePacer=services?.runtime?.framePacer,
    adaptiveGraphics=services?.runtime?.adaptiveGraphics,
    gameSettings=services?.runtime?.gameSettings,
    autoSave,
    earth,
    dungeon,
    wordLearning,
    languageAdventure,
    islandSocial,
    petScene,
    localPlay,
    membership,
    battleIntro,
    rewardFeedback,
    rewardRoot,
    perf,
    interact,
    nearbySceneInteraction,
    requestHeroPath,
    trackedDestinationInteraction,
    startFishing,
}){
    function backgroundScenePaused(){
        const ctx=getContext();
        return pauseBackgroundScene({
            stage:ctx.stage,
            hidden:document.hidden,
            panel:ctx.panel,
            dialog:ctx.dialog,
            learning:languageAdventure.active,
            conversation:ctx.characterChat.active||!!ctx.secondCharacterChat?.active,
            fullscreen:!!document.fullscreenElement&&!document.fullscreenElement.contains(nodes.world),
        });
    }

    function frame(now){
        requestAnimationFrame(frame);
        const ctx=getContext();
        const pacer=typeof framePacer==='object'?framePacer:null;
        const social=islandSocial();
        const pets=petScene();
        const lp=localPlay();
        if(document.hidden||hanziAnimationActive()||wordLearning.wordPractice.active){
            // Freeze all background frame work, including local play and battle.
            // Advance clocks so closing the player never replays the suspended interval.
            pacer?.reset();
            ctx.setLastFrame(now);
            ctx.setLastCare(now);
            social.lastFrame=now;
            pets.lastFrame=now;
            ctx.renderer?.pauseFrameMeter?.();
            adaptiveGraphics.suspend(now);
            perf.frame(now,false);
            return;
        }
        if(ctx.stage!=='world'||document.hidden||ctx.panel||ctx.dialog||ctx.keys.size||ctx.joystick.x||ctx.joystick.y||ctx.heldPointer?.active||lp.paused){
            heroNavigation.cancel();
        }
        if(!ctx.renderer||!ctx.save)return;
        if(sceneLoading.update(ctx.world,ctx.save,now,ctx.stage==='world'&&ctx.panel!=='home')){
            // No world simulation or full-scene drawing competes with initial terrain preparation.
            pacer?.reset();
            ctx.setLastFrame(now);
            ctx.setLastCare(now);
            social.lastFrame=now;
            pets.lastFrame=now;
            ctx.renderer.pauseFrameMeter?.();
            adaptiveGraphics.suspend(now);
            perf.frame(now,false);
            return;
        }
        const sceneActive=
            ctx.stage==='battle'
                ?Boolean(battleIntro.active||ctx.animation)
                :ctx.stage==='world'
                  &&!ctx.panel
                  &&!ctx.dialog
                  &&!document.hidden
                  &&Boolean(
                      ctx.moving
                          ||ctx.keys.size
                          ||ctx.joystick.x
                          ||ctx.joystick.y
                          ||ctx.path.length
                          ||ctx.destination
                          ||ctx.heldPointer
                          ||lp.moving?.[0]
                          ||lp.moving?.[1]
                          ||lp.gesture
                          ||social.gesture
                          ||ctx.teleportEffect
                          ||sceneFishing.active
                          ||ctx.world?.memoryGathering
                          ||ctx.fishingApproach
                          ||ctx.talkApproach
                          ||ctx.renderer.isAnimating?.(),
                  );
        if(pacer&&!pacer.shouldRender(now,sceneActive))return;
        ctx.hanziIsland?.tick();
        wordLearning.tick();
        const earthFrameStart=perf.enabled?performance.now():0;
        const phasePrefix=ctx.world?.isEarth?'earth-':'island-';
        perf.frame(now,ctx.stage==='world'&&!document.hidden&&!ctx.panel&&!ctx.dialog&&(!pacer||pacer.isActive(now)));
        if(ctx.panel!=='home')lp.pollInput(now);
        if(lp.paused){
            lp.tick(now,0);
            ctx.setLastFrame(now);
            return;
        }
        if(now-ctx.lastLanguageDayCheck>1000){
            ctx.setLastLanguageDayCheck(now);
            if(ctx.save.dailyLanguageBuff&&ctx.save.dailyLanguageBuff.day!==localBuffDay()){
                delete ctx.save.dailyLanguageBuff;
                persist();
                paintHud();
                if(ctx.panel==='learning-mode')paintPanel();
            }
        }
        void autoSave.tick();
        dungeon.dungeonStory.tick();
        battleIntro.tick(now,{paused:document.hidden});
        let scenePaused=ctx.panel==='home'||backgroundScenePaused();
        languageAdventure.tick(now);
        if(ctx.stage==='world'&&ctx.panel!=='home'&&!document.hidden&&now-ctx.lastCare>1000){
            ctx.setLastCare(now);
            setTimeout(()=>{
                const c=getContext();
                if(c.stage!=='world'||c.panel==='home'||!c.save||document.hidden||hanziAnimationActive())return;
                const started=perf.enabled?performance.now():0;
                if(tickCare(c.save,c.assets.content,A.playerSpec(c.save,c.assets.content),Date.now(),true)){
                    persist();
                    queueCloudSave();
                }
                syncCareHud(nodes.hud,nodes.overlay,c.panel,c.save,lp.second,c.assets.content,model(),c.updatePetStatus);
                if(performance.now()-c.lastRuntimeSave>30000)persistRuntime();
                if(started)perf.record(c.world.isEarth?'earth-care':'island-care',performance.now()-started);
            },0);
        }
        if((ctx.stage==='world'||ctx.stage==='battle')&&!document.hidden&&tickCheckin(ctx.save,Date.now(),Math.min(1000,Math.max(0,now-ctx.lastFrame)))){
            persist();
        }
        const dt=Math.min(0.065,(now-ctx.lastFrame)/1000||0);
        ctx.setLastFrame(now);
        ctx.setMoving(false);
        earth.updateFrame(now,dt);
        if(ctx.stage==='world'&&ctx.world.isEarth&&!ctx.panel&&now-ctx.lastTimeCityCheck>400){
            ctx.setLastTimeCityCheck(now);
            const cityId=timeScrollCity(ctx.world,ctx.save)?.id||null;
            if(cityId!==ctx.lastTimeCityId){
                ctx.setLastTimeCityId(cityId);
                paintHud();
            }
        }
        if(ctx.stage==='world'){
            const outing=campDetour(ctx.save);
            if(outing?.step===2&&!outing.paused)ctx.renderer.campToys.syncCrystalProgress(outing.crystals);
        }
        if(ctx.stage==='world')syncTeachPointer(nodes.hud,!!(ctx.destination||ctx.dialog||ctx.panel));
        const nowCtx=getContext();
        if(
            nowCtx.stage==='world'
            &&!lp.leaderBlocked
            &&!nowCtx.panel
            &&!nowCtx.dialog
            &&!languageAdventure.active
            &&!nowCtx.characterChat.active
            &&!nowCtx.secondCharacterChat?.active
        ){
            stepWorldMovement(
                {...nowCtx,isMoving:()=>getContext().moving},
                nodes,
                dt,
                now,
                languageAdventure,
                requestHeroPath,
            );
            const cell=nowCtx.world.zone+':'+Math.floor(nowCtx.save.position.x/512)+','+Math.floor(nowCtx.save.position.y/512);
            if(cell!==nowCtx.warmCell){
                nowCtx.setWarmCell(cell);
                void nowCtx.assets.warmNearby?.(nowCtx.world,nowCtx.save);
            }
            W.updateDungeonExploration(nowCtx.world,nowCtx.save);
            W.updateEncounterVisibility(nowCtx.world,nowCtx.save,Date.now());
            const auto=W.takeAutoInteraction(nowCtx.world,nowCtx.save.position);
            if(auto)interact(auto);
            else{
                const arrival=trackedDestinationInteraction(nowCtx.destination,82);
                if(arrival)interact(arrival);
            }
            const near=nearbySceneInteraction();
            updateLocationLabel(nowCtx.world,nowCtx.save,nodes.hud);
            syncInteractPrompt(nodes.hud,near,nowCtx.assets.content);
        }
        const fCtx=getContext();
        wordLearning.hanziMemory.tick(
            dt,
            fCtx.stage==='world'
                &&!document.hidden
                &&!fCtx.panel
                &&!fCtx.dialog
                &&!languageAdventure.active
                &&!fCtx.characterChat.active
                &&!fCtx.secondCharacterChat?.active
                &&!lp.paused,
        );
        const rewardEffect=rewardFeedback.tick(now,fCtx.stage==='world'&&!fCtx.panel&&!fCtx.dialog&&!sceneFishing.active);
        if(fCtx.moving||rewardEffect||lp.moving?.[0]||lp.moving?.[1])pacer?.wake(now);
        syncRewardGlow(nodes.hud,rewardRoot);
        if(fCtx.teleportEffect&&(fCtx.stage!=='world'||now-fCtx.teleportEffect.started>=TELEPORT_EFFECT_MS)){
            fCtx.setTeleportEffect(null);
        }
        if(fCtx.fishingApproach){
            if(fCtx.stage!=='world'||document.hidden||fCtx.panel||fCtx.dialog||fCtx.keys.size||fCtx.joystick.x||fCtx.joystick.y||fCtx.heldPointer){
                fCtx.setFishingApproach(null);
            }else if(!fCtx.path.length){
                const spot=fCtx.fishingApproach;
                fCtx.setFishingApproach(null);
                if(W.distance(fCtx.save.position,spot.shore)<24){
                    fCtx.setMoving(false);
                    void startFishing(spot.water);
                }else{
                    toast('没能走到水边，换个位置再试试。');
                }
            }
        }
        if(fCtx.talkApproach){
            if(!languageAdventure.preparedValid(fCtx.talkApproach)||fCtx.panel||fCtx.dialog||fCtx.keys.size||fCtx.joystick.x||fCtx.joystick.y||fCtx.heldPointer||document.hidden){
                fCtx.setTalkApproach(null);
                languageAdventure.close();
            }else if(W.distance(fCtx.save.position,fCtx.talkApproach.npc)<=learningParams(fCtx.assets.content).interactionRange){
                const prepared=fCtx.talkApproach;
                fCtx.setTalkApproach(null);
                fCtx.setPath([]);
                fCtx.setMoving(false);
                languageAdventure.greet(prepared,now);
            }else if(!fCtx.path.length){
                fCtx.setTalkApproach(null);
                toast('这里暂时走不过去，试试旁边的小路。');
            }
        }
        fCtx.characterChat.tick();
        fCtx.secondCharacterChat?.tick();
        earth.tickPractice();
        scenePaused=fCtx.panel==='home'||backgroundScenePaused();
        let earthPhaseStart=earthFrameStart?performance.now():0;
        if(earthFrameStart)perf.record(phasePrefix+'update',earthPhaseStart-earthFrameStart);
        lp.tick(now,dt);
        if(!scenePaused)social.step(Math.min(0.1,(now-(social.lastFrame||now))/1000),{view:fCtx.renderer.viewRect?.()});
        social.lastFrame=now;
        if(earthFrameStart){
            perf.record(phasePrefix+'social-frame',performance.now()-earthPhaseStart);
            earthPhaseStart=performance.now();
        }
        if(fCtx.stage==='world'&&!scenePaused){
            try{
                pets.step(Math.min(0.065,(now-(pets.lastFrame||now))/1000));
            }catch(error){
                if(pets.error!==error.message){
                    toast(error.message);
                    pets.error=error.message;
                }
            }
        }
        pets.lastFrame=now;
        if(earthFrameStart){
            perf.record(phasePrefix+'pet-frame',performance.now()-earthPhaseStart);
            earthPhaseStart=performance.now();
        }
        // One scene gate for battle, cinematic and every blocking UI; retain the last frame.
        adaptiveGraphics.sample(now,{active:fCtx.stage==='world'&&!scenePaused&&(!pacer||pacer.isActive(now)),scene:fCtx.world.layout});
        if(scenePaused)fCtx.renderer.pauseFrameMeter?.();
        if(!scenePaused||(nodes.world.sceneViewportDirty&&!document.hidden)){
            fCtx.renderer.render(fCtx.world,fCtx.save,now,{
                remotePlayers:fCtx.gameServerSession?.remoteActors(`haqi:${String(fCtx.save?.zone||'camp').slice(0,48)}`)||[],
                localSecond:lp.second,
                localSecondMoving:lp.moving[1],
                localFollowing:lp.following,
                localSecondFollowing:lp.secondFollowing,
                gatheringPets:lp.gatheringPets,
                graphics:adaptiveGraphics.effects(gameSettings.value),
                petScene:fCtx.save.petInstanceVersion===1&&fCtx.stage==='world'?pets:null,
                socialGesture:lp.gesture||social.gesture,
                socialActors:social.actors,
                inParty:social.team.length>0,
                moving:!scenePaused&&(fCtx.moving||lp.moving[0]),
                path:fCtx.path,
                title:fCtx.stage==='title',
                rewardEffect,
                teleportEffect:fCtx.teleportEffect,
                fishingPose:sceneFishing.pose(now),
                membership:membership().state,
                motionHidden:scenePaused||fCtx.stage!=='world'||document.hidden,
                hideLocalActors:fCtx.panel==='companion-wordplay',
                monstersPaused:scenePaused||!!(fCtx.panel||fCtx.dialog||languageAdventure.active||fCtx.characterChat.active||fCtx.secondCharacterChat?.active),
                learningGreeting:languageAdventure.greeting,
                companionBubble:
                    fCtx.stage==='world'&&!fCtx.panel&&!fCtx.dialog&&!languageAdventure.active&&!fCtx.characterChat.active&&!fCtx.secondCharacterChat?.active&&!sceneFishing.active
                        ?languageAdventure.bubble&&languageAdventure.invitation
                        :null,
            });
            nodes.world.sceneViewportDirty=false;
        }
        if(earthFrameStart)perf.record(phasePrefix+'draw',performance.now()-earthPhaseStart);
        if(fCtx.stage==='world'&&!scenePaused){
            perf.end('startup');
            perf.end('world-ready');
            perf.end('combat-return');
        }
        if(sceneFishing.active){
            if(fCtx.stage!=='world'||fCtx.panel||fCtx.dialog||fCtx.moving||fCtx.keys.size||fCtx.joystick.x||fCtx.joystick.y||fCtx.heldPointer?.active||document.hidden){
                sceneFishing.stop(false);
            }else{
                const origin=fCtx.renderer.screenToWorld(0,0);
                const unit=fCtx.renderer.screenToWorld(1,1);
                sceneFishing.update(model(),now,p=>({
                    x:(p.x-origin.x)/(unit.x-origin.x),
                    y:(p.y-origin.y)/(unit.y-origin.y),
                }));
            }
        }
        if(fCtx.stage==='battle'&&!battleIntro.active){
            const speechEvent=fCtx.animation?.events[fCtx.animation.index];
            const presentation=tickAnimation(now);
            syncBattleFrame({
                battleRoot:nodes.battle,
                renderer:fCtx.renderer,
                battle:fCtx.battle,
                save:fCtx.save,
                content:fCtx.assets.content,
                now,
                presentation,
                speechEvent,
                localActive:lp.active,
            });
        }
        if(earthFrameStart)perf.record(phasePrefix+'frame-work',performance.now()-earthFrameStart);
    }

    return {
        backgroundScenePaused,
        frame,
    };
}
