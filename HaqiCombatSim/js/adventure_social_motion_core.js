import {createRng,hashSeed} from './rng_core.js';
import {findPath,followPath,nearestWalkable,walkable} from './adventure_world_core.js';
import {SOCIAL_DEFAULTS} from './adventure_social_core.js';
// Sprite directions: down/front=0, left=1, right=2, up/back=3.
// Keep real travel direction, but turn toward the camera or sideways while standing.
export function socialFacing(dx,dy,moving=false){
    if(Math.abs(dx)>Math.abs(dy))return dx<0?1:2;
    return dy<0?(moving?3:dx<0?1:2):0;
}
export function socialInView(position,view){
    if(!view||!(view.w>0)||!(view.h>0))return true;
    return position.x>=view.x&&position.x<=view.x+view.w&&position.y>=view.y&&position.y<=view.y+view.h;
}
export function createSocialActors(world,profiles,seed=1) {
    const spots=world.npcs?.length?world.npcs:[world.center],used=[];
    return profiles.map((profile,i)=>{
        const rng=createRng(hashSeed(`${seed}:${world.zone}:${profile.id}`)),hotspot=spots[i%spots.length];let position;
        for(let n=0;n<30;n++){const angle=rng.float()*Math.PI*2,r=SOCIAL_DEFAULTS.hotspotRadius+rng.float()*SOCIAL_DEFAULTS.hotspotSpread;const p=nearestWalkable(world,hotspot.x+Math.cos(angle)*r,hotspot.y+Math.sin(angle)*r);if(walkable(world,p.x,p.y)&&used.every(v=>Math.hypot(v.x-p.x,v.y-p.y)>SOCIAL_DEFAULTS.separation)&&spots.every(v=>Math.hypot(v.x-p.x,v.y-p.y)>SOCIAL_DEFAULTS.npcClearance)){position=p;break;}}
        position??=nearestWalkable(world,world.center.x+i*45,world.center.y+120);used.push(position);
        return {profile,position,rng,path:[],facing:hashSeed(profile.id)%3,moving:false,wait:rng.int(SOCIAL_DEFAULTS.idleMin,SOCIAL_DEFAULTS.idleMax),travel:rng.int(SOCIAL_DEFAULTS.travelMin,SOCIAL_DEFAULTS.travelMax),hotspot};
    });
}
export function stepSocialActors(actors,world,dt,{paused=false,locked=null,team=[],leader=null,speed=SOCIAL_DEFAULTS.speed,view=null}={}) {
    if(paused)return;dt=Math.max(0,Math.min(dt,.1));let moving=actors.filter(a=>a.path.length).length;const limit=Math.ceil(actors.length/4);
    for(const a of actors){
        if(a.profile.id===locked){a.path=[];a.moving=false;if(leader){const dx=leader.x-a.position.x,dy=leader.y-a.position.y;a.facing=socialFacing(dx,dy);}continue;}
        // Off-camera residents idle in place; only on-screen actors walk like the hero.
        if(!socialInView(a.position,view)){a.path=[];a.moving=false;continue;}
        const distance=leader?Math.hypot(a.position.x-leader.x,a.position.y-leader.y):Infinity;
        // Hysteresis prevents repeated start/stop at the approach boundary.
        a.approached=distance<=(a.approached?SOCIAL_DEFAULTS.approachReleaseRadius:SOCIAL_DEFAULTS.approachRadius);
        if(a.approached){if(a.path.length)moving--;a.path=[];a.moving=false;a.wait=Math.max(a.wait,SOCIAL_DEFAULTS.followWait);a.facing=socialFacing(leader.x-a.position.x,leader.y-a.position.y);continue;}
        const index=team.indexOf(a.profile.id);a.wait-=dt;a.travel-=dt;
        if(index>=0&&leader){if(!a.path.length&&moving<limit&&a.wait<=0&&Math.hypot(a.position.x-leader.x,a.position.y-leader.y)>SOCIAL_DEFAULTS.followDistance){a.path=findPath(world,a.position,nearestWalkable(world,leader.x-SOCIAL_DEFAULTS.followSpacing*(index+1),leader.y+SOCIAL_DEFAULTS.separation));a.wait=SOCIAL_DEFAULTS.followWait;if(a.path.length)moving++;}}
        else if(!a.path.length&&a.wait<=0&&moving<limit){
            if(a.travel<=0){a.hotspot=a.rng.pick(world.npcs?.length?world.npcs:[world.center]);a.travel=a.rng.int(SOCIAL_DEFAULTS.travelMin,SOCIAL_DEFAULTS.travelMax);}
            const angle=a.rng.float()*Math.PI*2,r=SOCIAL_DEFAULTS.hotspotRadius+a.rng.float()*SOCIAL_DEFAULTS.hotspotSpread,p=nearestWalkable(world,a.hotspot.x+Math.cos(angle)*r,a.hotspot.y+Math.sin(angle)*r);
            if((world.npcs||[]).every(n=>Math.hypot(n.x-p.x,n.y-p.y)>SOCIAL_DEFAULTS.npcClearance))a.path=findPath(world,a.position,p);
            a.wait=a.rng.int(SOCIAL_DEFAULTS.idleMin,SOCIAL_DEFAULTS.idleMax);if(a.path.length)moving++;
        }
        const before={...a.position},next=followPath(world,a.position,a.path,speed*dt);a.position=next.position;a.path=next.path;a.moving=Math.hypot(a.position.x-before.x,a.position.y-before.y)>.01;
        if(a.moving)a.facing=socialFacing(a.position.x-before.x,a.position.y-before.y,true);
        else if(a.facing===3)a.facing=hashSeed(a.profile.id)%2+1;
    }
}

// One nearby invitation keeps crowded scenes quiet; body/name clicks never select.
export function socialBubble(actors,leader){
    if(!leader)return null;
    const near=actors.map(actor=>({actor,d:Math.hypot(actor.position.x-leader.x,actor.position.y-leader.y)})).filter(v=>v.d<=SOCIAL_DEFAULTS.converseRadius).sort((a,b)=>a.d-b.d||a.actor.profile.id.localeCompare(b.actor.profile.id))[0]?.actor;
    return near?{profile:near.profile,x:near.position.x-20,y:near.position.y-110,w:40,h:30}:null;
}
export function pickSocialBubble(actors,leader,point){const b=socialBubble(actors,leader);return b&&point.x>=b.x&&point.x<=b.x+b.w&&point.y>=b.y&&point.y<=b.y+b.h?b.profile:null;}
