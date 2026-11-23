import * as A from '../adventure_core.js';
import * as P from '../combat_pve_core.js';
import { showCompanionPlayReply } from '../views/adventure/view_hud.js';
import * as W from '../adventure_world_core.js';
import {catalogQuestsForNpc,catalogTalksForNpc} from '../adventure_catalog_quests_core.js';
import {dungeonFor} from '../adventure_dungeons_core.js';
import {isOcean} from '../adventure_fishing_core.js';
import {fishingSpot} from '../adventure_fishing_spot_core.js';
import {monsterInteractionTargets,monsterScenePositions} from '../adventure_monster_motion_core.js';
import {campDetour,campDetourGoal} from '../camp_detour_core.js';
import {forestCommissionAvailable} from '../forest_commission_core.js';
import {learningParams} from '../language_adventure_core.js';
import {openingJourney,openingJourneyActive,openingJourneyScene,openingJourneyTarget} from '../opening_journey_core.js';

export function createSceneNavigationController({
    nodes,
    getContext,
    model,
    services,
    close=services?.navigation?.close,
    openPanel=services?.navigation?.openPanel,
    persist=services?.persistence?.persist,
    paintHud=services?.navigation?.paintHud,
    paintDialogue=services?.navigation?.paintDialogue,
    paintBattle=services?.navigation?.paintBattle,
    startQuestTalk,
    tryLanguageScene,
    performAction,
    toast=services?.feedback?.toast,
    safely=services?.feedback?.safely,
    heroNavigation,
    sceneFishing,
    framePacer=services?.runtime?.framePacer,
    adaptiveGraphics=services?.runtime?.adaptiveGraphics,
    gameSettings=services?.runtime?.gameSettings,
    spellSound=services?.feedback?.spellSound,
    earth,
    dungeon,
    opening,
    wordLearning,
    languageTasks,
    languageAdventure,
    islandSocial,
    petScene,
    localPlay,
    membership,
    battleIntro,
    perf,
    onInteract,
    beginEncounter=A.beginEncounter,
    restorePveBattle=P.restorePveBattle,
}){
    function interact(target){
        const ctx=getContext();
        const lp=localPlay();
        if(ctx.stage!=='world'||!target||lp.paused||ctx.encounterStarting)return;
        heroNavigation.cancel();
        ctx.clearMovementPath();
        ctx.keys.clear();
        if(target.kind==='camp-toy'){
            const outing=campDetour(ctx.save);
            if(outing?.step===2&&!outing.paused)ctx.renderer.campToys.syncCrystalProgress(outing.crystals);
            const planned=ctx.renderer.campToys.planInteraction(target,performance.now());
            const response=planned?.response;
            if(response){
                if(campDetourGoal(ctx.save)?.id===target.id){
                    const result=performAction({type:'camp-detour',step:'touch',id:target.id},{campToy:target});
                    if(result===false)return;
                    nodes.hud.guideOpen=false;
                    paintHud();
                    response.line=campDetour(ctx.save)?.step===3?'抓宠符文到手！':campDetourGoal(ctx.save)?.text||response.line;
                }
                planned.commit();
                spellSound.play(response.sound,{rate:response.rate,gain:response.gain??1});
                if(!matchMedia('(prefers-reduced-motion: reduce)').matches&&adaptiveGraphics.effects(gameSettings.value).particles){
                    ctx.renderer.interactionFeedback.particles.emit(response.point.x,response.point.y,performance.now(),{count:response.count});
                }
                showCompanionPlayReply(nodes.hud,response.line);
            }
            return;
        }
        persist();
        if(
            !lp.active
            &&ctx.save.zone==='camp'
            &&openingJourneyActive(ctx.save)
            &&target.kind==='npc'
            &&(target.id===openingJourneyTarget(ctx.save)?.id||(target.id===36201&&openingJourney(ctx.save).phase!=='offer'))
        ){
            opening.openOpeningJourney();
            return;
        }
        if(!lp.active&&forestCommissionAvailable(ctx.save)&&(target.forestSite||target.forestCommission)){
            openPanel('forest-commission');
            return;
        }
        if(lp.interceptNpc(target))return;
        if(!(ctx.save.zone==='camp'&&openingJourneyActive(ctx.save))&&tryLanguageScene(target))return;
        if(ctx.world.isCityDungeon&&target.cityHotspot){
            dungeon.openCityHotspot(target);
            return;
        }
        if(target.kind==='landmark'&&target.cityDungeon){
            void dungeon.loadAndEnterCityDungeon(target.dungeonId,target.cityFallback);
            return;
        }
        if(target.kind==='npc'&&target.earthNpc){
            void earth.openEarthNpc(target);
            return;
        }
        if(target.kind==='npc'){
            if((target.id===36205||target.name==='法斯特船长')&&!target.questDialogue&&!(ctx.save.zone==='camp'&&ctx.save.languageLearning?.enabled)){
                const here=catalogQuestsForNpc(ctx.save,ctx.assets.content,target.id,A.catalogStatSnapshot(ctx.save,ctx.assets.content));
                if(!here.accept.length&&!here.claim.length&&!catalogTalksForNpc(ctx.save,ctx.assets.content,target.id).length){
                    openPanel('worldmap');
                    return;
                }
            }
            close();
            ctx.setDialog({
                npcId:target.id,
                npc:target,
                questDialogue:target.questDialogue===true,
                fromQuestTracking:target.questDialogue===true,
            });
            const talk=target.questDialogue&&A.pendingQuestTalk(ctx.save,A.currentQuest(ctx.save,ctx.assets.content),target.id);
            if(talk)startQuestTalk(talk);
            else paintDialogue();
        }
        if(target.kind==='portal'&&(target.id===ctx.world.entrancePortal?.id||!ctx.world.portal.hidden)){
            if(target.id===ctx.world.portal.id&&dungeon.openSparkRescue?.())return;
            if(dungeonFor(ctx.assets.content,ctx.save.zone))dungeon.exitDungeon();
            else openPanel('worldmap');
        }
        if(target.kind==='landmark'&&target.dungeonId){
            dungeon.openJourney(target.dungeonId);
            return;
        }
        if(target.kind==='landmark'){
            toast('{name}：{description}',{name:target.name,description:target.description});
        }
        if(target.kind==='encounter'){
            safely(async()=>{
                ctx.setEncounterStarting(true);
                try{
                    perf.start('combat-entry');
                    const nowCtx=getContext();
                    const startEpoch=nowCtx.roleEpoch;
                    const startWorld=nowCtx.world;
                    const startPosition={...nowCtx.save.position};
                    const startLanguage=nowCtx.save.languageLearning?.target;
                    const startRole=nowCtx.roleStore.catalog.activeId;
                    const startOwner=nowCtx.roleStore.owner;
                    let learned=null;
                    // Background saves replace the save object; only real lifecycle/input changes cancel entry.
                    const entryLive=()=>{
                        const c=getContext();
                        const loc=localPlay();
                        return (
                            c.roleEpoch===startEpoch
                            &&c.world===startWorld
                            &&c.save.languageLearning?.target===startLanguage
                            &&c.roleStore.catalog.activeId===startRole
                            &&c.roleStore.owner===startOwner
                            &&c.stage==='world'
                            &&!c.save.pendingEncounter
                            &&!c.panel
                            &&!c.dialog
                            &&!languageAdventure.active
                            &&!c.characterChat.active
                            &&!c.secondCharacterChat?.active
                            &&!loc.paused
                            &&!c.keys.size
                            &&!c.joystick.x
                            &&!c.joystick.y
                            &&!c.heldPointer?.active
                            &&!c.path.length
                            &&!c.destination
                            &&W.distance(startPosition,c.save.position)<1
                        );
                    };
                    if(nowCtx.save.languageLearning?.enabled&&!localPlay().active&&!nowCtx.save.coopRun){
                        try{
                            learned=await wordLearning.prepareBattleWordCards(startLanguage,entryLive);
                            if(!entryLive())return;
                        }catch{
                            learned=null;
                            if(entryLive())toast('字典暂时无法读取，本场使用普通卡牌。');
                        }
                    }
                    if(!entryLive())return;
                    const readyCtx=getContext();
                    const m=membership().state;
                    beginEncounter(readyCtx.save,readyCtx.assets.content,target.id,{
                        keepworkVip:m.isVip,
                        expiresAt:m.expiresAt,
                        now:Date.now(),
                    });
                    const languageTicket=languageTasks.battleTicket(target.id);
                    if(languageTicket)readyCtx.save.pendingEncounter.languageTask=languageTicket;
                    wordLearning.attachBattleWordCards(
                        readyCtx.save.pendingEncounter,
                        learned,
                        readyCtx.assets.content.balanceParams,
                        readyCtx.save.languageLearning.target,
                    );
                    persist();
                    const nextBattle=localPlay().active
                        ?await localPlay().beginBattle()
                        :restorePveBattle(readyCtx.assets.dataset,readyCtx.assets.content,readyCtx.save.pendingEncounter);
                    readyCtx.setBattle(nextBattle);
                    readyCtx.setStage('battle');
                    close();
                    nodes.hud.hidden=true;
                    readyCtx.setSelected(null);
                    readyCtx.setDiscarded([]);
                    readyCtx.setAnimation(null);
                    readyCtx.setPetCardsOpen(false);
                    readyCtx.setRuneCardsOpen(false);
                    nodes.battle.disposeHandGesture?.();
                    nodes.battle.replaceChildren();
                    readyCtx.renderer.prepareScene(readyCtx.world,readyCtx.save);
                    if(localPlay().active)paintBattle();
                    else battleIntro.open(nextBattle,readyCtx.assets);
                }finally{
                    getContext().setEncounterStarting(false);
                }
            });
        }
    }

    function nearbySceneInteraction(){
        const {save,world,renderer}=getContext();
        const goal=campDetourGoal(save);
        const toy=goal&&renderer.campToys?.rows.find(row=>row.id===goal.id);
        if(toy&&W.distance(save.position,toy)<85)return toy;
        return W.nearestInteraction(world,save.position)||renderer.campToys?.nearest(save.position);
    }

    function interactNearest(){
        const ctx=getContext();
        if(localPlay().tryGather())return;
        if(!ctx.panel&&!ctx.dialog&&!ctx.characterChat.active&&!ctx.secondCharacterChat?.active){
            interact(nearbySceneInteraction());
        }
    }

    function requestHeroPath(target,onResult=route=>getContext().setPath(route)){
        const ctx=getContext();
        heroNavigation.cancel();
        ctx.setPath([]);
        if(ctx.world.zone!=='camp'){
            onResult(W.findPath(ctx.world,ctx.save.position,target));
            return;
        }
        const currentWorld=ctx.world;
        const role=ctx.roleStore?.catalog.activeId;
        const epoch=ctx.roleEpoch;
        const owner=ctx.roleStore?.owner;
        const from={...ctx.save.position};
        heroNavigation.request(ctx.world,from,target,{
            roleId:role,
            isLive:()=>{
                const c=getContext();
                return (
                    c.roleEpoch===epoch
                    &&c.roleStore?.owner===owner
                    &&c.world===currentWorld
                    &&c.roleStore?.catalog.activeId===role
                    &&c.stage==='world'
                    &&!c.panel
                    &&!c.dialog
                    &&!c.encounterStarting
                    &&!languageAdventure.active
                    &&!c.characterChat.active
                    &&!c.secondCharacterChat?.active
                    &&!localPlay().paused
                    &&!document.hidden
                    &&!c.keys.size
                    &&!c.joystick.x
                    &&!c.joystick.y
                    &&!c.heldPointer?.active
                    &&W.distance(from,c.save.position)<1
                );
            },
            onResult,
        });
    }

    function liveEncounterTarget(world,target){
        if(!world||target?.kind!=='encounter'||!target.explicitChallenge)return target;
        const live=world.encounters?.find(row=>row.id===target.id);
        if(!live||live.hidden||live.blocked?.length)return null;
        const poses=monsterScenePositions(world,live);
        const anchor=Number.isFinite(target.x)&&Number.isFinite(target.y)?target:live;
        const closest=poses.reduce((best,pose)=>!best||W.distance(anchor,pose)<W.distance(anchor,best)?pose:best,null);
        return {...live,x:closest?.x??live.x,y:closest?.y??live.y,kind:'encounter',explicitChallenge:true};
    }

    function trackedDestinationInteraction(target,radius){
        const {world,save}=getContext();
        if(target?.kind==='encounter'&&target.explicitChallenge){
            const live=world.encounters.find(row=>row.id===target.id);
            if(live&&!live.hidden&&!live.blocked?.length){
                const nearAnchor=W.distance(save.position,live)<radius;
                const nearSprite=monsterScenePositions(world,live).some(p=>W.distance(save.position,p)<radius);
                if(nearAnchor||nearSprite)return {...live,kind:'encounter'};
            }
            return null;
        }
        return W.destinationInteraction(world,save.position,target,radius);
    }

    function walkTo(target,autoInteract=false){
        if(autoInteract&&target.kind==='encounter'){
            target={...target,explicitChallenge:true};
            target=liveEncounterTarget(getContext().world,target)||target;
        }
        close();
        getContext().setDestination(autoInteract?target:null);
        const arrival=autoInteract&&trackedDestinationInteraction(target,85);
        if(arrival){
            (onInteract||interact)(arrival);
            return;
        }
        requestHeroPath(target,route=>{
            getContext().setPath(route);
            if(!route.length)toast('这里暂时走不过去，试试旁边的小路。');
        });
    }

    // Walk to the resident named by the NPC bubble, then enter that conversation.
    function approachInvite(){
        const ctx=getContext();
        const invite=languageAdventure.invitation;
        if(!invite||ctx.stage!=='world')return false;
        const npc=ctx.world.npcs.find(n=>(invite.instanceId?n.instanceId===invite.instanceId:String(n.id)===String(invite.npcId)));
        if(!npc)return false;
        const target={...npc,kind:'npc'};
        close();
        ctx.clearMovementPath();
        void languageAdventure
            .prepare(target)
            .then(prepared=>{
                if(!prepared||!languageAdventure.preparedValid(prepared))return;
                const nowCtx=getContext();
                if(W.distance(nowCtx.save.position,target)<=learningParams(nowCtx.assets.content).interactionRange){
                    languageAdventure.greet(prepared,performance.now());
                    return;
                }
                requestHeroPath(target,route=>{
                    if(!languageAdventure.preparedValid(prepared))return;
                    getContext().setPath(route);
                    if(!route.length){
                        toast('这里暂时走不过去，试试旁边的小路。');
                        return;
                    }
                    getContext().setTalkApproach(prepared);
                });
            })
            .catch(error=>toast(error.message));
        return true;
    }

    async function startFishing(water){
        const ctx=getContext();
        if(!ctx.world||dungeonFor(ctx.assets.content,ctx.world.zone)||!isOcean(ctx.world,water.x,water.y))return;
        const epoch=ctx.bumpFishingLoadEpoch();
        const currentSave=ctx.save;
        const currentWorld=ctx.world;
        const position={...ctx.save.position};
        try{
            if(!ctx.assets.content.fishing)toast('正在准备钓鱼…');
            await ctx.assets.loadFishing();
            const c=getContext();
            if(
                epoch!==c.fishingLoadEpoch
                ||c.save!==currentSave
                ||c.world!==currentWorld
                ||c.stage!=='world'
                ||c.panel
                ||c.dialog
                ||document.hidden
                ||c.keys.size
                ||c.path.length
                ||W.distance(c.save.position,position)>1
            ){
                return;
            }
            sceneFishing.start(water,model());
        }catch{
            if(epoch===getContext().fishingLoadEpoch)toast('钓鱼数据加载失败，请再次点击海面重试。');
        }
    }

    function pickWorldTarget(clientX,clientY){
        const {world,renderer,save}=getContext();
        const rect=nodes.world.getBoundingClientRect();
        const p=renderer.screenToWorld(clientX-rect.left,clientY-rect.top);
        const targets=[
            ...world.npcs.map(n=>({...n,kind:'npc'})),
            ...world.encounters.flatMap(n=>monsterInteractionTargets(world,n)),
            ...(world.landmarks||[]).map(n=>({...n,kind:'landmark'})),
            ...(world.entrancePortal?[{...world.entrancePortal,kind:'portal'}]:[]),
            {...world.portal,kind:'portal'},
        ];
        const lp=localPlay();
        const companion=!lp.active&&openingJourneyScene(save,world.npcs.find(n=>n.id===36201));
        if(companion)targets.push({...companion,id:36201,kind:'npc',name:'咕噜噜'});
        const follower=!lp.active&&renderer.companionTarget();
        if(follower)targets.push({...follower,kind:'companion-guide',name:'同行伙伴'});
        const portal=targets.find(n=>n.cityDungeon&&!n.hidden&&Math.abs(n.x-p.x)<35&&Math.abs(n.y-p.y)<24);
        const target=
            portal
            ||targets
                .filter(n=>!n.hidden&&Math.abs(n.x-p.x)<62&&p.y>n.y-104&&p.y<n.y+42)
                .sort((a,b)=>W.distance(a,p)-W.distance(b,p))[0]
            ||renderer.campToys?.pick(p);
        return {p,target};
    }

    function clickWorld(clientX,clientY){
        const ctx=getContext();
        framePacer.wake();
        heroNavigation.cancel();
        ctx.bumpFishingLoadEpoch();
        const lp=localPlay();
        if(lp.paused)return false;
        const {p,target}=pickWorldTarget(clientX,clientY);
        ctx.renderer.interactionFeedback?.click(p,target,performance.now());
        if(target?.kind==='companion-guide'){
            ctx.clearMovementPath();
            nodes.hud.guideOpen=true;
            paintHud();
            return false;
        }
        const memoryNode=ctx.world.memoryNodes?.find(n=>Math.hypot(n.x-p.x,n.y-p.y)<38);
        if(memoryNode){
            walkTo(memoryNode,false);
            return false;
        }
        if(lp.interceptSocial(p)){
            ctx.clearMovementPath();
            return false;
        }
        if(lp.routePointer(p,target))return false;
        if(lp.collectClick(p))return false;
        const babyId=ctx.stage==='world'&&petScene().pick(p);
        if(babyId){
            safely(()=>petScene().adopt(babyId));
            return false;
        }
        const social=islandSocial();
        const socialTarget=lp.active?null:social.pick(p);
        if(socialTarget){
            ctx.clearMovementPath();
            social.select(socialTarget,'social-actions');
            return false;
        }
        if(languageAdventure.greeting){
            const rect=ctx.renderer.greetingTarget();
            if(rect&&p.x>=rect.x&&p.x<=rect.x+rect.w&&p.y>=rect.y&&p.y<=rect.y+rect.h){
                languageAdventure.enterGreeting();
                return false;
            }
            languageAdventure.close();
        }
        const bubble=ctx.renderer.bubbleTarget();
        if(bubble&&p.x>=bubble.x&&p.x<=bubble.x+bubble.w&&p.y>=bubble.y&&p.y<=bubble.y+bubble.h){
            approachInvite();
            return false;
        }
        if(!target&&!dungeonFor(ctx.assets.content,ctx.world.zone)&&isOcean(ctx.world,p.x,p.y)){
            if(sceneFishing.active)sceneFishing.aim(p);
            else{
                const spot=fishingSpot(ctx.world,ctx.save.position,p);
                if(!spot){
                    toast('这里离水边太远，换一处海岸试试。');
                    return false;
                }
                close();
                ctx.clearMovementPath();
                if(W.distance(ctx.save.position,spot.shore)>8){
                    requestHeroPath(spot.shore,route=>{
                        ctx.setPath(route);
                        if(!route.length){
                            toast('这处岸边暂时走不到，换个位置吧。');
                            return;
                        }
                        ctx.setFishingApproach(spot);
                    });
                }else{
                    void startFishing(spot.water);
                }
            }
            return false;
        }
        if(sceneFishing.active)sceneFishing.stop();
        walkTo(target||p,!!target);
        return !target;
    }

    return {
        interact,
        nearbySceneInteraction,
        interactNearest,
        requestHeroPath,
        liveEncounterTarget,
        trackedDestinationInteraction,
        walkTo,
        approachInvite,
        startFishing,
        pickWorldTarget,
        clickWorld,
    };
}
