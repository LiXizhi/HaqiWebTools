import {fitLocalCamera} from './adventure_local_coop_core.js';
import {drawPetTraitHalo} from './view_pet_traits.js';
import {npcCharacter} from './adventure_city_people_core.js';
import {performanceDiagnostics as perf} from './performance_diagnostics.js';
import {createQuestMarkerCache} from './adventure_quest_marker_cache_core.js';
import {createFrameMeter} from './frame_meter_core.js';
import {mergeSceneObjects} from './scene_order_core.js';
import {createIslandSceneryCache} from './island_scenery_cache.js';
import {createIslandTerrainRasterizer} from './island_terrain_rasterizer.js';
import {islandCompanionNavigation} from './island_companion_navigation.js';
import {createScheduledTerrainCache} from './terrain_tile_scheduler.js';
import {socialGesturePose,socialHeadAnchor} from './adventure_social_actions_core.js';
import {npcHasActiveQuest} from './adventure_npc_core.js';
import {earthCityNpcMarker} from './adventure_earth_city_config_core.js';
import {monsterScenePositions,stepMonsterWander,monsterTerritoryWarning,monsterSceneParams} from './adventure_monster_motion_core.js';
import {drawMonsterTerritory} from './view_monster_territory.js';
import {drawDungeonEntrance} from './view_dungeon_entrance.js';
import {drawEarthDocks,drawEarthBoatRider} from './view_earth_boat.js';
import {earthBoatAt,earthBoatRiderPose} from './adventure_earth_boat_core.js';
import {cityEntranceAppearance} from './adventure_city_dungeons_core.js';
import {drawCityScene,drawCityHotspot} from './view_city_dungeon.js';
import {createStreetPainter,paintStreetGround} from './view_city_street.js';
import {drawSchoolIcon} from './card_renderer.js';
import {battleTargetRects} from './battle_target_pick_core.js';
import {createDungeonFog} from './view_adventure_dungeon_fog.js';
import {drawSocialPet,drawPetSocialEffects} from './view_adventure_pet_social.js';
import {drawPetMood} from './view_adventure_pet_mood.js';
import {petBattleMood} from './adventure_pet_mood_core.js';
import {petDisplayScale} from './adventure_pet_interactions_core.js';
import {socialBubble,localSocialBubbles,heroSocialLookPeers} from './adventure_social_motion_core.js';
import { createHeroActor, updateHeroActor } from './hero_pose_core.js';
import { paintSoftShadow, paintStaticShadows } from './adventure_shadows.js';
import { createMotionTrail, motionStyle, drawMotionTrail, drawMotionAccessory } from './adventure_motion_effects.js';
import { createStarFollower } from './adventure_star_motion_core.js';
import { drawMagicStar, starCompanionVisible } from './adventure_star.js';
import { magicStarStatus } from './adventure_magic_star_core.js';
import { drawIslandWeather, stepWeatherFade } from './adventure_weather.js';
import {createEarthEnvironmentPainter} from './adventure_earth_environment.js';
import { alignCameraOrigin, clampCameraToWorld, createCameraZoom } from './adventure_camera_core.js';
import { regionAt } from './adventure_island_layout_core.js';
import { drawRewardEffect } from './view_adventure_rewards.js';
import { drawOverheadStatus,drawStatusFeedback,drawSpellMiss } from './view_adventure_overhead_status.js';
import { drawTeleportEffect } from './view_adventure_teleport.js';
import { petAppearanceStage } from './adventure_pets_core.js';
import { resolveMountDrawPose, sceneMountSave } from './adventure_mounts_core.js';
import { createCompanion, stepCompanion, selectCompanionId, selectSocialPetId } from './adventure_companion_core.js';
import { hashSeed } from './rng_core.js';
// Canvas presentation only. Visual motion uses time/seeded map decorations, never gameplay RNG.
import { createSpellEffects } from './spell_effects.js';
import { drawAnimatedActor } from './actor_animation.js';
import { battleActorAction } from './actor_animation_core.js';
import { drawBattlePointer } from './battle_pointer.js';
import {drawBattlePips} from './view_battle_pips.js';
import { nextBattlePointer } from './battle_pointer_core.js';
import { currentQuest,questReady,questState,questProgress,SCHOOL_NAMES,catalogStatSnapshot } from './adventure_core.js';
import {catalogNpcMarker,catalogTracksMonster,trackedQuestIds} from './adventure_catalog_quests_core.js';
import { onIsland,distance,createWorldViewQuery,walkable } from './adventure_world_core.js';
import { OCEAN_COLOR, paintTerrain } from './adventure_terrain.js';
import { tr } from './locale_runtime.js';
import { createSignpostPainter } from './adventure_signposts.js';
import { paintLargeTerrain,paintLargeTerrainSteps } from './adventure_large_terrain.js';
export const COLORS={fire:'#e98f44',ice:'#6ecbdc',storm:'#b39aea',life:'#84bd59',death:'#a887c7'};
const TAU=Math.PI*2;
// Battle heroes share a 90px nominal height, close to the 99px monster frame.
const BATTLE_HERO_SCALE=90/78;
function ellipse(c,x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fill();}
function text(c,value,x,y,size=13,color='#fff',align='center') {const shown=tr(value);c.font=`600 ${size}px "PingFang SC", "Microsoft YaHei", sans-serif`;c.textAlign=align;c.fillStyle=color;c.fillText(shown,x,y);}
// Soft scene palette restored by user preference (2026-09-27).
const PLATE={
    hero:{text:'#b8ddff'},
    npc:{text:'#fff0b5'},
    social:{text:'#9ff5e5'},
    mob:{text:'#ffc6b3'},
    place:{text:'#fbf6d7',bg:'rgba(24,55,46,.78)'},
};
const plateWidths=new Map();
function plate(c,label,x,y,style=PLATE.place,school=null) {
    const shown=tr(label);
    if(school){
        c.save();c.font='600 12px "PingFang SC", "Microsoft YaHei", sans-serif';
        const iconSize=26,iconGap=6,width=c.measureText(shown).width;
        const iconX=x-(width+iconSize+iconGap)/2+iconSize/2;
        drawSchoolIcon(c,school,iconX,y-3,iconSize);
        c.restore();x+=(iconSize+iconGap)/2;
    }
    if(!style.bg){c.save();c.shadowColor='#10251f';c.shadowBlur=4;c.shadowOffsetX=0;c.shadowOffsetY=2;text(c,shown,x,y+2,12,style.text);c.restore();return;}
    c.font='600 12px "PingFang SC", sans-serif';
    let width=plateWidths.get(shown);
    if(width===undefined){width=c.measureText(shown).width+20;plateWidths.set(shown,width);if(plateWidths.size>256)plateWidths.delete(plateWidths.keys().next().value);}
    c.beginPath();c.roundRect(x-width/2,y-14,width,23,8);c.fillStyle=style.bg;c.fill();
    if(style.stroke){c.strokeStyle=style.stroke;c.lineWidth=1.5;c.stroke();}
    text(c,shown,x,y+2,12,style.text);
}
function circleRune(c,x,y,r,t,color='#e4d69a') {
    c.save();c.translate(x,y);c.scale(1,.53);c.strokeStyle=color;c.lineWidth=2;
    c.beginPath();c.arc(0,0,r,0,TAU);c.stroke();c.beginPath();c.arc(0,0,r*.83,0,TAU);c.stroke();
    c.rotate(t*.05);c.beginPath();for(let i=0;i<6;i++){const a=-Math.PI/2+i*TAU/5;c.lineTo(Math.cos(a)*r*.75,Math.sin(a)*r*.75);}c.stroke();
    for(let i=0;i<8;i++){c.save();c.rotate(i*TAU/8);c.strokeRect(r*.89,-3,5,6);c.restore();}c.restore();
}
// NPC chat invitation; the click target follows the drawn rect.
function drawSpeechBubble(c,at,t,reduced) {
    const float=reduced?0:Math.sin(t*2.2)*2.5;
    const w=24,h=16,x=at.x,y=at.y-66-float;
    c.fillStyle='#fffbe9';c.strokeStyle='#7a6335';c.lineWidth=1.5;
    c.beginPath();c.roundRect(x-w/2,y-h,w,h,7);c.fill();c.stroke();
    c.beginPath();c.moveTo(x-5,y-1);c.lineTo(x+5,y-1);c.lineTo(x,y+5);c.closePath();c.fill();
    c.beginPath();c.moveTo(x-5,y-1.7);c.lineTo(x,y+4.3);c.lineTo(x+5,y-1.7);c.stroke();
    c.fillStyle='#7a6335';
    for(let i=-1;i<=1;i++){c.beginPath();c.arc(x+i*6,y-h/2,1.7,0,TAU);c.fill();}
    return {x:x-w/2-4,y:y-h-4,w:w+8,h:h+13};
}
export function questMarker(save,content,npcId,stats=()=>catalogStatSnapshot(save,content)) {
    const involved=trackedQuestIds(save,content).some(id=>{
        const tracked=content.catalogQuests?.byId[id];
        return tracked&&(tracked.startNpc===npcId||tracked.endNpc===npcId||tracked.groups.some(g=>g.kind==='talk'&&g.items.some(i=>i.id===npcId)));
    });
    if(involved){
        const mark=catalogNpcMarker(save,content,npcId,stats());
        if(mark)return mark;
    }
    const q=currentQuest(save,content);if(!q||!trackedQuestIds(save,content).includes(q.id))return null;
    if(!questState(save,q.id).accepted&&q.startNpc===npcId)return '!';
    if(questReady(save,q)&&q.endNpc===npcId)return '?';
    if(questState(save,q.id).accepted&&questProgress(save,q).some(g=>g.kind==='talk'&&g.id===npcId&&g.value<g.count))return '…';
    return null;
}
export function createRenderer(canvas,assets) {
    const markerCache=createQuestMarkerCache(questMarker,catalogStatSnapshot);
    const drawSignpost=createSignpostPainter();
    const dungeonFog=createDungeonFog(),mapFog=createDungeonFog();
    const effects=createSpellEffects(assets), reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
    const ctx=canvas.getContext('2d',{alpha:false}),cam={x:0,y:0,scale:1,w:0,h:0};let backing=null,backingZone=null;
    const terrainTiles=createScheduledTerrainCache({rasterize:createIslandTerrainRasterizer(assets.terrainDecorationArt),onMetric:(name,value)=>perf.record(name,value),paint:(c,world,rect,atlases)=>paintLargeTerrainSteps(c,world,rect,false,assets.terrainDecorationArt?{draw(...args){atlases.add(args[1]);return assets.terrainDecorationArt.draw(...args);}}:null),createCanvas:()=>document.createElement('canvas')});
    if(assets.terrainDecorationArt)assets.terrainDecorationArt.onAtlas=atlas=>terrainTiles.invalidateAtlas(atlas);
    let vignetteCanvas=null,vignetteW=0,vignetteH=0;
    let overviewWorld=null,overview=null;
    let companion=null,companionId=null,companionWorld=null,companionSave=null,lastPetTime=null,bubbleTarget=null,greetingTarget=null;
    const cameraZoom=createCameraZoom();let weatherFade=null;
    const earthEnvironment=createEarthEnvironmentPainter();
    const frameMeter=createFrameMeter(),worldView=createWorldViewQuery();
    const streetPainter=createStreetPainter(assets);
    function paintTree(c,o,world){
        const winter=o.snow&&assets.environmentArt?.draw(c,'trees',['spruce','pine','fir','oldPine'][(Math.round(o.x)+Math.round(o.y))%4],o.x-o.size/2,o.y-o.size+10,o.size,o.size);
        if(!winter)assets.tile(c,'sprites',o.tile,o.x-o.size/2,o.y-o.size+10,o.size,o.size);
        if(!o.snow&&assets.sceneryTile){const variant=Math.abs(Math.round(o.x*7+o.y*13))%8,size=o.size*.36;assets.sceneryTile(c,8+variant,o.x+o.size*.18,o.y-size+14,size,size);}
    }
    const islandScenery=createIslandSceneryCache({paint:paintTree});
    const streetCredit=typeof document==='undefined'?{style:{}}:document.createElement('a');streetCredit.textContent='© OpenStreetMap contributors';streetCredit.href='https://www.openstreetmap.org/copyright';streetCredit.target='_blank';streetCredit.rel='noopener noreferrer';streetCredit.style.cssText='position:absolute;left:10px;bottom:5px;font:11px sans-serif;color:#e8ecdd;background:#203a39bb;padding:2px 5px;z-index:2;display:none';if(typeof document!=='undefined')canvas.parentElement?.append(streetCredit);
    const motionTrail=createMotionTrail();
    const socialFx=new Map();
    let viewRect=null,lastMonsterTime=null;
    let heroActor=null,heroPrevious=null,heroScope=null,heroIdentity=null;
    let localActor=null,localPrevious=null,localScope=null,localIdentity=null;
    const battleHero=createHeroActor(9271);
    const starFollower=createStarFollower();
    function prepareScene(world,save){
        const w=canvas.clientWidth,h=canvas.clientHeight;if(world.isEarth||world.isCityDungeon)return;if(!world.layout||!w||!h)return;
        const zoom=cameraZoom.value,scale=(w<650?.82:1)*zoom;
        terrainTiles.prepare(world,{x:save.position.x-w/(2*scale),y:save.position.y-h/(2*scale)+(w<650?50:25)/zoom,w:w/scale,h:h/scale},scale*Math.min(2,window.devicePixelRatio||1));
    }
    function zoomBy(factor) {
        return cameraZoom.zoomBy(factor);
    }
    function size(low=false) {
        const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(low?1.25:2,window.devicePixelRatio||1);
        if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
        ctx.setTransform(dpr,0,0,dpr,0,0);cam.w=w;cam.h=h;return {w,h,dpr};
    }
    function ground(world) {
        if(world.layout){
            if(overviewWorld===(world.layout||world))return overview;
            overviewWorld=world.layout||world;overview=document.createElement('canvas');overview.width=560;overview.height=Math.round(560*world.h/world.w);
            const c=overview.getContext('2d');c.scale(overview.width/world.w,overview.height/world.h);paintLargeTerrain(c,world,undefined,true);
            return overview;
        }
        if(backingZone===world)return backing;
        backingZone=world;backing=document.createElement('canvas');backing.width=world.w;backing.height=world.h;
        const c=backing.getContext('2d');
        paintTerrain(c,world);
        // Inlaid stone plaza and school learning circle.
        ellipse(c,world.center.x,world.center.y-30,133,86,'#aaac85');ellipse(c,world.center.x,world.center.y-34,125,81,'#d9d5b1');
        c.strokeStyle='#b7b58f';c.lineWidth=1.4;for(let y=-65;y<65;y+=22){c.beginPath();c.moveTo(world.center.x-90,world.center.y-30+y);c.lineTo(world.center.x+90,world.center.y-30+y);c.stroke();}
        circleRune(c,world.center.x,world.center.y-32,94,0,'#8fa68a');
        for(const d of world.decorations)if(d.kind===3&&onIsland(d.x,d.y,80)&&!world.paths.some(p=>Math.hypot(d.x-p.a.x,d.y-p.a.y)<135)) {
            ellipse(c,d.x,d.y,2,2,'#f4edbb');ellipse(c,d.x+3,d.y-3,2,2,'#e9bca4');
        }
        paintStaticShadows(c,world);
        return backing;
    }
    function shadow(c,x,y,w=24) {paintSoftShadow(c,x,y,w*1.18,w*.4,.3);}
    function avatar(c,save,x,y,time,moving,scale=1,nameBounds=true,headPose=null,bounds=null) {
        shadow(c,x,y,(save.mountId?28:23)*scale);
        const result=assets.hero.drawSave(c,save,x,y,time,moving,scale,{
            head:save.visualHead??headPose?.head,breath:save.visualBreath??headPose?.breath,
            reducedMotion:reducedMotion.matches,nameBounds,
            ...(headPose?{moving:moving&&headPose.moving,walkTime:headPose.walkTime,facing:headPose.facing}:{}),
        });
        if(bounds&&result.ready){
            if(result.headRect)bounds.speechHead={x:result.headRect.x+result.headRect.w/2,y:result.headRect.y};
            const rects=[result.headRect,result.bodyRect,result.pose?.mount].filter(Boolean);
            bounds.left=Math.min(...rects.map(r=>r.x));bounds.right=Math.max(...rects.map(r=>r.x+r.w));
            bounds.hitTop=Math.min(...rects.map(r=>r.y));bounds.bottom=Math.max(...rects.map(r=>r.y+r.h));
            if(result.pose?.mount)bounds.top=bounds.hitTop-8;
        }
        return result.nameY;
    }
    function starAnchor(save,time,moving){
        const row=save.mountId&&assets.content.mountByItem?.[save.mountId];
        const mount=row&&assets.content.mountCatalog?.mounts.find(item=>item.id===row.mountId);
        if(mount?.art?.cdn){
            const pose=resolveMountDrawPose(mount,save.facing||0,{size:78,time,moving,gender:save.appearance==='girl'?'female':'male'});
            return {x:save.position.x+pose.rider.x+pose.rider.w/2,y:save.position.y+pose.rider.y+pose.rider.h*.18};
        }
        return {x:save.position.x,y:save.position.y-66};
    }
    function creature(c,id,x,y,t,scale=1,groundShadow=true) {
        const index={'fire-scout':0,'ice-scout':1,'storm-scout':2,'life-scout':3,'death-scout':4,'water-bubble':5,'death-bubble':4,pet:6}[id]??5;
        const bob=Math.sin(t*2.8+x)*3;if(groundShadow)shadow(c,x,y,27*scale);assets.tile(c,'creatures',index,x-45*scale,y-84*scale+bob,90*scale,88*scale);
    }
    function monster(c,m,x,y,t,scale=1,pose=null){
        const bob=reducedMotion.matches?0:pose?.moving?-Math.abs(Math.sin(t*10))*3:Math.sin(t*2.8+x)*2;
        shadow(c,x,y,27*scale);
        c.save();c.translate(x,y);c.scale(pose?.facing||1,1);
        if(!assets.drawMonster?.(c,m,-52*scale,-104*scale+bob,104*scale,104*scale))creature(c,m?.id||'water-bubble',0,bob,t,scale,false);
        c.restore();
    }
    function render(world,save,time,{localSecond=null,localSecondMoving=false,localFollowing=false,localSecondFollowing=false,gatheringPets=[],graphics={particles:true,trails:true},socialGesture=null,petScene=null,socialActors=[],inParty=false,moving=false,path=[],title=false,rewardEffect=null,teleportEffect=null,weatherOverride=null,weatherTime=time,fishingPose=null,membership={},motionHidden=false,companionBubble=null,learningGreeting=null}={}) {
        let phaseTime=perf.enabled?performance.now():0;
        const mark=name=>{if(phaseTime){const now=performance.now();perf.record(world.isEarth?name:name.replace('earth-','island-'),now-phaseTime);phaseTime=now;}};
        const markerFor=markerCache.forState(save,assets.content,world);
        streetCredit.style.display=world.dungeon?.scene.streetscape?.provenance?.kind==='osm-derived'?'block':'none';
        const {w,h,dpr}=size(graphics.low),t=time/1000,gestureAt=Date.now();bubbleTarget=null;greetingTarget=null;ctx.fillStyle=world.layout?.rules.terrain.ocean||OCEAN_COLOR;ctx.fillRect(0,0,w,h);
        cameraZoom.tick(time,reducedMotion.matches);
        const baseScale=w<650?.82:1,sceneZoom=title?1:cameraZoom.value;
        cam.scale=baseScale*sceneZoom;const center=title?{x:(world.layout?world.center.x:875)+Math.sin(t*.04)*60,y:world.layout?world.center.y:770}:{...save.position};
        const localCamera=!title&&localSecond&&!localSecondFollowing?fitLocalCamera([save.position,localSecond.position],w,h,cam.scale):null;
        if(localCamera){cam.scale=localCamera.scale;Object.assign(center,localCamera.center);}
        const aligned=alignCameraOrigin(center.x-w/(2*cam.scale),center.y-h/(2*cam.scale)+(w<650?50:25)/sceneZoom,cam.scale,dpr);
        const origin=!title&&world.dungeon?.scene.streetscape?.theme==='south-china'?clampCameraToWorld(aligned,world,{w:w/cam.scale,h:h/cam.scale},cam.scale,dpr):aligned;
        cam.x=origin.x;cam.y=origin.y;
        earthEnvironment.update(world,save.position,time,{light:graphics.earthLight,weather:graphics.earthWeather,at:gestureAt,reducedMotion:reducedMotion.matches});
        ctx.save();
        try {
        ctx.scale(cam.scale,cam.scale);ctx.translate(-cam.x,-cam.y);
        mark('earth-render-setup');
        if(world.isEarth)world.terrainPainter(ctx,world,{x:cam.x,y:cam.y,w:w/cam.scale,h:h/cam.scale});
        if(world.isEarth)drawEarthDocks(ctx,assets,world,{x:cam.x,y:cam.y,w:w/cam.scale,h:h/cam.scale});
        mark('earth-render-terrain');
        if(world.dungeon?.scene.streetscape)streetPainter.ground(ctx,world,{x:cam.x,y:cam.y,w:w/cam.scale,h:h/cam.scale});
        else {streetPainter.reset();if(world.isCityDungeon)drawCityScene(ctx,world);}
        for(const mark of world.landmarks||[])if(mark.cityDungeon&&!mark.hidden&&Math.abs(mark.x-(cam.x+w/cam.scale/2))<w/cam.scale/2+70&&Math.abs(mark.y-(cam.y+h/cam.scale/2))<h/cam.scale/2+70)drawDungeonEntrance(ctx,mark,0,true,assets.entranceArt);
        const coldTiles=world.layout&&!world.isEarth&&!world.isCityDungeon?terrainTiles.draw(ctx,world,{x:cam.x,y:cam.y,w:w/cam.scale,h:h/cam.scale},(c,x,y,size)=>{
            const map=ground(world),dw=Math.min(size,world.w-x),dh=Math.min(size,world.h-y);
            c.drawImage(map,x*map.width/world.w,y*map.height/world.h,dw*map.width/world.w,dh*map.height/world.h,x,y,dw,dh);
        },cam.scale*canvas.width/w,path):0;
        if(!world.layout)ctx.drawImage(ground(world),0,0);
        earthEnvironment.ground(ctx,world,cam,w,h,time,{enabled:graphics.particles&&!graphics.low,reducedMotion:reducedMotion.matches});
        // Moving water highlights, grounded visual-only ambient animation.
        ctx.strokeStyle='#e3f3da33';ctx.lineWidth=2;
        if(!world.layout&&!reducedMotion.matches)for(let i=0;i<38;i++){const x=(i*151+t*8)%1750,y=80+(i*269)%1450;if(onIsland(x,y,-12))continue;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+13,y+4,x+26,y);ctx.stroke();}
        if(path.length&&!title){ctx.strokeStyle='#fff6bc88';ctx.setLineDash([3,10]);ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(save.position.x,save.position.y);for(const p of path)ctx.lineTo(p.x,p.y);ctx.stroke();ctx.setLineDash([]);const end=path[path.length-1];circleRune(ctx,end.x,end.y,15,t,'#fff3ae');}
        if(!world.portal.hidden)circleRune(ctx,world.portal.x,world.portal.y,45,t,save.graduated?'#e9e29a':'#a6bab0');
        if(world.entrancePortal)circleRune(ctx,world.entrancePortal.x,world.entrancePortal.y,45,t,'#a6bab0');
        const identity=save.name+':'+save.appearance+':'+save.seed;
        if(!heroActor||heroScope!==world||heroIdentity!==identity||!heroPrevious||time-heroPrevious.time>1000||Math.hypot(save.position.x-heroPrevious.x,save.position.y-heroPrevious.y)>100){
            heroActor=createHeroActor(Number(save.seed)||7419);heroActor.facing=save.facing||0;heroActor.head=[0,4,12,8][heroActor.facing];heroPrevious={...save.position,time};heroScope=world;heroIdentity=identity;
        }
        // Head-turnable peers: hero + idle social AI. Static world NPCs cannot turn and stay one-way fallbacks.
        const turnableSocial=heroSocialLookPeers(socialActors,{inParty:inParty||!!save.coopRun});
        if(localSecond&&!title&&!localFollowing&&!localSecondMoving)turnableSocial.push({id:'local-hero-1',...localSecond.position});
        const heroPose=updateHeroActor(heroActor,{id:'hero',dx:save.position.x-heroPrevious.x,dy:save.position.y-heroPrevious.y,x:save.position.x,y:save.position.y,time:t,facing:save.facing||0,lookPeers:turnableSocial,npcs:world.npcs,reducedMotion:reducedMotion.matches});
        heroPrevious={...save.position,time};
        let localPose=null;
        if(localSecond&&!title){
            const identity=localSecond.name+':'+localSecond.appearance+':'+localSecond.seed;
            if(!localActor||localScope!==world||localIdentity!==identity||!localPrevious||time-localPrevious.time>1000||Math.hypot(localSecond.position.x-localPrevious.x,localSecond.position.y-localPrevious.y)>100){
                localActor=createHeroActor(Number(localSecond.seed)||7419);localActor.facing=localSecond.facing||0;localActor.head=[0,4,12,8][localActor.facing];localPrevious={...localSecond.position,time};localScope=world;localIdentity=identity;
            }
            const peers=heroSocialLookPeers(socialActors,{inParty:inParty||!!save.coopRun});
            if(!localFollowing&&!moving)peers.push({id:'hero',...save.position});
            localPose=updateHeroActor(localActor,{id:'local-hero-1',dx:localSecond.position.x-localPrevious.x,dy:localSecond.position.y-localPrevious.y,...localSecond.position,time:t,facing:localSecond.facing||0,lookPeers:peers,npcs:world.npcs,reducedMotion:reducedMotion.matches});
            localPrevious={...localSecond.position,time};
        }else{localActor=null;localPrevious=null;}
        // 坐骑显隐只影响漫游场景；renderBattle 直接用原 save，战斗中坐骑恒显示。
        const visualSave=sceneMountSave(earthBoatAt(world,save.position.x,save.position.y)?{...save,mountId:null}:save,{inParty:inParty||socialActors.some(actor=>actor.inParty)});
        const style=motionStyle(visualSave,membership);style.pose={...style.pose,facing:heroPose.facing,visualHead:heroPose.head,visualBreath:{...heroPose.breath}};
        const motion=motionTrail.step(save.position,time,style,{moving,scope:world,reducedMotion:reducedMotion.matches,hidden:!graphics.trails||title||motionHidden||!!fishingPose||!!teleportEffect});
        const star=starFollower.step(starAnchor({...visualSave,facing:heroPose.facing},t,moving),time,{enabled:starCompanionVisible(save,motion.style,{title,motionHidden,fishingPose:!!fishingPose,teleportEffect:!!teleportEffect}),reducedMotion:reducedMotion.matches,scope:world});
        const starLevel=magicStarStatus(membership,Date.now()).level;
        drawMotionTrail(ctx,motion,time,(c,p)=>avatar(c,p.pose,p.x,p.y,p.born/1000,true,1,false));
        viewRect={x:cam.x-200,y:cam.y-50,w:w/cam.scale+400,h:h/cam.scale+280};
        // Query by fixed spawns, expanded to include sprites that wandered into view.
        const monsterRadius=monsterSceneParams(world).territoryRadius,padding=Math.max(320,monsterRadius+110);
        const queryRect={x:cam.x-padding,y:cam.y-padding,w:w/cam.scale+padding*2,h:h/cam.scale+padding*2};
        const nearby=worldView.query(world,queryRect);
        const monsterDt=lastMonsterTime!==null&&time-lastMonsterTime<250?(time-lastMonsterTime)/1000:0;
        lastMonsterTime=time;
        const viewport={x:cam.x,y:cam.y,w:w/cam.scale,h:h/cam.scale};
        let objects=[];const scenery=[];
        const monsterWorld=world.isEarth?{...world,earthBoating:false}:world;
        for(const o of nearby){
            if(world.isEarth&&(o.x<queryRect.x||o.x>queryRect.x+queryRect.w||o.y<queryRect.y||o.y>queryRect.y+queryRect.h))continue;
            if(o.kind==='tree'&&world.isEarth&&world.earthDecorationBaked?.(o))continue;
            if(o.kind!=='mob'){scenery.push(o);continue;}
            stepMonsterWander(world,o,monsterDt,viewport,{enabled:!title&&!motionHidden,ambient:!reducedMotion.matches,hero:save.position,canWalk:(x,y)=>walkable(monsterWorld,x,y)});
            const warning=!title&&!motionHidden&&monsterTerritoryWarning(world,o,save.position);
            if(warning){
                drawMonsterTerritory(ctx,o,save.position,monsterSceneParams(world),t,reducedMotion.matches);
            }
            if(!o.hidden)for(const pose of monsterScenePositions(world,o))objects.push({...o,...pose,monsterIds:null,groupSize:o.monsterIds?.length||1});
        }
        objects.push({...save.position,kind:'hero'});
        if(localSecond&&!title)objects.push({...localSecond.position,kind:'local-player',save:localSecond});
        const petId=selectCompanionId(save,assets.content);
        if(petId&&!petScene){
            if(!companion||companionId!==petId||companionWorld!==world||companionSave!==save){
                companion=createCompanion(world,save.position,`${save.seed}:${world.zone}:${petId}`);
                companionId=petId;companionWorld=world;companionSave=save;lastPetTime=time;
            }
            stepCompanion(companion,world,save.position,(time-lastPetTime)/1000,{deferSearch:coldTiles>0,inParty,...islandCompanionNavigation.options(companion,world,()=>companionWorld===world&&companionSave===save)});
            if(!gatheringPets.some(row=>row.pet.id===petId))objects.push({...companion.position,kind:'pet'});
        }else companion=petScene?.pets.find(row=>row.pet.id===petId)||null;
        lastPetTime=time;
        const liveSocial=new Set();
        const lookables=[{id:'hero',x:save.position.x,y:save.position.y,moving},...(localSecond&&!title?[{id:'local-hero-1',...localSecond.position,moving:localSecondMoving}]:[]),...socialActors.map(a=>({id:a.profile.id,x:a.position.x,y:a.position.y,moving:!!a.moving}))];
        for(const actor of socialActors){
            liveSocial.add(actor.profile.id);
            const onScreen=actor.position.x>=viewRect.x&&actor.position.x<=viewRect.x+viewRect.w&&actor.position.y>=viewRect.y&&actor.position.y<=viewRect.y+viewRect.h;
            let fx=socialFx.get(actor.profile.id);
            const petSpecies=selectSocialPetId(actor.profile,assets.content);
            if(!fx||fx.world!==world||fx.petId!==petSpecies){
                const pose=createHeroActor(hashSeed(actor.profile.id));pose.facing=actor.facing;pose.head=[0,4,12,8][pose.facing];
                fx={petId:petSpecies,world,companion:createCompanion(world,actor.position,`${actor.profile.id}:${world.zone}:${petSpecies}`),trail:createMotionTrail(hashSeed(actor.profile.id)),pose,lastPos:{...actor.position},lastTime:time};
                socialFx.set(actor.profile.id,fx);
            }
            const peers=lookables.filter(p=>p.id!==actor.profile.id&&!p.moving);
            const dx=actor.position.x-fx.lastPos.x,dy=actor.position.y-fx.lastPos.y;
            const socialPose=updateHeroActor(fx.pose,{id:actor.profile.id,dx,dy,x:actor.position.x,y:actor.position.y,time:t,facing:actor.facing,lookPeers:peers,npcs:[],reducedMotion:reducedMotion.matches});
            if(!actor.moving&&socialPose.targetId)actor.facing=socialPose.facing;
            fx.lastPos={...actor.position};fx.poseOut=socialPose;
            const socialStyle=motionStyle({school:actor.profile.school,level:actor.profile.level||1,appearance:actor.profile.appearance,headId:actor.profile.headId,bodyId:actor.profile.bodyId,facing:socialPose.facing,mountId:null,equipmentGuids:{},equipmentInstances:[]});
            socialStyle.pose={...socialStyle.pose,facing:socialPose.facing,visualHead:socialPose.head,visualBreath:{...socialPose.breath}};
            const hidden=title||motionHidden||!onScreen;
            if(onScreen&&!title&&!petScene){
                stepCompanion(fx.companion,world,actor.position,(time-fx.lastTime)/1000,{deferSearch:coldTiles>0,inParty:!!actor.inParty,...islandCompanionNavigation.options(fx.companion,world,()=>socialFx.get(actor.profile.id)===fx)});
                objects.push({...fx.companion.position,kind:'social-pet',fx,actor});
            }
            const socialMotion=fx.trail.step(actor.position,time,socialStyle,{moving:!!actor.moving&&onScreen,scope:world,reducedMotion:reducedMotion.matches,hidden:hidden||!graphics.trails});
            if(!hidden){ctx.save();ctx.globalAlpha*=actor.sceneOpacity??1;drawMotionTrail(ctx,socialMotion,time,(c,p)=>avatar(c,{...actor.profile,mountId:null,facing:p.pose?.facing??socialPose.facing},p.x,p.y,p.born/1000,true,1,false));ctx.restore();}
            fx.lastTime=time;fx.motion=socialMotion;
            objects.push({...actor.position,kind:'social',actor,fx,onScreen});
        }
        for(const id of socialFx.keys())if(!liveSocial.has(id))socialFx.delete(id);
        if(petScene&&!title){for(const row of petScene.pets)if(!gatheringPets.some(job=>job.pet.id===row.pet.id))objects.push({...row.position,kind:'pet-social',row});for(const pet of petScene.babies)objects.push({...pet.birth.anchor,kind:'pet-social',row:{pet,position:pet.birth.anchor,scale:petDisplayScale(pet,assets.content)}});}
        if(world.dungeon?.scene.streetscape)objects.push(...streetPainter.objects(world,viewport,time,save.position,reducedMotion.matches));
        if(!title&&!motionHidden)for(const row of gatheringPets)objects.push({...row.position,kind:'pet-social',row:{...row,scale:petDisplayScale(row.pet,assets.content)}});
        objects=mergeSceneObjects(scenery,objects);
        const streetFocus=world.dungeon?.scene.streetscape?[...world.npcs,...streetPainter.people()].filter(n=>Math.hypot(n.x-save.position.x,n.y-save.position.y)<120):[];
        mark('earth-render-actors');
        const islandCache=!world.isEarth&&!world.isCityDungeon;
        if(islandCache)islandScenery.begin(world,assets.environmentArt?.images?.trees||assets.images?.get('sprites'),cam.scale*dpr);
        else islandScenery.clear();
        for(let objectIndex=0;objectIndex<objects.length;objectIndex++) {
            const o=objects[objectIndex];
            if(o.hidden)continue;
            if(o.kind.startsWith('street')){streetPainter.draw(ctx,o,save.position,streetFocus);continue;}
            if(o.x<cam.x-200||o.x>cam.x+w/cam.scale+200||o.y<cam.y-50||o.y>cam.y+h/cam.scale+230)continue;
            if(islandCache&&o.kind==='tree'){const end=islandScenery.draw(ctx,objects,objectIndex,save.position,viewport);if(end>objectIndex){objectIndex=end-1;continue;}}
            if(o.kind==='pet-social'){ctx.save();ctx.globalAlpha*=o.row.sceneOpacity??1;drawSocialPet(ctx,assets,o.row,petScene?.effects||[],time,reducedMotion.matches,petScene?.now);ctx.restore();}
            if(o.kind==='tree'){ctx.save();if(Math.abs(save.position.x-o.x)<o.size*.4&&save.position.y<o.y&&save.position.y>o.y-o.size*.85)ctx.globalAlpha=.52;const winter=(world.isEarth&&world.drawEarthDecoration?.(ctx,o))||o.snow&&assets.environmentArt?.draw(ctx,'trees',['spruce','pine','fir','oldPine'][(Math.round(o.x)+Math.round(o.y))%4],o.x-o.size/2,o.y-o.size+10,o.size,o.size);if(!winter&&!world.isEarth)assets.tile(ctx,'sprites',o.tile,o.x-o.size/2,o.y-o.size+10,o.size,o.size);ctx.restore();}
            // Stable plant variants add visual detail without changing collision or RNG.
            if(o.kind==='tree'&&!world.isEarth&&!o.snow&&assets.sceneryTile){
                const variant=Math.abs(Math.round(o.x*7+o.y*13))%8,size=o.size*.36;
                assets.sceneryTile(ctx,8+variant,o.x+o.size*.18,o.y-size+14,size,size);
            }
            if(o.kind==='building'){
                ctx.save();
                if(o.atlas&&Math.abs(save.position.x-o.x)<o.w*.5&&save.position.y<o.y&&save.position.y>o.y-o.h)ctx.globalAlpha=.52;
                const bob=o.frame==='boat'&&!reducedMotion.matches?Math.sin(t*1.4+o.x)*2:0;
                const drawn=world.isEarth?world.drawEarthBuilding?.(ctx,o):o.atlas&&assets.buildingArt?.draw(ctx,o.atlas,o.frame,o.x-o.w/2,o.y-o.h+bob,o.w,o.h);
                if(!drawn&&!o.decorationOnly&&!world.isEarth)assets.tile(ctx,'sprites',o.tile,o.x-o.w/2,o.y-o.h,o.w,o.h);
                ctx.restore();
            }
            if(o.kind==='landmark'){
                if(o.dungeonId&&!o.cityDungeon)drawDungeonEntrance(ctx,o,t,reducedMotion.matches,assets.entranceArt);else if(o.cityHotspot&&!o.streetArt)drawCityHotspot(ctx,o);else if(!world.isEarth&&!o.cityDungeon&&!o.streetArt)drawSignpost(ctx,o.name,o.x,o.y);
                if(o.cityDungeon&&!world.isEarth){const art=cityEntranceAppearance(o.cityLevel,o.cityNodeEntrance);plate(ctx,o.name,o.x,o.y-art.h/2-17,{...PLATE.place,text:art.color});}
                else if(!world.isEarth&&o.cityHotspot)plate(ctx,o.name,o.x,o.y+32);
            }
            if(o.kind==='npc') {
                shadow(ctx,o.x,o.y,25);const dragon=[36211,30112].includes(o.id),sw=dragon?100:64,sh=dragon?104:86;
                const character=npcCharacter(o,assets.hero?.manifest,world.isCityDungeon===true);
                if(character)avatar(ctx,{...character,facing:o.facing||0},o.x,o.y,t,false,1,false);
                else if(!assets.draw(ctx,o.portrait,o.x-sw/2,o.y-sh+Math.sin(t*1.6+o.id)*1.5,sw,sh,true,false)){
                    ellipse(ctx,o.x,o.y-27,19,28,'#668b76');ellipse(ctx,o.x,o.y-65,14,16,'#efd6ad');
                }
                plate(ctx,o.name,o.x,o.y+19,PLATE.npc);
                const marker=o.earthNpc?earthCityNpcMarker(save,world.city,o.id):markerFor(o.id);
                if(marker){text(ctx,marker,o.x,o.y-sh-8+Math.sin(t*3)*3,29,'#fff1a3');}
            }
            if(o.kind==='mob') {
                ctx.save();ctx.globalAlpha*=o.sceneState?.opacity??1;
                const m=o.monster||assets.content.monsters[o.monsterId]||{name:'缺失怪物'};
                monster(ctx,m,o.x,o.y,t,o.scale,o);
                if(o.index===0)plate(ctx,tr(m.name)+(o.monster?` · ${m.level}级`:'')+(o.groupSize>1?` · ${tr(`${o.groupSize}只`)}`:'')+(o.blocked?.length?` · ${tr('待迁移')}`:''),o.x,o.y+18,PLATE.mob);
                const q=currentQuest(save,assets.content),goal=q&&questProgress(save,q).find(g=>g.kind==='defeat'&&g.id===m.goalId&&g.value<g.count);
                const trackedMob=(o.monsterIds||[o.monsterId]).some(id=>catalogTracksMonster(save,assets.content,assets.content.monsters[id]));
                if(o.mode==='warning'){
                    const progress=1-o.alertRemaining/o.alertDuration;
                    const pop=reducedMotion.matches?1:.8+Math.min(1,progress*6)*.2+Math.sin(progress*Math.PI*4)*.06;
                    ctx.save();ctx.translate(o.x,o.y-104*o.scale-22);ctx.scale(pop,pop);
                    ellipse(ctx,0,0,13,13,'#fff4ce');ctx.strokeStyle='#a43b2a';ctx.lineWidth=1.5;
                    ctx.beginPath();ctx.arc(0,0,13,0,TAU);ctx.stroke();
                    ctx.strokeStyle='#ff7953';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,17,-Math.PI/2,-Math.PI/2+TAU*progress);ctx.stroke();
                    text(ctx,'!',0,7,23,'#a43b2a');ctx.restore();
                }else if((goal&&questState(save,q.id).accepted)||trackedMob)text(ctx,'◇',o.x,o.y-90+Math.sin(t*3)*3,25,'#fff2a9');
                ctx.restore();
            }
            if(o.kind==='social'){
                const a=o.actor,p=a.profile,fx=o.fx,pose=fx?.poseOut;
                const gesturePose=socialGesturePose(socialGesture,p.id,gestureAt,reducedMotion.matches);
                ctx.save();ctx.globalAlpha*=a.sceneOpacity??1;ctx.translate(0,-(gesturePose?.hop||0));
                if(graphics.trails&&fx?.motion&&!title&&!motionHidden)drawMotionAccessory(ctx,fx.motion,o,time,reducedMotion.matches);
                const onBoat=drawEarthBoatRider(ctx,assets,world,o,a.facing,(x,y)=>avatar(ctx,{...p,mountId:null,facing:a.facing},x,y,0,false,1,false,earthBoatRiderPose(pose,a.facing)));
                const nameY=onBoat?o.y+32:avatar(ctx,{...p,mountId:null,facing:pose?.facing??a.facing},o.x,o.y,t,a.moving,1,false,pose||null);
                if(graphics.trails&&fx?.motion&&!title&&!motionHidden)drawMotionAccessory(ctx,fx.motion,o,time,reducedMotion.matches,true);
                plate(ctx,`${tr(p.name)} · ${tr(p.native==='zh'?'中文':'英语')}`,o.x,nameY+16,PLATE.social);
                if(gesturePose){const head=socialHeadAnchor(o);text(ctx,gesturePose.icon,head.x,head.y+9,27,'#fff');}ctx.restore();
            }
            if(o.kind==='social-pet'){
                const fx=o.fx,id=fx.petId,pet=fx.companion;
                const hop=reducedMotion.matches?0:pet.moving?Math.abs(Math.sin(pet.phase))*5:Math.sin(t*2.5)*1.5;
                ctx.save();ctx.globalAlpha*=o.actor.sceneOpacity??1;shadow(ctx,o.x,o.y,18);ctx.translate(o.x,o.y);ctx.scale(pet.facing,1);
                const drawn=assets.content.pets?.[id]?.art&&assets.drawPet(ctx,id,0,-32,-60-hop,64,64);
                if(!drawn)creature(ctx,'pet',0,-hop,t,.36,false);
                ctx.restore();
            }
            if(o.kind==='local-player'){
                const pose=socialGesturePose(socialGesture,'local-hero-1',gestureAt,reducedMotion.matches);ctx.save();ctx.translate(0,-(pose?.hop||0));
                const peerVisualSave=sceneMountSave(earthBoatAt(world,o.x,o.y)?{...o.save,mountId:null}:o.save,{inParty:inParty||socialActors.some(actor=>actor.inParty)});
                const onBoat=drawEarthBoatRider(ctx,assets,world,o,localPose.facing,(x,y)=>avatar(ctx,{...peerVisualSave,mountId:null,facing:localPose.facing},x,y,0,false,1,true,earthBoatRiderPose(localPose,localPose.facing)));
                if(!onBoat)avatar(ctx,{...peerVisualSave,facing:localPose.facing},o.x,o.y,t,localSecondMoving||localPose.moving,1,true,localPose);plate(ctx,o.save.name,o.x,o.y+(onBoat?50:20),PLATE.hero);
                if(pose){const head=socialHeadAnchor(o);text(ctx,pose.icon,head.x,head.y+9,27,'#fff');}ctx.restore();
            }
            if(o.kind==='hero'){
                const gesturePose=socialGesturePose(socialGesture,'hero',gestureAt,reducedMotion.matches);
                ctx.save();ctx.translate(0,-(gesturePose?.hop||0));
                if(!star.front)drawMagicStar(ctx,star,assets,starLevel);
                if(graphics.trails)circleRune(ctx,o.x,o.y+2,24,t,'#f7e6a088');
                let nameY;
                if(drawEarthBoatRider(ctx,assets,world,o,save.facing||0,(x,y)=>avatar(ctx,{...visualSave,mountId:null,facing:save.facing||0},x,y,0,false,1,true,earthBoatRiderPose(heroPose,save.facing||0)))){
                    nameY=o.y+50;
                }else if(fishingPose){
                    // A temporary standing pose, without changing the saved mount or facing.
                    ctx.save();ctx.translate(o.x,o.y-fishingPose.lift);ctx.rotate(fishingPose.lean);
                    avatar(ctx,{...save,mountId:null,facing:fishingPose.facing},0,0,t,false);ctx.restore();
                    nameY=o.y+21;
                }else{
                    if(graphics.trails&&!title&&!motionHidden&&!teleportEffect)drawMotionAccessory(ctx,motion,o,time,reducedMotion.matches);
                    const heroBottom=avatar(ctx,{...visualSave,facing:heroPose.facing},o.x,o.y,t,moving,1,true,heroPose);
                    if(graphics.trails&&!title&&!motionHidden&&!teleportEffect)drawMotionAccessory(ctx,motion,o,time,reducedMotion.matches,true);
                    nameY=heroBottom+21;
                }
                if(star.front)drawMagicStar(ctx,star,assets,starLevel);
                if(!title)plate(ctx,save.name,o.x,nameY,PLATE.hero);
                if(gesturePose){const head=socialHeadAnchor(o);text(ctx,gesturePose.icon,head.x,head.y+9,27,'#fff');}ctx.restore();
            }
            if(o.kind==='pet'){
                const pet=save.pets?.[petId],id=pet?.speciesId||petId;
                const hop=reducedMotion.matches?0:companion.moving?Math.abs(Math.sin(companion.phase))*5:Math.sin(t*2.5)*1.5;
                shadow(ctx,o.x,o.y,18);ctx.save();ctx.translate(o.x,o.y);ctx.scale(companion.facing,1);
                // Pet sheets load lazily: keep the follower visible until its sheet is ready,
                // including after a failed request. Mount rendering is independent of this pet.
                const drawn=assets.content.pets?.[id]?.art&&assets.drawPet(ctx,id,pet?petAppearanceStage(pet,assets.content):0,-32,-60-hop,64,64);
                if(!drawn)creature(ctx,'pet',0,-hop,t,.36,false);
                ctx.restore();
            }
        }
        mark('earth-render-objects');
        if(petScene&&!title)drawPetSocialEffects(ctx,assets,objects.filter(o=>o.kind==='pet-social'&&o.x>=cam.x-80&&o.x<=cam.x+w/cam.scale+80&&o.y>=cam.y&&o.y<=cam.y+h/cam.scale+80).map(o=>o.row),petScene.effects,time,reducedMotion.matches,petScene.now);
        if(petScene?.food&&!title){const f=petScene.food;ctx.fillStyle='#b58a55';ctx.beginPath();ctx.ellipse(f.x,f.y,16,7,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#efcc80';for(let i=0;i<5;i++){ctx.beginPath();ctx.arc(f.x-8+i*4,f.y-2-(i%2)*3,3,0,Math.PI*2);ctx.fill();}}
        if(learningGreeting&&!title){
            const g=learningGreeting,at=g.npc;
            const maxWidth=Math.min(260,(w-24)/cam.scale),lines=[];
            ctx.font='600 14px "Microsoft YaHei", sans-serif';
            for(const value of [g.text,g.translation].filter(Boolean)){
                let line='';for(const ch of value){if(ctx.measureText(line+ch).width>maxWidth-24&&line){lines.push(line);line='';}line+=ch;}if(line)lines.push(line);
            }
            const height=lines.length*21+20;
            const left=Math.max(cam.x+12/cam.scale,Math.min(at.x-maxWidth/2,cam.x+w/cam.scale-maxWidth-12/cam.scale));
            const top=Math.max(cam.y+12/cam.scale,at.y-125-height);
            greetingTarget={x:left,y:top,w:maxWidth,h:height};
            ctx.fillStyle='#fffbe9';ctx.strokeStyle='#7a6335';ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(left,top,maxWidth,height,10);ctx.fill();ctx.stroke();
            ctx.fillStyle='#493a23';ctx.textAlign='left';lines.forEach((line,i)=>ctx.fillText(line,left+12,top+23+i*21));
            const head=starAnchor(visualSave,t,false);
            drawSpeechBubble(ctx,{x:head.x,y:head.y+50},t,true);
        }
        const partnerBubbles=localSecond?localSocialBubbles(socialActors,[save.position,localSecond.position],{gesture:socialGesture,at:gestureAt}):[socialBubble(socialActors,save.position,{gesture:socialGesture,at:gestureAt,inParty:inParty||!!save.coopRun})].filter(Boolean);
        const nearbyPartnerBubble=partnerBubbles[0];
        if(!title&&!motionHidden){for(const b of partnerBubbles){
            ctx.save();ctx.fillStyle='#fffbe9';ctx.strokeStyle='#7a6335';ctx.lineWidth=1.5;
            ctx.shadowColor='#173b3655';ctx.shadowBlur=4;ctx.beginPath();ctx.roundRect(b.x,b.y,b.w,b.h,10);ctx.fill();ctx.stroke();ctx.shadowBlur=0;
            ctx.beginPath();ctx.moveTo(b.x+15,b.y+b.h-1);ctx.lineTo(b.x+20,b.y+b.h+6);ctx.lineTo(b.x+25,b.y+b.h-1);ctx.fill();ctx.stroke();
            ctx.fillStyle='#7a6335';for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(b.x+12+i*8,b.y+15,2,0,TAU);ctx.fill();}ctx.restore();
        }}
        // Resolve the invited resident, never the player's follower, including duplicate NPC instances.
        const invitedNpc=companionBubble&&world.npcs.find(n=>!n.hidden&&(companionBubble.instanceId?n.instanceId===companionBubble.instanceId:String(n.id)===String(companionBubble.npcId)));
        if(invitedNpc&&!title&&!motionHidden&&!nearbyPartnerBubble&&!socialGesturePose(socialGesture,'hero',gestureAt)
            &&!markerFor(invitedNpc.id)&&!npcHasActiveQuest(save,assets.content,invitedNpc.id)){
            const height=[36211,30112].includes(invitedNpc.id)?104:86;
            bubbleTarget=drawSpeechBubble(ctx,{x:invitedNpc.x,y:invitedNpc.y-height+56},t,reducedMotion.matches);
        }
        if(!world.portal.hidden)plate(ctx,world.portal.name,world.portal.x,world.portal.y+48);
        if(world.entrancePortal)plate(ctx,world.entrancePortal.name,world.entrancePortal.x,world.entrancePortal.y+48);
        if(!title)drawRewardEffect(ctx,save.position.x,save.position.y,rewardEffect,reducedMotion.matches);
        if(!title)drawTeleportEffect(ctx,teleportEffect,time,reducedMotion.matches);
        dungeonFog(ctx,world,save.position,{x:cam.x,y:cam.y,w:w/cam.scale,h:h/cam.scale},cam.scale,save.dungeonExploration?.[world.zone]);
        } finally {ctx.restore();}
        earthEnvironment.tint(ctx,w,h);
        earthEnvironment.nightLights(ctx,world,cam,w,h,{enabled:!graphics.low});
        earthEnvironment.weather(ctx,cam,w,h,weatherTime,{enabled:graphics.particles,reducedMotion:reducedMotion.matches,low:graphics.low});
        const liveWeather=graphics.particles?(weatherOverride||world.layout&&regionAt(world,save.position)?.weather||null):null;
        if(!graphics.particles)weatherFade=null;
        weatherFade=stepWeatherFade(weatherFade,liveWeather,weatherTime,!!weatherOverride);
        const paintWeather=(weather,opacity)=>weather&&opacity>0.01&&drawIslandWeather(ctx,world,save.position,weatherTime/1000,w,h,reducedMotion.matches,assets.environmentArt,weather,cam,opacity);
        paintWeather(weatherFade.previous,weatherFade.previousWeight);
        paintWeather(weatherFade.weather,weatherFade.weight);
        if(!vignetteCanvas||vignetteW!==w||vignetteH!==h){
            vignetteW=w;vignetteH=h;vignetteCanvas=document.createElement('canvas');vignetteCanvas.width=Math.max(1,w);vignetteCanvas.height=Math.max(1,h);
            const g=vignetteCanvas.getContext('2d'),vignette=g.createRadialGradient(w*.5,h*.5,h*.15,w*.5,h*.5,Math.max(w,h)*.68);
            vignette.addColorStop(0,'transparent');vignette.addColorStop(1,'#113b4b66');g.fillStyle=vignette;g.fillRect(0,0,w,h);
        }
        ctx.drawImage(vignetteCanvas,0,0,w,h);
        mark('earth-render-overlay');
        if(world.isEarth&&!title){
            // Screen-size labels stay readable at every scene zoom, above scenery.
            const seen=new Set(),placed=[];
            const actors=[save.position,...socialActors.map(a=>a.position),...world.npcs.filter(n=>!n.hidden)].map(p=>({x:(p.x-cam.x)*cam.scale,y:(p.y-cam.y)*cam.scale}));
            ctx.save();ctx.font='600 12px "PingFang SC", sans-serif';
            const landmarks=(world.landmarks||[]).filter(p=>!p.hidden);
            // A city marker can snap to nearby land; deduplicate by its source ID,
            // not coordinates, and label the final entrance position only.
            const cities=(world.mapCities||[]).filter(city=>!landmarks.some(p=>p.id===`city:${city.id}`||p.cityFallback?.id===city.id||p.id===`city:${world.city?.id}:entrance`&&city.name===world.city?.name));
            for(const place of [...landmarks,...cities]){
                const key=`${place.name}:${Math.round(place.x)}:${Math.round(place.y)}`;if(seen.has(key))continue;seen.add(key);
                const x=(place.x-cam.x)*cam.scale,y=(place.y-cam.y)*cam.scale;
                if(x<12||x>w-12||y<20||y>h-20)continue;
                const width=ctx.measureText(tr(place.name)).width+20;
                const left=Math.max(width/2+8,Math.min(w-width/2-8,x));
                for(const offset of [-28,32,-100,64]){
                    const top=y+offset,box={x:left-width/2,y:top-14,w:width,h:23};
                    if(box.y<8||box.y+box.h>h-8||placed.some(b=>box.x<b.x+b.w+6&&box.x+box.w+6>b.x&&box.y<b.y+b.h+6&&box.y+box.h+6>b.y)||actors.some(a=>box.x<a.x+30&&box.x+box.w>a.x-30&&box.y<a.y+24&&box.y+box.h>a.y-90*cam.scale))continue;
                    const style=place.cityDungeon?{...PLATE.place,text:cityEntranceAppearance(place.cityLevel,place.cityNodeEntrance).color}:PLATE.place;
                    plate(ctx,place.name,left,top,style);placed.push(box);break;
                }
            }
            ctx.restore();
        }
        const meter=frameMeter.sample(time,!title&&!motionHidden);
        if(!title&&!motionHidden){
            ctx.save();ctx.font='600 12px monospace';ctx.textAlign='left';ctx.fillStyle='#17332ddd';
            ctx.fillRect(8,h-30,156,22);ctx.fillStyle='#e7f3dd';
            ctx.fillText(meter?`FPS ${meter.fps} · ${meter.ms.toFixed(1)} ms`:'FPS —',14,h-15);ctx.restore();
        }
    }
    function minimap(target,world,save,{labels=true,bounds=null,simple=false,mapData=null,showPlayer=true,atlasPreview=false}={}) {
        const markerFor=markerCache.forState(save,assets.content,world);
        const c=target.getContext('2d'),w=target.width,h=target.height;c.clearRect(0,0,w,h);c.fillStyle='#6ba7a2';if(!atlasPreview)c.fillRect(0,0,w,h);
        if(world.isEarth){
            if(simple&&bounds){
                const colors={ocean:'#438b9b',water:'#72acb7',forest:'#7c9d69',grass:'#b4c68a',urban:'#d6c59d',desert:'#d9c68e',snow:'#e5e8db',mountain:'#a49d85'},cells=64;
                for(let row=0;row<cells;row++)for(let col=0;col<cells;col++){
                    c.fillStyle=colors[(mapData?.terrainAt||world.terrainAt)(bounds.x+(col+.5)/cells*bounds.w,bounds.y+(row+.5)/cells*bounds.h)]||'#a4aaa0';
                    c.fillRect(col*w/cells,row*h/cells,Math.ceil(w/cells),Math.ceil(h/cells));
                }
                c.save();c.beginPath();c.rect(0,0,w,h);c.clip();c.lineCap='round';c.lineJoin='round';
                for(const [color,width] of [['#9a8d6d',5],['#f4e8bf',3]]){c.strokeStyle=color;c.lineWidth=width;c.beginPath();for(const road of mapData?.paths||world.paths){c.moveTo((road.a.x-bounds.x)/bounds.w*w,(road.a.y-bounds.y)/bounds.h*h);c.lineTo((road.b.x-bounds.x)/bounds.w*w,(road.b.y-bounds.y)/bounds.h*h);}c.stroke();}
                c.restore();const x=(save.position.x-bounds.x)/bounds.w*w,y=(save.position.y-bounds.y)/bounds.h*h;ellipse(c,x,y,5,5,'#fff');ellipse(c,x,y,3,3,'#205c99');return;
            }
            const size=world.earthRules.chunkSize*2,scale=w/size,rect={x:save.position.x-size/2,y:save.position.y-h/scale/2,w:size,h:h/scale};
            c.save();c.scale(scale,scale);c.translate(-rect.x,-rect.y);world.terrainPainter(c,world,rect);
            for(const n of world.npcs)ellipse(c,n.x,n.y,18,18,'#ffe89c');
            c.restore();ellipse(c,w/2,h/2,4,4,'#fff');ellipse(c,w/2,h/2,2,2,'#205c99');return;
        }
        const sx=w/world.w,sy=h/world.h;c.save();c.scale(sx,sy);if(atlasPreview&&world.layout?.coast?.length){c.beginPath();for(const [i,p]of world.layout.coast.entries()){if(i===0)c.moveTo(p[0],p[1]);else c.lineTo(p[0],p[1]);}c.closePath();c.clip();}if(world.dungeon?.scene.streetscape)paintStreetGround(c,world.dungeon.scene.streetscape,{x:0,y:0,w:world.w,h:world.h});else if(world.isCityDungeon)drawCityScene(c,world);else c.drawImage(ground(world),0,0,world.w,world.h);
        for(const b of world.buildings){c.fillStyle='#627b83';c.fillRect(b.x-45,b.y-60,90,65);}
        for(const n of world.npcs)ellipse(c,n.x,n.y,markerFor(n.id)?22:13,markerFor(n.id)?22:13,markerFor(n.id)?'#ffe89c':'#f6f3d9');
        for(const e of world.landmarks||[])if(e.dungeonId){ellipse(c,e.x,e.y,30,30,e.entranceKind==='tower'?'#f8dc80':'#67dfff');}
        if(!atlasPreview)mapFog(c,world,save.position,{x:0,y:0,w:world.w,h:world.h},Math.max(sx,sy),save.dungeonExploration?.[world.zone]);
        if(showPlayer){ellipse(c,save.position.x,save.position.y,25,25,'#184f73');ellipse(c,save.position.x,save.position.y,13,13,'#fff');}c.restore();
        if(world.layout){
            if(labels&&!world.layout.route)for(const r of world.layout.regions){ellipse(c,r.x*sx,r.y*sy,3,3,'#fff3c3');text(c,r.name,r.x*sx,r.y*sy-9,11,'#25483b');}
            if(showPlayer){ellipse(c,save.position.x*sx,save.position.y*sy,5,5,'#fff');ellipse(c,save.position.x*sx,save.position.y*sy,3,3,'#205c99');}
        }
    }
    function screenToWorld(x,y){return{x:x/cam.scale+cam.x,y:y/cam.scale+cam.y};}
    function renderBattle(target,battle,save,time,presentation) {
        const c=target.getContext('2d'),pixelWidth=target.clientWidth,pixelHeight=target.clientHeight,dpr=Math.min(2,devicePixelRatio||1);
        if(!pixelWidth||!pixelHeight)return {};
        const scale=Math.min(1,pixelHeight/270),w=pixelWidth/scale,h=pixelHeight/scale;
        if(target.width!==Math.round(pixelWidth*dpr)||target.height!==Math.round(pixelHeight*dpr)){target.width=Math.round(pixelWidth*dpr);target.height=Math.round(pixelHeight*dpr);}
        c.setTransform(dpr*scale,0,0,dpr*scale,0,0);c.clearRect(0,0,w,h);
        const t=time/1000,cx=w/2,cy=h*.52,r=Math.min(w*.46,h*.76);
        const haze=c.createRadialGradient(cx,cy,20,cx,cy,r*1.5);haze.addColorStop(0,'#527e7166');haze.addColorStop(1,'transparent');c.fillStyle=haze;c.fillRect(0,0,w,h);
        ellipse(c,cx,cy+18,r+24,r*.56+10,'#112f3c99');ellipse(c,cx,cy,r,r*.54,'#809580');ellipse(c,cx,cy-4,r-9,r*.51,'#c5c4a4');
        circleRune(c,cx,cy-2,r-18,t,'#ebdfaf');circleRune(c,cx,cy-2,r*.62,-t,'#7e9a90');
        // Runes, actor feet and targeting share the same ellipse coordinates.
        const slotPoint=(side,slot)=>{const a=([-155,-110,155,110][slot%4])*Math.PI/180;return{x:cx+Math.cos(a)*r*.76*(side==='near'?1:-1),y:cy+Math.sin(a)*r*.39};};
        for(const side of ['near','far'])for(let slot=0;slot<4;slot++){const at=slotPoint(side,slot);circleRune(c,at.x,at.y,19,t*.2,'#f2e6b677');}
        const ev=presentation?.event,p=presentation?.progress||0,positions={};
        const aura=presentation&&Object.hasOwn(presentation,'aura')?presentation.aura:battle.aura;
        if(aura?.cardKey)effects.drawEnvironment(c,{card:battle.resolved.cards[aura.cardKey],center:{x:cx,y:cy-2},radius:r,time:t,reducedMotion:reducedMotion.matches});
        for(const side of ['near','far'])for(const [i,unit] of battle.sides[side].entries())positions[unit.id]=slotPoint(side,unit.slot??i);
        const pointer=presentation?.pointer||{to:nextBattlePointer(battle)};
        if(!battle.finished||presentation)drawBattlePointer(c,{center:{x:cx,y:cy},radius:r,from:positions[pointer.from],to:positions[pointer.to],progress:pointer.progress,reduced:reducedMotion.matches});
        const actorBounds={},speechAnchors={};
        for(const id of Object.keys(battle.unitsById)) {
            const bounds=actorBounds[id]={};
            const hp=presentation?.hp?.[id]??battle.unitsById[id].hp;
            const hit=presentation?.reactions?.find(reaction=>reaction.target===id);
            const unit=battle.unitsById[id],petUnit=id!=='hero'&&!unit.arenaProfile&&!unit.isMob&&!save.coopRun?.members.some(m=>m.unit.id===id);
            const pose=petUnit&&hp<=0?{action:'idle',progress:0}:hp>0&&hit?{action:'hit',progress:hit.progress}:battleActorAction(id,hp,ev,p);
            if(hp>0)drawPetTraitHalo(c,unit.passiveTraits,positions[id].x,positions[id].y,38);
            drawAnimatedActor(c,positions[id],pose.action,pose.progress,id==='hero'?1:-1,reducedMotion.matches,()=>{
                if(id==='hero'){avatar(c,{...save,facing:2},0,0,t,false,BATTLE_HERO_SCALE,false,updateHeroActor(battleHero,{time:t,facing:2,reducedMotion:reducedMotion.matches}),bounds);const supportId=save.formation?.[save.heroSlot],support=save.pets?.[supportId];if((!battle.redMushroom||presentation?.showSupportPet)&&support&&assets.content.pets[support.speciesId]?.art)(()=>{c.save();c.translate(36,0);drawPetMood(c,petBattleMood(hp,unit.maxHp,assets.content),time,reducedMotion.matches,48,column=>assets.drawPet(c,support.speciesId,petAppearanceStage(support,assets.content),-24,-48,48,48,column));c.restore();})();}
                else if(unit.arenaProfile){avatar(c,{...unit.arenaProfile,facing:unit.side==='far'?1:2},0,0,t,false,BATTLE_HERO_SCALE,false,null,bounds);}
                else if(save.coopRun?.members.some(m=>m.unit.id===id)){const p=save.coopRun.members.find(m=>m.unit.id===id).profile;avatar(c,{...p,mountId:null,facing:2},0,0,t,false,BATTLE_HERO_SCALE,false,null,bounds);}
                else {const unit=battle.unitsById[id],species=unit.speciesId||unit.template?.speciesId;if(unit.isMob)monster(c,unit.template,0,0,t,.95);else if(species&&assets.content.pets[species]?.art)drawPetMood(c,petBattleMood(hp,unit.maxHp,assets.content),time,reducedMotion.matches,84,column=>assets.drawPet(c,species,petAppearanceStage(save.pets?.[unit.id]||save.pets?.[species]||unit,assets.content),-42,-84,84,84,column));else creature(c,unit.isMob?unit.template.id:'pet',0,0,t,.85);}
                if(bounds.speechHead){
                    // Use the actual drawn head, including mount rider offset, recoil and canvas scale.
                    const matrix=c.getTransform(),head=bounds.speechHead;
                    speechAnchors[id]={x:(matrix.a*head.x+matrix.c*head.y+matrix.e)/dpr,y:(matrix.b*head.x+matrix.d*head.y+matrix.f)/dpr};
                }
            });
        }
        const statusTargets=[];
        for(const u of [...battle.sides.near,...battle.sides.far]) {
            const at=positions[u.id],hp=presentation?.hp?.[u.id]??u.hp,bw=Math.min(115,w*.20);
            statusTargets.push(...drawOverheadStatus(c,u,battle,{...at,statusBottom:Number.isFinite(actorBounds[u.id]?.top)?at.y+actorBounds[u.id].top-12:undefined},w,hp,presentation?.status?.[u.id]));
            plate(c,w<650?u.name.slice(0,6):u.name,at.x,at.y+25,u.id==='hero'?PLATE.hero:u.isMob?PLATE.mob:save.coopRun?.members.some(m=>m.unit.id===u.id)?PLATE.social:PLATE.npc,u.school||'balance');c.fillStyle='#173843';c.beginPath();c.roundRect(at.x-bw/2,at.y+38,bw,10,5);c.fill();
            c.fillStyle=u.isMob?'#d39a7a':'#8ccc8a';c.beginPath();c.roundRect(at.x-bw/2+2,at.y+40,Math.max(0,(bw-4)*hp/u.maxHp),6,3);c.fill();
        }
        if(ev?.type==='cast'||ev?.type==='fizzle') {
            effects.draw(c,{card:battle.resolved.cards[ev.card],progress:p,from:positions[ev.caster],to:positions[ev.target]||positions[ev.caster],center:{x:cx,y:cy-2},width:w,height:h,seed:`${ev.round}:${ev.caster}:${ev.card}`,reducedMotion:reducedMotion.matches,failed:ev.type==='fizzle',reflection:ev.label==='reflection',environmentManaged:true});
        }
        if(ev?.type==='damage'||ev?.type==='heal') {
            const at=positions[ev.target];if(at){c.save();c.globalAlpha=1-p*.65;text(c,`${ev.type==='heal'?'+':'−'}${ev.amount}${ev.mark==='c'?' 暴击':''}`,at.x,at.y-100-p*40,26,ev.type==='heal'?'#adf8a0':'#fff0b4');c.restore();}
        }
        if(ev?.type==='fizzle')drawSpellMiss(c,positions[ev.caster],p,reducedMotion.matches);
        for(const u of Object.values(battle.unitsById))drawStatusFeedback(c,(presentation?.statusFeedback||[]).filter(change=>change.id===u.id),positions[u.id],time,reducedMotion.matches,w);
        for(const u of Object.values(battle.unitsById))drawBattlePips(c,positions[u.id],presentation?.pips?.[u.id]??u.pips,{hp:presentation?.hp?.[u.id]??u.hp});
        target.battleTargetRects=battleTargetRects(positions,actorBounds,scale);
        target.battleSpeechAnchors=speechAnchors;
        target.battleStatusRects=statusTargets.map(hit=>({...hit,x:hit.x*scale,y:hit.y*scale,width:hit.width*scale,height:hit.height*scale}));
        target.updateStatusTargets?.(target.battleStatusRects);
        return Object.fromEntries(Object.entries(positions).map(([id,at])=>[id,{x:at.x*scale,y:at.y*scale}]));
    }
    return {prepareScene,frameStats:()=>frameMeter.value,pauseFrameMeter:()=>frameMeter.sample(0,false),environmentStats:()=>earthEnvironment.stats,streetStats:streetPainter.stats,streetPeople:streetPainter.people,terrainStats:()=>({tiles:terrainTiles.size,pending:terrainTiles.pending,scenery:islandScenery.stats()}),resetZoom:()=>cameraZoom.reset(),render,minimap,worldToScreen:point=>({x:(point.x-cam.x)*cam.scale,y:(point.y-cam.y)*cam.scale}),screenToWorld,renderBattle,zoomBy,setFishingCamera:active=>cameraZoom.setFishing(active),viewRect:()=>viewRect?{...viewRect}:null,bubbleTarget:()=>bubbleTarget,greetingTarget:()=>greetingTarget,companionTarget:()=>companion?{x:companion.position.x,y:companion.position.y}:null};
}
