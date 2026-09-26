import { resolveMountDrawPose, MOUNT_DIRECTIONS } from './adventure_mounts_core.js';
import { createHeroActor, updateHeroActor, BODY_TO_HEAD, headBreath, walkFrameIndex } from './hero_pose_core.js';

// One UI scheduler; detached portraits release their actor state automatically.
const views=new Set();let viewFrame=0;
function animateViews(time){
    viewFrame=0;
    for(const view of views){if(view.node.isConnected){view.connected=true;if(!document.hidden)view.paint(time/1000);}else if(view.connected){views.delete(view);}}
    if(views.size)viewFrame=requestAnimationFrame(animateViews);
}
function scheduleView(view){views.add(view);if(!viewFrame)viewFrame=requestAnimationFrame(animateViews);}

/** Shared world/battle/UI library. Original source crops/layout bounds are immutable.
 * Hosts own placement, time, scene ordering and animation. UI and world use draw().
 */
export class HeroRenderer {
    constructor(manifest, catalog, { local = false, baseURL = new URL('../', import.meta.url) } = {}) {
        this.manifest = manifest; this.catalog = catalog; this.local = local; this.baseURL = baseURL;
        this.images = new Map(); this.pending = new Map(); this.sourceBounds = new Map();
        this.prepared=new Map();
    }
    createActor(seed) { return createHeroActor(seed); }
    headId(gender,id){return this.manifest.heads[id]?.gender===gender?id:gender==='female'?'elf-girl':'elf-boy';}
    updateActor(actor, input) { return updateHeroActor(actor, input); }
    async image(id, art, mountAsset = false) {
        if (this.images.has(id)) return this.images.get(id);
        if (!this.pending.has(id)) {
            const promise = new Promise((resolve, reject) => {
                const image = new Image(); image.crossOrigin = 'anonymous';
                const local = mountAsset && art.local?.startsWith('assets/') ? 'demos/mount-lab/'+art.local : art.local;
                const url = this.local ? new URL(local, this.baseURL).href : art.cdn;
                if (!url) { reject(new Error(`资源尚未登记 CDN：${id}`)); return; }
                image.onload = () => {
                    if (art.width && (image.width !== art.width || image.height !== art.height)) { reject(new Error(`资源尺寸不符：${id}`)); return; }
                    this.images.set(id,image); resolve(image);
                };
                image.onerror = () => reject(new Error(`资源加载失败：${id}`)); image.src = url;
            });
            this.pending.set(id,promise);
            promise.catch(() => this.pending.delete(id));
        }
        return this.pending.get(id);
    }
    appearance(save,{mounted=true}={}) {
        const mountId=this.catalog.mountByItem?.[save.mountId]?.mountId;
        const mount=mounted&&save.mountId?this.catalog.mounts.find(m=>m.id===mountId||Object.hasOwn(m.commerce||{},save.mountId)):null;
        return {gender:save.appearance==='girl'?'female':'male',mount:mount||null,headId:save.headId};
    }
    ensure(appearance){
        appearance={...appearance,headId:this.headId(appearance.gender||'male',appearance.headId)};
        const key=[appearance.gender,appearance.mount?.id,appearance.headId].join(':');
        if(!this.prepared.has(key))this.prepared.set(key,this.prepare(appearance).catch(()=>({fallback:true})));
        return this.prepared.get(key);
    }
    async prepare({ gender = 'male', mount = null, headId = gender==='female'?'elf-girl':'elf-boy' } = {}) {
        headId=this.headId(gender,headId);
        const keys = [gender+'-walk', ...(gender === 'female' ? ['female-standing','female-rider'] : ['standing','rider'])];
        const originals = keys.map(key => this.image('original:'+key,this.manifest.bodies[key].source));
        if (mount) originals.push(this.image('mount:'+mount.id,mount.art,true));
        await Promise.all(originals);
        const results = await Promise.allSettled(keys.map(async key => {
            const body=this.manifest.bodies[key];
            if(this.manifest.heads[headId])await Promise.all([this.image('body:'+key,body),this.image('head:'+headId,this.manifest.heads[headId])]);
        }));
        const walk=this.manifest.bodies[gender+'-walk'].walk;
        if(walk)await this.image('walk:'+gender,walk).catch(()=>null);
        return { fallback:results.some(r => r.status==='rejected'), errors:results.filter(r=>r.status==='rejected').map(r=>r.reason.message) };
    }
    originalBounds(key, cell) {
        const id=key+':'+cell;
        if(!this.sourceBounds.has(id)&&key.endsWith('-walk')&&this.getWalkingBounds)this.sourceBounds.set(id,this.getWalkingBounds('sprites',this.manifest.bodies[key].frames[cell].crop));
        if (!this.sourceBounds.has(id)) {
            const image=this.images.get('original:'+key),crop=this.manifest.bodies[key].frames[cell].crop;
            const c=document.createElement('canvas');c.width=Math.ceil(crop[2]);c.height=Math.ceil(crop[3]);
            const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,...crop,0,0,c.width,c.height);
            const data=ctx.getImageData(0,0,c.width,c.height).data;let l=c.width,t=c.height,r=0,b=0;
            for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(data[(y*c.width+x)*4+3]>20){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x);b=Math.max(b,y);}
            this.sourceBounds.set(id,[crop[0]+l,crop[1]+t,r-l+1,b-t+1]);
        }
        return this.sourceBounds.get(id);
    }
    layout({gender='male',mount=null},{facing=0,size=78,time=0,moving=false,standing=false,bodyRect,reducedMotion=false}={}) {
        if(bodyRect)return {key:gender+'-walk',rider:{cell:facing,...bodyRect},foreground:[]};
        if (mount && !standing) {
            const pose=resolveMountDrawPose(mount,facing,{size,time,moving,gender});
            const config=mount.directions[MOUNT_DIRECTIONS[facing]],p={...config,...config.characters?.[gender]};
            return {...pose,key:pose.rider.art,seat:[pose.rider.x+p.anchor[0]*pose.rider.w,pose.rider.y+p.anchor[1]*pose.rider.h]};
        }
        if (standing) {
            return {key:(gender==='female'?'female-':'')+'standing',rider:{cell:facing,x:-size/2,y:-size*.96,w:size,h:size},foreground:[]};
        }
        const bob=reducedMotion||moving?0:Math.sin(time*2)*size/78;
        return {key:gender+'-walk',rider:{cell:facing,x:-34*size/78,y:-size+bob,w:68*size/78,h:size},foreground:[]};
    }
    draw(ctx, appearance, options={}) {
        const {x=0,y=0,original=false,debug=false,overlay=false,head=BODY_TO_HEAD[options.facing??0]}=options;
        const pose=options.pose||this.layout(appearance,options),body=this.manifest.bodies[pose.key];
        let frame=body.frames[pose.rider.cell];
        const source=this.images.get('original:'+pose.key);
        if(!source)return {ready:false};
        const headId=this.headId(appearance.gender||'male',appearance.headId||body.defaultHead);
        const heads=this.manifest.heads[headId],headImage=this.images.get('head:'+headId);
        let bodyImage=this.images.get('body:'+pose.key);
        const split=!original&&!!headImage&&!!bodyImage;
        const step=walkFrameIndex(body.walk,options),walkImage=this.images.get('walk:'+(appearance.gender||'male'));
        const walking=split&&step!==null&&!!walkImage;
        if(walking){frame=body.walk.frames[pose.rider.cell*body.walk.framesPerDirection+step];bodyImage=walkImage;}
        const r=pose.rider,crop=walking?frame.crop:body.trimOriginal?this.originalBounds(pose.key,r.cell):frame.crop;
        // Same aspect-fit and original alpha trimming as the existing game renderer.
        const ratio=Math.min(r.w/crop[2],r.h/crop[3]);
        const rect={x:r.x+(r.w-crop[2]*ratio)/2,y:r.y+(r.h-crop[3]*ratio)/2,w:crop[2]*ratio,h:crop[3]*ratio};
        const neck=[rect.x+(frame.crop[0]+frame.neck[0]-crop[0])*ratio,rect.y+(frame.crop[1]+frame.neck[1]-crop[1])*ratio];
        // Move the walking body toward its head without moving the head attachment.
        const bodyRect=walking?{...rect,y:rect.y+(frame.bodyOffsetY||0)*ratio}:rect;
        const sheet=(image,crop,rect)=>ctx.drawImage(image,...crop,rect.x,rect.y,rect.w,rect.h);
        const mountImage=appearance.mount&&this.images.get('mount:'+appearance.mount.id);
        if(pose.mount&&!mountImage)return {ready:false};
        const drawMount=()=>{const m=pose.mount;const art=appearance.mount.art||mountImage,cw=art.width/(art.columns||2),ch=art.height/(art.rows||2);sheet(mountImage,[m.cell%2*cw,Math.floor(m.cell/2)*ch,cw,ch],m);};
        ctx.save();ctx.translate(x,y);
        if(pose.mount&&mountImage)drawMount();
        sheet(split?bodyImage:source,crop,bodyRect);
        let headRect=null;
        if(split&&!options.bodyOnly){
            const h=heads.frames[(head+heads.directionCount)%heads.directionCount],s=frame.headHeight*ratio/h.height;
            headRect={x:neck[0]-h.neck[0]*s,y:neck[1]-h.neck[1]*s,w:h.crop[2]*s,h:h.crop[3]*s};
            const breath=options.breath||headBreath(options.time||0,options.phase||0,options.reducedMotion||original);
            // Pivot at the attachment point; sub-pixel breathing stays inside neck overlap.
            ctx.save();ctx.translate(neck[0]+breath.x*r.w/78,neck[1]+breath.y*r.w/78);if(breath.angle)ctx.rotate(breath.angle);
            sheet(headImage,h.crop,{...headRect,x:headRect.x-neck[0],y:headRect.y-neck[1]});ctx.restore();
        }
        if(pose.mount&&mountImage&&pose.foreground.length){
            ctx.save();ctx.beginPath();
            // Match original polygon path behavior exactly.
            for(const polygon of pose.foreground)polygon.forEach(([u,v],i)=>ctx[i?'lineTo':'moveTo'](pose.mount.x+u*pose.mount.w,pose.mount.y+v*pose.mount.h));
            ctx.closePath();ctx.clip();drawMount();ctx.restore();
        }
        if(overlay){ctx.save();ctx.globalAlpha=.35;sheet(source,body.trimOriginal?this.originalBounds(pose.key,r.cell):body.frames[r.cell].crop,rect);ctx.restore();}
        if(debug){
            ctx.lineWidth=1;ctx.strokeStyle='#40dccc';ctx.strokeRect(r.x,r.y,r.w,r.h);
            const cross=(p,color)=>{ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(p[0]-5,p[1]);ctx.lineTo(p[0]+5,p[1]);ctx.moveTo(p[0],p[1]-5);ctx.lineTo(p[0],p[1]+5);ctx.stroke();};
            cross(neck,'#ffcc73');if(pose.seat)cross(pose.seat,'#ff6687');
        }
        ctx.restore();return {ready:true,split,walkFrame:walking?step:null,pose,bodyRect,headRect,neck,seat:pose.seat};
    }
    drawSave(ctx,save,x,y,time=0,moving=false,scale=1,options={}) {
        const appearance=this.appearance(save,options);this.ensure(appearance);
        const result=this.draw(ctx,appearance,{x,y,time,moving,size:78*scale,facing:save.facing||0,...options});
        let bottom=0;
        if(result.ready&&appearance.mount&&options.nameBounds!==false){
            const pose=this.layout(appearance,{facing:save.facing||0,size:78*scale,time:0});
            const art=appearance.mount.art,cols=art.columns||2,rows=art.rows||2;
            const key='mount:'+appearance.mount.id+':'+pose.mount.cell;
            // Keep label geometry from original alpha, never from detached head bounds.
            if(!this.sourceBounds.has(key)){
                const image=this.images.get('mount:'+appearance.mount.id),c=document.createElement('canvas');c.width=art.width/cols;c.height=art.height/rows;
                const cc=c.getContext('2d',{willReadFrequently:true});cc.drawImage(image,pose.mount.cell%cols*c.width,Math.floor(pose.mount.cell/cols)*c.height,c.width,c.height,0,0,c.width,c.height);
                const data=cc.getImageData(0,0,c.width,c.height).data;let b=c.height;
                outer:for(let yy=c.height-1;yy>=0;yy--)for(let xx=0;xx<c.width;xx++)if(data[(yy*c.width+xx)*4+3]>20){b=yy+1;break outer;}
                this.sourceBounds.set(key,b/c.height);
            }
            const bounds=this.originalBounds(pose.key,pose.rider.cell),frame=this.manifest.bodies[pose.key].frames[pose.rider.cell];
            bottom=Math.max(pose.mount.y+pose.mount.h*this.sourceBounds.get(key),pose.rider.y+(bounds[1]-frame.crop[1]+bounds[3])/frame.crop[3]*pose.rider.h);
        }
        return { ...result, nameY:y+bottom };
    }
    drawTile(ctx,index,x,y,w,h,options={}) {
        const appearance={gender:index>=12?'female':'male',headId:options.headId},facing=index%4;
        this.ensure(appearance);return this.draw(ctx,appearance,{facing,bodyRect:{x,y,w,h},...options});
    }
    createView(appearance,options={}) {
        const canvas=document.createElement('canvas');canvas.width=options.width||180;canvas.height=options.height||180;
        canvas.setAttribute('role','img');canvas.setAttribute('aria-label',options.label||'主角分层预览');
        let disposed=false,current=appearance,settings=options,revision=0;const actor=this.createActor(options.seed||7419);
        const reduced=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)'):null;
        const paint=(time=0)=>{if(disposed)return;const c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height);
            const pose=this.updateActor(actor,{time,facing:settings.facing||0,reducedMotion:reduced?.matches});
            this.draw(c,current,{x:canvas.width/2,y:canvas.height*.88,size:78,time,head:pose.head,breath:pose.breath,reducedMotion:reduced?.matches,...settings});};
        const view={node:canvas,paint,connected:false};
        const update=async(a=current,o=settings)=>{current=a;settings=o;const rev=++revision;await this.ensure(a);if(rev===revision&&!disposed){paint();if(settings.animate&&canvas.isConnected)scheduleView(view);}};
        return {node:canvas,update,dispose(){disposed=true;revision++;views.delete(view);},ready:update()};
    }
}

export function heroPortrait(assets,save,w=90,h=95,{facing=0,...options}={}){
    if(!assets.hero){const canvas=document.createElement('canvas');canvas.width=w*2;canvas.height=h*2;assets.tile?.(canvas.getContext('2d'),'sprites',(save.appearance==='girl'?12:8)+facing,0,0,w*2,h*2);return canvas;}
    const view=assets.hero.createView(assets.hero.appearance(save,{mounted:false}),{width:w*2,height:h*2,x:0,y:0,bodyRect:{x:0,y:0,w:w*2,h:h*2},facing,animate:true,...options});
    view.node.className='art';view.node.style.width=w+'px';view.node.style.height=h+'px';view.ready.catch(()=>{});return view.node;
}

export async function loadHeroLibrary(readJson,catalog,{local=false,sprites,sourceImages,getBounds}={}){
    let manifest;
    try{manifest=await readJson('data/adventure/hero-art.json');}
    catch{
        // Missing cosmetic manifest must not make existing saves unplayable.
        manifest={bodies:{},heads:{}};
        for(const [key,source] of Object.entries(catalog.sheets))manifest.bodies[key]={source:{...source,local:source.local.startsWith('assets/')?'demos/mount-lab/'+source.local:source.local},frames:Array.from({length:4},(_,i)=>({crop:[i%2*source.width/2,Math.floor(i/2)*source.height/2,source.width/2,source.height/2],neck:[0,0]}))};
        for(const [gender,row] of [['male',2],['female',3]]){const cuts=[0,323,650,929,1254].map(v=>v*sprites.height/1254);manifest.bodies[gender+'-walk']={source:sprites,trimOriginal:true,frames:Array.from({length:4},(_,i)=>({crop:[i*sprites.width/4,cuts[row],sprites.width/4,cuts[row+1]-cuts[row]],neck:[0,0]}))};}
    }
    const hero=new HeroRenderer(manifest,catalog,{local});
    hero.getWalkingBounds=getBounds;
    if(sourceImages?.has('sprites'))for(const gender of ['male','female']){
        const key=gender+'-walk';hero.images.set('original:'+key,sourceImages.get('sprites'));
    }
    await Promise.allSettled(['male','female'].map(gender=>hero.ensure({gender})));
    return hero;
}
