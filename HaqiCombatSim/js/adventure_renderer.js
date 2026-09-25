import { createHeroActor, updateHeroActor } from './hero_pose_core.js';
import { paintSoftShadow, paintStaticShadows } from './adventure_shadows.js';
import { createMotionTrail, motionStyle, drawMotionTrail, drawMotionAccessory } from './adventure_motion_effects.js';
import { createStarFollower } from './adventure_star_motion_core.js';
import { drawMagicStar, starCompanionVisible } from './adventure_star.js';
import { magicStarStatus } from './adventure_magic_star_core.js';
import { drawIslandWeather, stepWeatherFade } from './adventure_weather.js';
import { createCameraZoom } from './adventure_camera_core.js';
import { regionAt } from './adventure_island_layout_core.js';
import { drawRewardEffect } from './view_adventure_rewards.js';
import { drawOverheadStatus } from './view_adventure_overhead_status.js';
import { drawTeleportEffect } from './view_adventure_teleport.js';
import { petAppearanceStage } from './adventure_pets_core.js';
import { resolveMountDrawPose } from './adventure_mounts_core.js';
import { createCompanion, stepCompanion, selectCompanionId } from './adventure_companion_core.js';
// Canvas presentation only. Visual motion uses time/seeded map decorations, never gameplay RNG.
import { createSpellEffects } from './spell_effects.js';
import { drawAnimatedActor } from './actor_animation.js';
import { battleActorAction } from './actor_animation_core.js';
import { drawBattlePointer } from './battle_pointer.js';
import { nextBattlePointer } from './battle_pointer_core.js';
import { currentQuest,questReady,questState,questProgress,SCHOOL_NAMES,catalogStatSnapshot } from './adventure_core.js';
import {catalogNpcMarker,catalogTracksMonster,trackedQuestIds} from './adventure_catalog_quests_core.js';
import { onIsland,distance,nearbyWorldObjects } from './adventure_world_core.js';
import { OCEAN_COLOR, paintTerrain } from './adventure_terrain.js';
import { tr } from './locale_runtime.js';
import { createSignpostPainter } from './adventure_signposts.js';
import { paintLargeTerrain,createTerrainTileCache } from './adventure_large_terrain.js';
export const COLORS={fire:'#e98f44',ice:'#6ecbdc',storm:'#b39aea',life:'#84bd59',death:'#a887c7'};
const TAU=Math.PI*2;
function ellipse(c,x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fill();}
function text(c,value,x,y,size=13,color='#fff',align='center') {const shown=tr(value);c.font=`600 ${size}px "PingFang SC", "Microsoft YaHei", sans-serif`;c.textAlign=align;c.fillStyle=color;c.fillText(shown,x,y);}
const PLATE={
    hero:{text:'#eef7ff',bg:'rgba(18,78,140,.92)',stroke:'#9fd0f5'},
    npc:{text:'#fbf6d7',bg:'rgba(24,55,46,.82)',stroke:'#b7d7a4'},
    mob:{text:'#fff4ec',bg:'rgba(132,42,32,.92)',stroke:'#f0b09a'},
    place:{text:'#fbf6d7',bg:'rgba(24,55,46,.78)'},
};
const plateWidths=new Map();
function plate(c,label,x,y,style=PLATE.place) {
    const shown=tr(label);
    c.font='600 12px "PingFang SC", sans-serif';
    let width=plateWidths.get(shown);
    if(width===undefined){width=c.measureText(shown).width+20;plateWidths.set(shown,width);}
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
// Companion chat invitation: a small talk-bubble icon above the pet; the click target follows the drawn rect.
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
export function questMarker(save,content,npcId) {
    const involved=trackedQuestIds(save).some(id=>{
        const tracked=content.catalogQuests?.byId[id];
        return tracked&&(tracked.startNpc===npcId||tracked.endNpc===npcId||tracked.groups.some(g=>g.kind==='talk'&&g.items.some(i=>i.id===npcId)));
    });
    if(involved){
        const mark=catalogNpcMarker(save,content,npcId,catalogStatSnapshot(save,content));
        if(mark)return mark;
    }
    const q=currentQuest(save,content);if(!q)return null;
    if(!questState(save,q.id).accepted&&q.startNpc===npcId)return '!';
    if(questReady(save,q)&&q.endNpc===npcId)return '?';
    if(questState(save,q.id).accepted&&questProgress(save,q).some(g=>g.kind==='talk'&&g.id===npcId&&g.value<g.count))return '…';
    return null;
}
export function createRenderer(canvas,assets) {
    const drawSignpost=createSignpostPainter();
    const effects=createSpellEffects(assets), reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
    const ctx=canvas.getContext('2d'),cam={x:0,y:0,scale:1,w:0,h:0};let backing=null,backingZone=null;
    const terrainTiles=createTerrainTileCache((c,world,rect)=>paintLargeTerrain(c,world,rect,false,assets.terrainDecorationArt),()=>document.createElement('canvas'));
    let vignetteCanvas=null,vignetteW=0,vignetteH=0;
    let overviewWorld=null,overview=null;
    let companion=null,companionId=null,companionWorld=null,companionSave=null,lastPetTime=null,bubbleTarget=null;
    const cameraZoom=createCameraZoom();let weatherFade=null;
    const motionTrail=createMotionTrail();
    let heroActor=null,heroPrevious=null,heroScope=null,heroIdentity=null;
    const battleHero=createHeroActor(9271);
    const starFollower=createStarFollower();
    function zoomBy(factor) {
        return cameraZoom.zoomBy(factor);
    }
    function size() {
        const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(2,window.devicePixelRatio||1);
        if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
        ctx.setTransform(dpr,0,0,dpr,0,0);cam.w=w;cam.h=h;return {w,h};
    }
    function ground(world) {
        if(world.layout){
            if(overviewWorld===world)return overview;
            overviewWorld=world;overview=document.createElement('canvas');overview.width=560;overview.height=Math.round(560*world.h/world.w);
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
    function avatar(c,save,x,y,time,moving,scale=1,nameBounds=true,headPose=null) {
        shadow(c,x,y,(save.mountId?28:23)*scale);
        const result=assets.hero.drawSave(c,save,x,y,time,moving,scale,{
            head:save.visualHead??headPose?.head,breath:save.visualBreath??headPose?.breath,
            reducedMotion:reducedMotion.matches,nameBounds,
        });
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
    function monster(c,m,x,y,t,scale=1){
        const bob=reducedMotion.matches?0:Math.sin(t*2.8+x)*2;
        shadow(c,x,y,27*scale);
        if(!assets.drawMonster?.(c,m,x-52*scale,y-104*scale+bob,104*scale,104*scale))creature(c,m?.id||'water-bubble',x,y,t,scale,false);
    }
    function render(world,save,time,{moving=false,path=[],title=false,rewardEffect=null,teleportEffect=null,weatherOverride=null,weatherTime=time,fishingPose=null,membership={},motionHidden=false,companionBubble=null}={}) {
        const {w,h}=size(),t=time/1000;bubbleTarget=null;ctx.fillStyle=world.layout?.rules.terrain.ocean||OCEAN_COLOR;ctx.fillRect(0,0,w,h);
        cameraZoom.tick(time,reducedMotion.matches);
        const baseScale=w<650?.82:1,sceneZoom=title?1:cameraZoom.value;
        cam.scale=baseScale*sceneZoom;const center=title?{x:(world.layout?world.center.x:875)+Math.sin(t*.04)*60,y:world.layout?world.center.y:770}:save.position;
        cam.x=center.x-w/(2*cam.scale);cam.y=center.y-h/(2*cam.scale)+(w<650?50:25)/sceneZoom;
        ctx.save();
        try {
        ctx.scale(cam.scale,cam.scale);ctx.translate(-cam.x,-cam.y);
        const coldTiles=world.layout?terrainTiles.draw(ctx,world,{x:cam.x,y:cam.y,w:w/cam.scale,h:h/cam.scale},(c,x,y,size)=>{
            const map=ground(world),dw=Math.min(size,world.w-x),dh=Math.min(size,world.h-y);
            c.drawImage(map,x*map.width/world.w,y*map.height/world.h,dw*map.width/world.w,dh*map.height/world.h,x,y,dw,dh);
        },cam.scale*canvas.width/w):0;
        if(!world.layout)ctx.drawImage(ground(world),0,0);
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
        const heroPose=updateHeroActor(heroActor,{dx:save.position.x-heroPrevious.x,dy:save.position.y-heroPrevious.y,x:save.position.x,y:save.position.y,time:t,facing:save.facing||0,npcs:world.npcs,reducedMotion:reducedMotion.matches});
        heroPrevious={...save.position,time};
        // 坐骑显隐只影响漫游场景；renderBattle 直接用原 save，战斗中坐骑恒显示。
        const visualSave=save.mountHidden?{...save,mountId:null}:save;
        const style=motionStyle(visualSave,membership);style.pose={...style.pose,visualHead:heroPose.head,visualBreath:{...heroPose.breath}};
        const motion=motionTrail.step(save.position,time,style,{moving,scope:world,reducedMotion:reducedMotion.matches,hidden:title||motionHidden||!!fishingPose||!!teleportEffect});
        const star=starFollower.step(starAnchor(visualSave,t,moving),time,{enabled:starCompanionVisible(save,motion.style,{title,motionHidden,fishingPose:!!fishingPose,teleportEffect:!!teleportEffect}),reducedMotion:reducedMotion.matches,scope:world});
        const starLevel=magicStarStatus(membership,Date.now()).level;
        drawMotionTrail(ctx,motion,time,(c,p)=>avatar(c,p.pose,p.x,p.y,p.born/1000,true,1,false));
        const objects=[...nearbyWorldObjects(world,{x:cam.x-240,y:cam.y-60,w:w/cam.scale+480,h:h/cam.scale+320}),{...save.position,kind:'hero'}];
        const petId=selectCompanionId(save,assets.content);
        if(petId){
            if(!companion||companionId!==petId||companionWorld!==world||companionSave!==save){
                companion=createCompanion(world,save.position,`${save.seed}:${world.zone}:${petId}`);
                companionId=petId;companionWorld=world;companionSave=save;lastPetTime=time;
            }
            stepCompanion(companion,world,save.position,(time-lastPetTime)/1000,{deferSearch:coldTiles>0});
            objects.push({...companion.position,kind:'pet'});
        }else companion=null;
        lastPetTime=time;
        objects.sort((a,b)=>a.y-b.y);
        for(const o of objects) {
            if(o.x<cam.x-200||o.x>cam.x+w/cam.scale+200||o.y<cam.y-50||o.y>cam.y+h/cam.scale+230)continue;
            if(o.kind==='tree'){ctx.save();if(Math.abs(save.position.x-o.x)<o.size*.4&&save.position.y<o.y&&save.position.y>o.y-o.size*.85)ctx.globalAlpha=.52;const winter=o.snow&&assets.environmentArt?.draw(ctx,'trees',['spruce','pine','fir','oldPine'][(Math.round(o.x)+Math.round(o.y))%4],o.x-o.size/2,o.y-o.size+10,o.size,o.size);if(!winter)assets.tile(ctx,'sprites',o.tile,o.x-o.size/2,o.y-o.size+10,o.size,o.size);ctx.restore();}
            if(o.kind==='building'){
                ctx.save();
                if(o.atlas&&Math.abs(save.position.x-o.x)<o.w*.5&&save.position.y<o.y&&save.position.y>o.y-o.h)ctx.globalAlpha=.52;
                const bob=o.frame==='boat'&&!reducedMotion.matches?Math.sin(t*1.4+o.x)*2:0;
                const drawn=o.atlas&&assets.buildingArt?.draw(ctx,o.atlas,o.frame,o.x-o.w/2,o.y-o.h+bob,o.w,o.h);
                if(!drawn&&!o.decorationOnly)assets.tile(ctx,'sprites',o.tile,o.x-o.w/2,o.y-o.h,o.w,o.h);
                ctx.restore();
            }
            if(o.kind==='landmark'){
                drawSignpost(ctx,o.name,o.x,o.y);
            }
            if(o.kind==='npc') {
                shadow(ctx,o.x,o.y,25);const dragon=[36211,30112].includes(o.id),sw=dragon?100:64,sh=dragon?104:86;
                // The world redraws every frame; a late image callback must not erase a moved camera's scene.
                if(!assets.draw(ctx,o.portrait,o.x-sw/2,o.y-sh+Math.sin(t*1.6+o.id)*1.5,sw,sh,true,false)){
                    ellipse(ctx,o.x,o.y-27,19,28,'#668b76');ellipse(ctx,o.x,o.y-65,14,16,'#efd6ad');
                }
                plate(ctx,o.name,o.x,o.y+19,PLATE.npc);
                const marker=questMarker(save,assets.content,o.id);
                if(marker){text(ctx,marker,o.x,o.y-sh-8+Math.sin(t*3)*3,29,'#fff1a3');}
            }
            if(o.kind==='mob') {
                const m=assets.content.monsters[o.monsterId]||{name:'缺失怪物'};
                if(o.monsterIds){for(const [i,id]of o.monsterIds.entries()){const mob=assets.content.monsters[id];monster(ctx,mob,o.x+(i-(o.monsterIds.length-1)/2)*42,o.y-(i%2)*16,t,.7);}plate(ctx,`${tr(m.name)}${o.monsterIds.length>1?` · ${tr(`${o.monsterIds.length}只`)}`:""}${o.blocked?.length?` · ${tr('待迁移')}`:''}`,o.x,o.y+18,PLATE.mob);}
                else {monster(ctx,m,o.x,o.y,t,.8);plate(ctx,tr(m.name)+(o.blocked?.length?` · ${tr('待迁移')}`:''),o.x,o.y+18,PLATE.mob);}
                const q=currentQuest(save,assets.content),goal=q&&questProgress(save,q).find(g=>g.kind==='defeat'&&g.id===m.goalId&&g.value<g.count);
                const trackedMob=(o.monsterIds||[o.monsterId]).some(id=>catalogTracksMonster(save,assets.content,assets.content.monsters[id]));
                if((goal&&questState(save,q.id).accepted)||trackedMob)text(ctx,'◇',o.x,o.y-90+Math.sin(t*3)*3,25,'#fff2a9');
            }
            if(o.kind==='hero'){
                if(!star.front)drawMagicStar(ctx,star,assets,starLevel);
                circleRune(ctx,o.x,o.y+2,24,t,'#f7e6a088');
                let nameY;
                if(fishingPose){
                    // A temporary standing pose, without changing the saved mount or facing.
                    ctx.save();ctx.translate(o.x,o.y-fishingPose.lift);ctx.rotate(fishingPose.lean);
                    avatar(ctx,{...save,mountId:null,facing:fishingPose.facing},0,0,t,false);ctx.restore();
                    nameY=o.y+21;
                }else{
                    if(!title&&!motionHidden&&!teleportEffect)drawMotionAccessory(ctx,motion,o,time,reducedMotion.matches);
                    const heroBottom=avatar(ctx,visualSave,o.x,o.y,t,moving,1,true,heroPose);
                    if(!title&&!motionHidden&&!teleportEffect)drawMotionAccessory(ctx,motion,o,time,reducedMotion.matches,true);
                    nameY=heroBottom+21;
                }
                if(star.front)drawMagicStar(ctx,star,assets,starLevel);
                if(!title)plate(ctx,save.name,o.x,nameY,PLATE.hero);
            }
            if(o.kind==='pet'){
                const id=petId,pet=save.pets?.[id];
                const hop=reducedMotion.matches?0:companion.moving?Math.abs(Math.sin(companion.phase))*5:Math.sin(t*2.5)*1.5;
                shadow(ctx,o.x,o.y,18);ctx.save();ctx.translate(o.x,o.y);ctx.scale(companion.facing,1);
                // Pet sheets load lazily: keep the follower visible until its sheet is ready,
                // including after a failed request. Mount rendering is independent of this pet.
                const drawn=assets.content.pets?.[id]?.art&&assets.drawPet(ctx,id,pet?petAppearanceStage(pet,assets.content):0,-32,-60-hop,64,64);
                if(!drawn)creature(ctx,'pet',0,-hop,t,.36,false);
                ctx.restore();
            }
        }
        if(companionBubble&&companion&&!title)bubbleTarget=drawSpeechBubble(ctx,companion.position,t,reducedMotion.matches);
        if(!world.portal.hidden)plate(ctx,world.portal.name,world.portal.x,world.portal.y+48);
        if(world.entrancePortal)plate(ctx,world.entrancePortal.name,world.entrancePortal.x,world.entrancePortal.y+48);
        if(!title)drawRewardEffect(ctx,save.position.x,save.position.y,rewardEffect,reducedMotion.matches);
        if(!title)drawTeleportEffect(ctx,teleportEffect,time,reducedMotion.matches);
        } finally {ctx.restore();}
        const liveWeather=weatherOverride||world.layout&&regionAt(world,save.position)?.weather||null;
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
    }
    function minimap(target,world,save,{labels=true}={}) {
        const c=target.getContext('2d'),w=target.width,h=target.height;c.clearRect(0,0,w,h);c.fillStyle='#6ba7a2';c.fillRect(0,0,w,h);
        const sx=w/world.w,sy=h/world.h;c.save();c.scale(sx,sy);c.drawImage(ground(world),0,0,world.w,world.h);
        for(const b of world.buildings){c.fillStyle='#627b83';c.fillRect(b.x-45,b.y-60,90,65);}
        for(const n of world.npcs)ellipse(c,n.x,n.y,questMarker(save,assets.content,n.id)?22:13,questMarker(save,assets.content,n.id)?22:13,questMarker(save,assets.content,n.id)?'#ffe89c':'#f6f3d9');
        ellipse(c,save.position.x,save.position.y,25,25,'#184f73');ellipse(c,save.position.x,save.position.y,13,13,'#fff');c.restore();
        if(world.layout){
            if(labels)for(const r of world.layout.regions){ellipse(c,r.x*sx,r.y*sy,3,3,'#fff3c3');text(c,r.name,r.x*sx,r.y*sy-9,11,'#25483b');}
            ellipse(c,save.position.x*sx,save.position.y*sy,5,5,'#fff');ellipse(c,save.position.x*sx,save.position.y*sy,3,3,'#205c99');
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
        for(const id of Object.keys(battle.unitsById)) {
            const hp=presentation?.hp?.[id]??battle.unitsById[id].hp;
            const hit=presentation?.reactions?.find(reaction=>reaction.target===id);
            const pose=hp>0&&hit?{action:'hit',progress:hit.progress}:battleActorAction(id,hp,ev,p);
            drawAnimatedActor(c,positions[id],pose.action,pose.progress,id==='hero'?1:-1,reducedMotion.matches,()=>{
                if(id==='hero'){avatar(c,{...save,facing:2},0,0,t,false,.70,false,updateHeroActor(battleHero,{time:t,facing:2,reducedMotion:reducedMotion.matches}));const supportId=save.formation?.[save.heroSlot],support=save.pets?.[supportId];if(support&&assets.content.pets[supportId]?.art)assets.drawPet(c,supportId,petAppearanceStage(support,assets.content),12,-48,48,48);}
                else {const unit=battle.unitsById[id],species=unit.speciesId||unit.template?.speciesId;if(unit.isMob)monster(c,unit.template,0,0,t,.95);else if(species&&assets.content.pets[species]?.art)assets.drawPet(c,species,petAppearanceStage(save.pets?.[species]||unit,assets.content),-42,-84,84,84);else creature(c,unit.isMob?unit.template.id:'pet',0,0,t,.85);}
            });
        }
        const statusTargets=[];
        for(const u of [...battle.sides.near,...battle.sides.far]) {
            const at=positions[u.id],hp=presentation?.hp?.[u.id]??u.hp,bw=Math.min(115,w*.20);
            statusTargets.push(...drawOverheadStatus(c,u,battle,at,w,hp));
            plate(c,w<650?u.name.slice(0,6):u.name,at.x,at.y+25,u.id==='hero'?PLATE.hero:u.isMob?PLATE.mob:PLATE.npc);c.fillStyle='#173843';c.beginPath();c.roundRect(at.x-bw/2,at.y+38,bw,10,5);c.fill();
            c.fillStyle=u.isMob?'#d39a7a':'#8ccc8a';c.beginPath();c.roundRect(at.x-bw/2+2,at.y+40,Math.max(0,(bw-4)*hp/u.maxHp),6,3);c.fill();
        }
        if(ev?.type==='cast'||ev?.type==='fizzle') {
            effects.draw(c,{card:battle.resolved.cards[ev.card],progress:p,from:positions[ev.caster],to:positions[ev.target]||positions[ev.caster],center:{x:cx,y:cy-2},width:w,height:h,seed:`${ev.round}:${ev.caster}:${ev.card}`,reducedMotion:reducedMotion.matches,failed:ev.type==='fizzle',environmentManaged:true});
        }
        if(ev?.type==='damage'||ev?.type==='heal') {
            const at=positions[ev.target];if(at){c.save();c.globalAlpha=1-p*.65;text(c,`${ev.type==='heal'?'+':'−'}${ev.amount}${ev.mark==='c'?' 暴击':''}`,at.x,at.y-100-p*40,26,ev.type==='heal'?'#adf8a0':'#fff0b4');c.restore();}
        }
        target.updateStatusTargets?.(statusTargets.map(hit=>({...hit,x:hit.x*scale,y:hit.y*scale,width:hit.width*scale,height:hit.height*scale})));
        return Object.fromEntries(Object.entries(positions).map(([id,at])=>[id,{x:at.x*scale,y:at.y*scale}]));
    }
    return {render,minimap,screenToWorld,renderBattle,zoomBy,setFishingCamera:active=>cameraZoom.setFishing(active),bubbleTarget:()=>bubbleTarget,companionTarget:()=>companion?{x:companion.position.x,y:companion.position.y}:null};
}
