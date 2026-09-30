import {createRng,hashSeed} from './rng_core.js';
import {findPath,followPath,nearestWalkable,walkable,routeLocation,routePoint} from './adventure_world_core.js';
import {segmentDistance} from './adventure_island_layout_core.js';
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

function hubReach(params=SOCIAL_DEFAULTS){return params.hotspotRadius+params.hotspotSpread;}
function roadSlack(params=SOCIAL_DEFAULTS){return params.roadSlack??16;}
function spawnMinActors(params=SOCIAL_DEFAULTS){return Math.max(0,Math.floor(params.spawnMinActors??2));}

// Only social actors use this navigation view. Player entrance interactions stay reachable.
const socialWorlds=new WeakMap();
function socialNavigationWorld(world){
    if(world.movementExclusions)return world;
    const entrances=(world.landmarks||[]).filter(p=>p.dungeonId);
    if(!entrances.length)return world;
    if(!socialWorlds.has(world))socialWorlds.set(world,{...world,movementExclusions:entrances.map(p=>({
        x:p.x,y:p.y-(p.entranceKind==='tower'?25:0),radius:SOCIAL_DEFAULTS.entranceClearance,
    }))});
    return socialWorlds.get(world);
}

export function roadClearance(world,p){
    if(!world.paths?.length)return 0;
    return Math.min(...world.paths.map(path=>segmentDistance(p,path.a,path.b)-(path.width||60)/2));
}
export function onActivityRoad(world,p,params=SOCIAL_DEFAULTS){
    if(!world.paths?.length)return walkable(world,p.x,p.y);
    return roadClearance(world,p)<=roadSlack(params);
}

// Activity hubs are quest-adjacent places: teleporters, landmarks, roadside NPCs and nearby mobs.
export function socialActivityHubs(world){
    const hubs=[];
    const add=(point,weight,kind,id)=>{
        if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))return;
        hubs.push({x:point.x,y:point.y,weight,kind,id});
    };
    const plaza=world.zone==='town'?(world.landmarks||[]).find(p=>/广场|plaza/i.test(`${p.id||''}${p.name||''}`)):null;
    add(plaza||world.layout?.spawn||world.center,4,'spawn','spawn');
    add(world.portal,1,'portal','portal');
    add(world.entrancePortal,1,'portal','entrance');
    for(const landmark of world.landmarks||[]){
        if(landmark.dungeonId)continue;
        if(landmark===plaza)continue;
        add(landmark,2.5,'landmark',landmark.id);
    }
    for(const npc of world.npcs||[]){
        const guide=/导师|任务/i.test(npc.name||'');
        add(npc,guide?3.5:2,'npc',npc.id);
    }
    for(const encounter of world.encounters||[])add(encounter,1.5,'encounter',encounter.id);
    if(!hubs.length)add(world.center||world.layout?.spawn,1,'center','center');
    return hubs;
}

function pickWeightedHub(rng,hubs){
    const total=hubs.reduce((sum,h)=>sum+h.weight,0);
    let roll=rng.float()*total;
    for(const hub of hubs){roll-=hub.weight;if(roll<=0)return hub;}
    return hubs[hubs.length-1];
}

function roadsideCandidates(world,hub,params=SOCIAL_DEFAULTS){
    const reach=hubReach(params),paths=world.paths||[],out=[];
    if(!paths.length){
        for(let n=0;n<16;n++){
            const angle=n/16*Math.PI*2,r=params.hotspotRadius+((n%4)/4)*params.hotspotSpread;
            const p=nearestWalkable(world,hub.x+Math.cos(angle)*r,hub.y+Math.sin(angle)*r);
            if(walkable(world,p.x,p.y))out.push(p);
        }
        return out;
    }
    for(const path of paths){
        const dx=path.b.x-path.a.x,dy=path.b.y-path.a.y,length=Math.hypot(dx,dy)||1;
        const step=Math.max(28,Math.min(48,path.width||40));
        for(let d=0;d<=length;d+=step){
            const t=d/length,cx=path.a.x+dx*t,cy=path.a.y+dy*t;
            if(Math.hypot(cx-hub.x,cy-hub.y)>reach)continue;
            const nx=-dy/length,ny=dx/length,half=(path.width||60)*.28;
            for(const side of [0,-1,1]){
                const p=nearestWalkable(world,cx+nx*half*side,cy+ny*half*side);
                if(walkable(world,p.x,p.y)&&onActivityRoad(world,p,params)&&Math.hypot(p.x-hub.x,p.y-hub.y)<=reach)out.push(p);
            }
        }
    }
    if(!out.length){
        const p=nearestWalkable(world,hub.x,hub.y);
        if(walkable(world,p.x,p.y))out.push(p);
    }
    return out;
}

export function socialMonsterGap(encounter,params=SOCIAL_DEFAULTS){
    const count=encounter.monsterIds?.length||1;
    const spread=count>1?(count-1)/2*42:0;
    return (params.monsterClearance??96)+spread;
}
function clearsMonsters(world,p,params=SOCIAL_DEFAULTS){
    return (world.encounters||[]).every(e=>Math.hypot(e.x-p.x,e.y-p.y)>socialMonsterGap(e,params));
}
function clearsPeople(world,p,used,params=SOCIAL_DEFAULTS){
    if(!clearsMonsters(world,p,params))return false;
    if(used.some(v=>Math.hypot(v.x-p.x,v.y-p.y)<=params.separation))return false;
    return (world.npcs||[]).every(n=>Math.hypot(n.x-p.x,n.y-p.y)>params.npcClearance);
}
// Keep the companion on the road, but far enough along it that sprites do not stack.
function standClearOfMonsters(world,origin,params=SOCIAL_DEFAULTS){
    if(clearsMonsters(world,origin,params)&&walkable(world,origin.x,origin.y))return origin;
    const paths=world.paths||[];
    let best=null,bestDist=Infinity;
    for(const path of paths){
        const length=Math.hypot(path.b.x-path.a.x,path.b.y-path.a.y)||1;
        const steps=Math.ceil(length/28);
        for(let i=0;i<=steps;i++){
            const t=i/steps,p={x:path.a.x+(path.b.x-path.a.x)*t,y:path.a.y+(path.b.y-path.a.y)*t};
            if(!walkable(world,p.x,p.y)||!onActivityRoad(world,p,params)||!clearsMonsters(world,p,params))continue;
            const d=Math.hypot(p.x-origin.x,p.y-origin.y);
            if(d<bestDist){bestDist=d;best=p;}
        }
    }
    return best||origin;
}

export function sampleActivitySpot(world,hub,rng,used=[],params=SOCIAL_DEFAULTS){
    world=socialNavigationWorld(world);
    const shuffled=rng.shuffle(roadsideCandidates(world,hub,params).slice());
    for(const p of shuffled)if(clearsPeople(world,p,used,params))return p;
    for(const p of shuffled)if(clearsMonsters(world,p,params)&&used.every(v=>Math.hypot(v.x-p.x,v.y-p.y)>params.separation*.5))return p;
    const aside=standClearOfMonsters(world,nearestWalkable(world,hub.x+rng.float()*20-10,hub.y+rng.float()*20-10),params);
    return clearsMonsters(world,aside,params)?aside:shuffled.find(p=>clearsMonsters(world,p,params))||aside;
}

function assignHub(rng,hubs,index,spawnHub,spawnQuota){
    if(index<spawnQuota&&spawnHub)return spawnHub;
    return pickWeightedHub(rng,hubs);
}

export function createSocialActors(world,profiles,seed=1) {
    world=socialNavigationWorld(world);
    const hubs=socialActivityHubs(world);
    const spawnHub=hubs.find(h=>h.kind==='spawn');
    const spawnQuota=Math.min(spawnMinActors(),profiles.length);
    const used=[];
    return profiles.map((profile,i)=>{
        const rng=createRng(hashSeed(`${seed}:${world.zone}:${profile.id}`));
        const hotspot=assignHub(rng,hubs,i,spawnHub,spawnQuota);
        const position=sampleActivitySpot(world,hotspot,rng,used);
        used.push(position);
        return {profile,position,rng,path:[],facing:hashSeed(profile.id)%3,moving:false,wait:rng.int(SOCIAL_DEFAULTS.idleMin,SOCIAL_DEFAULTS.idleMax),travel:rng.int(SOCIAL_DEFAULTS.travelMin,SOCIAL_DEFAULTS.travelMax),hotspot};
    });
}
// Dungeon members follow the captain's actual trail, including turns and retreats.
const partyTrails=new WeakMap();
export function stepDungeonParty(actors,world,leader,dt){
    if(!leader||!world.layout?.route)return;
    let trail=partyTrails.get(actors);
    const gap=SOCIAL_DEFAULTS.followSpacing;
    if(!trail||trail.world!==world||Math.hypot(leader.x-trail.points[0].x,leader.y-trail.points[0].y)>SOCIAL_DEFAULTS.dungeonRegroupDistance){
        const progress=routeLocation(world,leader).progress;
        trail={world,points:[{...leader}]};
        for(let back=8;back<=gap*(actors.length+2);back+=8)trail.points.push(routePoint(world,Math.max(0,progress-back)));
        partyTrails.set(actors,trail);
        actors.forEach((a,i)=>{a.position=routePoint(world,Math.max(0,progress-gap*(i+1)));a.path=[];});
    }
    if(Math.hypot(leader.x-trail.points[0].x,leader.y-trail.points[0].y)>=2)trail.points.unshift({...leader});
    function behind(distance){
        for(let i=1;i<trail.points.length;i++){
            const a=trail.points[i-1],b=trail.points[i],length=Math.hypot(b.x-a.x,b.y-a.y);
            if(length>=distance)return {x:a.x+(b.x-a.x)*distance/length,y:a.y+(b.y-a.y)*distance/length};
            distance-=length;
        }
        return trail.points.at(-1);
    }
    let length=0;
    for(let i=1;i<trail.points.length;i++){length+=Math.hypot(trail.points[i].x-trail.points[i-1].x,trail.points[i].y-trail.points[i-1].y);if(length>gap*(actors.length+3)){trail.points.length=i+1;break;}}
    actors.forEach((a,i)=>{
        const before=a.position,target=behind(gap*(i+1));
        const next=followPath(world,before,findPath(world,before,target),SOCIAL_DEFAULTS.dungeonFollowSpeed*Math.max(0,Math.min(.1,dt)));
        a.position=next.position;a.path=[];a.moving=Math.hypot(a.position.x-before.x,a.position.y-before.y)>.1;
        if(a.moving)a.facing=socialFacing(a.position.x-before.x,a.position.y-before.y,true);
    });
}
export function stepSocialActors(actors,world,dt,{paused=false,locked=null,team=[],leader=null,speed=SOCIAL_DEFAULTS.speed,view=null}={}) {
    if(paused)return;
    if(world.layout?.route){stepDungeonParty(actors,world,leader,dt);return;}
    world=socialNavigationWorld(world);
    dt=Math.max(0,Math.min(dt,.1));let moving=actors.filter(a=>a.path.length).length;const limit=Math.ceil(actors.length/4);
    const hubs=socialActivityHubs(world);
    for(const a of actors){
        if(!walkable(world,a.position.x,a.position.y)){
            a.position=standClearOfMonsters(world,nearestWalkable(world,a.position.x,a.position.y));a.path=[];
        }
        if(a.profile.id===locked){a.path=[];a.moving=false;if(leader){const dx=leader.x-a.position.x,dy=leader.y-a.position.y;a.facing=socialFacing(dx,dy);}continue;}
        if(!a.path.length&&!clearsMonsters(world,a.position)){const aside=standClearOfMonsters(world,a.position);if(aside)a.position=aside;}
        // Off-camera residents idle in place; only on-screen actors walk like the hero.
        if(!socialInView(a.position,view)){a.path=[];a.moving=false;continue;}
        const distance=leader?Math.hypot(a.position.x-leader.x,a.position.y-leader.y):Infinity;
        // Hysteresis once idle near the player; walking residents finish the current path first.
        a.approached=distance<=(a.approached?SOCIAL_DEFAULTS.approachReleaseRadius:SOCIAL_DEFAULTS.approachRadius);
        // Brush-by mid-walk does not cancel travel; only an already-idle actor stays put while close.
        if(a.approached&&!a.path.length){a.moving=false;a.wait=Math.max(a.wait,SOCIAL_DEFAULTS.followWait);a.facing=socialFacing(leader.x-a.position.x,leader.y-a.position.y);continue;}
        const index=team.indexOf(a.profile.id);a.wait-=dt;a.travel-=dt;
        if(index>=0&&leader){if(!a.path.length&&moving<limit&&a.wait<=0&&Math.hypot(a.position.x-leader.x,a.position.y-leader.y)>SOCIAL_DEFAULTS.followDistance){a.path=findPath(world,a.position,standClearOfMonsters(world,nearestWalkable(world,leader.x-SOCIAL_DEFAULTS.followSpacing*(index+1),leader.y+SOCIAL_DEFAULTS.separation)));a.wait=SOCIAL_DEFAULTS.followWait;if(a.path.length)moving++;}}
        else if(!a.path.length&&a.wait<=0&&moving<limit){
            if(a.travel<=0){a.hotspot=pickWeightedHub(a.rng,hubs);a.travel=a.rng.int(SOCIAL_DEFAULTS.travelMin,SOCIAL_DEFAULTS.travelMax);}
            const occupied=actors.filter(o=>o!==a).map(o=>o.position);
            const p=sampleActivitySpot(world,a.hotspot,a.rng,occupied);
            if(clearsPeople(world,p,[],SOCIAL_DEFAULTS))a.path=findPath(world,a.position,p);
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
