import {drawAnimatedActor} from '../../actor_animation.js';
import {battleActorAction} from '../../actor_animation_core.js';
import {petBattleMood} from '../../adventure_pet_mood_core.js';
import {petAppearanceStage} from '../../adventure_pets_core.js';
import {cinematicCast,sampleBattleCamera,projectBattlePoint,cameraActorFacing} from '../../battle_camera_core.js';
import {battleDamageFeedback} from '../../battle_damage_feedback_core.js';
import {drawBattlePointer} from '../../battle_pointer.js';
import {nextBattlePointer} from '../../battle_pointer_core.js';
import {createBattleScenery,drawBattleBackground,drawBattleDisk} from '../../battle_scenery.js';
import {battleTargetRects} from '../../battle_target_pick_core.js';
import {battleViewport} from '../../battle_viewport_core.js';
import {createHeroActor,updateHeroActor} from '../../hero_pose_core.js';
import {tr} from '../../locale_runtime.js';
import {spellEffect} from '../../spell_effects_core.js';
import {drawOverheadStatus,drawStatusFeedback} from '../../views/adventure/view_adventure_overhead_status.js';
import {drawPetMood} from '../../views/adventure/view_adventure_pet_mood.js';
import {battleCameraViewport,drawCameraGround} from '../../views/adventure/view_battle_camera.js';
import {drawBattlePips} from '../../views/adventure/view_battle_pips.js';
import {drawPetTraitHalo} from '../../views/adventure/view_pet_traits.js';
import {BATTLE_HERO_SCALE,PLATE,ellipse,text,plate,circleRune} from './primitives.js';

export function createBattleCanvasRenderer({assets,effects,reducedMotion,resolution,avatar,monster,creature}){
    const battleScenery=createBattleScenery();
    const battleHero=createHeroActor(9271);

    function renderBattle(target,battle,save,time,presentation) {
        const c=target.getContext('2d'),pixelWidth=target.clientWidth,pixelHeight=target.clientHeight,dpr=resolution(false).display;
        if(!pixelWidth||!pixelHeight)return {};
        const {scale,w,h}=battleViewport(pixelWidth,pixelHeight);
        if(target.width!==Math.round(pixelWidth*dpr)||target.height!==Math.round(pixelHeight*dpr)){target.width=Math.round(pixelWidth*dpr);target.height=Math.round(pixelHeight*dpr);}
        c.setTransform(dpr*scale,0,0,dpr*scale,0,0);c.clearRect(0,0,w,h);
        const t=time/1000,cx=w/2,cy=h*.52,r=Math.min(w*.46,h*.76);
        if(!target.haze||target.hazeW!==w||target.hazeH!==h){
            const haze=c.createRadialGradient(cx,cy,20,cx,cy,r*1.5);haze.addColorStop(0,'#527e7166');haze.addColorStop(1,'transparent');
            target.haze=haze;target.hazeW=w;target.hazeH=h;
        }
        const scenery=battleScenery.get(battle,save,assets.content);
        if(target.dataset)target.dataset.battleScene=scenery?.id||'loading';
        if(scenery)drawBattleBackground(c,scenery.background,w,h);
        else {c.fillStyle=target.haze;c.fillRect(0,0,w,h);}
        const slotPoint=(side,slot)=>{const a=([-155,-110,155,110][slot%4])*Math.PI/180;return{x:cx+Math.cos(a)*r*.67*(side==='near'?1:-1),y:cy+Math.sin(a)*r*.34};};
        const ev=presentation?.event,p=presentation?.progress||0,worldPositions={};
        for(const side of ['near','far'])for(const [i,unit] of battle.sides[side].entries())worldPositions[unit.id]=slotPoint(side,unit.slot??i);
        const card=battle.resolved.cards[ev?.card],spec=card?spellEffect(assets.effects,card):null;
        const cinematic=p>0&&p<1&&cinematicCast(ev,card,reducedMotion.matches)&&!!worldPositions[ev?.caster]&&(!ev.target||!!worldPositions[ev.target]);
        const safeRect=battleCameraViewport(target,cinematic,scale);
        const affectedIds=ev?.type==='cast'&&ev.label!=='reflection'&&ev.sourceType!=='reflection'&&spec?.area?Object.values(battle.unitsById).filter(u=>u.side===(battle.unitsById[ev.target]?.side||battle.unitsById[ev.caster]?.side)&&(presentation?.hp?.[u.id]??u.hp)>0).map(u=>u.id):[];
        const camera=sampleBattleCamera({event:ev,card,spec:spec||{},progress:p,positions:worldPositions,targets:affectedIds.map(id=>worldPositions[id]),bounds:target.cameraActorBounds,
            center:{x:cx,y:cy},width:w,height:h,safeRect,reducedMotion:reducedMotion.matches,timeline:assets.effects.timeline});
        const feedback=battleDamageFeedback(ev,p,presentation?.reactions||[],reducedMotion.matches);
        target.battleDamageFeedback=feedback;
        const shakeX=feedback.shakeX/scale,shakeY=feedback.shakeY/scale;
        c.save();c.translate(shakeX,shakeY);
        target.battleCamera=camera;
        const positions=Object.fromEntries(Object.entries(worldPositions).map(([id,at])=>[id,projectBattlePoint(camera,at)]));
        const sceneCenter=projectBattlePoint(camera,{x:cx,y:cy-2});
        const pointer=presentation?.pointer||(ev?.type==='movearrow'?{from:ev.from,to:ev.caster,progress:p}:{to:ev?.caster||nextBattlePointer(battle)});
        if(scenery){
            drawBattleDisk(c,scenery.disk,camera,{cx,cy,r});
            if(!camera.active&&(!battle.finished||presentation))drawBattlePointer(c,{center:{x:cx,y:cy},radius:r,from:positions[pointer.from],to:positions[pointer.to],progress:pointer.progress,reduced:reducedMotion.matches});
        }
        else if(camera.active)drawCameraGround(c,camera,{center:{x:cx,y:cy},radius:r,time:t,pointer,positions:worldPositions});
        else {
            ellipse(c,cx,cy+18,r+24,r*.56+10,'#112f3c99');ellipse(c,cx,cy,r,r*.54,'#809580');ellipse(c,cx,cy-4,r-9,r*.51,'#c5c4a4');
            circleRune(c,cx,cy-2,r-18,t,'#ebdfaf');circleRune(c,cx,cy-2,r*.62,-t,'#7e9a90');
            for(const side of ['near','far'])for(let slot=0;slot<4;slot++){const at=slotPoint(side,slot);circleRune(c,at.x,at.y,19,t*.2,'#f2e6b677');}
            if(!battle.finished||presentation)drawBattlePointer(c,{center:{x:cx,y:cy},radius:r,from:positions[pointer.from],to:positions[pointer.to],progress:pointer.progress,reduced:reducedMotion.matches});
        }
        const aura=presentation&&Object.hasOwn(presentation,'aura')?presentation.aura:battle.aura;
        if(aura?.cardKey)effects.drawEnvironment(c,{card:battle.resolved.cards[aura.cardKey],center:sceneCenter,radius:r*(sceneCenter.scale||1),time:t,reducedMotion:reducedMotion.matches});
        const actorBounds={},rawActorBounds={},speechAnchors={};
        const drawIds=Object.keys(battle.unitsById);
        if(camera.active)drawIds.sort((a,b)=>positions[b].depth-positions[a].depth);
        for(const id of drawIds) {
            const bounds=actorBounds[id]={};
            const hp=presentation?.hp?.[id]??battle.unitsById[id].hp;
            const hit=presentation?.reactions?.find(reaction=>reaction.target===id);
            const unit=battle.unitsById[id],petUnit=id!=='hero'&&!unit.arenaProfile&&!unit.isMob&&!save.coopRun?.members.some(m=>m.unit.id===id);
            const pose=petUnit&&hp<=0?(['damage','dot'].includes(ev?.type)&&ev.target===id&&ev.amount>0?{action:'hit',progress:p}:{action:'idle',progress:0}):hp>0&&hit?{action:'hit',progress:hit.progress}:battleActorAction(id,hp,ev,p);
            const at=positions[id],actorScale=at.scale||1;
            const facing=cameraActorFacing(camera,id,worldPositions[id],id==='hero'||unit.side!=='far'?2:1);
            c.save();c.translate(at.x,at.y);c.scale(actorScale,actorScale);c.translate(-at.x,-at.y);
            if(camera.active&&camera.focusId&&id!==camera.focusId)c.globalAlpha*=1-camera.blend*.94;
            if(hp>0)drawPetTraitHalo(c,unit.passiveTraits,positions[id].x,positions[id].y,38);
            drawAnimatedActor(c,positions[id],pose.action,pose.progress,id==='hero'?1:-1,reducedMotion.matches,()=>{
                if(id==='hero'){avatar(c,{...save,facing},0,0,t,false,BATTLE_HERO_SCALE,false,camera.active?{facing,head:[0,4,12,8][facing]}:updateHeroActor(battleHero,{time:t,facing,reducedMotion:reducedMotion.matches}),bounds);const supportId=save.formation?.[save.heroSlot],support=save.pets?.[supportId];if((!battle.redMushroom||presentation?.showSupportPet)&&support&&assets.content.pets[support.speciesId]?.art)(()=>{c.save();c.translate(36,0);drawPetMood(c,petBattleMood(hp,unit.maxHp,assets.content),time,reducedMotion.matches,48,column=>assets.drawPet(c,support.speciesId,petAppearanceStage(support,assets.content),-24,-48,48,48,column));c.restore();})();}
                else if(unit.arenaProfile){avatar(c,{...unit.arenaProfile,facing},0,0,t,false,BATTLE_HERO_SCALE,false,null,bounds);}
                else if(save.coopRun?.members.some(m=>m.unit.id===id)){const p=save.coopRun.members.find(m=>m.unit.id===id).profile;avatar(c,{...p,mountId:null,facing},0,0,t,false,BATTLE_HERO_SCALE,false,null,bounds);}
                else {const unit=battle.unitsById[id],species=unit.speciesId||unit.template?.speciesId;if(unit.isMob)monster(c,unit.template,0,0,t,.95);else if(species&&assets.content.pets[species]?.art)drawPetMood(c,petBattleMood(hp,unit.maxHp,assets.content),time,reducedMotion.matches,84,column=>assets.drawPet(c,species,petAppearanceStage(save.pets?.[unit.id]||save.pets?.[species]||unit,assets.content),-42,-84,84,84,column));else creature(c,unit.isMob?unit.template.id:'pet',0,0,t,.85);}
                if(bounds.speechHead){
                    const matrix=c.getTransform(),head=bounds.speechHead;
                    speechAnchors[id]={x:(matrix.a*head.x+matrix.c*head.y+matrix.e)/dpr,y:(matrix.b*head.x+matrix.d*head.y+matrix.f)/dpr};
                }
            });
            c.restore();
            if(!Number.isFinite(bounds.hitTop))Object.assign(bounds,{left:-52,right:52,hitTop:-100,bottom:0});
            rawActorBounds[id]={...bounds};
            for(const key of ['left','right','hitTop','top','bottom'])if(Number.isFinite(bounds[key]))bounds[key]*=actorScale;
            speechAnchors[id]??={x:(at.x+shakeX)*scale,y:(at.y+bounds.hitTop+shakeY)*scale};
            if(camera.active&&camera.focusId&&id!==camera.focusId)delete speechAnchors[id];
        }
        target.cameraActorBounds=rawActorBounds;

        const statusTargets=[];
        for(const u of [...battle.sides.near,...battle.sides.far]) {
            if(camera.active&&camera.focusId&&u.id!==camera.focusId)continue;
            const at=positions[u.id],hp=presentation?.hp?.[u.id]??u.hp,bw=Math.min(115,w*.20);
            statusTargets.push(...drawOverheadStatus(c,u,battle,{...at,statusBottom:camera.active?at.y+(actorBounds[u.id]?.top??actorBounds[u.id]?.hitTop??-100)-12:Number.isFinite(actorBounds[u.id]?.top)?at.y+actorBounds[u.id].top-12:undefined},w,hp,presentation?.status?.[u.id]));
            plate(c,w<650?u.name.slice(0,6):u.name,at.x,at.y+25,u.id==='hero'?PLATE.hero:u.isMob?PLATE.mob:save.coopRun?.members.some(m=>m.unit.id===u.id)?PLATE.social:PLATE.npc,u.school||'balance');c.fillStyle='#173843';c.beginPath();c.roundRect(at.x-bw/2,at.y+38,bw,10,5);c.fill();
            c.fillStyle=u.isMob?'#d39a7a':'#8ccc8a';c.beginPath();c.roundRect(at.x-bw/2+2,at.y+40,Math.max(0,(bw-4)*hp/u.maxHp),6,3);c.fill();
        }
        if(ev?.type==='cast'||ev?.type==='fizzle') {
            effects.draw(c,{card:battle.resolved.cards[ev.card],progress:p,from:positions[ev.caster],to:positions[ev.target]||positions[ev.caster],center:sceneCenter,width:w,height:h,visualScale:camera.active?Math.min(3,positions[ev.target]?.scale||positions[ev.caster]?.scale||1):1,targets:affectedIds.map(id=>positions[id]),seed:`${ev.round}:${ev.caster}:${ev.card}`,reducedMotion:reducedMotion.matches,failed:ev.type==='fizzle',reflection:ev.label==='reflection',environmentManaged:true});
        }
        if(ev?.type==='cast'&&ev.caster==='hero')assets.hanziPresentation?.spell(c,{card:battle.resolved.cards[ev.card],progress:p,from:positions[ev.caster],to:positions[ev.target]||positions[ev.caster],reducedMotion:reducedMotion.matches});
        if(['damage','dot','heal','hot'].includes(ev?.type)) {
            const at=positions[ev.target];if(at){c.save();c.globalAlpha=1-p*.65;text(c,`${['heal','hot'].includes(ev.type)?'+':'−'}${ev.amount}${ev.mark==='c'?' 暴击':''}`,at.x,at.y-100-p*40,26,['heal','hot'].includes(ev.type)?'#adf8a0':'#fff0b4');c.restore();}
        }
        for(const u of Object.values(battle.unitsById))drawStatusFeedback(c,(presentation?.statusFeedback||[]).filter(change=>change.id===u.id),positions[u.id],time,reducedMotion.matches,w);
        for(const u of Object.values(battle.unitsById).filter(u=>!camera.active||!camera.focusId||camera.focusId===u.id))drawBattlePips(c,positions[u.id],presentation?.pips?.[u.id]??u.pips,{hp:presentation?.hp?.[u.id]??u.hp});
        for(const hit of feedback.hits){
            const at=positions[hit.target];if(!at)continue;
            const q=Math.max(0,Math.min(1,hit.progress)),size=(18+q*32)*(at.scale||1);
            c.save();c.globalAlpha=(1-q)*.8;c.strokeStyle='#ffe5a0';c.lineWidth=3;
            c.beginPath();c.ellipse(at.x,at.y-46*(at.scale||1),size,size*.65,0,0,Math.PI*2);c.stroke();c.restore();
        }
        c.restore();
        const actionTitle=ev?.type==='pass'?'跳过':ev?.type==='fizzle'?'miss':ev?.type==='cast'&&cinematicCast(ev,card)?(ev.wordCardText||spec?.name||card?.name):null;
        if(camera.active){
            const caster=battle.unitsById[ev.caster],rect=camera.rect;
            c.save();c.fillStyle='#102d38cc';c.beginPath();c.roundRect(rect.x,rect.y-32,rect.width,29,8);c.fill();
            c.font='600 14px "PingFang SC", sans-serif';c.textAlign='center';c.fillStyle='#fff0c9';
            c.fillText(`${tr(caster?.name||'')} · ${tr(actionTitle||spec?.name||card?.name||'')}`,rect.x+rect.width/2,rect.y-12,Math.max(1,rect.width-16));c.restore();
        }
        if(actionTitle&&positions[ev.caster]&&(!camera.active||camera.close)){
            const at=positions[ev.caster],head=speechAnchors[ev.caster];
            const headY=head?head.y/scale:at.y+(actorBounds[ev.caster]?.hitTop??-100);
            const rect=camera.rect||{x:16,y:32,width:w-32,height:h-64};
            const x=Math.max(rect.x+rect.width*.25,Math.min(rect.x+rect.width*.75,at.x));
            const y=Math.max(rect.y+28,headY-22);
            const size=Math.max(26,Math.min(40,w*.065)),pop=reducedMotion.matches?1:1+.09*Math.sin(Math.min(1,p/.08)*Math.PI);
            c.save();c.globalAlpha=Math.min(1,p/.025,(1-p)/.07);c.translate(x,y);c.scale(pop,pop);
            c.font=`900 ${size}px "Microsoft YaHei", sans-serif`;c.textAlign='center';c.lineJoin='round';c.lineWidth=6;
            c.strokeStyle='#12323f';c.fillStyle=ev.type==='fizzle'?'#ffc4a0':'#fff2a8';c.shadowColor='#071d2a';c.shadowBlur=8;
            c.strokeText(tr(actionTitle),0,0,rect.width-24);c.fillText(tr(actionTitle),0,0,rect.width-24);c.restore();
        }
        target.battleTargetRects=battleTargetRects(positions,actorBounds,scale).map(rect=>({...rect,x:rect.x+feedback.shakeX,y:rect.y+feedback.shakeY}));
        target.battleSpeechAnchors=speechAnchors;
        target.battleStatusRects=statusTargets.map(hit=>({...hit,x:hit.x*scale+feedback.shakeX,y:hit.y*scale+feedback.shakeY,width:hit.width*scale,height:hit.height*scale}));
        target.updateStatusTargets?.(target.battleStatusRects);
        return Object.fromEntries(Object.entries(positions).map(([id,at])=>[id,{x:(at.x+shakeX)*scale,y:(at.y+shakeY)*scale}]));
    }

    return renderBattle;
}
