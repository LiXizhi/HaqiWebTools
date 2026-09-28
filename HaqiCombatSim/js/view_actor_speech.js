export function speechPlacement(anchor,size,bounds,obstacles=[]){
    const gap=10,clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
    if(size.width>bounds.width-16||size.height>bounds.height-16)return null;
    const preferred={x:anchor.x-size.width/2,y:anchor.y-size.height-gap};
    const candidates=[preferred];
    for(const rect of obstacles)candidates.push(
        {x:preferred.x,y:rect.y-size.height-gap},
        {x:rect.x-size.width-gap,y:preferred.y},
        {x:rect.x+rect.width+gap,y:preferred.y},
        {x:preferred.x,y:rect.y+rect.height+gap});
    for(const candidate of candidates){
        const rect={x:clamp(candidate.x,8,bounds.width-size.width-8),y:clamp(candidate.y,8,bounds.height-size.height-8),...size};
        if(obstacles.every(other=>rect.x+rect.width+gap<=other.x||rect.x>=other.x+other.width+gap||rect.y+rect.height+gap<=other.y||rect.y>=other.y+other.height+gap))return rect;
    }
    return null;
}

export function placeActorSpeech(bubble,root,anchor,obstacles=[]){
    const rect=speechPlacement(anchor,{width:bubble.offsetWidth,height:bubble.offsetHeight},{width:root.clientWidth,height:root.clientHeight||10000},obstacles);
    bubble.hidden=!rect;
    if(!rect)return null;
    bubble.style.left=`${rect.x}px`;bubble.style.top=`${rect.y}px`;
    bubble.style.setProperty('--pet-hint-tail',`${Math.max(14,Math.min(rect.width-14,anchor.x-rect.x))}px`);
    return rect;
}

export function createActorSpeech(){
    const actors=new Map();
    return {
        say(actorId,text,{duration=Math.max(4000,Array.from(String(text)).length*180)}={}){
            if(!actorId||typeof text!=='string'||!text.trim()||!Number.isFinite(duration)||duration<=0)return false;
            if(!actors.has(actorId))actors.set(actorId,{queue:[],current:null,until:0});
            actors.get(actorId).queue.push({actorId,text,duration});return true;
        },
        clear(actorId){if(actorId===undefined)actors.clear();else actors.delete(actorId);},
        messages(now){
            const messages=[];
            for(const [actorId,state] of actors){
                if(!state.current||now>=state.until){state.current=state.queue.shift()||null;state.until=now+(state.current?.duration||0);}
                if(state.current)messages.push(state.current);else actors.delete(actorId);
            }
            return messages;
        },
        render(root,anchors,now,obstacles=[]){
            const occupied=[...obstacles],messages=this.messages(now);
            for(const bubble of root.querySelectorAll('.actor-speech'))bubble.hidden=true;
            for(const message of messages){
                const anchor=anchors[message.actorId];if(!anchor)continue;
                let bubble=[...root.querySelectorAll('.actor-speech')].find(node=>node.dataset.caster===message.actorId);
                if(!bubble){bubble=document.createElement('aside');bubble.className='battle-pet-hint actor-speech';bubble.dataset.caster=message.actorId;bubble.setAttribute('aria-live','polite');bubble.style.pointerEvents='none';root.append(bubble);}
                bubble.textContent=message.text;bubble.hidden=false;
                bubble.style.maxWidth=`${Math.max(1,Math.min(root.clientWidth-16,root.clientWidth<=650?230:280))}px`;
                const rect=placeActorSpeech(bubble,root,anchor,occupied);if(rect)occupied.push(rect);
            }
            for(const bubble of root.querySelectorAll('.actor-speech'))if(!messages.some(message=>message.actorId===bubble.dataset.caster))bubble.remove();
        },
    };
}