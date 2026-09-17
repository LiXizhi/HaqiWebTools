// Canvas presentation only. Visual motion uses time/seeded map decorations, never gameplay RNG.
import { createSpellEffects } from './spell_effects.js';
import { drawAnimatedActor } from './actor_animation.js';
import { battleActorAction } from './actor_animation_core.js';
import { currentQuest,questReady,questState,questProgress,SCHOOL_NAMES } from './adventure_core.js';
import { onIsland,distance } from './adventure_world_core.js';
export const COLORS={fire:'#e98f44',ice:'#6ecbdc',storm:'#b39aea',life:'#84bd59',death:'#a887c7'};
const TAU=Math.PI*2;
function ellipse(c,x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fill();}
function text(c,value,x,y,size=13,color='#fff',align='center') {c.font=`600 ${size}px "PingFang SC", "Microsoft YaHei", sans-serif`;c.textAlign=align;c.fillStyle=color;c.fillText(value,x,y);}
function plate(c,label,x,y,color='#fbf6d7') {
    c.font='600 12px "PingFang SC", sans-serif';const width=c.measureText(label).width+20;
    c.fillStyle='rgba(24,55,46,.78)';c.beginPath();c.roundRect(x-width/2,y-14,width,23,8);c.fill();text(c,label,x,y+2,12,color);
}
function circleRune(c,x,y,r,t,color='#e4d69a') {
    c.save();c.translate(x,y);c.scale(1,.53);c.strokeStyle=color;c.lineWidth=2;
    c.beginPath();c.arc(0,0,r,0,TAU);c.stroke();c.beginPath();c.arc(0,0,r*.83,0,TAU);c.stroke();
    c.rotate(t*.05);c.beginPath();for(let i=0;i<6;i++){const a=-Math.PI/2+i*TAU/5;c.lineTo(Math.cos(a)*r*.75,Math.sin(a)*r*.75);}c.stroke();
    for(let i=0;i<8;i++){c.save();c.rotate(i*TAU/8);c.strokeRect(r*.89,-3,5,6);c.restore();}c.restore();
}
export function questMarker(save,content,npcId) {
    const q=currentQuest(save,content);if(!q)return null;
    if(!questState(save,q.id).accepted&&q.startNpc===npcId)return '!';
    if(questReady(save,q)&&q.endNpc===npcId)return '?';
    if(questState(save,q.id).accepted&&questProgress(save,q).some(g=>g.kind==='talk'&&g.id===npcId&&g.value<g.count))return '…';
    return null;
}
export function createRenderer(canvas,assets) {
    const effects=createSpellEffects(assets), reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
    const ctx=canvas.getContext('2d'),cam={x:0,y:0,scale:1,w:0,h:0};let backing=null,backingZone=null;
    function size() {
        const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(2,window.devicePixelRatio||1);
        if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
        ctx.setTransform(dpr,0,0,dpr,0,0);cam.w=w;cam.h=h;return {w,h};
    }
    function ground(world) {
        if(backingZone===world.zone)return backing;
        backingZone=world.zone;backing=document.createElement('canvas');backing.width=world.w;backing.height=world.h;
        const c=backing.getContext('2d');
        const ocean=c.createLinearGradient(0,0,world.w,world.h);ocean.addColorStop(0,'#528f9e');ocean.addColorStop(.6,'#6abbb7');ocean.addColorStop(1,'#326a84');c.fillStyle=ocean;c.fillRect(0,0,world.w,world.h);
        ellipse(c,900,817,818,720,'#bad9ba');ellipse(c,900,808,803,714,'#dfdba4');ellipse(c,900,790,779,682,'#759e55');
        const grass=c.createRadialGradient(850,680,60,900,800,840);grass.addColorStop(0,world.zone==='camp'?'#acc778':'#bad394');grass.addColorStop(.6,'#87b769');grass.addColorStop(1,'#416e51');
        ellipse(c,900,785,771,671,grass);
        for(const d of world.decorations)if(onIsland(d.x,d.y,48)) {
            ellipse(c,d.x,d.y,d.size*2,d.size,'#bad78633');
            if(d.kind<2){c.strokeStyle=d.kind?'#dce49477':'#346c4244';c.lineWidth=1;c.beginPath();c.moveTo(d.x,d.y);c.lineTo(d.x-2,d.y-5);c.moveTo(d.x,d.y);c.lineTo(d.x+3,d.y-4);c.stroke();}
        }
        for(const p of world.paths) {
            c.lineCap='round';c.lineJoin='round';c.strokeStyle='#719b58';c.lineWidth=p.width+9;c.beginPath();c.moveTo(p.a.x,p.a.y);c.lineTo(p.b.x,p.b.y);c.stroke();
            c.strokeStyle='#d4c698';c.lineWidth=p.width;c.stroke();c.strokeStyle='#dfd4aa';c.lineWidth=p.width-10;c.stroke();
        }
        // Inlaid stone plaza and school learning circle.
        ellipse(c,world.center.x,world.center.y-30,133,86,'#aaac85');ellipse(c,world.center.x,world.center.y-34,125,81,'#d9d5b1');
        c.strokeStyle='#b7b58f';c.lineWidth=1.4;for(let y=-65;y<65;y+=22){c.beginPath();c.moveTo(world.center.x-90,world.center.y-30+y);c.lineTo(world.center.x+90,world.center.y-30+y);c.stroke();}
        circleRune(c,world.center.x,world.center.y-32,94,0,'#8fa68a');
        for(const d of world.decorations)if(d.kind===3&&onIsland(d.x,d.y,80)&&!world.paths.some(p=>Math.hypot(d.x-p.a.x,d.y-p.a.y)<135)) {
            ellipse(c,d.x,d.y,2,2,'#f4edbb');ellipse(c,d.x+3,d.y-3,2,2,'#e9bca4');
        }
        return backing;
    }
    function shadow(c,x,y,w=24) {ellipse(c,x,y,w,w*.32,'#173d4140');}
    function avatar(c,save,x,y,time,moving,scale=1) {
        shadow(c,x,y,23*scale);const bob=moving?Math.sin(time*14)*3:Math.sin(time*2)*1;
        assets.tile(c,'sprites',(save.appearance==='girl'?12:8)+(save.facing||0),x-34*scale,y-78*scale+bob,68*scale,78*scale);
    }
    function creature(c,id,x,y,t,scale=1) {
        const index={'fire-scout':0,'ice-scout':1,'storm-scout':2,'life-scout':3,'death-scout':4,'water-bubble':5,'death-bubble':4,pet:6}[id]??5;
        const bob=Math.sin(t*2.8+x)*3;shadow(c,x,y,27*scale);assets.tile(c,'creatures',index,x-45*scale,y-84*scale+bob,90*scale,88*scale);
    }
    function render(world,save,time,{moving=false,path=[],title=false}={}) {
        const {w,h}=size(),t=time/1000;ctx.clearRect(0,0,w,h);
        cam.scale=w<650?.82:1;const center=title?{x:875+Math.sin(t*.04)*60,y:770}:save.position;
        cam.x=center.x-w/(2*cam.scale);cam.y=center.y-h/(2*cam.scale)+(w<650?50:25);
        ctx.save();ctx.scale(cam.scale,cam.scale);ctx.translate(-cam.x,-cam.y);ctx.drawImage(ground(world),0,0);
        // Moving water highlights, grounded visual-only ambient animation.
        ctx.strokeStyle='#e3f3da33';ctx.lineWidth=2;
        for(let i=0;i<38;i++){const x=(i*151+t*8)%1750,y=80+(i*269)%1450;if(onIsland(x,y,-12))continue;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+13,y+4,x+26,y);ctx.stroke();}
        if(path.length&&!title){ctx.strokeStyle='#fff6bc88';ctx.setLineDash([3,10]);ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(save.position.x,save.position.y);for(const p of path)ctx.lineTo(p.x,p.y);ctx.stroke();ctx.setLineDash([]);const end=path[path.length-1];circleRune(ctx,end.x,end.y,15,t,'#fff3ae');}
        circleRune(ctx,world.portal.x,world.portal.y,45,t,save.graduated?'#e9e29a':'#a6bab0');
        const objects=[...world.trees.map(x=>({...x,kind:'tree'})),...world.buildings.map(x=>({...x,kind:'building'})),...world.npcs.map(x=>({...x,kind:'npc'})),...world.encounters.map(x=>({...x,kind:'mob'})),{...save.position,kind:'hero'}];
        if(save.pet)objects.push({x:save.position.x-38,y:save.position.y+28,kind:'pet'});
        objects.sort((a,b)=>a.y-b.y);
        for(const o of objects) {
            if(o.x<cam.x-200||o.x>cam.x+w/cam.scale+200||o.y<cam.y-50||o.y>cam.y+h/cam.scale+230)continue;
            if(o.kind==='tree'){ctx.save();if(Math.abs(save.position.x-o.x)<o.size*.4&&save.position.y<o.y&&save.position.y>o.y-o.size*.85)ctx.globalAlpha=.52;shadow(ctx,o.x,o.y,o.size*.3);assets.tile(ctx,'sprites',o.tile,o.x-o.size/2,o.y-o.size+10,o.size,o.size);ctx.restore();}
            if(o.kind==='building'){shadow(ctx,o.x,o.y,o.w*.4);assets.tile(ctx,'sprites',o.tile,o.x-o.w/2,o.y-o.h,o.w,o.h);}
            if(o.kind==='npc') {
                shadow(ctx,o.x,o.y,25);const dragon=[36211,30112].includes(o.id),sw=dragon?100:64,sh=dragon?104:86;
                assets.draw(ctx,o.portrait,o.x-sw/2,o.y-sh+Math.sin(t*1.6+o.id)*1.5,sw,sh);
                plate(ctx,o.name,o.x,o.y+19);
                const marker=questMarker(save,assets.content,o.id);
                if(marker){text(ctx,marker,o.x,o.y-sh-8+Math.sin(t*3)*3,29,'#fff1a3');}
            }
            if(o.kind==='mob') {
                const m=assets.content.monsters[o.monsterId];creature(ctx,o.id,o.x,o.y,t,.8);plate(ctx,m.name,o.x,o.y+18,'#ffebd7');
                const q=currentQuest(save,assets.content),goal=q&&questProgress(save,q).find(g=>g.kind==='defeat'&&g.id===m.goalId&&g.value<g.count);
                if(goal&&questState(save,q.id).accepted)text(ctx,'◇',o.x,o.y-90+Math.sin(t*3)*3,25,'#fff2a9');
            }
            if(o.kind==='hero'){circleRune(ctx,o.x,o.y+2,24,t,'#f7e6a088');avatar(ctx,save,o.x,o.y,t,moving);if(!title)plate(ctx,save.name,o.x,o.y+21);}
            if(o.kind==='pet')creature(ctx,'pet',o.x,o.y,t,.36);
        }
        plate(ctx,world.portal.name,world.portal.x,world.portal.y+48);
        // A few drifting motes. No random calls or dependence on combat seed.
        for(let i=0;i<18;i++){const x=470+(i*97)%950+Math.sin(t*.4+i)*20,y=420+(i*179)%820+Math.cos(t*.3+i)*15;ellipse(ctx,x,y,2,2,`rgba(255,252,181,${.22+.18*Math.sin(t+i)})`);}
        ctx.restore();
        const vignette=ctx.createRadialGradient(w*.5,h*.5,h*.15,w*.5,h*.5,Math.max(w,h)*.68);vignette.addColorStop(0,'transparent');vignette.addColorStop(1,'#113b4b66');ctx.fillStyle=vignette;ctx.fillRect(0,0,w,h);
    }
    function minimap(target,world,save) {
        const c=target.getContext('2d'),w=target.width,h=target.height;c.clearRect(0,0,w,h);c.fillStyle='#6ba7a2';c.fillRect(0,0,w,h);
        const sx=w/world.w,sy=h/world.h;c.save();c.scale(sx,sy);c.drawImage(ground(world),0,0);
        for(const b of world.buildings){c.fillStyle='#627b83';c.fillRect(b.x-45,b.y-60,90,65);}
        for(const n of world.npcs)ellipse(c,n.x,n.y,questMarker(save,assets.content,n.id)?22:13,questMarker(save,assets.content,n.id)?22:13,questMarker(save,assets.content,n.id)?'#ffe89c':'#f6f3d9');
        ellipse(c,save.position.x,save.position.y,25,25,'#184f73');ellipse(c,save.position.x,save.position.y,13,13,'#fff');c.restore();
    }
    function screenToWorld(x,y){return{x:x/cam.scale+cam.x,y:y/cam.scale+cam.y};}
    function renderBattle(target,battle,save,time,presentation) {
        const c=target.getContext('2d'),w=target.clientWidth,h=target.clientHeight,dpr=Math.min(2,devicePixelRatio||1);
        if(target.width!==Math.round(w*dpr)||target.height!==Math.round(h*dpr)){target.width=Math.round(w*dpr);target.height=Math.round(h*dpr);}
        c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
        const t=time/1000,cx=w/2,cy=h*.53,r=Math.min(w*.40,h*.62);
        const haze=c.createRadialGradient(cx,cy,20,cx,cy,r*1.5);haze.addColorStop(0,'#527e7166');haze.addColorStop(1,'transparent');c.fillStyle=haze;c.fillRect(0,0,w,h);
        ellipse(c,cx,cy+18,r+24,r*.56+10,'#112f3c99');ellipse(c,cx,cy,r,r*.54,'#809580');ellipse(c,cx,cy-4,r-9,r*.51,'#c5c4a4');
        circleRune(c,cx,cy-2,r-18,t,'#ebdfaf');circleRune(c,cx,cy-2,r*.62,-t,'#7e9a90');
        const hero={x:cx-r*.56,y:cy+r*.15},enemy={x:cx+r*.54,y:cy-r*.08};
        for(let i=0;i<8;i++){const a=i*TAU/8;circleRune(c,cx+Math.cos(a)*r*.79,cy+Math.sin(a)*r*.4,19,t*.2,'#f2e6b677');}
        const ev=presentation?.event,p=presentation?.progress||0,positions={hero,mob0:enemy};
        for(const id of ['hero','mob0']) {
            const hp=presentation?.hp?.[id]??battle.unitsById[id].hp;
            const hit=presentation?.reactions?.find(reaction=>reaction.target===id);
            const pose=hp>0&&hit?{action:'hit',progress:hit.progress}:battleActorAction(id,hp,ev,p);
            drawAnimatedActor(c,positions[id],pose.action,pose.progress,id==='hero'?1:-1,reducedMotion.matches,()=>{
                if(id==='hero')avatar(c,{...save,facing:2},0,0,t,false,1.4);
                else creature(c,battle.monsterTemplates[0].id,0,0,t,1.55);
            });
        }
        for(const u of [battle.sides.near[0],battle.sides.far[0]]) {
            const at=positions[u.id],hp=presentation?.hp?.[u.id]??u.hp,bw=Math.min(160,w*.27);
            plate(c,u.name,at.x,at.y+25);c.fillStyle='#173843';c.beginPath();c.roundRect(at.x-bw/2,at.y+38,bw,10,5);c.fill();
            c.fillStyle=u.isMob?'#d39a7a':'#8ccc8a';c.beginPath();c.roundRect(at.x-bw/2+2,at.y+40,Math.max(0,(bw-4)*hp/u.maxHp),6,3);c.fill();text(c,`${hp} / ${u.maxHp}`,at.x,at.y+65,11,'#f8f5d9');
            const total=u.pips.normal+u.pips.power;for(let i=0;i<total;i++)ellipse(c,at.x-(total-1)*7+i*14,at.y+82,4,4,i<u.pips.normal?'#78d6e8':'#f5d26d');
            const labels=[...u.standingWards.filter(x=>x.rounds>0).map(w=>`狂风印记 ${battle.resolved.global.stormChargingWardIds.indexOf(w.id)+1}阶 · ${w.rounds}回合`),...u.charms.filter(x=>x>0).map(id=>battle.resolved.charms[id]?.desc),...u.wards.filter(x=>x.id>0).map(w=>battle.resolved.wards[w.id]?.desc),u.dots.length?'持续伤害':'',u.hots.length?'持续治疗':''].filter(Boolean);
            for(let i=0;i<Math.min(2,labels.length);i++)text(c,labels[i]+(i===1&&labels.length>2?` 等${labels.length}项`:''),at.x,at.y+101+i*14,w<650?9:11,'#eedba2');
        }
        if(ev?.type==='cast'||ev?.type==='fizzle') {
            effects.draw(c,{card:battle.resolved.cards[ev.card],progress:p,from:positions[ev.caster],to:positions[ev.target]||positions[ev.caster],center:{x:cx,y:cy-2},width:w,height:h,seed:`${ev.round}:${ev.caster}:${ev.card}`,reducedMotion:reducedMotion.matches,failed:ev.type==='fizzle'});
        }
        if(ev?.type==='damage'||ev?.type==='heal') {
            const at=positions[ev.target];if(at){c.save();c.globalAlpha=1-p*.65;text(c,`${ev.type==='heal'?'+':'−'}${ev.amount}${ev.mark==='c'?' 暴击':''}`,at.x,at.y-100-p*40,26,ev.type==='heal'?'#adf8a0':'#fff0b4');c.restore();}
        }
        return positions;
    }
    return {render,minimap,screenToWorld,renderBattle};
}
