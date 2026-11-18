import {effectDuration,spellEffect} from './spell_effects_core.js';

// Practice reuses the game's painted attack art and existing support spell sprites.
// This presentation owns no combat state and is cancelled when its session closes.
export async function playMentorPracticeCast(field,assets,cast,{signal,reducedMotion=false,onProgress=()=>{},onImpact=()=>{}}={}){
    const card=cast.card,spec=spellEffect(assets.effects,card);
    if(signal?.aborted||!field.isConnected)return false;
    try{await assets.skillArt.ensure(spec.base);}catch{return false;}
    if(signal?.aborted||!field.isConnected)return false;
    const canvas=document.createElement('canvas');canvas.className='mentor-spell-canvas';canvas.setAttribute('aria-hidden','true');field.append(canvas);
    const c=canvas.getContext('2d'),duration=effectDuration(assets.effects,card,reducedMotion);
    return new Promise(resolve=>{
        let frame=0,start=null,impacted=false,ended=false;
        const finish=ok=>{if(ended)return;ended=true;cancelAnimationFrame(frame);signal?.removeEventListener('abort',abort);canvas.remove();resolve(ok);};
        const abort=()=>finish(false);signal?.addEventListener('abort',abort,{once:true});
        function tick(now){
            if(signal?.aborted||!field.isConnected){finish(false);return;}
            try{
            start??=now;
            const p=Math.min(1,(now-start)/duration),bounds=field.getBoundingClientRect(),width=bounds.width,height=bounds.height,dpr=Math.min(2,devicePixelRatio||1);
            if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
            c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,width,height);
            const point=id=>{const node=field.querySelector(`[data-unit-id="${id}"]`),art=node?.querySelector('canvas,img')||node;if(!art)return null;const r=art.getBoundingClientRect();return {x:r.left-bounds.left+r.width/2,y:r.top-bounds.top+r.height*.55};};
            const from=point(cast.casterId),ids=spec.area?cast.targetIds:[cast.targetId],scale=Math.min(1,width/650,height/230),radius=Math.max(18,55*scale*spec.scale);
            for(const [i,id] of ids.entries()){
                const to=point(id);if(!from||!to)continue;
                const painted=assets.skillArt.painterly?.draw(c,{spec,p,a:from,b:to,caster:from,from,to,radius,scale,timeline:assets.effects.timeline,width,height,echo:i>0,reducedMotion,seed:cast.card.key});
                if(!painted){
                    // Shield/heal atlases already contain the authored spell, never a geometric substitute.
                    const hit=p>=assets.effects.timeline.impact,t=reducedMotion?1:Math.min(1,p/assets.effects.timeline.impact),x=from.x+(to.x-from.x)*t,y=from.y+(to.y-from.y)*t,size=Math.min(width*.36,150)*(hit?1.15:.8);
                    c.save();c.globalAlpha=Math.min(1,p*8,(1-p)*8);assets.skillArt.drawSubject(c,spec.base,x-size/2,y-size/2,size,size,p);c.restore();
                }
            }
            onProgress(p,card);
            if(!impacted&&p>=assets.effects.timeline.impact){impacted=true;onImpact(cast);}
            if(p>=1){finish(true);return;}frame=requestAnimationFrame(tick);
            }catch{finish(false);}
        }
        frame=requestAnimationFrame(tick);
    });
}
