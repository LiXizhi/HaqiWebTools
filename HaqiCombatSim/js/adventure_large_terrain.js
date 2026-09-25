import { paintGroundDetail, paintWaterDetail, paintRoadDetail, paintRiverBank } from './adventure_terrain_detail.js';
import { groundDecorations } from './adventure_ground_decorations_core.js';

function polygon(c,points){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();}
function line(c,points,width,color){c.strokeStyle=color;c.lineWidth=width;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();}
function oval(c,x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();}
function hits(rect,x0,y0,x1,y1){return x1>=rect.x&&x0<=rect.x+rect.w&&y1>=rect.y&&y0<=rect.y+rect.h;}
function blend(a,b,t){
    const rgb=[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t));
    return `rgb(${rgb.join(',')})`;
}
function riverClip(c,points,radius){
    c.beginPath();
    for(let i=1;i<points.length;i++){
        const [ax,ay]=points[i-1],[bx,by]=points[i],length=Math.hypot(bx-ax,by-ay)||1;
        const nx=-(by-ay)/length*radius,ny=(bx-ax)/length*radius;
        c.moveTo(ax-nx,ay-ny);c.lineTo(bx-nx,by-ny);c.lineTo(bx+nx,by+ny);c.lineTo(ax+nx,ay+ny);c.closePath();
    }
    for(const [x,y] of points){c.moveTo(x+radius,y);c.arc(x,y,radius,0,Math.PI*2);}
    c.clip();
}

// A deterministic, world-space painter. It paints either one small terrain tile
// or a low-resolution overview; it never allocates a world-sized bitmap.
export function paintLargeTerrain(c,world,rect={x:0,y:0,w:world.w,h:world.h},overview=false,decorationArt=null){
    const {layout}=world,{rules}=layout,{terrain}=rules;
    c.fillStyle=terrain.ocean;c.fillRect(rect.x,rect.y,rect.w,rect.h);
    c.lineJoin='round';c.lineCap='round';
    for(let i=0;i<terrain.coastLayers.length;i++){
        const [width,color]=terrain.coastLayers[i],outer=i?terrain.coastLayers[i-1]:[width+65,terrain.ocean];
        for(let step=1;step<=8;step++){
            polygon(c,layout.coast);c.strokeStyle=blend(outer[1],color,step/8);c.lineWidth=outer[0]+(width-outer[0])*step/8;c.stroke();
        }
    }
    if(!overview){
        paintWaterDetail(c,world,rect,'water',true);
        // Broken crests follow the existing coast, underneath the beach fill.
        c.save();c.setLineDash([18,9,5,13]);
        polygon(c,layout.coast);c.lineWidth=terrain.coastWidth+13;c.strokeStyle='#e7fff050';c.stroke();
        c.restore();
    }
    polygon(c,layout.coast);c.fillStyle=terrain.sand;c.fill();
    c.save();polygon(c,layout.coast);c.clip();
    polygon(c,layout.coast);c.fillStyle=terrain.base;c.fill();
    for(const r of layout.regions){
        if(!hits(rect,r.x-r.rx*1.25,r.y-r.ry*1.25,r.x+r.rx*1.25,r.y+r.ry*1.25))continue;
        c.save();c.translate(r.x,r.y);c.scale(r.rx,r.ry);
        const g=c.createRadialGradient(0,0,.2,0,0,1.25);g.addColorStop(0,r.color);g.addColorStop(.65,r.color);g.addColorStop(1,r.color+'00');
        oval(c,0,0,1.25,1.25,g);c.restore();
    }
    polygon(c,layout.coast);c.lineWidth=terrain.coastWidth;c.strokeStyle=terrain.sand;c.stroke();
    if(!overview)paintGroundDetail(c,world,rect);
    // Relief contours and small stone fans suggest altitude without animated geometry.
    for(const mountain of layout.mountains||[]){
        const {x:cx,y:cy,biome,scale=1}=mountain,shape=rules.mountain,palette=rules.biomes[biome].mountain||rules.biomes.gold.mountain;
        const reach=(shape.baseRadius+(shape.layers-1)*shape.stepRadius)*scale*1.12,lift=(shape.layers-1)*shape.stepHeight*scale;
        if(!hits(rect,cx-reach,cy-reach*shape.aspect-lift,cx+reach,cy+reach*shape.aspect))continue;
        for(let j=shape.layers-1;j>=0;j--){
            const points=Array.from({length:12},(_,i)=>{const a=i*Math.PI/6,r=(shape.baseRadius+j*shape.stepRadius)*scale*(1+.12*Math.sin(i*4+cx));return[cx+Math.cos(a)*r,cy+Math.sin(a)*r*shape.aspect-j*shape.stepHeight*scale];});
            polygon(c,points);c.fillStyle=palette[Math.min(j,palette.length-1)];c.fill();
            c.strokeStyle=palette.at(-1)+'55';c.lineWidth=3;c.stroke();
        }
    }
    // Patchwork farmland is geometry baked into the ground, not individual sprites.
    for(const farm of layout.farms||[]){
        if(!hits(rect,farm.x,farm.y,farm.x+farm.cols*130,farm.y+farm.rows*90))continue;
        for(let row=0;row<farm.rows;row++)for(let col=0;col<farm.cols;col++){
        const x=farm.x+col*130,y=farm.y+row*90;
        if(!hits(rect,x,y,x+115,y+74))continue;
        c.fillStyle=(row+col)%2?'#c3bc70':'#799853';c.fillRect(x,y,115,74);
        for(let j=1;j<6;j++)line(c,[[x+6,y+j*11],[x+107,y+j*11]],3,'#e0cd8a66');
        }
    }
    for(const river of layout.rivers){
        const pad=(river.width+32)/2;let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
        for(const [x,y] of river.points){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
        if(!hits(rect,x0-pad,y0-pad,x1+pad,y1+pad))continue;
        const palette=rules.water[river.material||'water'];
        line(c,river.points,river.width+32,palette.bank);line(c,river.points,river.width+12,palette.edge);
        line(c,river.points,river.width,palette.fill);
        // Thin translucent passes soften the old hard central stripe.
        c.save();c.globalAlpha=.12;
        for(let i=0;i<9;i++)line(c,river.points,river.width*(.94-i*.065),palette.center);
        c.restore();
        if(!overview){
            c.save();riverClip(c,river.points,river.width/2);
            paintWaterDetail(c,world,rect,river.material||'water');c.restore();
            paintRiverBank(c,world,rect,river,palette);
        }
    }
    for(const l of layout.lakes||[]){
        if(!hits(rect,l.x-l.rx-18,l.y-l.ry-18,l.x+l.rx+18,l.y+l.ry+18))continue;
        const palette=rules.water[l.material||'water'];
        oval(c,l.x,l.y,l.rx+18,l.ry+18,palette.bank);oval(c,l.x,l.y,l.rx+6,l.ry+6,palette.edge);
        oval(c,l.x,l.y,l.rx,l.ry,palette.fill);
        c.save();c.translate(l.x,l.y);c.scale(l.rx,l.ry);
        const depth=c.createRadialGradient(-.15,-.2,0,0,0,1);depth.addColorStop(0,palette.center);depth.addColorStop(1,palette.fill);
        oval(c,0,0,1,1,depth);c.restore();
        if(!overview){c.save();c.beginPath();c.ellipse(l.x,l.y,l.rx,l.ry,0,0,Math.PI*2);c.clip();paintWaterDetail(c,world,rect,l.material||'water');c.restore();}
    }
    if(!overview&&decorationArt)for(const d of groundDecorations(world,rect)){
        c.save();c.translate(d.x,d.y);if(d.flip)c.scale(-1,1);
        decorationArt.draw(c,d.atlas,d.frame,-d.size/2,-d.size,d.size,d.size);c.restore();
    }
    // Every road pass is drawn over the full network to avoid crossing seams.
    const roadPad=Math.max(0,...rules.roads.layers.map(([extra])=>extra));
    for(const [extra,color] of rules.roads.layers){
        for(const p of world.paths){
            const half=(p.width+roadPad)/2,x0=Math.min(p.a.x,p.b.x)-half,y0=Math.min(p.a.y,p.b.y)-half,x1=Math.max(p.a.x,p.b.x)+half,y1=Math.max(p.a.y,p.b.y)+half;
            if(!hits(rect,x0,y0,x1,y1))continue;
            line(c,[[p.a.x,p.a.y],[p.b.x,p.b.y]],Math.max(4,p.width+extra),color);
        }
    }
    if(!overview)paintRoadDetail(c,world,rect);
    for(const b of layout.bridges){
        const reach=Math.hypot(b.w,b.h)/2;
        if(!hits(rect,b.x-reach,b.y-reach,b.x+reach,b.y+reach))continue;
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
        if(!hits(rect,f.x-s,f.y-s,f.x+s,f.y+s*.2))continue;
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
    if(hits(rect,world.center.x-plaza.radiusX,world.center.y-plaza.radiusY,world.center.x+plaza.radiusX,world.center.y+plaza.radiusY)){
        oval(c,world.center.x,world.center.y,plaza.radiusX,plaza.radiusY,plaza.edge);oval(c,world.center.x,world.center.y,plaza.radiusX-11,plaza.radiusY-9,plaza.fill);
        c.strokeStyle=plaza.line;c.lineWidth=2;
        for(let i=0;i<3;i++){c.beginPath();c.ellipse(world.center.x,world.center.y,145-i*36,83-i*20,0,0,Math.PI*2);c.stroke();}
    }
    c.restore();
}

export function createTerrainTileCache(paint,createCanvas,limit=24){
    const tiles=new Map();let currentWorld=null,previous=null,currentDensity=null;
    let pixels=512,capacity=limit;const bleed=2;
    function paintTile(world,size,scale,margin,x,y){
        const tile=createCanvas();tile.width=tile.height=pixels+bleed*2;const tc=tile.getContext('2d');
        tc.translate(bleed,bleed);tc.scale(scale,scale);tc.translate(-x*size,-y*size);
        paint(tc,world,{x:x*size-margin,y:y*size-margin,w:size+margin*2,h:size+margin*2});
        return tile;
    }
    return {
        draw(c,world,rect,fallback,pixelRatio=1){
            const density=Number.isFinite(pixelRatio)&&pixelRatio>1?2:1;
            if(currentWorld!==world||currentDensity!==density){tiles.clear();currentWorld=world;currentDensity=density;previous=null;}
            pixels=512*density;
            // At most 64 MiB of RGBA tiles (including bleed) on high-DPI displays.
            capacity=Math.max(1,Math.min(limit,Math.floor(64*1024*1024/((pixels+bleed*2)**2*4))));
            let generated=0;
            const touched=new Set();
            // Zoomed-out or very wide screens use coarser terrain tiles rather
            // than repeatedly evicting visible tiles or growing mobile memory.
            let size=512;
            while((Math.ceil(rect.w/size)+1)*(Math.ceil(rect.h/size)+1)>capacity)size*=2;
            const scale=pixels/size,margin=bleed/scale;
            const x0=Math.max(0,Math.floor(rect.x/size)),y0=Math.max(0,Math.floor(rect.y/size));
            const x1=Math.min(Math.ceil(world.w/size)-1,Math.floor((rect.x+rect.w)/size));
            const y1=Math.min(Math.ceil(world.h/size)-1,Math.floor((rect.y+rect.h)/size));
            const cols=Math.ceil(world.w/size),rows=Math.ceil(world.h/size);
            for(let y=y0;y<=y1;y++){
                for(let x=x0;x<=x1;x++){
                    const key=`${size}:${x},${y}`;let tile=tiles.get(key);
                    if(!tile){
                        // Keep a continuous low-resolution floor while new
                        // detail arrives; at most two cold tiles per frame.
                        if(fallback&&generated>=2){fallback(c,x*size,y*size,size);continue;}
                        generated++;
                        tile=paintTile(world,size,scale,margin,x,y);
                    }
                    tiles.delete(key);tiles.set(key,tile);touched.add(key);
                    // Include one painted bleed pixel on each side so fractional
                    // camera transforms cannot expose the floor between tiles.
                    // Keep the outer pixel as a filtering gutter; expand source
                    // and destination equally to preserve world-space alignment.
                    const overlap=1/scale;
                    c.drawImage(tile,bleed-1,bleed-1,pixels+2,pixels+2,
                        x*size-overlap,y*size-overlap,size+overlap*2,size+overlap*2);
                    while(tiles.size>capacity)tiles.delete(tiles.keys().next().value);
                }
            }
            const dx=previous?rect.x-previous.x:0,dy=previous?rect.y-previous.y:0;
            if(generated===0&&(dx||dy)){
                const px=Math.abs(dx)>=Math.abs(dy)?(dx>0?x1+1:x0-1):Math.max(x0,Math.min(x1,Math.floor((rect.x+rect.w/2)/size)));
                const py=Math.abs(dy)>Math.abs(dx)?(dy>0?y1+1:y0-1):Math.max(y0,Math.min(y1,Math.floor((rect.y+rect.h/2)/size)));
                const key=`${size}:${px},${py}`;
                const oldest=tiles.keys().next().value;
                if(px>=0&&py>=0&&px<cols&&py<rows&&!tiles.has(key)&&(tiles.size<capacity||oldest!==undefined&&!touched.has(oldest))){
                    const tile=paintTile(world,size,scale,margin,px,py);
                    tiles.set(key,tile);generated++;
                    while(tiles.size>capacity){
                        const old=tiles.keys().next().value;
                        if(touched.has(old)){tiles.delete(key);generated--;break;}
                        tiles.delete(old);
                    }
                }
            }
            previous={x:rect.x,y:rect.y};
            return generated;
        },
        get size(){return tiles.size;},
    };
}
