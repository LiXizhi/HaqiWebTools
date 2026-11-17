import {createPromoNarration} from './promo_narration.js';
import {capturePromoChrome,promoText} from './promo_locale.js';
import {resolvePromoEdition,compileFilm,locateShot,filmText,srtFor,frameDelta,captionAt,narrationLimitedTime} from './promo_timeline_core.js';
const $=id=>document.getElementById(id),query=new URLSearchParams(location.search);
const simple=query.get('simple')==='1';
let failed=false;
let loaded=false,uiLocale='zh-CN',statusSource='准备中';
const paintChrome=capturePromoChrome(),t=text=>promoText(text,uiLocale);
let script,film,stage,time=0,index=-1,cueIndex=0,playing=false,busy=true,checking=false,last=0;
let report={version:1,status:'未运行',results:[],excluded:['真实账号登录注册','云端存储','真实好友请求与通信','麦克风与语音识别服务','支付','剧本外游戏功能']};
// Balanced logical viewports: readable landscape UI and a compact portrait layout.
const formats={wide:{width:1280,height:720},classic:{width:1120,height:840},phone:{width:540,height:960}};
function resizeScreen(){
    const {width,height}=formats[$('format').value],cinema=$('cinema'),screen=document.querySelector('.screen'),frame=$('stage');
    cinema.style.setProperty('--film-ratio',String(width/height));
    const scale=Math.min(cinema.clientWidth/width,(cinema.clientHeight-(simple?50:0))/height);
    if(!scale)return;
    screen.dataset.format=$('format').value;
    screen.style.width=`${width*scale}px`;screen.style.height=`${height*scale}px`;
    frame.style.width=`${width}px`;frame.style.height=`${height-(height>width?142:100)}px`;frame.style.transform=`scale(${scale})`;
    if(loaded&&!busy)stage.tick(locateShot(film,time).elapsed);
}
new ResizeObserver(resizeScreen).observe($('cinema'));
$('format').onchange=resizeScreen;
const narration=createPromoNarration({onState:text=>{$('narration-status').textContent=t(text);stage?.setPaused(!playing||busy||narration.starting);},onError:()=>{$('narration-status').textContent=t('朗读暂不可用，可切换音色重试');if(simple){$('simple-message').textContent='声音暂不可用，可关闭后重新开启';$('simple-message').hidden=false;}}});
function refreshVoices(){const selected=$('narration-voice').value,options=[new Option(t('自动匹配字幕语言'),'')];for(const voice of narration.voices())options.push(new Option(`${voice.name} (${voice.language})`,voice.id));$('narration-voice').replaceChildren(...options);if(options.some(o=>o.value===selected))$('narration-voice').value=selected;}
function narrate(){
    if(!film)return;
    const at=locateShot(film,time),lang=language()==='off'?uiLocale:language(),enabled=$('read-subtitles').checked,run=playing&&!checking&&!document.hidden,voiceURI=$('narration-voice').value;
    const started=narration.speak({text:captionAt(at.shot,at.elapsed,lang),key:at.shot.id,lang,voiceURI,rate:Number($('speed').value),enabled,playing:run});
    if(enabled&&run){
        const next=at.shot.cues.find(c=>c.caption&&c.time>at.elapsed)?.caption||film.shots[at.index+1]?.subtitle;
        narration.prefetch(next?{text:filmText(next,lang),lang,voiceURI}:null);
    }else narration.clearPrefetch();
    return started;
}
refreshVoices();$('narration-voice').disabled=true;$('narration-status').textContent=t('正在加载Keepwork音色…');
if(!simple)void narration.ready().then(()=>{refreshVoices();$('narration-voice').disabled=false;$('narration-status').textContent='';}).catch(()=>{$('narration-status').textContent=t('Keepwork音色加载失败，播放时重试');});
for(const id of ['read-subtitles','narration-voice','speed'])$(id).addEventListener('change',()=>{narration.stop();narration.clearPrefetch();$('narration-status').textContent='';narrate();});
window.addEventListener('pagehide',()=>{narration.stop();narration.clearPrefetch();});
const language=()=>$('language').value,clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(Math.floor(n%60)).padStart(2,'0')}`;
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function controls(){if(simple)syncSimple();for(const id of ['play','restart','check','seek','edition','language','chapters']){const node=$(id);if(id==='chapters')for(const b of node.children)b.disabled=!loaded||busy||checking;else node.disabled=!loaded||checking||failed||(busy&&!(simple&&id==='play')); }$('play').textContent=t(playing?'暂停':'播放');stage?.setPaused(!playing||busy||narration.starting);if(!playing||checking)narration.stop();else if(!busy)narrate();}
function status(text){statusSource=text;$('status').textContent=t(text);}
function fail(error){console.error(error);failed=true;playing=false;busy=false;checking=false;$('loading').hidden=false;$('loading').textContent=`${uiLocale==='en'?'Playback paused':'播放暂停'}: ${error.message}`;status(`${uiLocale==='en'?'Failed':'失败'}: ${error.message}`);controls();}
function labels(){if(!film)return;const at=locateShot(film,time),s=at.shot,l=language();$('chapter-title').textContent=filmText(s.title,uiLocale);$('scene-label').textContent=l==='off'?'':`${String(at.index+1).padStart(2,'0')} / ${filmText(s.title,uiLocale)}`;$('chapter-number').textContent=`${String(at.index+1).padStart(2,'0')} / ${String(film.shots.length).padStart(2,'0')}`;$('subtitle').textContent=l==='off'?'':captionAt(s,at.elapsed,l);$('clock').textContent=`${clock(time)} / ${clock(film.duration)}`;$('seek').value=time;if(simple)$('simple-clock').textContent=$('clock').textContent;const opacity=!playing||narration.pending?1:Math.min(1,at.index===0?1:at.elapsed/.7,at.index===film.shots.length-1?1:(s.duration-at.elapsed)/.7);$('shade').style.opacity=1-Math.max(0,opacity);$('subtitle').style.opacity=Math.max(0,opacity);for(const [i,b]of [...$('chapters').children].entries())b.setAttribute('aria-current',String(i===at.index));narrate();}
function chapters(){film=compileFilm(script,$('edition').value);$('seek').max=film.duration;$('chapters').replaceChildren(...film.shots.map((s,i)=>{const b=document.createElement('button');b.textContent=`${String(i+1).padStart(2,'0')} ${filmText(s.title,uiLocale)}`;b.onclick=()=>{void seek(s.start).catch(fail);$('cinema').scrollIntoView({block:'start'});};return b;}));}
async function loadShot(i){narration.stop();index=i;cueIndex=0;await stage.prepare(film.shots[i],script.seed);}
async function applyCues(elapsed){const s=film.shots[index];while(cueIndex<s.cues.length&&s.cues[cueIndex].time<=elapsed){stage.tick(s.cues[cueIndex].time);labels();await narrate();await stage.action(s.cues[cueIndex]);cueIndex++;}}
async function seek(target){if(busy||checking)return;failed=false;busy=true;controls();$('loading').hidden=false;$('loading').textContent=t('正在准备镜头…');try{const at=locateShot(film,target);time=at.time;await loadShot(at.index);await applyCues(at.elapsed);stage.tick(at.elapsed);labels();$('loading').hidden=true;}finally{busy=false;last=performance.now();controls();}}
async function advance(delta){let waited=false;busy=true;controls();try{time=narrationLimitedTime(film,time,delta,cueIndex,$('read-subtitles').checked&&narration.pending);const at=locateShot(film,time);if(at.index!==index){waited=true;await loadShot(at.index);}if(film.shots[index].cues[cueIndex]?.time<=at.elapsed)waited=true;await applyCues(at.elapsed);stage.tick(at.elapsed);labels();if(time>=film.duration){playing=false;status('播放结束 · 可以从头播放或选择章节');}}finally{busy=false;if(waited)last=performance.now();controls();}}
function frame(now){requestAnimationFrame(frame);const delta=frameDelta(now,last,Number($('speed').value));last=now;if(playing&&!busy&&!checking&&!document.hidden&&!narration.starting)void advance(delta).catch(fail);}
async function runCheck(){
    if(busy||checking)return;playing=false;checking=true;$('loading').hidden=true;controls();report={...report,status:'运行中',edition:film.edition,startedAt:new Date().toISOString(),results:[]};
    try{for(let i=0;i<film.shots.length;i++){
        const s=film.shots[i];status(`${uiLocale==='en'?'Checking':'检查'} ${i+1}/${film.shots.length}: ${filmText(s.title,uiLocale)}`);
        try{await loadShot(i);for(const cue of s.cues){stage.tick(cue.time);await stage.action(cue);}stage.tick(s.duration-.05);time=s.start+s.duration-.05;labels();const result=stage.validateFrames();report.results.push({...result,status:'通过'});}
        catch(error){report.results.push({shot:s.id,status:'失败',error:error.message});throw error;}
        await new Promise(resolve=>requestAnimationFrame(resolve));
    }report.status='通过';status(uiLocale==='en'?`All ${report.results.length} scenes passed; AI demo verified; account and voice services excluded`:`剧本检查通过：${report.results.length} 个镜头；已验证AI示例，账号与语音服务除外`);}
    catch(error){report.status='失败';fail(error);}
    finally{report.completedAt=new Date().toISOString();checking=false;controls();}
}
$('play').onclick=()=>{if(time>=film.duration){void seek(0).then(()=>{playing=true;controls();}).catch(fail);}else{playing=!playing;last=performance.now();controls();}};
$('restart').onclick=()=>void seek(0).then(()=>{playing=true;controls();}).catch(fail);
$('seek').onchange=()=>void seek(Number($('seek').value)).catch(fail);
$('edition').onchange=()=>{playing=false;chapters();status('已切换版本，准备播放');void seek(0).catch(fail);};
$('language').onchange=()=>{if(!script||busy||checking)return;void changeLanguage().catch(fail);};
async function changeLanguage(){
    if(language()!=='off')uiLocale=language();
    busy=true;controls();try{paintChrome(uiLocale);refreshVoices();await stage.setLocale(uiLocale);chapters();status(statusSource);}finally{busy=false;}
    await seek(time);
}
$('clean').onclick=()=>{document.body.classList.toggle('recording');document.activeElement?.blur();};
$('fullscreen').onclick=()=>{const action=document.fullscreenElement?document.exitFullscreen():$('cinema').requestFullscreen();void action.catch(error=>status(error.message));};
$('check').onclick=()=>void runCheck();
$('report').onclick=()=>download('haqi-promo-check.json',JSON.stringify(report,null,2),'application/json');
$('srt').onclick=()=>download(`haqi-${film.edition}-${uiLocale}.srt`,srtFor(film,uiLocale),'text/plain');
document.addEventListener('keydown',event=>{if(event.key==='Escape')document.body.classList.remove('recording');if(['INPUT','SELECT','TEXTAREA','BUTTON'].includes(event.target.tagName))return;if(event.code==='Space'){event.preventDefault();if(!busy&&!checking)$('play').click();}if(['ArrowLeft','ArrowRight'].includes(event.key)&&!busy&&!checking){event.preventDefault();const target=Math.max(0,Math.min(film.shots.length-1,index+(event.key==='ArrowRight'?1:-1)));void seek(film.shots[target].start).catch(fail);}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing){playing=false;controls();status('页面已隐藏，播放已暂停');}});

// Small public player. Existing studio controls remain the source of truth.
let hideTimer;
function revealSimple(){
    document.body.classList.remove('controls-hidden');clearTimeout(hideTimer);
    if(playing)hideTimer=setTimeout(()=>document.body.classList.add('controls-hidden'),2400);
}
function syncSimple(){
    document.body.classList.toggle('is-playing',playing);
    document.body.classList.toggle('is-busy',busy);
    $('simple-start').hidden=playing||busy||!loaded||failed;
    $('simple-error').hidden=!failed;
    $('simple-mute').textContent=$('read-subtitles').checked?'关闭声音':'开启声音';
    $('simple-mute').setAttribute('aria-pressed',String($('read-subtitles').checked));
    if(!playing)document.body.classList.remove('controls-hidden');
}
if(simple){
    document.body.classList.add('simple');
    const phone=matchMedia('(max-width:600px)');
    const fit=()=>{$('format').value=phone.matches?'phone':'wide';resizeScreen();};
    phone.addEventListener('change',fit);fit();
    $('read-subtitles').checked=false;
    const cinema=$('cinema');
    const message=document.createElement('p');message.id='simple-message';message.hidden=true;message.setAttribute('role','status');cinema.append(message);
    const bar=document.createElement('div');bar.className='simple-bar';bar.setAttribute('aria-label','播放控制');
    const mute=document.createElement('button');mute.id='simple-mute';mute.textContent='开启声音';
    const timer=document.createElement('span');timer.id='simple-clock';timer.textContent='00:00 / 00:00';
    bar.append($('play'),$('seek'),timer,mute,$('fullscreen'));cinema.append(bar);
    const start=document.createElement('button');start.id='simple-start';start.textContent='▶ 播放';start.hidden=true;cinema.append(start);
    const error=document.createElement('div');error.id='simple-error';error.hidden=true;
    const retry=document.createElement('button');retry.textContent='重试';retry.onclick=()=>location.reload();
    const external=document.createElement('a');external.textContent='新窗口打开 ↗';external.href=location.href;external.target='_blank';external.rel='noopener';
    error.append(retry,external);cinema.append(error);
    start.onclick=()=>{$('play').click();revealSimple();};
    mute.onclick=()=>{$('simple-message').hidden=true;$('read-subtitles').checked=!$('read-subtitles').checked;$('read-subtitles').dispatchEvent(new Event('change'));syncSimple();};
    for(const event of ['pointermove','pointerdown','focusin'])cinema.addEventListener(event,revealSimple);
    $('play').addEventListener('click',revealSimple);
}

window.promoPlayer={get state(){return {ready:!!stage&&!busy,time,index,playing,checking,duration:film?.duration,report:structuredClone(report)};},seek,runCheck};
(async()=>{
    const response=await fetch('data/promo/film.json');if(!response.ok)throw Error(`剧本加载失败 ${response.status}`);script=await response.json();
    $('edition').value=resolvePromoEdition(query.get('edition'),simple);if(query.get('lang')==='en')$('language').value='en';
    uiLocale=language()==='en'?'en':'zh-CN';paintChrome(uiLocale);refreshVoices();chapters();controls();const iframe=$('stage');if(query.get('assets')==='local')iframe.src='HaqiPromoStage.html?assets=local';
    await new Promise((resolve,reject)=>{const deadline=performance.now()+120000;const poll=()=>{try{if(iframe.contentWindow?.promoStage){stage=iframe.contentWindow.promoStage;resolve();return;}}catch(error){reject(error);return;}if(performance.now()>deadline)reject(Error('舞台加载超时，请刷新重试'));else setTimeout(poll,100);};poll();});
    await Promise.race([stage.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('资源加载超时，请刷新重试')),120000))]);
    await stage.setLocale(uiLocale);loaded=true;busy=false;await seek(0);status('准备就绪 · 全程使用隔离演示角色');requestAnimationFrame(frame);if(simple&&query.get('autoplay')==='1'&&!document.hidden){playing=true;last=performance.now();controls();revealSimple();}
})().catch(fail);
