import {assetUrl} from './adventure_media_core.js';

const TAU=Math.PI*2;
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const mix=(a,b,t)=>a+(b-a)*t;
function visualSeed(value){
    if(typeof value==='number'&&Number.isFinite(value))return Math.abs(value)%10000;
    let hash=2166136261;for(const char of String(value))hash=Math.imul(hash^char.charCodeAt(0),16777619);
    return (hash>>>0)%10000;
}

export function validatePainterlySpells(manifest) {
    if(manifest?.version!==1||!manifest.sheets||!manifest.bases)throw new Error('手绘法术清单无效');
    const styles=['comet','meteor','nova','icefall','icecrown','lightning','orb','cyclone','leaf','vines','heal','ghost','seal','drain'];
    for(const [base,row] of Object.entries(manifest.bases)){
        const sheet=manifest.sheets[row.sheet];
        if(!sheet||!styles.includes(row.style)||!row.school||!Array.isArray(row.palette)||row.palette.length!==3)throw new Error('手绘法术配置无效：'+base);
        if(row.upright!==undefined&&typeof row.upright!=='boolean')throw new Error('手绘法术朝向无效：'+base);
        for(const rect of [row.release,row.impact])if(!Array.isArray(rect)||rect.length!==4||rect.some(v=>!Number.isInteger(v))||rect[0]<0||rect[1]<0||rect[2]<=0||rect[3]<=0||rect[0]+rect[2]>sheet.width||rect[1]+rect[3]>sheet.height)throw new Error('手绘法术裁切越界：'+base);
    }
    for(const row of Object.values(manifest.sheets)){
        if(!/^[a-f0-9]{64}$/.test(row.sha256)||row.size<=0||row.size>100000||row.width<=0||row.height<=0)throw new Error('手绘图集超过预算或缺少校验信息');
        assetUrl(row,'cdn');assetUrl(row,'local');
    }
    return Object.keys(manifest.bases).length;
}

// Visual time follows the engine's existing impact boundary; no battle clock or RNG is changed.
export function painterlySpellPhase(p,timeline={attack:.24,impact:.7}){
    return {charge:smooth(p/timeline.attack),flight:smooth((p-timeline.attack)/(timeline.impact-timeline.attack)),hit:clamp((p-timeline.impact)/(1-timeline.impact)),impacted:p>=timeline.impact,alpha:Math.min(1,p*10,(1-p)*8)};
}

export async function loadPainterlySpellArt(mode,read){
    const manifest=await read('data/adventure/painterly-spells.json');validatePainterlySpells(manifest);
    const images=new Map(),pending=new Map(),reported=new Set();
    function ensure(base){
        const row=manifest.bases[base];if(!row)return Promise.resolve(null);
        const id=row.sheet;if(images.has(id))return Promise.resolve(images.get(id));
        if(!pending.has(id))pending.set(id,new Promise((resolve,reject)=>{
            const image=new Image();image.crossOrigin='anonymous';
            const done=()=>{clearTimeout(timer);image.onload=image.onerror=null;};
            const fail=()=>{done();pending.delete(id);reject(new Error('手绘法术图集加载失败：'+id));};
            const timer=setTimeout(fail,12000);
            image.onerror=fail;image.onload=async()=>{done();try{await image.decode?.();}catch{/* onload already confirms usable pixels. */}images.set(id,image);reported.delete(id);resolve(image);};
            image.src=assetUrl(manifest.sheets[id],mode);
        }));
        return pending.get(id);
    }
    function draw(c,options){
        const row=manifest.bases[options.spec.base];if(!row)return false;
        const image=images.get(row.sheet);if(!image)return false;
        drawPainterlySpell(c,image,row,options);return true;
    }
    async function warm(base){try{return await ensure(base);}catch(error){const id=manifest.bases[base]?.sheet;if(!reported.has(id)){reported.add(id);console.warn('手绘法术暂不可用，保留原特效：',error);}return null;}}
    return {manifest,images,ensure:warm,draw};
}

function sprite(c,image,rect,x,y,size,angle=0,alpha=1,sx=1,sy=1){
    if(size<=0||alpha<=0)return;
    const ratio=rect[2]/rect[3],w=ratio>=1?size:size*ratio,h=ratio>=1?size/ratio:size;
    c.save();c.globalAlpha*=clamp(alpha);c.translate(x,y);c.rotate(angle);c.scale(sx,sy);c.drawImage(image,...rect,-w/2,-h/2,w,h);c.restore();
}
function bloom(c,x,y,r,color,alpha,aspect=.5){
    if(r<=0||alpha<=0)return;
    c.save();c.globalAlpha*=alpha;c.translate(x,y);c.scale(1,aspect);
    const glow=c.createRadialGradient(0,0,0,0,0,r);glow.addColorStop(0,color);glow.addColorStop(.35,color+'70');glow.addColorStop(1,color+'00');
    c.fillStyle=glow;c.fillRect(-r,-r,r*2,r*2);c.restore();
}
function flecks(c,row,x,y,r,q,seed,scale,inward=false){
    const count=row.style==='vines'||row.style==='heal'?14:18;
    for(let i=0;i<count;i++){
        const v=(i*.61803398875+seed*.013)%1,angle=i*2.399963+seed*.17;
        const t=clamp(q*1.5-v*.42),distance=r*(inward?1-t:t)*(.4+v*.8);
        const px=x+Math.cos(angle)*distance,py=y+Math.sin(angle)*distance*.65-t*t*r*.15;
        c.save();c.globalAlpha*=Math.sin(t*Math.PI)*(1-q)*.85;c.fillStyle=row.palette[i%3];c.translate(px,py);c.rotate(angle+t*2);
        const s=(1.4+v*2.1)*scale;
        c.beginPath();c.ellipse(0,0,s*(row.school==='life'?2.5:1),s*.65,0,0,TAU);c.fill();c.restore();
    }
}

export function drawPainterlySpell(c,image,row,{spec,p,a,b,caster,from,to,radius,scale,timeline,width,height,echo=false,reflection=false,failed=false,reducedMotion=false,seed=0}){
    seed=visualSeed(seed);
    // Cinematic cameras already enlarge actors. Keep painted impacts inside the shot.
    const r=Math.min(radius,width*.12,height*.15);
    const {charge,flight,hit,impacted,alpha}=painterlySpellPhase(p,timeline);
    const [primary,light]=row.palette,dir=b.x>=a.x?1:-1,angle=Math.atan2(b.y-a.y,b.x-a.x);
    const size=r*3.4,style=row.style;
    // Creature silhouettes stay upright when the enemy casts from the other side.
    const flightAngle=row.upright?0:angle,flightScaleX=row.upright?dir:1;
    const release=(x,y,size,angle=0,alpha=1,sx=1,sy=1)=>sprite(c,image,row.release,x,y,size,angle+(row.releaseRotation??0),alpha,sx,sy);
    c.save();c.globalAlpha*=alpha;c.shadowBlur=0;
    if(failed){
        if(!echo){release(caster.x,caster.y-p*r*.6,r*(.7+charge*.5),-.25*p,(1-p)*.38,dir,1);flecks(c,row,caster.x,caster.y,r*.5,p,seed,scale);}
        c.restore();return;
    }
    if(reducedMotion){
        if(!echo)bloom(c,caster.x,from.y,r,primary,.16);
        sprite(c,image,impacted?row.impact:row.release,b.x,b.y,size*.72,0,.68);
        c.restore();return;
    }
    if(!echo){
        c.fillStyle=`rgba(14,15,35,${Math.sin(p*Math.PI)*.12})`;c.fillRect(0,0,width,height);
        bloom(c,caster.x,from.y,r*(.5+charge*.5),primary,(1-flight)*.24,.35);
        // The charge uses the painted material itself, with a small rising orbit.
        if(p<timeline.attack)release(caster.x,caster.y+mix(14,-7,charge)*scale,r*(.5+charge*.7),Math.sin(p*8)*.06,charge*.8,dir,1);
    }
    if(p>=timeline.attack&&!impacted){
        const swell=.72+Math.sin(flight*Math.PI)*.28;
        if(['comet','orb','leaf','ghost','drain'].includes(style)){
            const x=mix(a.x,b.x,flight),y=mix(a.y,b.y,flight)-Math.sin(flight*Math.PI)*r*.3;
            for(let i=2;i>=1;i--){const f=clamp(flight-i*.035);release(mix(a.x,b.x,f),mix(a.y,b.y,f)-Math.sin(f*Math.PI)*r*.3,size*.62*swell,flightAngle,.11/i,flightScaleX);}
            release(x,y,size*.76*swell,flightAngle,1,flightScaleX);
            bloom(c,x,y,r*.4,light,.13,1);
        }else if(['meteor','icefall'].includes(style)){
            const start={x:b.x-dir*r*2.1,y:b.y-r*3.5},t=flight*flight;
            const theta=Math.atan2(b.y-start.y,b.x-start.x);
            release(mix(start.x,b.x,t),mix(start.y,b.y,t),size*.9,theta,Math.min(1,flight*5));
        }else if(style==='lightning'){
            const flash=smooth((flight-.25)/.2)*(1-smooth((flight-.85)/.15));
            release(b.x,b.y-r*.9,size*1.2,Math.PI/2,flash,.95,1.1);
            bloom(c,b.x,to.y,r*1.2,primary,flash*.2,.35);
        }else if(style==='nova'){
            for(let i=0;i<3;i++){
                const t=clamp(flight-i*.11),x=mix(a.x,b.x+(i-1)*r*.3,t),y=mix(a.y,b.y,t)-Math.sin(t*Math.PI)*r*(.5+i*.25);
                release(x,y,size*(.42+i*.06),angle,Math.min(1,t*5));
            }
        }else{
            const grow=smooth(flight),lift=(1-grow)*r*.65;
            bloom(c,b.x,to.y,r*1.1,primary,grow*.22,.32);
            release(b.x,b.y+lift,size*(.35+.5*grow),style==='seal'?flight*.4:Math.sin(flight*5)*.045,grow,1,.5+.5*grow);
            flecks(c,row,b.x,b.y,r,flight,seed,scale,true);
        }
    }
    if(impacted){
        const kick=Math.sin(clamp(hit/.18)*Math.PI)*.12;
        const impactSize=size*(.68+.3*smooth(hit/.28)+kick),fade=1-smooth((hit-.55)/.45);
        const ground=['icecrown','vines','cyclone','heal'].includes(style);
        const iy=ground?to.y-impactSize*.29:b.y;
        bloom(c,b.x,to.y,r*(1+hit*.8),primary,(1-hit)*.26,.32);
        sprite(c,image,row.impact,b.x,iy,impactSize,style==='seal'?hit*.3:0,fade,1+hit*.08,1);
        if(hit<.25)sprite(c,image,row.impact,b.x,iy,impactSize*(1+hit*.6),0,(1-hit/.25)*.2);
        flecks(c,row,b.x,b.y,r*1.8,hit,seed,scale);
        if(style==='heal'){
            release(b.x,b.y-r*.4-hit*r*.6,size*.66,Math.sin(hit*3)*.06,(1-hit)*.7);
        }
        if(style==='drain'&&!reflection){
            for(let i=0;i<3;i++){
                const q=smooth((hit-i*.075)/.68);if(q<=0||q>=1)continue;
                release(mix(b.x,caster.x,q),mix(b.y,caster.y,q)-Math.sin(q*Math.PI)*r*.55,r*(.62-i*.1),row.upright?0:Math.atan2(caster.y-b.y,caster.x-b.x),Math.sin(q*Math.PI)*.85,row.upright?(caster.x>=b.x?1:-1):1);
            }
            if(!echo)bloom(c,caster.x,from.y,r,light,smooth((hit-.5)/.2)*(1-hit)*.6);
        }
    }
    c.restore();
}
