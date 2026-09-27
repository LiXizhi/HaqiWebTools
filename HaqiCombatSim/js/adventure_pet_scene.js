import {petContentKey} from './adventure_pet_files_core.js';
// Browser scene coordinator: movement is transient; the controller commits rules synchronously.
import {createCompanion,stepCompanion,selectCompanionId} from './adventure_companion_core.js';
import {petWorldAction,npcPetId} from './adventure_pet_world_core.js';
import {petInteractionParams,petDisplayScale} from './adventure_pet_interactions_core.js';
import {walkable,distance} from './adventure_world_core.js';
// Story residents include creatures and props; do not give every map NPC a pet.
// Only roaming characters (or explicitly configured pet owners) participate.
export function petSceneProfiles(state){
    const owners=new Map();
    for(const n of state.world.npcs)if(n.petCompanion===true){const id=`resident:${n.id}`;owners.set(id,{id,name:n.name,school:n.school,position:n});}
    for(const a of state.socialActors||[])owners.set(a.profile.id,{...a.profile,position:a.position});
    return [...owners.values()];
}
export function createPetScene({getState,commit,toast,now=()=>Date.now()}){
    let context=null,contextWorld=null,actors=new Map(),effects=[],meeting=null,lastPlay=0,lastPrune=0,food=null,loadRetryAt=0,loadEpoch=0,loading=new Set();
    const run=action=>{const {save,content}=getState(),result=petWorldAction(save,content,{...action,now:now()});if(result.changed)commit(result.save);return result;};
    const profiles=petSceneProfiles;
    function scene(a,b){const {world,save,content}=getState(),p=petInteractionParams(content);const midpoint={x:(a.position.x+b.position.x)/2,y:(a.position.y+b.position.y)/2},gap=p.interactionDistance*.65,babies=Object.values(save.petWorld).filter(p=>p.ownerId===null&&p.birth.zone===world.zone);const candidates=[[0,gap],[gap,0],[-gap,0],[0,-gap],[0,0]].map(([x,y])=>({x:midpoint.x+x,y:midpoint.y+y}));const anchor=candidates.find(p=>walkable(world,p.x,p.y)&&babies.every(b=>distance(p,b.birth.anchor)>gap/2))||a.position;return {zone:world.zone,distance:distance(a.position,b.position),anchor:{...anchor},walkable:walkable(world,anchor.x,anchor.y),inBattle:false};}
    function settle(ids,type){
        const {content}=getState(),pairs=ids.map(pair=>({ids:pair,scene:scene(actors.get(pair[0]),actors.get(pair[1]))}));
        const result=run({type,pairs,hostId:food?.hostId});
        const at=now();for(const effect of result.effects)if(effect.play)effects.push({...effect,at,until:at+petInteractionParams(content).effectMs,kind:type});
        if(result.babies.length)toast('新宝宝出生了！点击“待领养”即可带回战宠背包。');
        return result;
    }
    return {
        get now(){return now();},
        get food(){return food&&{...food.anchor};},
        get effects(){return effects;},
        get pets(){const {save,content}=getState();return [...actors.values()].map(a=>({...a,pet:save.pets[a.id]||save.petWorld[a.id],scale:petDisplayScale(save.pets[a.id]||save.petWorld[a.id],content)}));},
        get babies(){return Object.values(getState().save?.petWorld||{}).filter(p=>p.ownerId===null&&p.birth.zone===getState().world?.zone);},
        dialogue(owner){const {save,content}=getState(),host=selectCompanionId(save,content),other=npcPetId(owner),a=actors.get(host),b=actors.get(other);if(a&&b&&distance(a.position,b.position)<=petInteractionParams(content).feedingDistance){meeting={type:'dialogue',hostId:host,guests:[other],anchor:{...a.position},until:now()+petInteractionParams(content).effectMs*3};}},
        feed(id){
            const {save,content,locked}=getState();if(locked||save.pendingEncounter)throw Error('请先结束当前互动或战斗');
            if(meeting)throw Error('宠物正在聚会，请稍候');
            const host=actors.get(id);
            if(!host){run({type:'feed',hostId:id,pairs:[]});toast('宠物吃下了一份营养餐。');return;}
            // Debit and feed immediately in the same durable save. Social rewards are only
            // granted to guests that actually arrive; interruption never re-debits the meal.
            run({type:'feed',hostId:id,pairs:[]});
            const p=petInteractionParams(content),guests=[...actors.values()].filter(a=>a.id!==id&&distance(host.position,a.position)<=p.feedingDistance).map(a=>a.id);
            food={hostId:id,anchor:{...host.position},until:now()+p.effectMs*3};meeting={type:'shared-meal',hostId:id,guests,anchor:{...host.position},until:now()+p.effectMs*3};
            toast('摆好一份营养餐，附近的伙伴正在走来分享。');
        },
        adopt(id){const result=run({type:'adopt',id});if(result.changed)toast('领养成功，宝宝已进入战宠背包。');},
        pick(point){return this.babies.find(p=>Math.abs(point.x-p.birth.anchor.x)<=26&&point.y>=p.birth.anchor.y-44&&point.y<=p.birth.anchor.y+24)?.id||null;},
        step(dt){
            const state=getState(),{save,world,content}=state;if(!save?.petInstanceVersion||!world)return;
            const token=`${state.scope}:${world.zone}`;
            if(context!==token||contextWorld!==world){context=token;contextWorld=world;actors=new Map();effects=[];meeting=null;food=null;lastPlay=now();lastPrune=0;loadEpoch++;loading=new Set();loadRetryAt=0;
                const keep=new Set([selectCompanionId(save,content),...(save.formation||[]),...profiles(state).map(r=>npcPetId(r.id))]);
                for(const group of ['pets','petWorld'])for(const [id,pet]of Object.entries(save[group]||{})){const ref=save.petFileRefs?.[id];if(ref&&!keep.has(id)&&!(pet.ownerId===null&&pet.birth.zone===world.zone)&&ref.contentKey===petContentKey(pet))delete save[group][id];}
            }
            if(state.locked||save.pendingEncounter){meeting=null;food=null;return;}
            const p=petInteractionParams(content),residents=profiles(state);
            const needed=Object.entries(save.petFileRefs||{}).filter(([id,r])=>r.group==='petWorld'&&(r.summary.ownerId===null&&r.summary.zone===world.zone||residents.some(n=>npcPetId(n.id)===id))&&!save.petWorld[id]);
            if(needed.length&&now()>=loadRetryAt){
                loadRetryAt=now()+p.playIntervalMs;const epoch=loadEpoch;
                for(const [id]of needed)if(!loading.has(id)){
                    loading.add(id);
                    Promise.resolve().then(()=>state.loadPet(id)).catch(error=>{if(epoch===loadEpoch)toast(error.message);}).finally(()=>{if(epoch===loadEpoch)loading.delete(id);});
                }
            }
            const missing=residents.filter(r=>!save.petWorld[npcPetId(r.id)]&&!save.petFileRefs?.[npcPetId(r.id)]);
            if(missing.length)run({type:'residents',residents:missing});
            const current=getState().save,leader=selectCompanionId(current,content),entries=[...(current.pets[leader]?[{id:leader,position:current.position}]:[]),...residents.filter(r=>current.petWorld[npcPetId(r.id)]).map(r=>({id:npcPetId(r.id),position:r.position}))];
            const live=new Set(entries.map(e=>e.id));for(const id of actors.keys())if(!live.has(id))actors.delete(id);
            for(const row of entries){
                let actor=actors.get(row.id);if(!actor){actor={id:row.id,...createCompanion(world,row.position,`${save.seed}:${row.id}`)};actors.set(row.id,actor);}
                const target=meeting&&(meeting.hostId===row.id||meeting.guests.includes(row.id))?meeting.anchor:row.position;
                stepCompanion(actor,world,target,dt);
            }
            const at=now();if(food&&at>=food.until)food=null;effects=effects.filter(e=>e.until>at&&e.ids.every(id=>actors.has(id))&&distance(actors.get(e.ids[0]).position,actors.get(e.ids[1]).position)<=p.interactionDistance);
            if(meeting){
                const host=actors.get(meeting.hostId);
                if(!host){meeting=null;food=null;return;}
                const arrived=meeting.guests.filter(id=>actors.has(id)&&distance(host.position,actors.get(id).position)<=p.interactionDistance);
                if(arrived.length){
                    // A paid meal uses the manual-feed event without another food debit.
                    const pairs=arrived.map(id=>({ids:[host.id,id],scene:scene(host,actors.get(id))}));
                    const result=run({type:meeting.type==='shared-meal'?'meal-arrival':'dialogue',pairs,hostId:meeting.hostId});
                    effects.push(...result.effects.filter(e=>e.play).map(e=>({...e,at,until:at+p.effectMs,kind:'dialogue'})));
                    if(result.babies.length)toast('新宝宝出生了！点击“待领养”即可领养。');
                    meeting.guests=meeting.guests.filter(id=>!arrived.includes(id));
                }
                if(!meeting.guests.length||at>=meeting.until){meeting=null;if(food)food.until=at+p.effectMs;}
            }
            if(at-lastPlay>=p.playIntervalMs){lastPlay=at;const host=actors.get(leader),pairs=host?[...actors.values()].filter(a=>a.id!==leader&&distance(host.position,a.position)<=p.interactionDistance).map(a=>[leader,a.id]):[];if(pairs.length)settle(pairs,'proximity');}
            if(at-lastPrune>=p.memoryProtectionMs){lastPrune=at;run({type:'prune',ids:[...actors.keys()],now:at});}
        },
    };
}
