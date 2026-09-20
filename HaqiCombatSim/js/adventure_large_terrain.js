import { createRng, hashSeed } from './rng_core.js';

function polygon(c,points){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();}
function line(c,points,width,color){c.strokeStyle=color;c.lineWidth=width;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();}
function oval(c,x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();}

// A deterministic, world-space painter. It paints either one small terrain tile
// or a low-resolution overview; it never allocates a world-sized bitmap.
export function paintLargeTerrain(c,world,rect={x:0,y:0,w:world.w,h:world.h},overview=false){
    const {layout}=world,{rules}=layout,{terrain}=rules;
    c.fillStyle=terrain.ocean;c.fillRect(rect.x,rect.y,rect.w,rect.h);
    c.lineJoin='round';c.lineCap='round';
    for(const [width,color] of terrain.coastLayers){
        polygon(c,layout.coast);c.strokeStyle=color;c.lineWidth=width;c.stroke();
    }
    polygon(c,layout.coast);c.fillStyle=terrain.sand;c.fill();
    c.save();polygon(c,layout.coast);c.clip();
    polygon(c,layout.coast);c.fillStyle=terrain.base;c.fill();
    for(const r of layout.regions){
        c.save();c.translate(r.x,r.y);c.scale(r.rx,r.ry);
        const g=c.createRadialGradient(0,0,.2,0,0,1.25);g.addColorStop(0,r.color);g.addColorStop(.65,r.color);g.addColorStop(1,r.color+'00');
        oval(c,0,0,1.25,1.25,g);c.restore();
    }
    polygon(c,layout.coast);c.lineWidth=terrain.coastWidth;c.strokeStyle=terrain.sand;c.stroke();
    // Relief contours and small stone fans suggest altitude without animated geometry.
    for(const mountain of layout.mountains||[]){
        const {x:cx,y:cy,biome,scale=1}=mountain,shape=rules.mountain,palette=rules.biomes[biome].mountain||rules.biomes.gold.mountain;
        for(let j=shape.layers-1;j>=0;j--){
            const points=Array.from({length:12},(_,i)=>{const a=i*Math.PI/6,r=(shape.baseRadius+j*shape.stepRadius)*scale*(1+.12*Math.sin(i*4+cx));return[cx+Math.cos(a)*r,cy+Math.sin(a)*r*shape.aspect-j*shape.stepHeight*scale];});
            polygon(c,points);c.fillStyle=palette[Math.min(j,palette.length-1)];c.fill();
            c.strokeStyle=palette.at(-1)+'55';c.lineWidth=3;c.stroke();
        }
    }
    // Patchwork farmland is geometry baked into the ground, not individual sprites.
    for(const farm of layout.farms||[])for(let row=0;row<farm.rows;row++)for(let col=0;col<farm.cols;col++){
        const x=farm.x+col*130,y=farm.y+row*90;
        c.fillStyle=(row+col)%2?'#c3bc70':'#799853';c.fillRect(x,y,115,74);
        for(let j=1;j<6;j++)line(c,[[x+6,y+j*11],[x+107,y+j*11]],3,'#e0cd8a66');
    }
    for(const river of layout.rivers){
        const palette=rules.water[river.material||'water'];
        line(c,river.points,river.width+32,palette.bank);line(c,river.points,river.width+12,palette.edge);
        line(c,river.points,river.width,palette.fill);line(c,river.points,river.width*.52,palette.center);
        line(c,river.points,3,palette.shine);
    }
    for(const l of layout.lakes||[]){
        const palette=rules.water[l.material||'water'];
        oval(c,l.x,l.y,l.rx+18,l.ry+18,palette.bank);oval(c,l.x,l.y,l.rx+6,l.ry+6,palette.edge);
        oval(c,l.x,l.y,l.rx,l.ry,palette.fill);oval(c,l.x,l.y,l.rx*.8,l.ry*.7,palette.center);
    }
    // Every road pass is drawn over the full network to avoid crossing seams.
    for(const [extra,color] of rules.roads.layers){
        for(const p of world.paths)line(c,[[p.a.x,p.a.y],[p.b.x,p.b.y]],Math.max(4,p.width+extra),color);
    }
    for(const b of layout.bridges){
        c.save();c.translate(b.x,b.y);c.rotate(b.angle||0);
        c.fillStyle=rules.bridge.edge;c.fillRect(-b.w/2,-b.h/2,b.w,b.h);
        c.fillStyle=rules.bridge.fill;c.fillRect(-b.w/2+7,-b.h/2+7,b.w-14,b.h-14);
        for(let x=-b.w/2+15;x<b.w/2;x+=17)line(c,[[x,-b.h/2+8],[x,b.h/2-8]],2,rules.bridge.seam);
        c.restore();
    }
    // Tree shade is baked with terrain; only the canopy needs depth ordering.
    for(const t of world.trees){
        if(t.x<rect.x-120||t.x>rect.x+rect.w+120||t.y<rect.y-120||t.y>rect.y+rect.h+120)continue;
        oval(c,t.x-10,t.y+5,t.size*.48,t.size*.24,terrain.shadow);
    }
    for(const d of layout.details||[]){
        if(d.x<rect.x-20||d.x>rect.x+rect.w+20||d.y<rect.y-20||d.y>rect.y+rect.h+20)continue;
        oval(c,d.x,d.y,d.size,d.size*.5,rules.biomes[d.biome].color);oval(c,d.x-1,d.y-2,d.size*.7,d.size*.25,'#fff2ce30');
    }
    for(const f of layout.features||[]){
        const s=f.size;
        if(f.kind==='goldTree'){
            c.fillStyle='#8d7040';c.fillRect(f.x-s*.09,f.y-s*.65,s*.18,s*.65);
            for(const [dx,dy,k] of [[0,-.8,.45],[-.28,-.65,.32],[.28,-.65,.32],[0,-1,.3]])oval(c,f.x+dx*s,f.y+dy*s,s*k,s*k*.85,'#e4bd55');
            oval(c,f.x-s*.12,f.y-s*.95,s*.23,s*.17,'#f5db7e');
        }else if(f.kind==='ruins'){
            c.fillStyle='#a89b79';c.fillRect(f.x-s*.6,f.y-s*.12,s*1.2,s*.18);
            for(const dx of [-.45,-.15,.15,.45]){c.fillStyle='#cdbd91';c.fillRect(f.x+dx*s-s*.06,f.y-s*.65,s*.12,s*.55);c.fillStyle='#e0cea4';c.fillRect(f.x+dx*s-s*.09,f.y-s*.7,s*.18,s*.09);}
        }
    }
    const plaza=rules.plaza;
    oval(c,world.center.x,world.center.y,plaza.radiusX,plaza.radiusY,plaza.edge);oval(c,world.center.x,world.center.y,plaza.radiusX-11,plaza.radiusY-9,plaza.fill);
    c.strokeStyle=plaza.line;c.lineWidth=2;
    for(let i=0;i<3;i++){c.beginPath();c.ellipse(world.center.x,world.center.y,145-i*36,83-i*20,0,0,Math.PI*2);c.stroke();}
    if(!overview){
        // Grid-seeded texture is identical at adjoining tile boundaries.
        const {cell,count,light,dark}=terrain.texture;
        for(let gy=Math.floor(rect.y/cell);gy<=Math.floor((rect.y+rect.h)/cell);gy++)for(let gx=Math.floor(rect.x/cell);gx<=Math.floor((rect.x+rect.w)/cell);gx++){
            const rng=createRng(hashSeed(`${gx}:${gy}:${world.zone}-ground`));
            for(let i=0;i<count;i++){
                const x=gx*cell+rng.int(4,cell-4),y=gy*cell+rng.int(4,cell-4);
                // The enclosing coast clip already removes offshore marks.
                oval(c,x,y,rng.int(1,3),1,i%3?light:dark);
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
