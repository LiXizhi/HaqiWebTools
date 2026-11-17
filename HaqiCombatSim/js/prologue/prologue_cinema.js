// prologue_cinema.js — key art with Ken Burns moves, particle effects and title cards for the prologue.
// Browser only. Art URLs come from data/prologue/art.json (CDN in normal mode, local copy with ?assets=local).

const GLYPHS='光日月山水火木石土人口手目耳心田上下大小中天云雨门休森明国';

export function artUrl(manifest,id,mode){
    const entry=manifest?.entries?.[id];if(!entry)return '';
    return mode==='local'||!entry.cdn?entry.local:entry.cdn;
}

export function createCinema(root,{manifest,mode,reducedMotion=()=>false}){
    const doc=root.ownerDocument;
    const make=(tag,cls)=>{const n=doc.createElement(tag);if(cls)n.className=cls;return n;};
    const artHost=make('div','pl-art-host'),fx=make('canvas','pl-fx'),veil=make('div','pl-veil'),bars=make('div','pl-bars'),title=make('div','pl-title');
    bars.append(make('i','top'),make('i','bottom'));
    title.setAttribute('aria-live','polite');
    root.append(artHost,veil,fx,bars,title);
    const cache=new Map();
    let currentArt=null,particles=[],burst=null,raf=0,last=0,disposed=false;

    function preload(ids){
        return Promise.all(ids.map(id=>{
            const url=artUrl(manifest,id,mode);if(!url||cache.has(url))return cache.get(url);
            const image=new Image();image.decoding='async';
            const ready=new Promise(resolve=>{image.onload=()=>resolve(true);image.onerror=()=>resolve(false);});
            image.src=url;cache.set(url,ready);return ready;
        }));
    }
    function showArt(id,move='still'){
        const url=artUrl(manifest,id,mode);if(!url)return;
        if(currentArt?.dataset.art===id){currentArt.className=`pl-art move-${reducedMotion()?'still':move} shown`;return;}
        const layer=make('div',`pl-art move-${reducedMotion()?'still':move}`);layer.dataset.art=id;
        layer.style.backgroundImage=`url("${url}")`;artHost.append(layer);
        const previous=currentArt;currentArt=layer;
        requestAnimationFrame(()=>requestAnimationFrame(()=>layer.classList.add('shown')));
        if(previous)setTimeout(()=>previous.remove(),1400);
    }
    function setBars(on){bars.classList.toggle('on',!!on);}
    function setVeil(kind){veil.className=`pl-veil ${kind||''}`;}
    function showTitle(text,{primary,secondary}={}){
        title.replaceChildren();const a=make('strong','');a.textContent=primary||text||'';const b=make('small','');b.textContent=secondary||'';
        title.append(a,b);title.classList.remove('shown');void title.offsetWidth;title.classList.add('shown');
    }
    function hideTitle(){title.classList.remove('shown');}

    function size(){const r=root.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);const w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr));if(fx.width!==w||fx.height!==h){fx.width=w;fx.height=h;}return {w,h,dpr};}
    function spawnLeaves(count){
        const {w,h}=size();
        for(let i=0;i<count;i++)particles.push({kind:'leaf',glyph:GLYPHS[Math.floor(Math.random()*GLYPHS.length)],x:Math.random()*w,y:h*(0.35+Math.random()*0.7),vx:(Math.random()-.5)*14,vy:-(10+Math.random()*26),life:0,max:5+Math.random()*5,size:12+Math.random()*18});
    }
    function effect(name,{glyph='光'}={}){
        const reduced=reducedMotion();
        if(name==='word-leaves'){setVeil('');if(!reduced)spawnLeaves(46);}
        if(name==='darken'){setVeil('dark');particles=particles.filter(p=>p.kind!=='leaf');}
        if(name==='dawn'){setVeil('dawn');if(!reduced)spawnLeaves(20);}
        if(name==='shatter'){setVeil('night');burst={glyph,start:performance.now()};
            if(!reduced){const {w,h}=size();for(let i=0;i<70;i++){const a=Math.random()*Math.PI*2,s=120+Math.random()*420;particles.push({kind:'streak',x:w/2,y:h*.36,vx:Math.cos(a)*s,vy:Math.sin(a)*s*.6-60,life:0,max:2.4+Math.random()*1.8,size:2+Math.random()*3});}}
        }
        start();
    }
    function start(){if(!raf&&!disposed){last=performance.now();raf=requestAnimationFrame(frame);}}
    function frame(now){
        raf=0;if(disposed)return;
        const dt=Math.min(.05,(now-last)/1000);last=now;
        const {w,h,dpr}=size(),c=fx.getContext('2d');c.clearRect(0,0,w,h);
        for(const p of particles){
            p.life+=dt;p.x+=p.vx*dt*dpr;p.y+=p.vy*dt*dpr;
            const fade=Math.min(1,p.life/0.6)*Math.max(0,1-p.life/p.max);
            if(p.kind==='leaf'){
                c.save();c.globalAlpha=fade*.9;c.font=`${p.size*dpr}px "KaiTi","STKaiti",serif`;c.fillStyle='#ffe9a8';c.shadowColor='#ffcf5a';c.shadowBlur=14*dpr;c.fillText(p.glyph,p.x,p.y);c.restore();
            }else{
                p.vy+=160*dt;c.save();c.globalAlpha=fade;c.strokeStyle='#fff3c4';c.shadowColor='#ffd36b';c.shadowBlur=16*dpr;c.lineWidth=p.size*dpr;c.lineCap='round';
                c.beginPath();c.moveTo(p.x,p.y);c.lineTo(p.x-p.vx*.06*dpr,p.y-p.vy*.06*dpr);c.stroke();c.restore();
            }
        }
        particles=particles.filter(p=>p.life<p.max);
        if(burst){
            const t=(now-burst.start)/1000;
            if(t<2.2){const scale=t<.7?0.6+t*.8:1.16+(t-.7)*.15,alpha=t<.7?Math.min(1,t*2):Math.max(0,1-(t-.7)/1.5);
                c.save();c.globalAlpha=alpha;c.translate(w/2,h*.36);c.scale(scale,scale);c.font=`bold ${Math.round(h*.28)}px "KaiTi","STKaiti",serif`;c.textAlign='center';c.textBaseline='middle';c.fillStyle='#fffbe6';c.shadowColor='#ffd36b';c.shadowBlur=60*dpr;c.fillText(burst.glyph,0,0);c.restore();}
            else burst=null;
        }
        if(particles.length||burst)raf=requestAnimationFrame(frame);
        else c.clearRect(0,0,w,h);
    }
    function clearFx(){particles=[];burst=null;setVeil('');}
    function dispose(){disposed=true;cancelAnimationFrame(raf);artHost.remove();fx.remove();veil.remove();bars.remove();title.remove();}
    return {preload,showArt,setBars,showTitle,hideTitle,effect,clearFx,dispose,get art(){return currentArt?.dataset.art||null;}};
}
