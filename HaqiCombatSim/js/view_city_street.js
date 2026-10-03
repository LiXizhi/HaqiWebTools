import {createSpatialIndex,polygonBounds,createStreetMotion,stepStreetMotion,signalGreen} from './adventure_city_street_core.js';
import {streetPeopleProfiles} from './adventure_city_people_core.js';
import {createHeroActor,updateHeroActor,facingToward,WALK_CYCLE_DISTANCE} from './hero_pose_core.js';
import {hashSeed} from './rng_core.js';
const path=(c,points,close=true)=>{c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));if(close)c.closePath();};
export function paintStreetGround(c,street,rect){
    c.fillStyle=street.ground||'#d5d1bd';c.fillRect(rect.x,rect.y,rect.w,rect.h);
    for(const s of street.surfaces){path(c,s.points);c.fillStyle=s.color;c.fill();if(s.kind==='water'){c.save();c.clip();c.strokeStyle='#d7eff033';c.lineWidth=2;for(let y=Math.floor(rect.y/45)*45;y<rect.y+rect.h;y+=45)for(let x=Math.floor(rect.x/85)*85;x<rect.x+rect.w;x+=85){c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+18,y-7,x+40,y);c.stroke();}c.restore();}}
    c.lineJoin='round';c.lineCap='round';
    for(const r of street.roads){
        path(c,r.points,false);c.strokeStyle=r.kind==='road'?'#b8b5a6':'#b9ad92';c.lineWidth=r.width+24;c.stroke();
        c.strokeStyle=r.kind==='road'?'#737c7c':r.color||'#d8cbb0';c.lineWidth=r.width;c.stroke();
        if(r.kind==='road'){c.save();c.setLineDash([24,24]);c.lineWidth=2;c.strokeStyle='#eee5bd';c.stroke();c.restore();}
        else{c.save();path(c,r.points,false);c.setLineDash([2,26]);c.lineWidth=Math.max(1,r.width-8);c.strokeStyle='#988e7920';c.stroke();c.restore();}
    }
    // Paving seams are subtle continuous material detail, never colored parcel squares.
    c.strokeStyle='#574f3810';c.lineWidth=1;
    for(let y=Math.floor(rect.y/32)*32;y<rect.y+rect.h;y+=32){c.beginPath();c.moveTo(rect.x,y);c.lineTo(rect.x+rect.w,y);c.stroke();}
    for(const crossing of street.crossings||[]){c.save();c.translate(crossing.x,crossing.y);c.rotate(crossing.angle||0);c.fillStyle='#edead7';for(let x=-crossing.w/2;x<crossing.w/2;x+=17)c.fillRect(x,-crossing.h/2,9,crossing.h);c.restore();}
}
function objectBounds(o){return{x:o.x-o.w/2-40,y:o.y-o.h-40,w:o.w+80,h:o.h+80};}
export function createStreetPainter(assets,{makeCanvas=()=>document.createElement('canvas')}={}){
    let active=null,index=null,motion=null,last=null,profiles=new Map(),tileSize=512;const people=new Map(),tiles=new Map(),maxTiles=24;
    const resolution=typeof navigator!=='undefined'&&((navigator.hardwareConcurrency||8)<=4||(navigator.deviceMemory||8)<=4)?384:512;
    const clearTiles=()=>{for(const tile of tiles.values())tile.width=tile.height=0;tiles.clear();};
    const select=world=>{if(active===world.dungeon.scene)return;active=world.dungeon.scene;clearTiles();people.clear();profiles=streetPeopleProfiles(active.streetscape,assets.hero?.manifest,world.dungeon.id);for(const entry of Object.values(assets.content.cityStreetArt?.entries||{}))assets.registerImage?.(entry.id,entry);const npcAtlas=world.city?.art?.npcs||assets.content.cityStreetArt?.npcAtlas;if(npcAtlas)assets.registerImage?.(npcAtlas.id,npcAtlas);index=createSpatialIndex(active.streetscape.objects,objectBounds);motion=createStreetMotion(active.streetscape);last=null;};
    return {
        reset(){if(active)for(const entry of Object.values(assets.content.cityStreetArt?.entries||{}))assets.releaseImage?.(entry.id);active=null;index=null;motion=null;last=null;clearTiles();people.clear();profiles.clear();},
        stats:()=>({tiles:tiles.size,bytes:tiles.size*resolution*resolution*4,tileSize,resolution,actors:motion?.actors.length||0,people:people.size,peopleReady:[...people.values()].filter(p=>p.ready).length}),
        people:()=>motion?.actors.filter(a=>a.route.kind==='pedestrian').map(a=>({id:a.id,x:a.x,y:a.y,profile:profiles.get(a.id)}))||[],
        ground(c,world,rect){select(world);const street=active.streetscape;
            // Zoomed-out views use larger world chunks at the same pixel cost.
            // The visible working set fits the cache, avoiding continual eviction.
            let nextSize=512;
            while((Math.ceil(rect.w/nextSize)+1)*(Math.ceil(rect.h/nextSize)+1)>maxTiles)nextSize*=2;
            if(nextSize!==tileSize){clearTiles();tileSize=nextSize;}
            for(let ty=Math.max(0,Math.floor(rect.y/tileSize));ty<=Math.min(Math.ceil(world.h/tileSize)-1,Math.floor((rect.y+rect.h)/tileSize));ty++)for(let tx=Math.max(0,Math.floor(rect.x/tileSize));tx<=Math.min(Math.ceil(world.w/tileSize)-1,Math.floor((rect.x+rect.w)/tileSize));tx++){
                const key=tx+','+ty;let tile=tiles.get(key);
                if(!tile){tile=makeCanvas();tile.width=tile.height=resolution;const g=tile.getContext('2d');g.scale(resolution/tileSize,resolution/tileSize);g.translate(-tx*tileSize,-ty*tileSize);paintStreetGround(g,street,{x:tx*tileSize,y:ty*tileSize,w:tileSize,h:tileSize});tiles.set(key,tile);while(tiles.size>maxTiles){const first=tiles.keys().next().value,old=tiles.get(first);old.width=old.height=0;tiles.delete(first);}}else{tiles.delete(key);tiles.set(key,tile);}
                c.drawImage(tile,tx*tileSize,ty*tileSize,tileSize,tileSize);
            }
        },
        objects(world,rect,time,hero,reducedMotion){select(world);const street=active.streetscape,dt=last===null?0:(time-last)/1000;last=time;
            const actors=stepStreetMotion(motion,street,dt,hero,{reducedMotion,paused:dt>.5});
            return [...index(rect).map(o=>({...o,kind:'street',sortY:o.sortY??o.y})),...street.signals.map(o=>({...o,kind:'street-signal',green:signalGreen(o,motion.time)})),...actors.filter(a=>a.x>=rect.x-100&&a.y>=rect.y-100&&a.x<=rect.x+rect.w+100&&a.y<=rect.y+rect.h+100).map(a=>({...a,kind:'street-actor',profile:profiles.get(a.id),time:time/1000,reducedMotion,moving:a.moving&&!reducedMotion&&dt<=.5}))];
        },
        draw(c,o,hero,focus=[]){
            c.save();
            if(o.art==='railing'){c.translate(o.x,o.y);c.rotate(o.angle||0);c.strokeStyle='#657b76';c.lineWidth=3;c.beginPath();c.moveTo(-22,-24);c.lineTo(22,-24);c.moveTo(-22,-13);c.lineTo(22,-13);c.moveTo(-20,0);c.lineTo(-20,-30);c.stroke();c.restore();return;}
            if(o.kind==='street-signal'){c.translate(o.x,o.y);c.fillStyle='#58615c';c.fillRect(-3,-65,6,65);c.fillStyle='#303b3a';c.fillRect(-10,-76,20,43);for(let i=0;i<2;i++){c.beginPath();c.arc(0,-65+i*20,6,0,Math.PI*2);c.fillStyle=i===0?(o.green?'#663d37':'#eb7558'):(o.green?'#9de09b':'#354f43');c.fill();}c.restore();return;}
            if(o.kind==='street-actor'){
                const vehicle=o.route.kind==='vehicle',w=vehicle?96:42,h=vehicle?65:66,key=o.route.art||(vehicle?'car':null),entry=assets.content.cityStreetArt?.entries?.[key];
                if(vehicle){c.translate(o.x,o.y);if(Math.cos(o.angle)<0)c.scale(-1,1);if(!entry||!assets.draw(c,{id:entry.id},-w/2,-h,w,h,true,false)){c.fillStyle='#608d8e';c.beginPath();c.roundRect(-38,-30,76,30,10);c.fill();}}
                else{
                    let actor=people.get(o.id);if(!actor){actor=createHeroActor(hashSeed(o.id));people.set(o.id,actor);}
                    const pose=updateHeroActor(actor,{id:o.id,x:o.x,y:o.y,dx:o.moving?o.dx:0,dy:o.moving?o.dy:0,time:o.time,facing:facingToward(Math.cos(o.angle),Math.sin(o.angle)),npcs:hero?[{id:'hero',...hero}]:[],reducedMotion:o.reducedMotion});
                    c.fillStyle='#263b3026';c.beginPath();c.ellipse(o.x,o.y,19,7,0,0,Math.PI*2);c.fill();
                    // Same layered hero renderer, geometry and size as the player.
                    const result=assets.hero?.drawSave(c,{...o.profile,facing:pose.facing},o.x,o.y,o.time,o.moving,1,{head:pose.head,breath:pose.breath,walkTime:o.walkDistance/WALK_CYCLE_DISTANCE,reducedMotion:o.reducedMotion,nameBounds:false});
                    actor.ready=!!result?.ready;
                    if(!result?.ready)assets.tile?.(c,'sprites',(o.profile?.appearance==='girl'?12:8)+pose.facing,o.x-34,o.y-78,68,78);
                }
                c.restore();return;
            }
            const b=objectBounds(o),covered=[hero,...focus].some(p=>p&&p.x>b.x+15&&p.x<b.x+b.w-15&&p.y<o.y&&p.y>b.y+15);
            if(covered&&(o.type==='building'||o.type==='tree'))c.globalAlpha=.30;
            const entry=assets.content.cityStreetArt?.entries?.[o.art];
            if(o.footprint){path(c,o.footprint);c.fillStyle='#85786733';c.fill();}
            if(!entry||!assets.draw(c,{id:entry.id},o.x-o.w/2,o.y-o.h,o.w,o.h,true,false)){
                c.fillStyle=o.type==='tree'?'#648565':'#b8a488';c.beginPath();c.roundRect(o.x-o.w*.4,o.y-o.h*.7,o.w*.8,o.h*.7,8);c.fill();
            }
            if(o.label&&!covered){c.fillStyle='#f0dfb7';c.fillRect(o.x-Math.min(80,o.w*.38),o.y-46,Math.min(160,o.w*.76),22);c.fillStyle='#4e5145';c.font='13px Microsoft YaHei,sans-serif';c.textAlign='center';c.fillText(o.label,o.x,o.y-30,Math.min(150,o.w*.72));}
            c.restore();
        }
    };
}
