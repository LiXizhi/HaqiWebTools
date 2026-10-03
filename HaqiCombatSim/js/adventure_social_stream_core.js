import {createRng,hashSeed} from './rng_core.js';
import {SOCIAL_DEFAULTS} from './adventure_social_core.js';
import {socialInView} from './adventure_social_motion_core.js';

// Dormant residents retain only spawn descriptors, never paths, RNGs or pet scenes.
export function socialSpawnDescriptors(actors){
    return actors.map(({profile,position,facing,hotspot})=>({profile,position:{...position},facing,hotspot}));
}

export function streamSocialActors(actors,spawns,dt,{leader,view,team=[],params=SOCIAL_DEFAULTS,seed=1}={}){
    if(!leader||!view?.w||!view?.h)return actors;
    dt=Math.max(0,Math.min(.1,dt));
    const protectedIds=new Set(team),byId=new Map(spawns.map(s=>[s.profile.id,s]));
    const padded={x:view.x-params.viewPadding,y:view.y-params.viewPadding,w:view.w+2*params.viewPadding,h:view.h+2*params.viewPadding};
    const distance=a=>Math.hypot(a.position.x-leader.x,a.position.y-leader.y);
    const eligible=a=>distance(a)<=params.sceneLoadDistance&&socialInView(a.position,padded);
    const live=[];
    for(const a of actors){
        const protectedActor=protectedIds.has(a.profile.id);
        if(!protectedActor&&distance(a)>params.sceneUnloadDistance)continue;
        const present=protectedActor||(byId.has(a.profile.id)&&eligible(a));
        a.outOfView=present?0:(a.outOfView||0)+dt;
        a.retiring=!present&&(!byId.has(a.profile.id)||a.outOfView>=params.sceneUnloadDelay);
        a.sceneOpacity=Math.max(0,Math.min(1,(a.sceneOpacity??1)+(a.retiring?-dt/params.sceneFadeOut:dt/params.sceneFadeIn)));
        if(!a.retiring||a.sceneOpacity>0)live.push(a);
    }
    const activeIds=new Set(live.map(a=>a.profile.id));
    const candidates=spawns.filter(s=>!activeIds.has(s.profile.id)&&(protectedIds.has(s.profile.id)||eligible(s)))
        .sort((a,b)=>Number(protectedIds.has(b.profile.id))-Number(protectedIds.has(a.profile.id))||distance(a)-distance(b)||a.profile.id.localeCompare(b.profile.id));
    for(const spawn of candidates){
        if(live.length>=params.sceneMaxActors){
            if(!protectedIds.has(spawn.profile.id))break;
            const i=live.findLastIndex(a=>!protectedIds.has(a.profile.id));if(i<0)break;live.splice(i,1);
        }
        const rng=createRng(hashSeed(`${seed}:${spawn.profile.id}`));
        live.push({...spawn,position:{...(protectedIds.has(spawn.profile.id)?leader:spawn.position)},rng,path:[],moving:false,
            wait:rng.int(params.idleMin,params.idleMax),travel:rng.int(params.travelMin,params.travelMax),sceneOpacity:0,outOfView:0,retiring:false});
    }
    return live;
}
