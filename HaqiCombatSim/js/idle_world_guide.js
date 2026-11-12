import {createIslandHeroNavigation} from './island_hero_navigation.js';
import {companionWorldTarget} from './companion_guide_core.js';

// Existing path algorithm, time-sliced on idle only. It never controls the player.
export function createIdleWorldGuide(){
    const navigation=createIslandHeroNavigation({workerFactory:null});
    let scope=null,owner=null,lastInput=0,requested='',route=[],alpha=0,lastFrame=0,active=false;
    function activity(now){lastInput=now;requested='';navigation.cancel();}
    function clear(){navigation.cancel();scope=null;owner=null;route=[];alpha=0;requested='';active=false;}
    function update(world,save,content,now,{moving=false,disabled=false,reduced=false}={}){
        if(scope!==world||owner!==save){clear();scope=world;owner=save;lastInput=now;}
        const dt=Math.max(0,Math.min(100,now-lastFrame));lastFrame=now;
        if(disabled||moving){activity(now);}
        const idle=now-lastInput;
        active=!disabled&&!moving&&!reduced&&idle>=8000&&idle<18000;
        alpha=Math.max(0,Math.min(1,alpha+(active?dt/350:-dt/220)));
        if(!alpha&&!active)route=[];
        if(!active)return;
        const target=companionWorldTarget(save,content,world);
        if(!target){route=[];return;}
        const key=`${target.kind}:${target.id}:${target.x}:${target.y}`;
        if(key===requested)return;
        navigation.cancel();requested=key;route=[];
        const from={...save.position};
        navigation.request(world,from,target,{roleId:String(save.seed),isLive:()=>scope===world&&owner===save&&active&&requested===key&&Math.hypot(save.position.x-from.x,save.position.y-from.y)<2,onResult:path=>{route=[from,...path];}});
    }
    function draw(ctx,now){
        if(!alpha||route.length<2)return;
        ctx.save();ctx.strokeStyle='#ffeeb3';ctx.fillStyle='#fff9d8';ctx.globalAlpha=alpha*.38;ctx.lineWidth=2;
        ctx.setLineDash([2,12]);ctx.lineDashOffset=-now/80;ctx.beginPath();ctx.moveTo(route[0].x,route[0].y);
        // A short trail shows the next leg without cluttering the whole map.
        let budget=280;
        for(let i=1;i<route.length&&budget>0;i++){const a=route[i-1],b=route[i],len=Math.hypot(b.x-a.x,b.y-a.y);const ratio=Math.min(1,budget/(len||1));ctx.lineTo(a.x+(b.x-a.x)*ratio,a.y+(b.y-a.y)*ratio);budget-=len;}
        ctx.stroke();ctx.setLineDash([]);ctx.restore();
    }
    return{activity,update,draw,clear,get active(){return alpha>0;}};
}
