// Embedded by build_hanzi_stories.mjs: no imports or fetches in the final page.
(() => {
  const $=id=>document.getElementById(id),canvas=$('view'),c=canvas.getContext('2d');
  const backdrop=document.createElement('canvas'),backdropContext=backdrop.getContext('2d');let backdropKey='';
  const S=STORY,G=STORY.strokes,paths=G.strokes.map(p=>new Path2D(p));
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>{x=clamp(x);return x*x*(3-2*x);};
  let phase=-1,energy=0,visualEnergy=0,t=0,elapsed=0,last=0,paused=false,stroke=0,trace=0,dragging=false,demo=false,demoTime=0,done=false;
  let width=1,height=1,scale=1,dpr=1,raf=0,audio=null,master=null,muted=false,visible=true;
  const titles=['初见','寻找','变化','成字','写字','余韵'];
  const ui=(text,el)=>{el.textContent=window.haqiHanziUi(text,el);};
  const caption=text=>{$('capText').textContent=text;window.haqiHanziCaption($('capText'),text);};
  const point=p=>[(p[0]-512)*.46,(450-p[1])*.46];
  const guides=G.medians.map(points=>points.map(point));
  // Arc-length resampling makes pointer checks insensitive to source point density.
  function resample(points,n=64){const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));const total=lengths.at(-1);return Array.from({length:n},(_,k)=>{const d=total*k/(n-1);let j=1;while(j<lengths.length-1&&lengths[j]<d)j++;const a=points[j-1],b=points[j],f=(d-lengths[j-1])/(lengths[j]-lengths[j-1]||1);return[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];});}
  const routes=guides.map(g=>resample(g));
  const contours=storyContours(S.theme),sources=routes.map((_,i)=>resample(contours[i%contours.length]));
  function tone(index=0){if(muted||!audio)return;try{const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.value=[261.63,293.66,329.63,392,440,523.25][index%6];g.gain.setValueAtTime(0,audio.currentTime);g.gain.linearRampToValueAtTime(.035,audio.currentTime+.025);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.8);o.connect(g);g.connect(master);o.start();o.stop(audio.currentTime+.85);}catch{/* Sound is optional. */}}
  function initAudio(){try{if(!audio){audio=new(window.AudioContext||window.webkitAudioContext)();master=audio.createGain();master.gain.value=muted?0:1;master.connect(audio.destination);}void audio.resume().catch(()=>{});}catch{}}
  function progress(){document.querySelectorAll('#progress li').forEach((el,i)=>{el.classList.toggle('on',i===phase);el.classList.toggle('done',i<phase);if(i===phase)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});}
  function show(next){phase=next;elapsed=0;dragging=false;demo=false;progress();$('intro').hidden=true;$('action').hidden=false;$('demo').hidden=true;$('meter').hidden=true;ui(titles[next],$('chapter'));ui('', $('hint'));
    if(next===0){caption(S.intro);ui('走进故事',$('action'));}
    if(next===1){caption(S.intro);ui(S.action,$('action'));ui('轻点画面或按钮，让故事慢慢发生。',$('hint'));$('meter').hidden=false;updateMeter();}
    if(next===2){caption(S.change);$('action').hidden=true;ui('看，画面正在回应你。',$('hint'));}
    if(next===3){caption(S.form);ui('亲手写一写',$('action'));ui('画面是联想，笔画是今天的规范字形。',$('hint'));}
    if(next===4){stroke=0;trace=0;caption('顺着亮起的笔画，慢慢写下这个字。');$('action').hidden=true;$('demo').hidden=false;ui('示范这一笔',$('demo'));writingHint();}
    if(next===5){caption(S.finale);$('action').hidden=true;ui('故事完成，可以重播。',$('hint'));if(!done){done=true;window.haqiHanziComplete();}tone(5);}
    draw();
  }
  function writingHint(){ui(`第 ${stroke+1} 笔，共 ${paths.length} 笔。`,$('hint'));}
  function updateMeter(){$('meter').firstElementChild.style.width=`${energy*100}%`;$('meter').setAttribute('aria-valuenow',String(Math.round(energy*100)));}
  function activate(){if(paused)return;if(phase===0)show(1);else if(phase===1){energy=Math.min(1,energy+1/3);updateMeter();tone(Math.round(energy*3));if(energy>=1)show(2);else draw();}else if(phase===3)show(4);}
  function finishStroke(){if(phase!==4||stroke>=paths.length)return;stroke++;trace=0;dragging=false;demo=false;tone(stroke);if(stroke===paths.length){window.haqiHanziWritten();show(5);}else{writingHint();draw();}}
  function resize(){const r=canvas.getBoundingClientRect();width=r.width;height=r.height;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.max(1,Math.round(width*dpr));canvas.height=Math.max(1,Math.round(height*dpr));scale=Math.min(width/(width<600&&height>width?560:760),height/540);draw();}
  function glyphStroke(index,alpha,color){c.save();c.globalAlpha*=alpha;c.translate(-512*.46,450*.46);c.scale(.46,-.46);c.fillStyle=color;c.fill(paths[index]);c.restore();}
  function glyph(){
    const forming=phase===2&&!reduced?ease((elapsed-1.2)/3.8):1;
    c.save();
    if(phase===2||phase===3){
      c.globalAlpha=phase===2?ease(elapsed/.8):1;
      // Each scene's luminous contours gather into the actual stroke medians.
      for(let i=0;i<routes.length;i++){const line=routes[i].map((p,k)=>[p[0]*forming+sources[i][k][0]*(1-forming),p[1]*forming+sources[i][k][1]*(1-forming)]);c.shadowColor=S.color;c.shadowBlur=12*(1-forming);Paint.path(c,line,S.color,2+forming*5);}
      if(forming>.75)for(let i=0;i<paths.length;i++)glyphStroke(i,(forming-.75)*4,'#f5e6c7');
    }else if(phase===4){
      // Square guide and current stroke: completed strokes never disappear.
      c.strokeStyle='#d4d6bc25';c.lineWidth=1;c.strokeRect(-205,-205,410,410);c.setLineDash([5,8]);Paint.path(c,[[-205,0],[205,0]],'#d4d6bc30',1);Paint.path(c,[[0,-205],[0,205]],'#d4d6bc30',1);c.setLineDash([]);
      for(let i=0;i<paths.length;i++)glyphStroke(i,i<stroke?1:.12,i<stroke?'#f8e7c5':S.color);
      if(stroke<paths.length){glyphStroke(stroke,.18,S.color);const r=routes[stroke],portion=Math.max(1,Math.floor(trace*(r.length-1)));Paint.path(c,r.slice(0,portion+1),S.color,7);c.setLineDash([3,8]);Paint.path(c,r,'#f3d49c88',2);c.setLineDash([]);const p=r[Math.min(portion,r.length-1)];Paint.glow(c,p[0],p[1],22,S.color+'50');Paint.oval(c,p[0],p[1],5,5,'#fff4c7');Paint.oval(c,r.at(-1)[0],r.at(-1)[1],3,3,'#d3dfd677');}
    }else if(phase===5){for(let i=0;i<paths.length;i++)glyphStroke(i,1,'#f8e7c5');}
    c.restore();
  }
  function draw(){if(!c||!width)return;c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,width,height);c.save();c.translate(width/2,height/2);c.scale(scale,scale);
    const q=phase<0?.7:reduced?energy:visualEnergy,clock=reduced?12:t;
    if(reduced){
      const key=[canvas.width,canvas.height,scale,q].join(':');
      if(key!==backdropKey){backdrop.width=canvas.width;backdrop.height=canvas.height;backdropContext.setTransform(dpr*scale,0,0,dpr*scale,canvas.width/2,canvas.height/2);Paint.draw(backdropContext,S,clock,q);backdropKey=key;}
      c.save();c.setTransform(1,0,0,1,0,0);c.drawImage(backdrop,0,0);c.restore();
    }else Paint.draw(c,S,clock,q);
    if(phase>=2){const opacity=phase===2?ease(elapsed/4)*.86:phase===5?.74:.92;c.fillStyle=`rgba(6,22,34,${opacity})`;c.fillRect(-1000,-1000,2000,2000);glyph();}
    if(phase<0){c.fillStyle='#081c325c';c.fillRect(-1000,-1000,2000,2000);}
    c.restore();const vignette=c.createRadialGradient(width/2,height/2,Math.min(width,height)*.2,width/2,height/2,Math.hypot(width,height)*.6);vignette.addColorStop(0,'#05132100');vignette.addColorStop(1,'#05132188');c.fillStyle=vignette;c.fillRect(0,0,width,height);
  }
  function loop(now){const dt=last?Math.min((now-last)/1000,.05):0;last=now;if(!paused&&visible){t+=dt;elapsed+=dt;visualEnergy+=(energy-visualEnergy)*Math.min(1,dt*3);if(phase===2&&elapsed>=5.4)show(3);if(phase===4&&demo){demoTime+=dt;trace=clamp(demoTime/1.25);if(trace>=1)finishStroke();}if(!reduced||phase===2||demo)draw();}raf=requestAnimationFrame(loop);}
  function local(e){const r=canvas.getBoundingClientRect();return[(e.clientX-r.left-width/2)/scale,(e.clientY-r.top-height/2)/scale];}
  function distance(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1]);}
  function down(e){if(paused)return;if(phase===1){activate();return;}if(phase!==4||demo||stroke>=routes.length)return;const p=local(e),r=routes[stroke];if(distance(p,r[0])>30){ui('从亮起的起点开始，慢慢跟着走。',$('hint'));return;}dragging=true;trace=0;canvas.setPointerCapture(e.pointerId);e.preventDefault();}
  function move(e){if(!dragging||phase!==4)return;const p=local(e),r=routes[stroke],index=Math.floor(trace*63);let best=index;for(let i=index;i<=Math.min(index+10,63);i++)if(distance(p,r[i])<25)best=i;trace=Math.max(trace,best/63);if(trace>.94&&distance(p,r[63])<28)finishStroke();draw();}
  function release(){if(!dragging)return;dragging=false;trace=0;ui('这一笔还没到终点，再试一次。',$('hint'));draw();}
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
  canvas.addEventListener('keydown',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();if(phase===1)activate();else if(phase===4)startDemo();}});
  function startDemo(){if(phase!==4||paused||demo)return;dragging=false;trace=0;demo=true;demoTime=0;initAudio();}
  $('start').onclick=()=>{initAudio();tone();show(0);$('action').focus();};$('action').onclick=activate;$('demo').onclick=startDemo;
  $('replay').onclick=()=>{phase=-1;energy=0;visualEnergy=0;stroke=0;trace=0;done=false;demo=false;dragging=false;t=0;elapsed=0;paused=false;ui('暂停',$('pause'));$('pause').setAttribute('aria-pressed','false');$('intro').hidden=false;$('action').hidden=true;$('demo').hidden=true;$('meter').hidden=true;ui('一字一故事',$('chapter'));ui('',$('hint'));caption(S.intro);progress();$('start').focus();draw();};
  $('mute').onclick=()=>{muted=!muted;if(master)master.gain.value=muted?0:1;$('mute').setAttribute('aria-pressed',String(muted));ui(muted?'开启声音':'静音',$('mute'));if(!muted){initAudio();tone();}};
  $('pause').onclick=()=>{paused=!paused;dragging=false;ui(paused?'继续':'暂停',$('pause'));$('pause').setAttribute('aria-pressed',String(paused));if(audio)void(paused?audio.suspend():audio.resume()).catch(()=>{});};
  document.addEventListener('visibilitychange',()=>{visible=!document.hidden;last=0;if(!visible){dragging=false;void audio?.suspend().catch(()=>{});}else if(!paused)void audio?.resume().catch(()=>{});});
  addEventListener('pagehide',()=>{cancelAnimationFrame(raf);void audio?.close().catch(()=>{});},{once:true});
  new ResizeObserver(resize).observe(canvas);caption(S.intro);ui('一字一故事',$('chapter'));window.haqiHanziPrefetch([S.title,S.intro,S.action,S.change,S.form,S.finale,...titles,'走进故事','亲手写一写','顺着亮起的笔画，慢慢写下这个字。','故事完成，可以重播。','轻点画面或按钮，让故事慢慢发生。','看，画面正在回应你。','画面是联想，笔画是今天的规范字形。']);
  // Read-only diagnostics for acceptance. No phase skipping or reward shortcuts.
  window.hanziStoryState=()=>({id:S.id,glyph:S.glyph,phase,stroke,trace,energy,paused,reduced});
  resize();raf=requestAnimationFrame(loop);
})();
