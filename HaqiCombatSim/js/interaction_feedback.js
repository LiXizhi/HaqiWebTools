import {createRng} from './rng_core.js';

// Presentation only. Never consumes battle RNG or changes position/save/rewards.
const clamp=v=>Math.max(0,Math.min(1,v));
export const Easing=Object.freeze({
    outCubic:t=>1-(1-clamp(t))**3,
    outBack:t=>{const q=clamp(t)-1;return 1+2.70158*q*q*q+1.70158*q*q;},
    magic:t=>{
        // Invert x for cubic-bezier(.16,1,.3,1); bounded and independent of FPS.
        const x=clamp(t);let lo=0,hi=1,u=x;
        for(let i=0;i<12;i++){u=(lo+hi)/2;const a=1-u;const bx=3*a*a*u*.16+3*a*u*u*.3+u*u*u;if(bx<x)lo=u;else hi=u;}
        return x===0?0:x===1?1:1-(1-u)**3;
    },
});

export class ParticleSystem {
    constructor({limit=96,seed=11212}={}){this.limit=Math.max(0,limit);this.rng=createRng(seed);this.items=[];}
    emit(x,y,now,{count=7,dust=false}={}){
        if(!Number.isFinite(x+y+now))return;
        for(let i=0;i<count;i++){
            if(this.items.length>=this.limit)this.items.shift();
            if(!this.limit)break;
            const rng=this.rng;
            this.items.push({x:x+(rng.float()-.5)*12,y:y+(rng.float()-.5)*5,born:now,life:dust?360:650,vx:(rng.float()-.5)*(dust?22:85),vy:-(dust?10:35)-rng.float()*(dust?12:45),size:dust?3+rng.float()*3:1+rng.float()*2,dust});
        }
    }
    clear(){this.items.length=0;}
    draw(ctx,now){
        this.items=this.items.filter(p=>now-p.born<p.life&&now>=p.born);
        ctx.save();
        for(const p of this.items){const age=(now-p.born)/1000,q=(now-p.born)/p.life;ctx.globalAlpha=(1-q)*(p.dust?.22:.8);ctx.fillStyle=p.dust?'#e9deb9':'#fff4be';ctx.beginPath();ctx.arc(p.x+p.vx*age/(1+age),p.y+p.vy*age+(p.dust?4:95)*age*age,p.size*(p.dust?1+q:1-q*.5),0,Math.PI*2);ctx.fill();}
        ctx.restore();
    }
}

export class ScreenShake {
    constructor(){this.clear();}
    clear(){this.born=-Infinity;this.duration=0;this.amount=0;}
    trigger(now,{amount=4,duration=200}={}){this.born=now;this.duration=Math.max(1,Math.min(400,duration));this.amount=Math.max(0,Math.min(4,amount));}
    offset(now,reduced=false){const q=(now-this.born)/this.duration;if(reduced||q<0||q>=1)return{x:0,y:0};const a=this.amount*(1-q)**2;return{x:Math.sin(q*31)*a,y:Math.sin(q*43)*a*.65};}
}

// Real reward events may enqueue one visual; completion never awards anything.
export class FloatingFeedback {
    constructor({limit=24}={}){this.limit=limit;this.items=[];}
    add({from,to,text='',image=null,now,onArrive}){if(!from||!to||!Number.isFinite(from.x+from.y+to.x+to.y+now))return;this.items.push({from:{...from},to:{...to},text:String(text),image,born:now,onArrive});while(this.items.length>this.limit)this.items.shift();}
    clear(){this.items.length=0;}
    draw(ctx,now,{reduced=false}={}){
        const pending=[];ctx.save();ctx.textAlign='center';ctx.font='600 17px sans-serif';
        for(const item of this.items){const age=now-item.born;if(age<0){pending.push(item);continue;}if(age>=950){item.onArrive?.();continue;}pending.push(item);const q=clamp((age-300)/650),t=q*q,inv=1-t;const control={x:(item.from.x+item.to.x)/2,y:Math.min(item.from.y,item.to.y)-65};const x=reduced?item.to.x:inv*inv*item.from.x+2*inv*t*control.x+t*t*item.to.x;const y=reduced?item.to.y:inv*inv*item.from.y+2*inv*t*control.y+t*t*item.to.y;ctx.globalAlpha=reduced?1-q:1;ctx.strokeStyle='#244f3b';ctx.lineWidth=3;if(item.image)ctx.drawImage(item.image,x-16,y-37,32,32);ctx.strokeText(item.text,x,y);ctx.fillStyle='#fff3bd';ctx.fillText(item.text,x,y);}
        ctx.restore();this.items=pending;
    }
}

export function createInteractionFeedback(){
    const particles=new ParticleSystem(),floating=new FloatingFeedback(),shake=new ScreenShake();
    let scope=null,identity='',rings=[],clicks=new Map(),hover=null,previousMoving=false,transition=-Infinity,lastDust=-Infinity,reduced=false,enabled=true,lastTime=0;
    function clear(){particles.clear();floating.clear();shake.clear();rings=[];clicks.clear();hover=null;previousMoving=false;transition=-Infinity;lastDust=-Infinity;}
    function click(point,target,now){
        if(!enabled||!point)return;
        if(target?.kind==='npc'){clicks.set(String(target.instanceId??target.id),now);}
        else if(!target){rings.push({...point,born:now});if(rings.length>8)rings.shift();if(!reduced)particles.emit(point.x,point.y,now);}
    }
    function update(world,save,now,{moving=false,disabled=false,reducedMotion=false,particlesEnabled=true}={}){
        const id=`${save.name}:${save.seed}`;
        if(scope!==world||identity!==id){clear();scope=world;identity=id;}
        reduced=reducedMotion;enabled=!disabled;lastTime=now;
        if(disabled){clear();return;}
        if(reduced||!particlesEnabled)particles.clear();
        if(moving!==previousMoving){transition=now;previousMoving=moving;}
        if(moving&&!reduced&&particlesEnabled&&now-lastDust>=180){particles.emit(save.position.x,save.position.y+3,now,{count:2,dust:true});lastDust=now;}
        rings=rings.filter(r=>now-r.born<450);
        for(const [id,born] of clicks)if(now-born>180)clicks.delete(id);
    }
    function heroPose(now){if(reduced||!enabled)return{x:1,y:1};const duration=previousMoving?60:80,q=(now-transition)/duration;if(q<0||q>=1)return{x:1,y:1};const strength=Math.sin(q*Math.PI)*(previousMoving?1:-.6);return{x:1+.08*strength,y:1-.08*strength};}
    function npcPose(npc,player,now){
        if(!enabled)return{lift:0,glow:false,facing:npc.facing||0};
        const id=String(npc.instanceId??npc.id),near=Math.hypot(npc.x-player.x,npc.y-player.y)<=120,active=hover===id||near;
        const clickTime=clicks.get(id),q=clickTime===undefined?2:(now-clickTime)/150;
        const jump=!reduced&&q>=0&&q<1?Math.sin(q*Math.PI)*8:0;
        const lift=reduced?0:jump+(active?2+Math.sin(now/1500*Math.PI*2)*2:0);
        const dx=player.x-npc.x,dy=player.y-npc.y;
        return{lift,glow:active,facing:clickTime===undefined?(npc.facing||0):Math.abs(dx)>Math.abs(dy)?(dx<0?1:2):(dy<0?3:0)};
    }
    function drawGround(ctx,now){
        if(!enabled)return;
        ctx.save();
        for(const ring of rings){const q=clamp((now-ring.born)/450),s=reduced?1:Easing.magic(q);ctx.globalAlpha=(1-q)*.9;ctx.strokeStyle='#fff6bd';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(ring.x,ring.y,22*(.2+s),11*(.2+s),0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([3,5]);ctx.globalAlpha*=(1-q);ctx.beginPath();ctx.ellipse(ring.x,ring.y,30*(.3+s),15*(.3+s),0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
        ctx.restore();particles.draw(ctx,now);
    }
    return{click,update,heroPose,npcPose,drawGround,clear,particles,floating,shake,hover:target=>{hover=target?.kind==='npc'?String(target.instanceId??target.id):null;},active:()=>enabled&&(rings.length>0||particles.items.length>0||clicks.size>0||floating.items.length>0||lastTime-transition<100)};
}
