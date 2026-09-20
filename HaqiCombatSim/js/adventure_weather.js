// Presentation only: a fixed screen-space budget, independent of map area.
import { regionAt } from './adventure_island_layout_core.js';
export function drawIslandWeather(c,world,position,time,w,h,reducedMotion=false,art=null,override=null){
    const weather=override||(world.layout&&regionAt(world,position)?.weather);
    if(!weather||weather.kind==='none'||reducedMotion)return;
    const {kind,color,speed,wind}=weather,count=Math.min(64,weather.count);
    const wrap=(n,max)=>((n%max)+max)%max;
    c.save();c.fillStyle=color;c.strokeStyle=color;c.lineWidth=1;
    for(let i=0;i<count;i++){
        const x=wrap(i*173.31+time*wind+Math.sin(time*.6+i)*9,w+40)-20;
        const y=wrap(i*97.73+time*speed,h+40)-20;
        c.globalAlpha=kind==='mist'?.08:.35+(i%4)*.13;
        if(art){
            const size=kind==='mist'?180:kind==='sand'?70:kind==='ash'?38:kind==='snow'?12+i%3*3:18;
            c.globalAlpha*=kind==='mist'?.8:kind==='sand'?.3:.85;
            if(art.draw(c,'weather',kind,x-size/2,y-size/2,size,size))continue;
        }
        c.beginPath();
        if(kind==='sand'){c.moveTo(x,y);c.lineTo(x+9,y-2);c.stroke();}
        else {const r=kind==='mist'?45:kind==='snow'?1.5+i%3*.5:1.3;c.ellipse(x,y,r,kind==='mist'?r*.25:r,0,0,Math.PI*2);c.fill();}
    }
    c.restore();
}
