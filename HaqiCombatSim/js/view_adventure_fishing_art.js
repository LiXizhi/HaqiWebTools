import {fishSize,fishingTuning} from './adventure_fishing_records_core.js';
const TAU=Math.PI*2;
const mix=(a,b,t)=>a+(b-a)*t;
const clamp=t=>Math.max(0,Math.min(1,t));
function ellipse(c,x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fill();}
function ripple(c,x,y,r,alpha=1){c.save();c.globalAlpha=alpha;c.strokeStyle='#e4fff4';c.lineWidth=1.7;c.beginPath();c.ellipse(x,y,r,r*.38,0,0,TAU);c.stroke();c.restore();}
function fish(c,x,y,size,angle,color='#f4ca70'){
    c.save();c.translate(x,y);c.rotate(angle);c.scale(size,size);
    c.fillStyle=color;c.beginPath();c.moveTo(-15,0);c.lineTo(-29,-12);c.quadraticCurveTo(-24,0,-29,12);c.closePath();c.fill();
    ellipse(c,0,0,22,13,color);ellipse(c,4,5,15,6,'#fff5ce88');
    c.fillStyle='#d79849';c.beginPath();c.moveTo(-4,-8);c.lineTo(1,-20);c.lineTo(11,-9);c.fill();
    ellipse(c,12,-3,4.2,5,'#fff9e8');ellipse(c,13,-3,2.2,3,'#234849');
    c.strokeStyle='#ba7b39';c.lineWidth=1.5;c.beginPath();c.arc(2,0,9,-1,1);c.stroke();c.restore();
}
function catchArt(c,assets,result,x,y,size,angle=0){
    const trophy=result?.catches?.slice().sort((a,b)=>b.grams-a.grams)[0];
    const id=trophy?.itemId??result?.items?.[0]?.id,ref=id&&assets.content.items[id]?.art;
    c.save();c.translate(x,y);c.rotate(angle);
    if(!ref||!assets.draw(c,ref,-size/2,-size/2,size,size,true,false))fish(c,0,0,size/60,0);
    c.restore();
}

export function fishingCatchLayout(s){
    const grams=Math.max(0,...(s.result?.catches||[]).map(row=>row.grams));
    const tier=fishSize(grams),factor=grams ? .75+1.45*Math.sqrt(Math.min(1,grams/fishingTuning.fishingMaxGrams)):1;
    const size=Math.min((s.compact?64:76)*s.scale*factor,s.compact?128:210,(s.width||800)*.46);
    const side=s.target.x<s.hero.x?-1:1;
    const x=s.compact?s.hero.x+side*155:s.hero.x;
    const y=s.compact?Math.max(size/2+20,s.hero.y-42):Math.max(size/2+110,s.hero.y-102*s.scale);
    return {x,y,size,tier,labelX:s.compact?s.hero.x-side*170:x,labelY:s.compact?Math.max(55,s.hero.y-90):y-size/2-48};
}

// Procedural rod, line and water effects; existing item art supplies the actual catch.
export function drawFishingScene(c,s,assets){
    const {hero:h,target:b,scale:z,phase,elapsed,reduced,result}=s;
    const side=b.x<h.x?-1:1,now=reduced?0:s.time;
    const casting=phase==='cast',reeling=phase==='reel',show=phase==='show'&&result?.caught;
    const trophy=fishingCatchLayout(s),big=trophy.tier!=='normal';
    const cp=reduced?1:clamp(elapsed/600),rp=reduced?1:clamp(elapsed/1100);
    const lean=s.pose?.lean||0;
    const hand={x:h.x+(side*12*Math.cos(lean)+40*Math.sin(lean))*z,y:h.y+(side*12*Math.sin(lean)-40*Math.cos(lean)-(s.pose?.lift||0))*z};
    const angle=casting?mix(-side*1.9,side*.85,cp):reeling?mix(side*.85,-side*.65,Math.sin(rp*Math.PI/2)):side*.85;
    const pullX=reduced?0:s.pose?.pullX||0,pullY=reduced?0:s.pose?.pullY||0;
    const tip={x:hand.x+(Math.sin(angle)*99+pullX*42)*z,y:hand.y+(-Math.cos(angle)*99+pullY*34)*z};
    const bend=(phase==='rest'?20+Math.sin(now/38)*5:phase==='bite'?15:reeling?Math.sin(rp*Math.PI)*24:0)*z;
    const control={x:mix(hand.x,tip.x,.53)+side*bend,y:mix(hand.y,tip.y,.53)+bend};
    c.save();c.lineCap='round';
    // Rod is held at the same hand height as the player's standing sprite.
    c.strokeStyle='#624024';c.lineWidth=5*z;c.beginPath();c.moveTo(hand.x-side*9*z,hand.y+12*z);c.lineTo(hand.x,hand.y);c.stroke();
    c.strokeStyle='#c49b59';c.lineWidth=3*z;c.beginPath();c.moveTo(hand.x,hand.y);c.quadraticCurveTo(control.x,control.y,tip.x,tip.y);c.stroke();
    c.strokeStyle='#ffe3a4';c.lineWidth=1*z;c.beginPath();c.moveTo(hand.x+z,hand.y);c.quadraticCurveTo(control.x+z,control.y,tip.x,tip.y);c.stroke();
    ellipse(c,hand.x-side*5*z,hand.y+4*z,5*z,5*z,'#d1ab59');ellipse(c,hand.x-side*5*z,hand.y+4*z,2*z,2*z,'#4d6860');
    let float={...b};
    if(casting){float={x:mix(hand.x,b.x,cp),y:mix(hand.y,b.y,cp)-Math.sin(cp*Math.PI)*88*z};}
    if(reeling&&!result?.caught){float={x:mix(b.x,tip.x,rp),y:mix(b.y,tip.y,rp)-Math.sin(rp*Math.PI)*35*z};}
    if(reeling&&result?.caught){
        const p=clamp((rp-.15)/.85);
        float={x:mix(b.x,trophy.x,p),y:mix(b.y,trophy.y,p)-Math.sin(p*Math.PI)*90*z};
    }
    const inWater=['wait','bite','rest'].includes(phase);
    if(inWater){float.x+=pullX*7*z;float.y+=pullY*5*z;}
    if(inWater){float.y+=(phase==='rest'?Math.sin(now/40)*5:phase==='bite'?6+Math.sin(now/45)*3:Math.sin(now/330)*2)*z;}
    if(casting||inWater||reeling){
        c.strokeStyle='#153e4955';c.lineWidth=2.8*z;c.beginPath();c.moveTo(tip.x,tip.y);c.quadraticCurveTo(mix(tip.x,float.x,.5),mix(tip.y,float.y,.5)+(phase==='bite'||reeling?0:15*z),float.x,float.y);c.stroke();
        c.strokeStyle='#f9ffef';c.lineWidth=1.25*z;c.stroke();
        if(inWater){
            const wave=(now%1100)/1100;ripple(c,b.x,b.y,(12+wave*20)*z,1-wave*.85);
            if(phase==='bite')ripple(c,b.x,b.y,27*z,.85);
            else{
                c.save();c.globalAlpha=.28;
                const approach=.5+.5*Math.sin(now/1200);fish(c,b.x+side*(18+approach*28)*z,b.y+9*z,.65*z,side<0?Math.PI:0,'#103e4b');c.restore();
            }
        }
        if(!reeling||!result?.caught){
            ellipse(c,float.x,float.y+4*z,4*z,2*z,'#123e4944');
            c.strokeStyle='#604b35';c.lineWidth=1.5*z;c.beginPath();c.moveTo(float.x,float.y);c.lineTo(float.x,float.y-15*z);c.stroke();
            ellipse(c,float.x,float.y-3*z,4*z,7*z,'#fff7d9');ellipse(c,float.x,float.y-7*z,4*z,4*z,'#ef7650');
        }
    }
    if((casting&&cp>.8)||(reeling&&rp<.65)){
        const progress=casting?(cp-.8)/.2:rp/.65;
        if(big&&reeling&&!reduced){ripple(c,b.x,b.y,(20+progress*72)*z,1-progress);ripple(c,b.x,b.y,(10+progress*52)*z,1-progress);}
        ripple(c,b.x,b.y,(8+progress*34)*z,1-progress);
        for(let i=0;i<7;i++){const a=i/7*TAU;ellipse(c,b.x+Math.cos(a)*progress*38*z,b.y+Math.sin(a)*progress*13*z-Math.sin(progress*Math.PI)*30*z,2*z,4*z,`rgba(226,255,250,${1-progress})`);}
    }
    if(reeling&&result?.caught){
        const p=clamp((rp-.15)/.85),x=mix(b.x,trophy.x,p),y=mix(b.y,trophy.y,p)-Math.sin(p*Math.PI)*90*z;
        catchArt(c,assets,result,x,y,mix(38*z,trophy.size,p),reduced?0:-side*Math.sin(p*Math.PI)*.8);
    }
    if(show){
        if(big){
            const radius=trophy.size*.65;
            c.save();c.translate(trophy.x,trophy.y);
            ellipse(c,0,0,radius,radius,'#ffe39724');
            for(let i=0;i<16;i++){
                const angle=i/16*TAU+(reduced?0:elapsed/2400),r=radius+(reduced?0:Math.sin(elapsed/180+i)*7);
                const x=Math.cos(angle)*r,y=Math.sin(angle)*r;c.fillStyle=i%2?'#fff5c4':'#ffd365';
                c.beginPath();c.moveTo(x,y-5);c.lineTo(x+3,y);c.lineTo(x,y+5);c.lineTo(x-3,y);c.closePath();c.fill();
            }c.restore();
        }
        const fy=trophy.y,turn=reduced?0:elapsed/1400;
        c.save();c.translate(trophy.x,fy);c.rotate(turn);
        for(let i=0;i<10;i++){c.rotate(TAU/10);c.fillStyle=i%2?'#fff1b35c':'#f9d47385';c.beginPath();c.moveTo(trophy.size*.4,-3*z);c.lineTo(trophy.size*.68,-5*z);c.lineTo(trophy.size*.68,5*z);c.lineTo(trophy.size*.4,3*z);c.fill();}c.restore();
        catchArt(c,assets,result,trophy.x,fy,trophy.size,reduced?0:Math.sin(elapsed/150)*.06);
    }
    c.restore();
}
