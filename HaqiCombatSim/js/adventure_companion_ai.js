import {companionParams,companionLanguage,normalizeCompanionMemory,reserveCompanionQuota,releaseCompanionQuota,companionMessages,validateCompanionReply,companionIntent,localCompanionReply} from './adventure_companion_ai_core.js';
import {createLocalStore} from './adventure_local_store.js';
import {createLearningVoice} from './language_adventure_voice.js';
import {createDialogueVoiceSession} from './dialogue_voice_session.js';
import {createCompanionChatView} from './view_companion_chat.js';
import {createActorSpeech} from './view_actor_speech.js';
import {targetLanguageText} from './language_adventure_core.js';
import {textFor} from './locale.js';

// IO adapter boundary: future CLI/MCP providers can replace voice.judge here.
export function createCompanionAI(api,{store=createLocalStore({name:'haqi-companion-ai-v1'}),voice=createLearningVoice({getSettings:()=>api.settings()})}={}){
    const speech=createActorSpeech(),audio=createDialogueVoiceSession(voice),layer=document.createElement('div');layer.className='companion-speech-layer';document.body.append(layer);
    let scope=null,epoch=0,abort=new AbortController(),params=companionParams(),memory=normalizeCompanionMemory(),memoryGeneration=0;
    let content=null,loading=null,pending=false,interacting=false,phase='ready',status='',muted=false,quiet=false,unanswered=0,nextSpeech=Infinity,lastScene='',lastLanguage='',lastReply='',lastSnapshot=null,proactiveCount=0,lastObservation='',wasPaused=false,ready=false,queuedEvents=[];
    const view=createCompanionChatView({toggle:()=>api.toggle(),focus:()=>api.focus?.(),send:text=>void send(text),record,finish:()=>audio.finish(),cancel:()=>audio.cancel(),isRecording:()=>audio.recording,
        mute:()=>{muted=!muted;if(muted)void audio.cancel();paint();},repeat:()=>speak(lastReply),quiet:()=>{quiet=!quiet;paint();},follow:()=>api.follow(),
        clear:()=>void clearMemory(),suggest:s=>api.suggest(s)});
    const live=ticket=>!!scope&&ticket===epoch&&!abort.signal.aborted&&scope.owner===api.owner();
    function paint(){view.render({active:!!scope,inBattle:!!api.inBattle?.(),ai:api.isAI(),switching:api.switching()||!ready,name:api.name(),busy:pending||!ready||phase==='judging'||phase==='recording'||phase==='connecting',phase,status,muted,quiet,memory,suggestions:lastSnapshot?.suggestions||[]});}
    async function data(){return content||await(loading||=(fetch(new URL('../data/adventure/companion-ai.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('陪伴指引加载失败');return r.json();}).then(v=>content=v).finally(()=>{loading=null;})));}
    function invalidate(){epoch++;abort.abort();abort=new AbortController();pending=false;phase='ready';speech.clear();layer.replaceChildren();void audio.dispose();}
    async function start(value){
        invalidate();scope=value;ready=false;queuedEvents=[];params=companionParams(api.content());memory=normalizeCompanionMemory();lastScene=api.scene();lastLanguage=companionLanguage(api.settings());nextSpeech=performance.now()+api.speechDelay(false);unanswered=0;lastObservation='';status='';lastSnapshot=null;paint();
        const ticket=epoch;
        try{const row=await store.read(value.memoryKey);if(!live(ticket))return;memoryGeneration=row?.generation||0;memory=normalizeCompanionMemory({...row,events:[...(row?.events||[]),...queuedEvents]},params);ready=true;await saveMemory(ticket);await data();if(live(ticket))paint();}
        catch(e){if(live(ticket)){status=e.message;paint();}}
        finally{if(live(ticket)){ready=true;paint();}}
    }
    function stop(){invalidate();scope=null;paint();}
    function modeChanged(){invalidate();nextSpeech=performance.now()+api.speechDelay(false);paint();}
    async function saveMemory(ticket){
        if(!live(ticket))return;const value=structuredClone(memory),generation=memoryGeneration,key=scope.memoryKey;
        await store.update(key,row=>(row?.generation||0)===generation?{...value,generation}:row);
    }
    async function clearMemory(){
        if(!scope)return;invalidate();const ticket=epoch,key=scope.memoryKey;memory=normalizeCompanionMemory();status='本机记忆已清除';paint();
        try{const row=await store.update(key,old=>({...normalizeCompanionMemory(),generation:(old?.generation||0)+1}));if(live(ticket))memoryGeneration=row.generation;}
        catch(e){if(live(ticket)){status=e.message;paint();}}
    }
    async function remember(event){
        if(!scope||memory.events.at(-1)===event)return;
        if(!ready){queuedEvents.push(event);return;}
        memory=normalizeCompanionMemory({...memory,events:[...memory.events,event]},params);
        try{await saveMemory(epoch);}catch(e){status=e.message;}paint();
    }
    function say(text,translation='',language=companionLanguage(api.settings())){
        if(!text)return;speech.clear();speech.say('local-hero-1',text);lastReply=text;
        memory=normalizeCompanionMemory({...memory,messages:[...memory.messages,{role:'assistant',text,translation,language}]},params);paint();speak(text);
    }
    function speak(text){
        if(!text||muted||!scope?.owner||audio.recording||api.paused())return;
        const ticket=epoch;void audio.speak({text,locale:companionLanguage(api.settings()),speaker:{name:api.name()},signal:abort.signal,valid:()=>live(ticket)&&api.isAI(),onState:value=>{phase=value;paint();},onDone:()=>{phase='ready';paint();},onError:e=>{status=e.message;phase='ready';paint();}});
    }
    async function fallback(text='',proactive=true){
        const language=companionLanguage(api.settings());
        const local=lastSnapshot?.stage==='battle'?null:localCompanionReply(lastSnapshot||api.snapshot(),text);
        if(local){say(local.reply,local.translation,language);if(proactive)unanswered++;await saveMemory(epoch);return;}
        if(!content)return;const catalog=lastSnapshot?.stage==='battle'?content.fallbackBattle:content.fallback,rows=catalog?.[language];
        if(rows?.length){const index=proactiveCount++%rows.length,native=api.settings()?.native||'zh-CN';say(rows[index],native===language?'':catalog[native]?.[index]||'',language);if(proactive)unanswered++;await saveMemory(epoch);}
        else{status='当前语言暂无离线台词，伙伴仍会陪你探索。';paint();}
    }
    async function send(text='',proactive=false){
        if(!scope||!ready||!api.isAI()||pending||api.paused()||audio.recording)return;
        text=text.trim().slice(0,params.inputChars);
        const intent=!proactive&&companionIntent(text);
        if(intent==='quiet')quiet=true;else if(intent)api.command?.(intent);
        if(!proactive){unanswered=0;memory=normalizeCompanionMemory({...memory,messages:[...memory.messages,{role:'user',text,language:companionLanguage(api.settings())}]},params);}
        const ticket=epoch,context=api.snapshot();lastSnapshot=context;
        const observation=JSON.stringify([context.scene,context.goal,context.goalName,memory.events.at(-1)]);
        if(proactive&&(quiet||observation===lastObservation||unanswered>=2)){nextSpeech=performance.now()+api.speechDelay(true);return;}
        if(proactive)lastObservation=observation;
        pending=true;interacting=!proactive;status='';paint();
        nextSpeech=performance.now()+api.speechDelay(quiet||unanswered>=2);
        const id=crypto.randomUUID(),quotaKey=scope.quotaKey;let reserved=false;
        try{
            const config=await data();if(!live(ticket))return;
            if(intent||!scope.owner){if(!scope.owner)status='当前使用本地陪伴，登录后可以自由交流。';await fallback(text,proactive);return;}
            await store.update(quotaKey,row=>reserveCompanionQuota(row,{now:Date.now(),id,proactive,params}));reserved=true;if(!live(ticket)){await store.update(quotaKey,row=>releaseCompanionQuota(row,id));return;}
            const reply=validateCompanionReply(await voice.judge(companionMessages(config.skillMarkdown,context,memory,text||'Offer a brief, natural observation about our current shared activity. Ask at most one question.'),abort.signal,{maxTokens:params.modelTokens}),context.candidates||[],params);
            if(!live(ticket))return;
            if(['en','zh-CN'].includes(context.language)&&!targetLanguageText(reply.reply,context.language,[context.player,context.partner]))throw Error('伙伴回复语言不符合当前设置，请再试一次。');
            if(reply.summary!==null)memory.summary=reply.summary;
            if(reply.goalId&&!proactive)api.prefer(reply.goalId);
            say(reply.reply,context.language===context.native?'':reply.translation,context.language);if(proactive)unanswered++;
            await saveMemory(ticket);
        }catch(e){
            if(reserved&&e.requestUncertain===false)await store.update(quotaKey,row=>releaseCompanionQuota(row,id)).catch(()=>{});
            if(live(ticket)){status=e.message;await fallback(text,proactive);}
        }finally{if(live(ticket)){pending=false;paint();}}
    }
    async function record(){
        if(!scope||!api.isAI()||pending||api.paused())return;
        if(!scope.owner){status='请先登录 Keepwork 再使用录音。';paint();return;}
        await audio.cancel();const ticket=epoch;
        return audio.start({signal:abort.signal,valid:()=>live(ticket)&&api.isAI(),maxMs:params.recordMaxMs,
            onState:value=>{phase=value;paint();},onError:e=>{phase='ready';status=e.message;paint();},onCancel:()=>{phase='ready';paint();},
            onText:async text=>{await audio.dispose();phase='ready';if(live(ticket)){if(text.trim()&&api.settings()?.enabled)api.onSpeech?.(`companion:${crypto.randomUUID()}`);await send(text);}},
        });
    }
    function hint(action,battle){
        if(!scope||!api.isAI()||!content||api.paused())return;
        const language=companionLanguage(api.settings()),phrases=content.battle[language];if(!phrases)return;
        const card=api.cardName?.(action.key)||'这张牌',target=battle.unitsById[action.targetId]?.name||'';
        const text=(action.pass?phrases.pass:phrases.card).replace('{card}',textFor(card,language)).replace('{target}',textFor(target,language));
        // Local advice does not consume a model request and is discarded on round change.
        const native=api.settings()?.native||'zh-CN',translated=content.battle[native];
        const translation=language!==native&&translated?(action.pass?translated.pass:translated.card).replace('{card}',textFor(card,native)).replace('{target}',textFor(target,native)):'';
        say(text,translation,language);
    }
    function tick(now,anchor,obstacles=[]){
        if(!scope)return;
        if(scope.owner!==api.owner()){stop();return;}
        if(!ready)return;
        const paused=api.paused();layer.hidden=paused||!api.isAI();view.root.hidden=paused||!!api.inBattle?.();view.position();
        if(paused){if(!wasPaused){invalidate();wasPaused=true;}return;}wasPaused=false;
        const language=companionLanguage(api.settings()),scene=api.scene();
        if(language!==lastLanguage||scene!==lastScene){invalidate();lastLanguage=language;lastScene=scene;nextSpeech=now+api.speechDelay(false);paint();}
        if(anchor&&api.isAI()){
            speech.render(layer,{'local-hero-1':anchor},now,obstacles);
            for(const bubble of layer.querySelectorAll('.actor-speech')){bubble.style.pointerEvents='auto';bubble.setAttribute('role','button');bubble.tabIndex=0;bubble.setAttribute('aria-label','收起队友提示');bubble.onclick=()=>{speech.clear();layer.replaceChildren();};bubble.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();bubble.click();}};}
        }
        if(api.isAI()&&now>=nextSpeech&&!pending&&phase==='ready')void send('',true);
    }
    return {start,stop,modeChanged,tick,hint,remember,openChat(){if(scope&&api.isAI()&&!api.inBattle?.())view.open();},clearSpeech(){speech.clear();layer.replaceChildren();},get ready(){return !!scope&&ready&&!!content;},get conversing(){return pending&&interacting||audio.recording||view.opened&&view.root.contains(document.activeElement)&&!!document.activeElement?.value?.trim();},get typing(){return view.root.contains(document.activeElement)&&['INPUT','TEXTAREA'].includes(document.activeElement?.tagName);}};
}
