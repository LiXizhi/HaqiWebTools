import {selectableCards,canCast,PET_CARD_SEQ_BASE} from './combat_unit_core.js';
import {validTargets} from './combat_arena_core.js';
import {createActorSpeech,placeActorSpeech} from './view_actor_speech.js';
// DOM speech balloon anchored to the same screen positions as battle actors.
export function nearestBattlePet(battle,save,content,positions,scale=1){
    const hero=battle.sides.near[0],origin=positions[hero.id];
    if(!origin||hero.hp<=0)return null;
    const pets=battle.sides.near.filter(u=>u.hp>0&&u.speciesId&&positions[u.id]).map(u=>({
        id:u.id,name:content.pets?.[u.speciesId]?.name||u.name,x:positions[u.id].x,y:positions[u.id].y,head:96*scale,
    }));
    const supportId=save.formation?.[save.heroSlot],support=save.pets?.[supportId];
    if(support&&content.pets?.[support.speciesId||supportId]?.art)pets.push({id:support.id,name:content.pets[support.speciesId||supportId].name,x:origin.x+36*scale,y:origin.y,head:60*scale});
    return pets.sort((a,b)=>Math.hypot(a.x-origin.x,a.y-origin.y)-Math.hypot(b.x-origin.x,b.y-origin.y)||String(a.id).localeCompare(String(b.id)))[0]||null;
}
export function createBattlePetHint(model,{el,onDismiss}){
    const candidate=model.aiHint;
    if(model.aiHintsMuted||model.animating||model.battle.finished||model.selected||!candidate)return null;
    const action=candidate.action,hero=model.battle.sides.near[0];
    // Revalidate cached advice against the live hand, including the separate pet pile.
    if(!action.pass){
        const card=model.battle.resolved?.cards[action.key];
        if(hero.hp<=0||hero.stunned||(model.discarded||[]).includes(action.seq)
            ||!selectableCards(hero).some(h=>h.seq===action.seq&&h.key===action.key)
            ||!canCast(hero,card,model.battle.resolved)
            ||!validTargets(model.battle,hero,card).some(target=>target.id===action.targetId))return null;
    }
    const petCard=!action.pass&&action.seq>=PET_CARD_SEQ_BASE;
    const cardName=model.assets.dataset.cards[action.key]?.name;
    const target=model.battle.unitsById[action.targetId]?.name;
    const dropped=(action.discardSeqs||[]).map(seq=>model.assets.dataset.cards[model.battle.sides.near[0].deckSeq[seq]]?.name).filter(Boolean);
    const message=action.pass
        ?(dropped.length?`可以弃掉「${dropped[0]}」，找找需要的牌。`:'先攒点魔力，等机会再出手。')
        :cardName?`${petCard?(model.petCardsOpen?'可以试试宠物卡':'打开“使用宠物卡”，试试'):'可以试试'}「${cardName}」${target?`，目标选${target}`:''}。`:null;
    if(!message)return null;
    const bubble=el('aside','battle-pet-hint',el('p','',message));
    bubble.setAttribute('aria-live','polite');bubble.hidden=true;
    bubble.setAttribute('role','button');bubble.setAttribute('tabindex','0');
    bubble.setAttribute('aria-label',`${message} 点击收起提示`);
    const dismiss=event=>{event.stopPropagation();bubble.hintDismissed=true;bubble.hidden=true;onDismiss?.();};
    bubble.onclick=dismiss;
    bubble.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();dismiss(event);}};
    return bubble;
}
export function updateBattlePetHint(root,battle,save,content,canvas){
    const bubble=root.battlePetHint;if(!bubble)return;
    const scale=Math.min(1,canvas.clientHeight/270),pet=nearestBattlePet(battle,save,content,canvas.battlePositions||{},scale);
    // Hints are passive speech from a visible living pet.
    if(!pet||bubble.hintDismissed){bubble.hidden=true;return;}
    bubble.hidden=false;
    bubble.dataset.petId=pet?.id||'';
    const x=canvas.offsetLeft+pet.x,y=canvas.offsetTop+pet.y-pet.head;
    // Grow rightwards from the pet instead of centering over the hero. On narrow
    // screens wrap the text within the remaining space rather than shifting left.
    const left=Math.max(8,Math.min(root.clientWidth-96,x));
    bubble.style.maxWidth=`${Math.max(80,Math.min(root.clientWidth<=650?230:280,root.clientWidth-left-8))}px`;
    const width=bubble.offsetWidth,height=bubble.offsetHeight;
    bubble.style.left=`${left}px`;bubble.style.top=`${Math.max(8,y-height-8)}px`;
    bubble.style.setProperty('--pet-hint-tail',`${Math.max(14,Math.min(width-14,x-left))}px`);
    const obstacles=(canvas.battleStatusRects||[]).map(rect=>({...rect,x:rect.x+canvas.offsetLeft,y:rect.y+canvas.offsetTop}));
    for(const node of root.querySelectorAll?.('.actor-speech')||[])if(!node.hidden)obstacles.push({x:parseFloat(node.style.left),y:parseFloat(node.style.top),width:node.offsetWidth,height:node.offsetHeight});
    if(obstacles.length){
        const rect=placeActorSpeech(bubble,root,{x:left+width/2,y},obstacles);
        if(rect)bubble.style.setProperty('--pet-hint-tail',`${Math.max(14,Math.min(rect.width-14,x-rect.x))}px`);
    }
}

const battleSpeechStates=new WeakMap();
export function battleSpeech(battle,now,event=null){
    let state=battleSpeechStates.get(battle);
    if(!state){
        const queue=[];
        if(!battle.finished&&!(battle.completedDecisions>0))for(const unit of battle.sides.far){
            const lines=(unit.template?.sequences||[]).flat().filter(row=>['1','1-'].includes(String(row.round))&&row.speak);
            for(const text of new Set(lines.map(row=>row.speak)))queue.push({caster:unit.id,text});
        }
        state={speech:createActorSpeech(),seen:new WeakSet(),opening:new Set(queue.map(row=>`${row.caster}:${row.text}`))};
        for(const row of queue)state.speech.say(row.caster,row.text);
        battleSpeechStates.set(battle,state);
    }
    if(event?.type==='speak'&&!state.seen.has(event)){
        state.seen.add(event);
        const key=`${event.caster}:${event.text}`;
        if(state.opening.has(key))state.opening.delete(key);
        else state.speech.say(event.caster,event.text);
    }
    const current=now===null?null:state.speech.messages(now)[0];
    return current?{caster:current.actorId,text:current.text}:null;
}
export function battleSpeechController(battle){
    if(!battleSpeechStates.has(battle))battleSpeech(battle,null);
    return battleSpeechStates.get(battle).speech;
}
export function updateBattleSpeech(root,battle,canvas,now,event=null){
    battleSpeech(battle,now,event);
    const anchors=Object.fromEntries(Object.entries(canvas.battlePositions||{}).map(([id,at])=>[id,{x:canvas.offsetLeft+at.x,y:canvas.offsetTop+at.y-104*Math.min(1,canvas.clientHeight/270)}]));
    const obstacles=(canvas.battleStatusRects||[]).map(rect=>({...rect,x:rect.x+canvas.offsetLeft,y:rect.y+canvas.offsetTop}));
    battleSpeechController(battle).render(root,anchors,now,obstacles);
}
