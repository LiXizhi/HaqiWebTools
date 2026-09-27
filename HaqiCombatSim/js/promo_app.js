import {compileFilm,locateShot,filmText,srtFor,frameDelta} from './promo_timeline_core.js';
const $=id=>document.getElementById(id),query=new URLSearchParams(location.search);
let loaded=false;
let script,film,stage,time=0,index=-1,cueIndex=0,playing=false,busy=true,checking=false,last=0;
let report={version:1,status:'未运行',results:[],excluded:['真实账号登录注册','云端存储','真实好友请求与通信','AI 与语音服务','支付','剧本外游戏功能']};
new ResizeObserver(entries=>{const width=entries[0].contentRect.width;$('stage').style.transform=`scale(${width/1280})`;}).observe(document.querySelector('.screen'));
const language=()=>$('language').value,clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(Math.floor(n%60)).padStart(2,'0')}`;
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function controls(){for(const id of ['play','restart','check','seek','edition','chapters']){const node=$(id);if(id==='chapters')for(const b of node.children)b.disabled=!loaded||busy||checking;else node.disabled=!loaded||busy||checking;}$('play').textContent=playing?'暂停':'播放';stage?.setPaused(!playing||busy);}
function status(text){$('status').textContent=text;}
function fail(error){console.error(error);playing=false;busy=false;checking=false;$('loading').hidden=false;$('loading').textContent=`播放暂停：${error.message}`;status(`失败：${error.message}`);controls();}
function labels(){if(!film)return;const at=locateShot(film,time),s=at.shot,l=language();$('chapter-title').textContent=filmText(s.title,l);$('chapter-number').textContent=`${String(at.index+1).padStart(2,'0')} / ${String(film.shots.length).padStart(2,'0')}`;$('subtitle').textContent=l==='off'?'':filmText(s.subtitle,l);$('fixture-label').textContent=s.fixture?(l==='en'?'Scripted demonstration · no live service':'剧本演示 · 未连接真实服务'):'';$('clock').textContent=`${clock(time)} / ${clock(film.duration)}`;$('seek').value=time;const opacity=Math.min(1,at.index===0?1:at.elapsed/.7,at.index===film.shots.length-1?1:(s.duration-at.elapsed)/.7);$('shade').style.opacity=1-Math.max(0,opacity);$('subtitle').style.opacity=Math.max(0,opacity);for(const [i,b]of [...$('chapters').children].entries())b.setAttribute('aria-current',String(i===at.index));}
function chapters(){film=compileFilm(script,$('edition').value);$('seek').max=film.duration;$('chapters').replaceChildren(...film.shots.map((s,i)=>{const b=document.createElement('button');b.textContent=`${String(i+1).padStart(2,'0')} ${filmText(s.title,language())}`;b.onclick=()=>void seek(s.start).catch(fail);return b;}));}
async function loadShot(i){index=i;cueIndex=0;await stage.prepare(film.shots[i],script.seed);}
async function applyCues(elapsed){const s=film.shots[index];while(cueIndex<s.cues.length&&s.cues[cueIndex].time<=elapsed){await stage.action(s.cues[cueIndex]);cueIndex++;}}
async function seek(target){if(busy||checking)return;busy=true;controls();$('loading').hidden=false;$('loading').textContent='正在准备镜头…';try{const at=locateShot(film,target);time=at.time;await loadShot(at.index);await applyCues(at.elapsed);stage.tick(at.elapsed);labels();$('loading').hidden=true;}finally{busy=false;last=performance.now();controls();}}
async function advance(delta){let waited=false;busy=true;controls();try{time=Math.min(film.duration,time+delta);const at=locateShot(film,time);if(at.index!==index){waited=true;await loadShot(at.index);}if(film.shots[index].cues[cueIndex]?.time<=at.elapsed)waited=true;await applyCues(at.elapsed);stage.tick(at.elapsed);labels();if(time>=film.duration){playing=false;status('播放结束 · 可以从头播放或选择章节');}}finally{busy=false;if(waited)last=performance.now();controls();}}
function frame(now){requestAnimationFrame(frame);const delta=frameDelta(now,last,Number($('speed').value));last=now;if(playing&&!busy&&!checking&&!document.hidden)void advance(delta).catch(fail);}
async function runCheck(){
    if(busy||checking)return;playing=false;checking=true;$('loading').hidden=true;controls();report={...report,status:'运行中',edition:film.edition,startedAt:new Date().toISOString(),results:[]};
    try{for(let i=0;i<film.shots.length;i++){
        const s=film.shots[i];status(`检查 ${i+1}/${film.shots.length}：${s.title['zh-CN']}`);
        try{await loadShot(i);for(const cue of s.cues)await stage.action(cue);stage.tick(s.duration-.05);time=s.start+s.duration-.05;labels();const result=stage.validateFrames();report.results.push({...result,status:'通过'});}
        catch(error){report.results.push({shot:s.id,status:'失败',error:error.message});throw error;}
        await new Promise(resolve=>requestAnimationFrame(resolve));
    }report.status='通过';status(`剧本检查通过：${report.results.length} 个镜头；联网服务不在本次检查范围`);}
    catch(error){report.status='失败';fail(error);}
    finally{report.completedAt=new Date().toISOString();checking=false;controls();}
}
$('play').onclick=()=>{if(time>=film.duration){void seek(0).then(()=>{playing=true;controls();}).catch(fail);}else{playing=!playing;last=performance.now();controls();}};
$('restart').onclick=()=>void seek(0).then(()=>{playing=true;controls();}).catch(fail);
$('seek').onchange=()=>void seek(Number($('seek').value)).catch(fail);
$('edition').onchange=()=>{playing=false;chapters();status('已切换版本，准备播放');void seek(0).catch(fail);};
$('language').onchange=()=>{if(!script)return;chapters();labels();controls();};
$('clean').onclick=()=>{document.body.classList.toggle('recording');document.activeElement?.blur();};
$('fullscreen').onclick=()=>void $('cinema').requestFullscreen().catch(error=>status(error.message));
$('check').onclick=()=>void runCheck();
$('report').onclick=()=>download('haqi-promo-check.json',JSON.stringify(report,null,2),'application/json');
$('srt').onclick=()=>download(`haqi-${film.edition}-${language()==='off'?'zh-CN':language()}.srt`,srtFor(film,language()),'text/plain');
document.addEventListener('keydown',event=>{if(event.key==='Escape')document.body.classList.remove('recording');if(['INPUT','SELECT','TEXTAREA','BUTTON'].includes(event.target.tagName))return;if(event.code==='Space'){event.preventDefault();if(!busy&&!checking)$('play').click();}if(['ArrowLeft','ArrowRight'].includes(event.key)&&!busy&&!checking){event.preventDefault();const target=Math.max(0,Math.min(film.shots.length-1,index+(event.key==='ArrowRight'?1:-1)));void seek(film.shots[target].start).catch(fail);}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing){playing=false;controls();status('页面已隐藏，播放已暂停');}});
window.promoPlayer={get state(){return {ready:!!stage&&!busy,time,index,playing,checking,duration:film?.duration,report:structuredClone(report)};},seek,runCheck};
(async()=>{
    const response=await fetch('data/promo/film.json');if(!response.ok)throw Error(`剧本加载失败 ${response.status}`);script=await response.json();
    if(query.get('edition')==='short')$('edition').value='short';if(query.get('lang')==='en')$('language').value='en';
    chapters();controls();const iframe=$('stage');if(query.get('assets')==='local')iframe.src='HaqiPromoStage.html?assets=local';
    await new Promise((resolve,reject)=>{const deadline=performance.now()+120000;const poll=()=>{try{if(iframe.contentWindow?.promoStage){stage=iframe.contentWindow.promoStage;resolve();return;}}catch(error){reject(error);return;}if(performance.now()>deadline)reject(Error('舞台加载超时，请刷新重试'));else setTimeout(poll,100);};poll();});
    await Promise.race([stage.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('资源加载超时，请刷新重试')),120000))]);
    loaded=true;busy=false;await seek(0);status('准备就绪 · 中文字幕 · 全程使用隔离演示角色');requestAnimationFrame(frame);
})().catch(fail);
