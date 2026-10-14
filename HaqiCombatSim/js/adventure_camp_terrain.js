import {createRng,hashSeed} from './rng_core.js';
import {campScenerySteps} from './adventure_camp_scenery_core.js';

// Called only while baking terrain tiles, on both Worker and fallback paths.
export function* paintCampFloorSteps(c,world,rect,art){
    for(const d of campScenerySteps(world,rect)){
        c.save();c.translate(d.x,d.y);if(d.flip)c.scale(-1,1);
        art?.draw(c,d.atlas,d.frame,-d.size/2,-d.size*.65,d.size,d.size*.75);c.restore();yield;
    }
}
export function* paintCampPlazaSteps(c,world,rect){
    const {x,y}=world.center,{radiusX:rx,radiusY:ry}=world.layout.rules.plaza;
    c.save();c.beginPath();c.ellipse(x,y,rx-12,ry-10,0,0,Math.PI*2);c.clip();
    // Soft limestone variation and staggered joints, with a quiet central medallion.
    const cw=68,ch=34;
    for(let row=Math.floor((rect.y-y)/ch)-1;row<=Math.ceil((rect.y+rect.h-y)/ch);row++){
        for(let col=Math.floor((rect.x-x)/cw)-1;col<=Math.ceil((rect.x+rect.w-x)/cw);col++){
            const rng=createRng(hashSeed(`camp:paving:${row}:${col}`));
            const px=x+col*cw+(row%2)*cw/2,py=y+row*ch;
            if(Math.abs(px-x)>rx+cw||Math.abs(py-y)>ry+ch)continue;
            c.fillStyle=rng.pick(['#fff4d71c','#a6976d10','#e9deb918','#fff8df24']);c.fillRect(px+2,py+2,cw-4,ch-4);
            c.strokeStyle='#8c896c35';c.lineWidth=1;c.beginPath();c.moveTo(px+cw,py);c.lineTo(px,py);c.lineTo(px,py+ch);c.stroke();
            c.strokeStyle='#fff7d93d';c.beginPath();c.moveTo(px+2,py+ch-2);c.lineTo(px+cw-2,py+ch-2);c.stroke();yield;
        }
    }
    const wash=c.createRadialGradient(x,y,15,x,y,150);wash.addColorStop(0,'#efe4c6e0');wash.addColorStop(1,'#efe4c600');c.fillStyle=wash;c.fillRect(x-160,y-160,320,320);
    c.strokeStyle='#b4ac8870';c.lineWidth=3;c.beginPath();c.ellipse(x,y,rx-24,ry-18,0,0,Math.PI*2);c.stroke();
    c.restore();
}
