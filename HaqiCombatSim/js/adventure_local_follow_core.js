import {movePosition} from './adventure_world_core.js';
import {stepDungeonParty} from './adventure_social_motion_core.js';
import {SOCIAL_DEFAULTS} from './adventure_social_core.js';

// Following is an explicit control mode, not a proximity-based social interaction.
// Use the leader's traversed route across terrain and boat transitions.
export function createLocalFollowMotion(){
    let worldRef=null,keys=[{},{}];
    function reset(){worldRef=null;keys=[{},{}];}
    function sync(world,roles,{force=false,params=SOCIAL_DEFAULTS}={}){
        if(!force&&worldRef===world)return false;
        worldRef=world;keys=[{},{}];
        roles[1].zone=roles[0].zone;
        roles[1].position=movePosition(world,roles[0].position,params.followSpacing,0);
        roles[1].facing=roles[0].facing||0;
        return true;
    }
    function step(world,roles,following,dt,{paused=false,params=SOCIAL_DEFAULTS}={}){
        sync(world,roles,{params});
        const moving=[false,false];
        for(let owner=0;owner<2;owner++){
            if(!following[owner]){keys[owner]={};continue;}
            if(paused)continue;
            const follower=roles[owner],leader=roles[1-owner];
            const actor={profile:{id:'local-hero-1'},position:follower.position,facing:follower.facing};
            stepDungeonParty([actor],world,{...leader.position,facing:leader.facing},dt,{key:keys[owner],params});
            follower.position=actor.position;follower.facing=actor.facing;moving[owner]=actor.moving;
        }
        return moving;
    }
    return {reset,sync,step};
}
