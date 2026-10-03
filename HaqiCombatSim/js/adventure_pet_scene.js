import {petContentKey} from './adventure_pet_files_core.js';
import {updatePetIdle} from './adventure_pet_mood_core.js';
import {findPetMeeting,petMeetingClear,petMeetingTargets,petMeetingPath} from './adventure_pet_meeting_core.js';
// Browser scene coordinator: movement is transient; the controller commits rules synchronously.
import {createCompanion,stepCompanion,selectCompanionId} from './adventure_companion_core.js';
import {petWorldAction,npcPetId,createNpcPet} from './adventure_pet_world_core.js';
import {petInteractionParams,petDisplayScale,recordPetMeeting} from './adventure_pet_interactions_core.js';
import {walkable,distance,followPath,WALK_SPEED} from './adventure_world_core.js';
// Story residents include creatures and props; do not give every map NPC a pet.
// Only roaming characters (or explicitly configured pet owners) participate.
export function petSceneProfiles(state){
    const owners=new Map();
    for(const n of state.world.npcs)if(n.petCompanion===true){const id=`resident:${n.id}`;owners.set(id,{id,name:n.name,school:n.school,position:n});}
    for(const a of state.socialActors||[])owners.set(a.profile.id,{...a.profile,position:a.position,sceneOpacity:a.sceneOpacity??1});
    return [...owners.values()];
}
export function createPetScene({isFriend=()=>false,getState,commit,toast,sound=()=>{},now=()=>Date.now()}){
    let context=null,contextWorld=null,actors=new Map(),visitors=new Map(),effects=[],meeting=null,lastPlay=0,lastPrune=0,food=null,loadRetryAt=0,loadEpoch=0,loading=new Set(),heroWakeAnchor=null;
    let meetings={},temporaryPairs={},ownerActions=new Map();
    const run=action=>{const {save,content}=getState(),result=petWorldAction(save,content,{...action,visitors:[...visitors.values()],temporaryPairs,friendPetIds:petSceneProfiles(getState()).filter(p=>isFriend(p.id)).map(p=>npcPetId(p.id)),now:now()});temporaryPairs=result.temporaryPairs||temporaryPairs;if(result.changed){commit(result.save);if(action.type==='adopt')sound('adopt');else if(action.type==='feed')sound('feed');else if(result.effects?.some(effect=>effect.markAdded))sound('friendship');}for(const effect of result.effects||[])if(effect.play&&!effect.markAdded){const petId=effect.ids.find(id=>save.pets[id]),otherId=effect.ids.find(id=>id!==petId);if(petId&&otherId)meetings=recordPetMeeting(meetings,{petId,otherId,at:now()},content);}return result;};
    const grouped=()=>{const s=getState();return !!s.team?.length||!!s.save?.coopRun||!!s.socialActors?.some(a=>a.inParty);};
    const profiles=petSceneProfiles;
    const people=()=>{const s=getState();return [s.save.position,...s.world.npcs,...(s.socialActors||[]).map(a=>a.position)];};
    function startMeeting(type,hostId,guests){
        if(grouped()&&!['dialogue','gesture'].includes(type))return false;
        const {world,content}=getState(),ids=[hostId,...guests];
        const anchor=findPetMeeting(world,ids.map(id=>actors.get(id).position),people(),content);
        if(!anchor)return false;
        meeting={type,hostId,guests,anchor,until:now()+petInteractionParams(content).effectMs*3};return true;
    }
    function scene(a,b){const {world,save,content}=getState(),p=petInteractionParams(content);const midpoint={x:(a.position.x+b.position.x)/2,y:(a.position.y+b.position.y)/2},gap=p.interactionDistance*.65,babies=Object.values(save.petWorld).filter(p=>p.ownerId===null&&p.birth.zone===world.zone);const candidates=[[0,gap],[gap,0],[-gap,0],[0,-gap],[0,0]].map(([x,y])=>({x:midpoint.x+x,y:midpoint.y+y}));const anchor=candidates.find(p=>walkable(world,p.x,p.y)&&babies.every(b=>distance(p,b.birth.anchor)>gap/2))||a.position;return {zone:world.zone,distance:distance(a.position,b.position),anchor:{...anchor},walkable:walkable(world,anchor.x,anchor.y),inBattle:false};}
    function settle(ids,type){
        const {content}=getState(),pairs=ids.map(pair=>({ids:pair,scene:scene(actors.get(pair[0]),actors.get(pair[1]))}));
        const result=run({type,pairs,hostId:food?.hostId});
        const at=now();for(const effect of result.effects)if(effect.play)effects.push({...effect,at,until:at+petInteractionParams(content).effectMs,kind:type});
        if(result.babies.length)toast('新宝宝出生了！点击“待领养”即可带回战宠背包。');
        return result;
    }
    return {
        get temporaryRelations(){return structuredClone(temporaryPairs);},
        get meetings(){return structuredClone(meetings);},
        get now(){return now();},
        get food(){return food&&{...food.anchor};},
        get effects(){return effects;},
        get pets(){const {save,content}=getState();return [...actors.values()].map(a=>{const pet=save.pets[a.id]||save.petWorld[a.id]||visitors.get(a.id);return {...a,pet,scale:petDisplayScale(pet,content)};});},
        get babies(){return Object.values(getState().save?.petWorld||{}).filter(p=>p.ownerId===null&&p.birth.zone===getState().world?.zone);},
        dialogue(owner,action='greet',settle=true){const {save,content}=getState(),host=selectCompanionId(save,content),other=npcPetId(owner),a=actors.get(host),b=actors.get(other);if(a&&b&&distance(a.position,b.position)<=petInteractionParams(content).encounterDistance){if(settle)ownerActions.set(other,action);if(startMeeting(settle?'dialogue':'gesture',host,[other]))meeting.action=action;}},
        feed(id){
            const {save,content,locked}=getState();if(locked||save.pendingEncounter)throw Error('请先结束当前互动或战斗');
            if(grouped()){meeting=null;food=null;effects=[];run({type:'feed',hostId:id,pairs:[]});toast('宠物吃下了一份营养餐。');return;}
            if(meeting)throw Error('宠物正在聚会，请稍候');
            const host=actors.get(id);
            if(!host){run({type:'feed',hostId:id,pairs:[]});toast('宠物吃下了一份营养餐。');return;}
            // Debit and feed immediately in the same durable save. Social rewards are only
            // granted to guests that actually arrive; interruption never re-debits the meal.
            run({type:'feed',hostId:id,pairs:[]});
            const p=petInteractionParams(content),guests=[...actors.values()].filter(a=>a.id!==id&&distance(host.position,a.position)<=p.feedingDistance).map(a=>a.id);
            if(!startMeeting('shared-meal',id,guests)){toast('宠物吃下了一份营养餐，附近暂时没有聚会空地。');return;}
            food={hostId:id,anchor:{...meeting.anchor},until:meeting.until};
            toast('摆好一份营养餐，附近的伙伴正在走来分享。');
        },
        adopt(id){const result=run({type:'adopt',id});if(result.changed)toast('领养成功，宝宝已进入战宠背包。');},
        pick(point){return this.babies.find(p=>Math.abs(point.x-p.birth.anchor.x)<=26&&point.y>=p.birth.anchor.y-44&&point.y<=p.birth.anchor.y+24)?.id||null;},
        step(dt){
            const state=getState(),{save,world,content}=state;if(!save?.petInstanceVersion||!world)return;
            const token=`${state.scope}:${world.zone}`;
            if(context!==token||contextWorld!==world){context=token;contextWorld=world;actors=new Map();visitors=new Map();meetings={};temporaryPairs={};ownerActions=new Map();effects=[];meeting=null;food=null;lastPlay=now();lastPrune=0;heroWakeAnchor=null;loadEpoch++;loading=new Set();loadRetryAt=0;
                const keep=new Set([selectCompanionId(save,content),...(save.formation||[])]);
                for(const group of ['pets','petWorld'])for(const [id,pet]of Object.entries(save[group]||{})){const ref=save.petFileRefs?.[id];if(ref&&!keep.has(id)&&!(pet.ownerId===null&&pet.birth.zone===world.zone)&&ref.contentKey===petContentKey(pet))delete save[group][id];}
            }
            const inParty=grouped();
            if(inParty&&!['dialogue','gesture'].includes(meeting?.type)&&!effects.some(e=>['dialogue','gesture'].includes(e.kind)&&e.until>now())){meeting=null;food=null;effects=[];}
            if(state.locked||save.pendingEncounter){meeting=null;food=null;heroWakeAnchor=null;return;}
            const p=petInteractionParams(content),residents=profiles(state);
            for(const profile of residents){const id=npcPetId(profile.id);if(!visitors.has(id))visitors.set(id,{...createNpcPet(profile,content),homeZone:world.zone});}
            for(const id of visitors.keys())if(!residents.some(profile=>npcPetId(profile.id)===id))visitors.delete(id);
            const needed=Object.entries(save.petFileRefs||{}).filter(([id,r])=>r.group==='petWorld'&&r.summary.ownerId===null&&r.summary.zone===world.zone&&!String(id).startsWith('npc-pet:')&&!save.petWorld[id]);
            if(needed.length&&now()>=loadRetryAt){
                loadRetryAt=now()+p.playIntervalMs;const epoch=loadEpoch;
                for(const [id]of needed)if(!loading.has(id)){
                    loading.add(id);
                    Promise.resolve().then(()=>state.loadPet(id)).catch(error=>{if(epoch===loadEpoch)toast(error.message);}).finally(()=>{if(epoch===loadEpoch)loading.delete(id);});
                }
            }
            const stale=[...Object.keys(save.petWorld||{}),...Object.keys(save.petFileRefs||{})].some(id=>String(id).startsWith('npc-pet:'));
            if(stale)run({type:'residents',residents});
            const current=getState().save,leader=selectCompanionId(current,content),entries=[...(current.pets[leader]?[{id:leader,position:current.position}]:[]),...residents.map(r=>({id:npcPetId(r.id),position:r.position,sceneOpacity:r.sceneOpacity??1}))];
            const heroMoved=!!heroWakeAnchor&&distance(current.position,heroWakeAnchor)>p.idleMoveDistance;
            if(!heroWakeAnchor||heroMoved)heroWakeAnchor={...current.position};
            const live=new Set(entries.map(e=>e.id));for(const id of actors.keys())if(!live.has(id))actors.delete(id);
            const owners=people();
            effects=effects.filter(e=>e.ids.every(id=>actors.has(id)&&petMeetingClear(actors.get(id).position,owners,content)));
            if(meeting&&!petMeetingTargets(meeting.anchor,content).every(t=>petMeetingClear(t,owners,content))){meeting=null;food=null;}
            for(const row of entries){
                let actor=actors.get(row.id);if(!actor){actor={id:row.id,...createCompanion(world,row.position,`${save.seed}:${row.id}`)};actors.set(row.id,actor);}
                actor.sceneOpacity=row.sceneOpacity??1;
                const ownerId=residents.find(r=>npcPetId(r.id)===row.id)?.id;
                const queued=inParty&&!['dialogue','gesture'].includes(meeting?.type)&&!effects.some(e=>['dialogue','gesture'].includes(e.kind)&&e.until>now()&&e.ids.includes(row.id))&&(row.id===leader||state.team?.includes(ownerId)||state.socialActors?.some(a=>a.profile.id===ownerId&&a.inParty)||!!save.coopRun?.members?.some(m=>m.profile.id===ownerId));
                if(queued){updatePetIdle(actor,row.position,now(),content,{wake:true});stepCompanion(actor,world,row.position,dt,{inParty:true});continue;}
                const playing=effects.find(e=>e.until>now()&&e.ids.includes(row.id)&&e.ids.every(id=>actors.has(id)));
                const invited=meeting&&(meeting.hostId===row.id||meeting.guests.includes(row.id));
                const passingHero=row.id!==leader&&heroMoved&&distance(current.position,row.position)<=p.encounterDistance;
                updatePetIdle(actor,row.position,now(),content,{happy:!!playing,wake:passingHero||(invited&&meeting.type!=='proximity')});
                if(actor.mood==='sleeping'){actor.path=[];actor.moving=false;continue;}
                if(playing){const other=actors.get(playing.ids.find(id=>id!==row.id));if(other&&distance(actor.position,row.position)<=p.encounterDistance+p.meetingOffset){actor.facing=other.position.x>=actor.position.x?1:-1;actor.path=[];actor.moving=false;continue;}}
                if(meeting&&(meeting.hostId===row.id||meeting.guests.includes(row.id))){
                    const side=meeting.hostId===row.id?-1:1,target={x:meeting.anchor.x+side*p.meetingSpacing/2,y:meeting.anchor.y};
                    const goal=walkable(world,target.x,target.y)?target:meeting.anchor;
                    actor.repath-=dt;
                    if(actor.repath<=0||!actor.path.length){actor.path=petMeetingPath(world,actor.position,goal);actor.repath=.5;}
                    const previous=actor.position,next=followPath(world,previous,actor.path,WALK_SPEED*Math.min(.055,dt));actor.position=next.position;actor.path=next.path;actor.moving=distance(previous,actor.position)>.01;actor.phase+=distance(previous,actor.position)*.1;actor.facing=side<0?1:-1;
                }else stepCompanion(actor,world,row.position,dt);
            }
            const at=now();if(food&&at>=food.until)food=null;effects=effects.filter(e=>e.until>at&&e.ids.every(id=>actors.has(id))&&distance(actors.get(e.ids[0]).position,actors.get(e.ids[1]).position)<=p.interactionDistance);
            if(meeting){
                const host=actors.get(meeting.hostId);
                if(!host){meeting=null;food=null;return;}
                const targets=petMeetingTargets(meeting.anchor,content);
                const arrived=meeting.guests.filter(id=>actors.has(id)&&distance(host.position,targets[0])<=p.meetingTargetTolerance&&distance(actors.get(id).position,targets[1])<=p.meetingTargetTolerance&&petMeetingClear(host.position,owners,content)&&petMeetingClear(actors.get(id).position,owners,content)&&distance(host.position,actors.get(id).position)<=p.meetingArrivalDistance);
                if(arrived.length){
                    // A paid meal uses the manual-feed event without another food debit.
                    const pairs=arrived.map(id=>({ids:[host.id,id],scene:scene(host,actors.get(id))}));
                    const type=meeting.type==='shared-meal'?'meal-arrival':meeting.type;
                    const result=run({type,pairs,hostId:meeting.hostId,confirmedOwners:[...ownerActions.keys()]});
                    effects.push(...result.effects.filter(e=>e.play).map(e=>({...e,at,until:at+p.effectMs,kind:type,action:meeting.action||ownerActions.get(e.ids.find(id=>id!==leader))})));
                    if(result.babies.length)toast('新宝宝出生了！点击“待领养”即可领养。');
                    meeting.guests=meeting.guests.filter(id=>!arrived.includes(id));
                }
                if(!meeting.guests.length||at>=meeting.until){meeting=null;if(food)food.until=at+p.effectMs;}
            }
            if(!inParty&&!meeting&&!effects.some(e=>e.until>at)&&at-lastPlay>=p.playIntervalMs){
                lastPlay=at;const host=actors.get(leader),guest=host&&host.mood!=='sleeping'?[...actors.values()].filter(a=>a.id!==leader&&a.mood!=='sleeping'&&distance(host.position,a.position)<=p.encounterDistance).sort((a,b)=>distance(host.position,a.position)-distance(host.position,b.position)||a.id.localeCompare(b.id))[0]:null;
                if(guest)startMeeting('proximity',leader,[guest.id]);
            }
            if(at-lastPrune>=p.memoryProtectionMs){lastPrune=at;run({type:'prune',ids:[...actors.keys()],now:at});}
        },
    };
}
