import {streamSocialActors} from './adventure_social_stream_core.js';
import {SOCIAL_DEFAULTS} from './adventure_social_core.js';
import {createEarthWildEncounter,earthWildSpecies} from './adventure_earth_wild_core.js';

// Only descriptors live outside the camera. Reuse the AI character fade lifecycle.
const spawnIndices=new WeakMap();
export function streamEarthWild(world,content,leader,view,dt=0){
    const rules=world.earthRules,spawns=world.wildSpawns||[];let byId=spawnIndices.get(spawns);
    if(!byId){byId=new Map(spawns.map(s=>[s.profile.id,s]));spawnIndices.set(spawns,byId);}
    const params={...SOCIAL_DEFAULTS,...content.balanceParams?.islandSocial,sceneMaxActors:rules.wildMaxActors};
    const actors=streamSocialActors(world.wildActors||[],spawns,dt,{leader,view,params});
    const species=world.wildSpecies||earthWildSpecies(content);
    const live=[];
    for(const actor of actors){
        const descriptor=byId.get(actor.profile.id);
        if(descriptor){
            const signature=`${descriptor.level}:${descriptor.targetPower}`;
            if(!actor.encounter||actor.signature!==signature){
                const encounter=createEarthWildEncounter(content,{...descriptor,species});
                if(!encounter)continue;
                actor.encounter={...encounter,x:descriptor.position.x,y:descriptor.position.y,sceneState:{opacity:0,retiring:false}};
                actor.signature=signature;
            }
        }
        if(!actor.encounter)continue;
        actor.encounter.sceneState.opacity=actor.sceneOpacity;
        actor.encounter.sceneState.retiring=actor.retiring;
        live.push(actor.encounter);
    }
    world.wildActors=actors;
    const next=[...(world.wildAuthored||[]),...live],previous=world.encounters||[];
    const changed=next.length!==previous.length||next.some((e,i)=>e!==previous[i]);
    if(changed){world.encounters=next;world.revision++;world.onObjectsChanged?.({wildOnly:true});}
    return changed;
}
