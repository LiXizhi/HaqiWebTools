import * as V from './view_adventure.js';
import {renderRoles} from './view_adventure_roles.js';
import {createCompanionChatView} from './view_companion_chat.js';
import {createLocalPeerControl} from './view_local_peer_controls.js';
import {createPromoDuoBattle,samplePromoDuoMotion} from './promo_duo_core.js';
import {presentationEventDurationMs,samplePresentationClock} from './battle_presentation_core.js';

// Only the film's input script and saves are staged. All visible panels are production views.
export async function createPromoDuo({assets,save,second,world,origin,path,nodes,renderer,model,callbacks,locale,check,aimPointer}){
    const saves=[save,second],catalog={activeId:'promo-first',roles:saves.map((save,i)=>({id:i?'promo-second':'promo-first',save}))};
    let selection=null,controller='human',mode='roles',activeOwner=0,playback=[],playbackAt=0,painted=-1;
    const selected=[null,null],choices=[null,null],round=createPromoDuoBattle(assets.dataset,assets.content,saves);
    const root=nodes.battle,entry=nodes.entry,hud=document.getElementById('hud');
    const chat=createCompanionChatView({...callbacks,toggle:()=>{controller=controller==='ai'?'human':'ai';paintHud();}});
    chat.root.hidden=true;
    const peer=createLocalPeerControl(()=>{});
    const paintHud=()=>{
        V.renderHud(hud,{...model(),localSecond:second},callbacks);
        chat.root.hidden=false;chat.render({active:true,ai:controller==='ai',name:second.name,memory:{messages:[],events:[]}});
        peer.render(hud.querySelector('.local-secondary-toolbar'),true);
    };
    function enter(){mode='world';entry.hidden=true;entry.replaceChildren();document.body.classList.add('local-duo');paintHud();check(hud.querySelectorAll('.hero-status').length===2,'正式双角色HUD与各自工具栏');}
    function roles(){
        entry.hidden=false;
        renderRoles(entry,assets,{locale,catalog,duoSelection:selection,duoController:controller},{...callbacks,secondLocale:locale==='en'?'zh-CN':'en',toggleDuo:()=>{selection=selection?null:[null,null];roles();},setDuoController:value=>{controller=value;roles();},confirmDuo:id=>{selection[selection.indexOf(null)]=id;if(selection.every(Boolean))enter();else roles();},retryDuo:enter});
    }
    function paintBattle(battle=round.battle,animating=false){
        root.className='battle-layer visible local-battle';
        let container=root.querySelector('#local-battle-panels');
        if(!container){root.replaceChildren(V.el('div','local-battle-shared'));container=V.el('div','local-battle-panels');container.id='local-battle-panels';container.append(V.el('div','local-battle-half'),V.el('div','local-battle-half'));root.append(container);}
        const shared=root.querySelector('.local-battle-shared');
        const views=round.ids.map((id,owner)=>{
            const waiting=!!round.ready.choices[id]&&!animating;
            const cb={...callbacks,select:card=>{selected[owner]=card;activeOwner=owner;paintBattle();},reselect:()=>{selected[owner]=null;paintBattle();},target:targetId=>{
                check(!!selected[owner],'玩家已选择卡牌');
                const snapshots=[];round.battle.onEvent=event=>{if(['cast','damage','heal','fizzle','combat_end'].includes(event.type))snapshots.push({arena:JSON.parse(JSON.stringify(round.battle)),event:{...event},duration:presentationEventDurationMs(event,{effects:assets.effects,card:round.battle.resolved.cards[event.card],hp:round.battle.unitsById[event.target]?.hp})||250});};
                let resolved;try{resolved=round.submit(owner,{...selected[owner],targetId,discardSeqs:[]});}finally{delete round.battle.onEvent;}
                if(resolved){round.ready.reset(null);selected.fill(null);playback=[...snapshots,{arena:JSON.parse(JSON.stringify(round.battle)),event:null,duration:1000}];painted=-1;check(true,'双方准备后通过正式双人决策结算');}
                else check(round.battle.completedDecisions===0,'一人准备时战斗等待另一位玩家');
                paintBattle();
            },cancelReady:()=>{round.ready.cancel(id);paintBattle();}};
            return [{...model(),save:saves[owner],battle,controlledUnitId:id,localDuo:true,localBattlePane:true,localBattleOwner:owner,localBattleWaiting:waiting,localBattleFooter:shared,selected:selected[owner],discarded:[],runeHand:[],animating,aiHintsMuted:true},cb];
        });
        V.renderBattle(shared,{...views[activeOwner][0],localBattlePane:false,localBattleShared:true,selected:round.ready.choices[round.ids[activeOwner]]?null:selected[activeOwner]},views[activeOwner][1]);shared.classList.add('local-battle-shared');shared.querySelector('.battle-pet-hint-toggle')?.remove();
        views.forEach((view,owner)=>{const pane=container.children[owner];V.renderBattle(pane,...view);pane.classList.add('local-battle-half');pane.classList.toggle('local-ready',!!round.ready.choices[round.ids[owner]]&&!battle.finished&&!animating);pane.querySelector('.battle-chat')?.remove();});
    }
    function click(node,time){check(!!node,'正式双人UI操作控件存在');aimPointer(node,time-.18);node.click();}
    roles();
    await assets.hero.ensure(assets.hero.appearance(second));
    await assets.warmBattle(round.battle);
    await Promise.all(Object.values(round.battle.unitsById).map(unit=>{
        const species=unit.speciesId||unit.template?.speciesId;
        return species?assets.ensureImage('pet:'+species):unit.arenaProfile?assets.hero.ensure(assets.hero.appearance(unit.arenaProfile)):Promise.resolve();
    }));
    return {
        action(cue){
            if(cue.step==='mode')click([...entry.querySelectorAll('button')].find(b=>b.textContent===(locale==='en'?'Two-player mode':'双人模式'))||entry.querySelector('.role-heading button'),cue.time);
            else if(cue.step==='controller')click(entry.querySelectorAll('.role-head .gui-tabs button')[cue.ai?1:0],cue.time);
            else if(cue.step==='confirm')click(entry.querySelectorAll('.role-card')[cue.owner].querySelector('button:not(.role-delete)'),cue.time);
            else if(cue.step==='battle'){mode='battle';chat.root.hidden=true;paintBattle();check(root.querySelectorAll('.battle-hand').length===2,'正式双人战斗同时显示两副手牌');}
            else if(cue.step==='select'){
                choices[cue.owner]=round.choice(cue.owner);
                click(root.querySelectorAll('.local-battle-half')[cue.owner].querySelector(`[data-seq="${choices[cue.owner].seq}"] .card-select`),cue.time);
                if(selected.every(Boolean))check(true,'两名玩家同时保留各自选牌');
            }else if(cue.step==='target'){
                activeOwner=cue.owner;paintBattle();playbackAt=cue.time;
                const canvas=root.querySelector('canvas.battle-canvas');renderer.renderBattle(canvas,round.battle,save,cue.time*1000,{});
                const target=canvas.battleTargetRects?.find(r=>r.id===choices[cue.owner].targetId);check(!!target,'双人战场目标可点击');
                const r=canvas.getBoundingClientRect(),x=r.left+(target.x+target.width/2)*r.width/canvas.clientWidth,y=r.top+(target.y+target.height/2)*r.height/canvas.clientHeight;
                aimPointer({closest:()=>null,getBoundingClientRect:()=>({left:x,top:y,width:0,height:0})},cue.time-.18);
                canvas.dispatchEvent(new MouseEvent('click',{clientX:x,clientY:y,bubbles:true}));
            }
        },
        tick(elapsed){
            if(mode==='roles'){renderer.render(world,save,elapsed*1000,{title:true,socialActors:[]});return;}
            if(mode==='world'){
                const [leader,partner]=samplePromoDuoMotion(world,origin,path,elapsed-12);
                Object.assign(save,{position:leader.position,facing:leader.facing});Object.assign(second,{position:partner.position,facing:partner.facing});
                renderer.render(world,save,elapsed*1000,{localSecond:second,moving:leader.moving,localSecondMoving:partner.moving,socialActors:[]});return;
            }
            let frame=null;
            if(playback.length){const sample=samplePresentationClock(playback,elapsed-playbackAt);frame=playback[sample.index];if(painted!==sample.index){paintBattle(frame.arena,sample.index<playback.length-1);painted=sample.index;}frame={...frame,progress:sample.progress};}
            const canvas=root.querySelector('canvas.battle-canvas');if(canvas)renderer.renderBattle(canvas,frame?.arena||round.battle,save,elapsed*1000,{event:frame?.event,progress:frame?.progress});
        },
        dispose(){chat.root.remove();peer.node.remove();document.body.classList.remove('local-duo');for(const node of root.querySelectorAll('.local-battle-half,.local-battle-shared')){node.disposeHandGesture?.();node.disposeStatusTooltips?.();node.battleLayoutObserver?.disconnect();}},
    };
}
