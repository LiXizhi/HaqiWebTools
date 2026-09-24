// Presentation-only companion motion; never consumes combat RNG or changes saves.
import { createRng, hashSeed } from './rng_core.js';
import { clearSegment, distance, findPath, followPath, walkable, WALK_SPEED } from './adventure_world_core.js';

export function createCompanion(world, hero, seed) {
    const nearby={x:hero.x-38,y:hero.y+28};
    return {position:walkable(world,nearby.x,nearby.y)?nearby:{...hero},lastHero:{...hero},
        rng:createRng(hashSeed(seed)),path:[],following:false,wait:1,repath:0,facing:1,moving:false,phase:0};
}

export function stepCompanion(pet,world,hero,dt,options={}) {
    dt=Math.max(0,Math.min(.055,dt));
    const deferSearch=!!options.deferSearch;
    function route(from,to){
        if(deferSearch&&!clearSegment(world,from,to))return null;
        return findPath(world,from,to);
    }
    // A zone/save teleport should not leave the companion on the other side of the map.
    if(distance(hero,pet.lastHero)>360){
        const fresh=createCompanion(world,hero,pet.rng.seed);
        Object.assign(pet,fresh);
    }
    pet.lastHero={...hero};
    const gap=distance(pet.position,hero);
    pet.repath-=dt;
    if(gap>100&&!pet.following){pet.following=true;pet.repath=0;pet.path=[];}
    if(pet.following&&gap<46){pet.following=false;pet.path=[];pet.wait=.8+pet.rng.float()*2;}
    if(pet.following&&pet.repath<=0){
        const next=route(pet.position,hero);
        if(next){pet.path=next;pet.repath=.45;}
        else pet.repath=.05;
    }else if(!pet.following&&!pet.path.length){
        pet.wait-=dt;
        if(pet.wait<=0){
            pet.wait=1.4+pet.rng.float()*2.8;
            let searched=false;
            for(let i=0;i<8&&!searched;i++){
                const angle=pet.rng.float()*Math.PI*2,radius=34+pet.rng.float()*42;
                const target={x:hero.x+Math.cos(angle)*radius,y:hero.y+Math.sin(angle)*radius};
                if(!walkable(world,target.x,target.y)||distance(target,pet.position)<18)continue;
                if(deferSearch&&!clearSegment(world,pet.position,target))continue;
                const next=findPath(world,pet.position,target);
                searched=true;
                if(next.length){pet.path=next;break;}
            }
        }
    }
    const speed=pet.following?WALK_SPEED*(gap>180?1.55:1.18):48;
    const previous=pet.position;
    const next=followPath(world,previous,pet.path,speed*dt);
    pet.position=next.position;pet.path=next.path;
    const dx=pet.position.x-previous.x,travel=distance(previous,pet.position);
    pet.moving=travel>.01;
    if(Math.abs(dx)>.05)pet.facing=dx<0?-1:1;
    pet.phase+=travel*.10;
    return pet;
}
