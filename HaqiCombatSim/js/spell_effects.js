// Canvas presentation. All card choices/timing/art references live in spell-effects.json.
import { effectParticles, spellEffect } from './spell_effects_core.js';
const TAU=Math.PI*2,clamp=v=>Math.max(0,Math.min(1,v));
function disc(c,x,y,r,color){c.fillStyle=color;c.beginPath();c.arc(x,y,Math.max(.1,r),0,TAU);c.fill();}
function line(c,points,color,width=2){c.strokeStyle=color;c.lineWidth=width;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();}
function rune(c,x,y,r,t,color){c.save();c.translate(x,y);c.scale(1,.42);c.rotate(t*TAU*.3);c.strokeStyle=color;c.lineWidth=2;c.beginPath();c.arc(0,0,r,0,TAU);c.stroke();c.beginPath();c.arc(0,0,r*.8,0,TAU);c.stroke();for(let i=0;i<10;i++){const a=i*TAU/10;c.save();c.rotate(a);c.strokeRect(r*.87,-3,6,6);c.restore();}c.beginPath();for(let i=0;i<=5;i++){const a=i*TAU*2/5;c.lineTo(Math.cos(a)*r*.75,Math.sin(a)*r*.75);}c.stroke();c.restore();}
function shard(c,x,y,size,angle,color){c.save();c.translate(x,y);c.rotate(angle);c.fillStyle=color;c.beginPath();c.moveTo(0,-size*2.4);c.lineTo(size*.5,0);c.lineTo(0,size*.65);c.lineTo(-size*.5,0);c.closePath();c.fill();c.strokeStyle='#ffffffb0';c.lineWidth=.8;c.stroke();c.restore();}
export function createSpellEffects(assets) {
    const config=assets.effects,cache=new Map();
    function draw(c,{card,progress,from,to,width,height,seed=0,reducedMotion=false,failed=false}) {
        const spec=spellEffect(config,card);if(!spec||!from||!to)return;
        const p=clamp(progress),col=spec.palette,[primary,light,dark]=col;
        const scale=Math.min(1,width/650,height/330),radius=70*scale*spec.scale;
        const a={x:from.x,y:from.y-52*scale},b={x:to.x,y:to.y-52*scale};
        const cacheKey=card.key+':'+seed;
        if(!cache.has(cacheKey)){if(cache.size>128)cache.clear();cache.set(cacheKey,effectParticles(card.key,spec.count,seed));}
        const particles=cache.get(cacheKey);
        c.save();c.lineCap='round';
        if(reducedMotion){c.globalAlpha=Math.sin(p*Math.PI)*.65;rune(c,b.x,b.y+40*scale,radius,p*.1,primary);c.restore();return;}
        // A soft darkening gives particles contrast without white screen flashes.
        c.fillStyle=`rgba(10,14,35,${Math.sin(p*Math.PI)*.22})`;c.fillRect(0,0,width,height);
        c.shadowColor=primary;c.shadowBlur=12*scale;c.globalAlpha=Math.min(1,p*8,(1-p)*7);
        rune(c,a.x,from.y+4,radius*(.65+Math.sin(p*Math.PI)*.15),p,primary);
        const summon=spec.kind==='summon',attackStart=summon?config.timeline.summonAttack:config.timeline.attack,impact=summon?config.timeline.summonImpact:config.timeline.impact;
        const flight=clamp((p-attackStart)/(impact-attackStart)),hit=clamp((p-impact)/(1-impact));
        if(failed){c.globalAlpha*=1-p;for(const v of particles.slice(0,20))disc(c,a.x+Math.cos(v.angle)*radius*p,a.y-Math.sin(v.angle)*radius*p,2*scale,'#9aa1af');c.restore();return;}
        if(summon) {
            const def=spec.summonDef,emerge=clamp(p/.26),fade=clamp((1-p)/.15),dir=b.x>=a.x?1:-1;
            const sx=a.x+dir*radius*.8+dir*Math.sin(flight*Math.PI)*radius*.45,sy=from.y-10*scale;
            c.save();c.globalAlpha*=emerge*fade;rune(c,sx,sy,radius*1.1,p,light);
            for(const v of particles.slice(0,24)){const phase=(p*1.4+v.phase)%1;disc(c,sx+Math.cos(v.angle+p*5)*radius*(1-phase),sy-phase*170*scale,v.size*scale,primary);}
            c.shadowBlur=0;c.translate(sx,sy);c.scale(dir,1);c.rotate(Math.sin(flight*TAU)*.065);
            const size=def.size*scale*(.75+.25*emerge),tile=flight>.05?(def.attackTile??def.tile):def.tile;
            assets.draw(c,{id:def.asset,crop:config.frames[tile]},-size/2,-size*emerge,size,size*emerge);c.restore();
        }
        const kind=summon?spec.attack:spec.kind;
        const x=a.x+(b.x-a.x)*flight,y=a.y+(b.y-a.y)*flight-Math.sin(flight*Math.PI)*55*scale;
        if(['shield','blade','trap','heal'].includes(kind)) {
            const r=radius*(.4+.6*Math.sin(p*Math.PI/2));
            rune(c,b.x,to.y,r,p,primary);
            if(kind==='shield') {
                c.save();c.translate(b.x,b.y);c.scale(scale,scale);const grow=Math.min(1,p*5);c.scale(grow,grow);c.fillStyle=primary+'44';c.strokeStyle=light;c.lineWidth=3;c.beginPath();c.moveTo(-49,-54);c.lineTo(0,-72);c.lineTo(49,-54);c.lineTo(41,12);c.quadraticCurveTo(24,43,0,59);c.quadraticCurveTo(-24,43,-41,12);c.closePath();c.fill();c.stroke();line(c,[[0,-47],[0,29]],light,4);line(c,[[-24,-10],[24,-10]],light,4);c.restore();
            } else if(kind==='blade') {
                for(let i=0;i<3;i++){const ang=p*TAU+i*TAU/3;shard(c,b.x+Math.cos(ang)*r,b.y+Math.sin(ang)*r*.4,15*scale,ang+.8,light);}
            } else if(kind==='trap') {
                for(let i=0;i<8;i++){const ang=i*TAU/8;shard(c,b.x+Math.cos(ang)*r,to.y+Math.sin(ang)*r*.4-18*scale,17*scale,0,primary);}
            }
            for(const v of particles){const q=(v.phase+p*.8)%1;c.globalAlpha= Math.sin(p*Math.PI)*Math.sin(q*Math.PI);const px=b.x+Math.cos(v.angle)*r*v.speed,py=to.y-q*145*scale;if(kind==='heal'){line(c,[[px-3*scale,py],[px+3*scale,py]],light,2);line(c,[[px,py-3*scale],[px,py+3*scale]],light,2);}else disc(c,px,py,v.size*scale,primary);}
        } else {
            if(p>=attackStart&&flight<1) {
                if(kind==='lightning') {
                    for(let branch=0;branch<3;branch++){const pts=[];for(let i=0;i<=12;i++){const v=i/12;pts.push([a.x+(b.x-a.x)*v,a.y+(b.y-a.y)*v+Math.sin(i*17+Math.floor(p*24)+branch*7)*(i===0||i===12?0:23)*scale]);}line(c,pts,primary,7*scale);line(c,pts,light,2*scale);}
                } else if(kind==='meteor') {
                    const mx=b.x-110*scale*(1-flight),my=b.y-200*scale*(1-flight);
                    line(c,[[mx-60*scale,my-110*scale],[mx,my]],primary,16*scale);shard(c,mx,my,30*scale,2.7,light);
                } else if(kind==='swords') {
                    for(let i=0;i<5;i++){const q=clamp(flight*1.5-i*.11),sx=a.x+(b.x-a.x)*q,sy=a.y+(b.y-a.y)*q+(i-2)*18*scale*(1-q)-Math.sin(q*Math.PI)*60*scale;shard(c,sx,sy,18*scale,Math.atan2(b.y-a.y,b.x-a.x)+Math.PI/2,light);line(c,[[sx-(b.x>=a.x?40:-40)*scale,sy],[sx,sy]],primary,3*scale);}
                } else if(kind==='vines') {
                    for(let i=0;i<7;i++){const vx=b.x+(i-3)*17*scale;c.strokeStyle=i%2?light:primary;c.lineWidth=5*scale;c.beginPath();c.moveTo(vx,to.y);c.bezierCurveTo(vx-35*scale,to.y-40*scale*flight,vx+40*scale,to.y-80*scale*flight,vx,to.y-150*scale*flight);c.stroke();shard(c,vx,to.y-110*scale*flight,10*scale,.7,primary);}
                } else if(kind==='vortex') {
                    for(let i=0;i<16;i++){const ang=i*.8+p*22,rr=radius*(1-i/22);disc(c,b.x+Math.cos(ang)*rr,b.y+30*scale-i*5*scale+Math.sin(ang)*rr*.28,(3+i*.35)*scale,i%3?primary:light);}
                } else {
                    line(c,[[a.x,a.y],[x,y]],dark,9*scale);disc(c,x,y,13*scale,primary);disc(c,x,y,6*scale,light);
                }
                for(const v of particles.slice(0,30)){const q=clamp(flight-v.phase*.2);disc(c,a.x+(b.x-a.x)*q+Math.cos(v.angle)*12*scale,a.y+(b.y-a.y)*q-Math.sin(q*Math.PI)*55*scale+Math.sin(v.angle)*12*scale,v.size*scale,primary);}
            }
            if(hit>0) {
                c.globalAlpha=1-hit;c.strokeStyle=light;c.lineWidth=(1-hit)*5*scale;c.beginPath();c.ellipse(b.x,b.y,radius*hit*1.5,radius*hit,0,0,TAU);c.stroke();
                for(const v of particles){const travel=radius*(.2+hit*1.6)*v.speed,px=b.x+Math.cos(v.angle)*travel,py=b.y+Math.sin(v.angle)*travel+hit*hit*35*scale;
                    if(card.spellSchool==='ice')shard(c,px,py,v.size*scale*2,v.spin+hit*2,hit<.3?light:primary);else disc(c,px,py,v.size*scale*(1-hit*.6),v.phase>.5?primary:light);
                }
                if(kind==='drain')for(const v of particles.slice(0,20)){const q=clamp(hit*1.4-v.phase*.3);disc(c,b.x+(a.x-b.x)*q,b.y+(a.y-b.y)*q+Math.sin(q*TAU+v.angle)*20*scale,3*scale,primary);}
            }
        }
        c.restore();
    }
    return {draw};
}
