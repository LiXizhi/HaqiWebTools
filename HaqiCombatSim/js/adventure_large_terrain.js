import { createRng, hashSeed } from './rng_core.js';

function polygon(c,points){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();}
function line(c,points,width,color){c.strokeStyle=color;c.lineWidth=width;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();}
function oval(c,x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();}

// A deterministic, world-space painter. It paints either one small terrain tile
// or a low-resolution overview; it never allocates a world-sized bitmap.
export function paintLargeTerrain(c,world,rect={x:0,y:0,w:world.w,h:world.h},overview=false){
    const {layout}=world;
    c.fillStyle='#438b9b';c.fillRect(rect.x,rect.y,rect.w,rect.h);
    c.lineJoin='round';c.lineCap='round';
    for(const [width,color] of [[150,'#529ba9'],[95,'#75b8bb'],[48,'#b0d6cc'],[18,'#edf0cf']]){
        polygon(c,layout.coast);c.strokeStyle=color;c.lineWidth=width;c.stroke();
    }
    polygon(c,layout.coast);c.fillStyle='#e4d2a4';c.fill();
    c.save();polygon(c,layout.coast);c.clip();
    polygon(c,layout.coast);c.lineWidth=90;c.strokeStyle='#e5d5aa';c.stroke();
    polygon(c,layout.coast);c.fillStyle='#8eb077';c.fill();
    for(const r of layout.regions){
        c.save();c.translate(r.x,r.y);c.scale(r.rx,r.ry);
        const g=c.createRadialGradient(0,0,.2,0,0,1.25);g.addColorStop(0,r.color);g.addColorStop(.65,r.color);g.addColorStop(1,r.color+'00');
        oval(c,0,0,1.25,1.25,g);c.restore();
    }
    polygon(c,layout.coast);c.lineWidth=70;c.strokeStyle='#e5d5aa';c.stroke();
    // Relief contours and small stone fans suggest altitude without animated geometry.
    for(const [cx,cy,snow] of [[1840,900,true],[2390,720,true],[2900,930,true],[3530,1500,false],[3980,1610,false]]){
        for(let j=5;j>=0;j--){
            const points=Array.from({length:12},(_,i)=>{const a=i*Math.PI/6,r=(75+j*31)*(1+.12*Math.sin(i*4+cx));return[cx+Math.cos(a)*r,cy+Math.sin(a)*r*.56-j*7];});
            polygon(c,points);c.fillStyle=snow?['#eff4dd','#d7e5d8','#bad1ce','#9ebcba','#86aaa5','#71938a'][j]:['#ecdc9b','#daca85','#cab474','#bba064','#ac905b','#a08d5f'][j];c.fill();
            c.strokeStyle=snow?'#74968e44':'#806d3f44';c.lineWidth=3;c.stroke();
        }
    }
    // Patchwork farmland is geometry baked into the ground, not individual sprites.
    for(let row=0;row<4;row++)for(let col=0;col<5;col++){
        const x=970+col*130,y=2870+row*90;
        c.fillStyle=(row+col)%2?'#c3bc70':'#799853';c.fillRect(x,y,115,74);
        for(let j=1;j<6;j++)line(c,[[x+6,y+j*11],[x+107,y+j*11]],3,'#e0cd8a66');
    }
    for(const river of layout.rivers){
        line(c,river.points,river.width+32,'#c6c59a');line(c,river.points,river.width+12,'#619d91');
        line(c,river.points,river.width,'#65b8bf');line(c,river.points,river.width*.52,'#80cbd0');
        line(c,river.points,3,'#d6efe466');
    }
    for(const l of layout.lakes||[]){
        oval(c,l.x,l.y,l.rx+18,l.ry+18,'#c6c59a');oval(c,l.x,l.y,l.rx+6,l.ry+6,'#619d91');
        oval(c,l.x,l.y,l.rx,l.ry,'#65b8bf');oval(c,l.x,l.y,l.rx*.8,l.ry*.7,'#80cbd0');
    }
    // Every road pass is drawn over the full network to avoid crossing seams.
    for(const [extra,color] of [[14,'#648554'],[8,'#b2b182'],[0,'#d3c098'],[-12,'#e3d1ac']]){
        for(const p of world.paths)line(c,[[p.a.x,p.a.y],[p.b.x,p.b.y]],Math.max(4,p.width+extra),color);
    }
    for(const b of layout.bridges){
        c.fillStyle='#796c4d';c.fillRect(b.x-b.w/2,b.y-b.h/2,b.w,b.h);
        c.fillStyle='#c4b88c';c.fillRect(b.x-b.w/2+7,b.y-b.h/2+7,b.w-14,b.h-14);
        for(let y=b.y-b.h/2+15;y<b.y+b.h/2;y+=17)line(c,[[b.x-b.w/2+8,y],[b.x+b.w/2-8,y]],2,'#857a5855');
    }
    // Tree shade is baked with terrain; only the canopy needs depth ordering.
    for(const t of world.trees){
        if(t.x<rect.x-120||t.x>rect.x+rect.w+120||t.y<rect.y-120||t.y>rect.y+rect.h+120)continue;
        oval(c,t.x-10,t.y+5,t.size*.48,t.size*.24,'#244b3820');
    }
    oval(c,world.center.x,world.center.y,180,110,'#aaa989');oval(c,world.center.x,world.center.y,169,101,'#dad6b4');
    c.strokeStyle='#b5b18b';c.lineWidth=2;
    for(let i=0;i<3;i++){c.beginPath();c.ellipse(world.center.x,world.center.y,145-i*36,83-i*20,0,0,Math.PI*2);c.stroke();}
    if(!overview){
        // Grid-seeded texture is identical at adjoining tile boundaries.
        const cell=64;
        for(let gy=Math.floor(rect.y/cell);gy<=Math.floor((rect.y+rect.h)/cell);gy++)for(let gx=Math.floor(rect.x/cell);gx<=Math.floor((rect.x+rect.w)/cell);gx++){
            const rng=createRng(hashSeed(`${gx}:${gy}:town-ground`));
            for(let i=0;i<8;i++){
                const x=gx*cell+rng.int(4,60),y=gy*cell+rng.int(4,60);
                // The enclosing coast clip already removes offshore marks.
                oval(c,x,y,rng.int(1,3),1,i%3?'#fff4c21f':'#35523f16');
            }
        }
    }
    c.restore();
}

export function createTerrainTileCache(paint,createCanvas,limit=24){
    const tiles=new Map();let currentWorld=null;
    const pixels=512,bleed=2;
    return {
        draw(c,world,rect,fallback){
            if(currentWorld!==world){tiles.clear();currentWorld=world;}
            let generated=0;
            // Zoomed-out or very wide screens use coarser terrain tiles rather
            // than repeatedly evicting visible tiles or growing mobile memory.
            let size=pixels;
            while((Math.ceil(rect.w/size)+1)*(Math.ceil(rect.h/size)+1)>limit)size*=2;
            const scale=pixels/size,margin=bleed/scale;
            for(let y=Math.max(0,Math.floor(rect.y/size));y<=Math.min(Math.ceil(world.h/size)-1,Math.floor((rect.y+rect.h)/size));y++){
                for(let x=Math.max(0,Math.floor(rect.x/size));x<=Math.min(Math.ceil(world.w/size)-1,Math.floor((rect.x+rect.w)/size));x++){
                    const key=`${size}:${x},${y}`;let tile=tiles.get(key);
                    if(!tile){
                        // Keep a continuous low-resolution floor while new
                        // detail arrives; at most two cold tiles per frame.
                        if(fallback&&generated>=2){fallback(c,x*size,y*size,size);continue;}
                        generated++;
                        tile=createCanvas();tile.width=tile.height=pixels+bleed*2;const tc=tile.getContext('2d');
                        tc.translate(bleed,bleed);tc.scale(scale,scale);tc.translate(-x*size,-y*size);
                        paint(tc,world,{x:x*size-margin,y:y*size-margin,w:size+margin*2,h:size+margin*2});
                    }
                    tiles.delete(key);tiles.set(key,tile);
                    c.drawImage(tile,bleed,bleed,pixels,pixels,x*size,y*size,size,size);
                    while(tiles.size>limit)tiles.delete(tiles.keys().next().value);
                }
            }
        },
        get size(){return tiles.size;},
    };
}
