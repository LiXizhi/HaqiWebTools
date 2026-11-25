import * as A from '../adventure_core.js';
import {tickCare} from '../adventure_pets_core.js';

const DIRECTION_KEYS={
    w:'up',
    arrowup:'up',
    s:'down',
    arrowdown:'down',
    a:'left',
    arrowleft:'left',
    d:'right',
    arrowright:'right',
};

export function createInputBindings({
    nodes,
    getContext,
    services,
    close=services?.navigation?.close,
    openPanel=services?.navigation?.openPanel,
    persist=services?.persistence?.persist,
    paintBattle=services?.navigation?.paintBattle,
    playRound,
    updateMusic,
    sceneLoading,
    sceneFishing,
    framePacer=services?.runtime?.framePacer,
    adaptiveGraphics=services?.runtime?.adaptiveGraphics,
    spellSound=services?.feedback?.spellSound,
    dungeon,
    languageAdventure,
    localPlay,
    battleIntro,
    rewardRoot,
    interactNearest,
    pickWorldTarget,
    clickWorld,
    heroNavigation,
    onMovementIntent=()=>{},
}){
    function movementIntent(){
        heroNavigation?.cancel();
        onMovementIntent();
    }

    function controllerAction(action,down,repeat=false){
        const ctx=getContext();
        const direction=['up','down','left','right'].includes(action);
        if(!down){
            if(direction)ctx.keys.delete(action);
            return;
        }
        framePacer.wake();
        if(ctx.stage!=='world'&&ctx.stage!=='battle')return;
        if(action==='settings'){
            if(!repeat){
                if(ctx.panel||ctx.dialog)close();
                else openPanel('settings');
            }
            return;
        }
        if(ctx.panel||ctx.dialog){
            if(action==='back')close();
            else localPlay().navigateGlobal(nodes.overlay,action);
            return;
        }
        if(ctx.stage==='battle'){
            if(ctx.animation)return;
            if(action==='back'){
                ctx.setSelected(null);
                paintBattle();
            }else if(action==='pass'&&!repeat&&!ctx.battle.finished){
                playRound({pass:true,discardSeqs:ctx.discarded});
            }else if(action==='discard'&&ctx.selected&&!repeat){
                nodes.battle.querySelector('.hand-card.selected .discard-button')?.click();
            }else{
                localPlay().navigateGlobal(nodes.battle,action);
            }
            return;
        }
        if(direction){
            movementIntent();
            ctx.keys.add(action);
            ctx.clearMovementPath();
            ctx.setHeldPointer(null);
            return;
        }
        if(repeat)return;
        if(action==='confirm')interactNearest();
        else if(action==='back')close();
        else if(['inventory','pet','deck'].includes(action))openPanel(action);
    }

    function releaseWorldPointer(e){
        const ctx=getContext();
        if(ctx.heldPointer?.id!==e.pointerId)return;
        const clicked=
            e.type==='pointerup'
            &&!ctx.heldPointer.active
            &&performance.now()-ctx.heldPointer.since<180
            &&Math.hypot(e.clientX-ctx.heldPointer.startX,e.clientY-ctx.heldPointer.startY)<=6;
        ctx.setHeldPointer(null);
        if(nodes.world.hasPointerCapture(e.pointerId))nodes.world.releasePointerCapture(e.pointerId);
        if(!clicked){
            ctx.clearMovementPath();
            return;
        }
        if(ctx.stage==='world'&&!ctx.panel&&!ctx.dialog&&!languageAdventure.active&&!ctx.characterChat.active&&!ctx.secondCharacterChat?.active){
            clickWorld(e.clientX,e.clientY);
        }
    }

    function bindEvents(){
        window.addEventListener('keydown',e=>{
            if(typeof e.key!=='string')return;
            if(sceneLoading.active)return;
            framePacer.wake();
            // Arrow keys belong to the second keyboard map and would be swallowed before fishing.
            if(sceneFishing.key(e)){
                e.preventDefault();
                return;
            }
            if(localPlay().key(e,true)){
                e.preventDefault();
                return;
            }
            if(languageAdventure.active)return;
            if(rewardRoot?.contains(e.target))return;
            if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;
            const ctx=getContext();
            const key=e.key.toLowerCase();
            if(DIRECTION_KEYS[key]&&ctx.stage==='world'&&!ctx.panel&&!ctx.dialog){
                movementIntent();
                e.preventDefault();
                languageAdventure.close();
                ctx.setTalkApproach(null);
                ctx.setHeldPointer(null);
                ctx.keys.add(DIRECTION_KEYS[key]);
                ctx.clearMovementPath();
            }
            if(e.repeat)return;
            if(key==='escape'){
                if(ctx.panel||ctx.dialog)close();
                else if(ctx.stage==='world')openPanel('settings');
            }
            if(ctx.stage!=='world'||ctx.panel||ctx.dialog)return;
            if(key==='e'){
                e.preventDefault();
                interactNearest();
            }
            if(key==='r')openPanel('equipment');
            if(key==='j')openPanel('quests');
            if(key==='b'||key==='i')openPanel('inventory');
            if(key==='c')openPanel('deck');
            if(key==='p')openPanel('pet');
        });
        window.addEventListener('keyup',e=>{
            if(typeof e.key!=='string')return;
            if(localPlay().key(e,false)){
                e.preventDefault();
                return;
            }
            getContext().keys.delete(DIRECTION_KEYS[e.key.toLowerCase()]);
        });
        window.addEventListener('blur',()=>{
            const ctx=getContext();
            localPlay().clearKeys();
            if(!languageAdventure.active)languageAdventure.close();
            ctx.setTalkApproach(null);
            ctx.bumpFishingLoadEpoch();
            ctx.setFishingApproach(null);
            sceneFishing.stop(false);
            ctx.resetMovementInput();
            ctx.clearMovementPath();
            persist();
        });
        window.addEventListener('pagehide',()=>{
            const ctx=getContext();
            persist();
            void ctx.roleStore?.flushRuntime();
            dungeon.dungeonStory.suspend();
            battleIntro.suspend();
            spellSound.stop();
            ctx.music?.pause();
        });
        document.addEventListener('visibilitychange',()=>{
            const ctx=getContext();
            if(document.hidden){
                if(ctx.animation)ctx.animation.silentThrough=ctx.animation.index;
                languageAdventure.suspend();
                ctx.characterChat.suspend();
                dungeon.dungeonStory.suspend();
                battleIntro.suspend();
            }
            spellSound.stop();
            if(document.hidden){
                ctx.setFishingApproach(null);
                sceneFishing.stop(false);
                ctx.resetMovementInput();
                ctx.clearMovementPath();
                persist();
                ctx.music?.pause();
            }else{
                languageAdventure.resume();
                if(ctx.stage==='world'&&ctx.save?.pets){
                    tickCare(ctx.save,ctx.assets.content,A.playerSpec(ctx.save,ctx.assets.content),Date.now(),false);
                }
                updateMusic();
            }
            adaptiveGraphics.suspend(performance.now());
        });
        nodes.world.addEventListener('pointerdown',e=>{
            if(e.pointerType==='touch'||e.pointerType==='pen')return;
            const ctx=getContext();
            if(ctx.stage!=='world'||ctx.panel||ctx.dialog||e.button!==0)return;
            e.preventDefault();
            framePacer.wake();
            nodes.world.focus({preventScroll:true});
            const lp=localPlay();
            if(lp.active&&lp.mouseOwner!==0){
                clickWorld(e.clientX,e.clientY);
                return;
            }
            movementIntent();
            // Defer target picking and pathfinding until release, after gesture detection.
            if(e.pointerType==='mouse'){
                ctx.setHeldPointer({
                    bounds:nodes.world.getBoundingClientRect(),
                    id:e.pointerId,
                    x:e.clientX,
                    y:e.clientY,
                    startX:e.clientX,
                    startY:e.clientY,
                    since:performance.now(),
                    active:false,
                });
                nodes.world.setPointerCapture(e.pointerId);
            }
        });
        nodes.world.addEventListener('pointermove',e=>{
            const ctx=getContext();
            if(ctx.stage==='world'&&!ctx.panel&&!ctx.dialog&&!ctx.heldPointer&&e.pointerType==='mouse'){
                ctx.renderer?.interactionFeedback?.hover(pickWorldTarget(e.clientX,e.clientY).target);
            }
            if(ctx.heldPointer?.id===e.pointerId){
                ctx.heldPointer.x=e.clientX;
                ctx.heldPointer.y=e.clientY;
                if(Math.hypot(e.clientX-ctx.heldPointer.startX,e.clientY-ctx.heldPointer.startY)>6){
                    if(!ctx.heldPointer.active){
                        languageAdventure.close();
                        ctx.setTalkApproach(null);
                    }
                    ctx.heldPointer.active=true;
                    ctx.clearMovementPath();
                }
            }
        });
        nodes.world.addEventListener('pointerleave',()=>getContext().renderer?.interactionFeedback?.hover(null));
        for(const event of ['pointerup','pointercancel','lostpointercapture']){
            nodes.world.addEventListener(event,releaseWorldPointer);
        }
        window.addEventListener('resize',()=>{
            nodes.world.sceneViewportDirty=true;
            framePacer.wake();
            adaptiveGraphics.suspend(performance.now());
            const ctx=getContext();
            if(ctx.heldPointer)ctx.heldPointer.bounds=nodes.world.getBoundingClientRect();
        });
    }

    return {
        controllerAction,
        releaseWorldPointer,
        bindEvents,
    };
}
