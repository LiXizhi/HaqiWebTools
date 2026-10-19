// prologue_app.js — interactive cinematic prologue 《失落的光》, mounted inside Haqi.html.
// Lazily imported by adventure_app.js (Haqi.html?prologue, the title-screen button, or a new player's
// first visit). Shares the already loaded assets, renderer, locale and sound; needs no login and writes
// no save. Story text lives only in data/prologue/script.json.
import {createJsonReader} from './runtime_data.js';
import {createCloseButton} from './view_adventure_controls.js';
import {validateScript,languagePair,bilingual,beatAutoSeconds,createRunner} from './prologue_script_core.js';
import {wordCardRow} from './prologue_battle_core.js';
import {createCinema} from './prologue_cinema.js';
import {createPrologueDialog} from './view_prologue_dialog.js';
import {createPrologueStage} from './prologue_stage.js';

const CHROME={
    brand:{'zh-CN':'魔法哈奇 · 序章','en':'Magic Haqi · Prologue'},
    skip:{'zh-CN':'跳过本幕','en':'Skip scene'},
    exit:{'zh-CN':'退出序章','en':'Leave prologue'},
    read:{'zh-CN':'朗读','en':'Read aloud'},
    lang:{'zh-CN':'English','en':'中文'},
    replay:{'zh-CN':'再看一遍','en':'Watch again'},
    loading:{'zh-CN':'正在准备序章…','en':'Preparing the prologue…'},
    readFail:{'zh-CN':'朗读暂不可用，可继续阅读字幕。','en':'Read aloud is unavailable. Subtitles still work.'},
    you:{'zh-CN':'你','en':'You'},
};
class Skip extends Error{}

export async function mountPrologue(host,ctx){
    const {assets,renderer,spellSound,onExit=()=>{},onLocaleChange=()=>{}}=ctx;
    const doc=host.ownerDocument;
    const make=(tag,cls,text)=>{const n=doc.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
    const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
    let pair=languagePair(ctx.locale,ctx.second);
    const layer=make('div','prologue-layer');layer.setAttribute('role','dialog');layer.setAttribute('aria-modal','true');layer.setAttribute('aria-label',CHROME.brand[pair.native]);
    const stageNode=make('div','pl-stage');
    const loading=make('p','pl-loading',CHROME.loading[pair.native]);
    layer.append(stageNode,loading);host.append(layer);

    const read=createJsonReader();
    const [script,artManifest,words]=await Promise.all([read('data/prologue/script.json'),read('data/prologue/art.json'),read('data/adventure/dictionary/word-cards.json')]);
    validateScript(script,{artIds:new Set(Object.keys(artManifest.entries||{}))});

    const cinema=createCinema(stageNode,{manifest:artManifest,mode:assets.mode,reducedMotion});
    const dialog=createPrologueDialog(stageNode);
    let epoch=0,disposed=false,narration=null,readAloud=false,autoPlay=false,tapResolvers=new Set(),skipResolvers=new Set();
    const state={school:null,appearance:null,draft:null,battles:{}};

    // ----- waiting primitives (tap / auto / skip) -----
    function tap(){for(const fn of [...tapResolvers])fn();}
    const skipped=()=>new Promise(resolve=>skipResolvers.add(resolve));
    function guard(e){if(e!==epoch||disposed)throw new Skip();}
    /** Resolves on tap or after `seconds` of visible time (0 = tap only). Speech holds the timer. */
    function advance(seconds,{progress}={}){
        const e=epoch;
        return new Promise(resolve=>{
            let shown=0,last=performance.now(),done=false;
            const finish=()=>{if(done)return;done=true;tapResolvers.delete(finish);skipResolvers.delete(finish);clearInterval(timer);progress?.(0);resolve();};
            tapResolvers.add(finish);skipResolvers.add(finish);
            const timer=setInterval(()=>{
                const now=performance.now(),dt=now-last;last=now;
                if(!autoPlay)shown=0;
                else if(!doc.hidden&&!(readAloud&&narration?.pending))shown+=dt;
                if(seconds>0){progress?.(shown/1000/seconds);if(shown/1000>=seconds)finish();}
            },100);
        }).then(()=>guard(e));
    }
    const wait=seconds=>advance(seconds);
    function showPrompt({speaker:speakerId,text:rawText}){
        const speaker=script.speakers[speakerId],text=bilingual(rawText,pair);
        dialog.show({
            speaker:speaker?.[pair.native]||'',
            school:speaker?.school,
            avatar:stage.speakerAvatar(speakerId),
            primary:text.primary,
            secondary:text.secondary,
            nativeLang:pair.native,
            targetLang:pair.target,
            reducedMotion:true,
            promptMode:true,
        });
    }
    async function say(line){
        const e=epoch,speaker=script.speakers[line.speaker],text=bilingual(line.text,pair);
        dialog.show({
            speaker:speaker?.[pair.native]||'',
            school:speaker?.school,
            avatar:stage.speakerAvatar(line.speaker),
            primary:text.primary,
            secondary:text.secondary,
            nativeLang:pair.native,
            targetLang:pair.target,
            reducedMotion:reducedMotion(),
        });
        if(readAloud)speak(text.primary);
        await advance(beatAutoSeconds({type:'line',text:line.text},pair),{progress:value=>dialog.setProgress(value)});
        guard(e);narration?.stop();
    }
    function speak(text){
        if(!narration)return;
        narration.speak({text,key:text,lang:pair.native,enabled:true,playing:true}).catch(()=>{});
    }

    const stage=createPrologueStage({
        root:stageNode,
        assets,
        renderer,
        spellSound,
        speakers:script.speakers,
        artManifest,
        getPair:()=>pair,
        say,
        showPrompt,
        setPromptProgress:value=>dialog.setProgress(value),
        wait,
        reducedMotion,
        hideDialog:()=>dialog.hide(),
    });
    function continueStory(){if(dialog.typing)dialog.stopTyping();else tap();}
    dialog.onAutoPlay=()=>{autoPlay=!autoPlay;dialog.setAutoPlay(autoPlay);};
    const onClick=event=>{
        if(event.target?.closest?.('button,input,textarea,select,a,[role="button"],iframe'))return;
        continueStory();
    };
    layer.addEventListener('click',onClick);

    // ----- chrome -----
    const bar=make('header','pl-chrome');
    const brand=make('span','pl-brand');
    const langBtn=make('button','pl-chip');langBtn.type='button';
    const readBtn=make('button','pl-chip');readBtn.type='button';readBtn.setAttribute('aria-pressed','false');
    const skipBtn=make('button','pl-chip');skipBtn.type='button';
    const status=make('span','pl-status');status.setAttribute('role','status');
    const close=createCloseButton(()=>finish({finished:false}),CHROME.exit[pair.native],'pl-close');
    bar.append(brand,status,langBtn,readBtn,skipBtn,close);layer.append(bar);
    function paintChrome(){
        brand.textContent=`${CHROME.brand[pair.native]}《${script.title[pair.native]}》`;
        langBtn.textContent=CHROME.lang[pair.native];readBtn.textContent=CHROME.read[pair.native];skipBtn.textContent=CHROME.skip[pair.native];
        close.title=CHROME.exit[pair.native];close.setAttribute('aria-label',CHROME.exit[pair.native]);
        layer.setAttribute('aria-label',CHROME.brand[pair.native]);
    }
    langBtn.onclick=async()=>{
        pair=languagePair(pair.native==='en'?'zh-CN':'en',null);paintChrome();
        try{await onLocaleChange(pair.native,pair.target);}catch{}
        if(current?.beat.type==='line')say(current.beat).catch(()=>{});
    };
    readBtn.onclick=async()=>{
        readAloud=!readAloud;readBtn.setAttribute('aria-pressed',String(readAloud));
        if(readAloud&&!narration){
            try{const {createPromoNarration}=await import('./promo_narration.js');narration=createPromoNarration({onError:()=>{status.textContent=CHROME.readFail[pair.native];}});}
            catch{status.textContent=CHROME.readFail[pair.native];readAloud=false;readBtn.setAttribute('aria-pressed','false');}
        }
        if(!readAloud)narration?.stop();
    };
    skipBtn.onclick=()=>skip('scene');
    const onKey=event=>{
        if(event.target?.closest?.('input,textarea,select'))return;
        if(event.key===' '||event.key==='Enter'){
            if(event.repeat||!tapResolvers.size)return;
            if(event.key===' '||event.target===doc.body||event.target===layer||stageNode.contains(event.target)&&!event.target.closest('button')){event.preventDefault();continueStory();}
        }
        else if(event.key==='ArrowRight'){event.preventDefault();skip('scene');}
    };
    doc.addEventListener('keydown',onKey);
    paintChrome();

    // ----- runner -----
    const runner=createRunner(script,{start:ctx.start&&script.scenes.some(s=>s.id===ctx.start)?ctx.start:null});
    let current=null;
    function skip(kind){
        if(disposed)return;
        epoch++;for(const fn of [...skipResolvers])fn();skipResolvers.clear();tapResolvers.clear();
        stage.abort();dialog.hide();cinema.hideTitle();narration?.stop();
        if(kind==='scene')runner.skipScene();else runner.skipAll();
        const art=runner.artAt();if(art){cinema.clearFx();cinema.showArt(art.art,'still');}
    }
    async function playBeat(beat){
        const e=epoch;
        switch(beat.type){
            case 'art':cinema.setBars(true);cinema.showArt(beat.art,beat.move||'still');await sleep(180);break;
            case 'fx':cinema.effect(beat.name,{glyph:beat.glyph});await sleep(beat.name==='shatter'?900:150);break;
            case 'title':{dialog.hide();const t=bilingual(beat.text,pair);cinema.showTitle('',t);await advance(beatAutoSeconds(beat,pair));cinema.hideTitle();await sleep(180);break;}
            case 'line':await say(beat);break;
            case 'battle-scripted':{dialog.hide();cinema.setBars(false);if(beat.art)cinema.showArt(beat.art,'still');state.battles.masters=await stage.mastersBattle(beat);break;}
            case 'catch-spark':dialog.hide();await stage.catchSpark(beat);break;
            case 'hanzi':{dialog.hide();cinema.setBars(false);const result=await stage.hanzi(beat);state.written=result.written;break;}
            case 'card-forge':{dialog.hide();const row=wordCardRow(words.cards,pair.target);const hanziBeat=script.scenes.flatMap(s=>s.beats).find(b=>b.type==='hanzi');await stage.cardForge(row,pair,{reveal:hanziBeat.reveal});break;}
            case 'battle-live':{
                dialog.hide();cinema.setBars(false);if(beat.art)cinema.showArt(beat.art,'still');
                state.battles.finale=await stage.finaleBattle(beat,{wordCard:wordCardRow(words.cards,pair.target)});
                break;
            }
            case 'end':await endCard(beat);break;
            default:throw Error(`未支持的序章镜头：${beat.type}`);
        }
        guard(e);
    }
    function sleep(ms){const e=epoch;return new Promise(r=>setTimeout(r,ms)).then(()=>guard(e));}
    function endCard(beat){
        dialog.hide();cinema.setBars(false);
        return new Promise(resolve=>{
            const e=epoch,card=make('section','pl-end'),t=bilingual(beat.text,pair),a=bilingual(beat.action,pair);
            const h=make('h1','',t.primary);h.append(make('small','',t.secondary));
            const go=make('button','primary pl-end-go',a.primary);go.type='button';go.append(make('small','',a.secondary));
            const again=make('button','secondary pl-end-again',CHROME.replay[pair.native]);again.type='button';
            go.onclick=()=>{resolve();finish({finished:true});};
            again.onclick=()=>{card.remove();resolve();epoch++;for(const fn of [...skipResolvers])fn();skipResolvers.clear();runner.jump(script.scenes[0].id);state.battles={};};
            card.append(h,go,again);stageNode.append(card);
            skipResolvers.add(()=>{card.remove();resolve();});
            requestAnimationFrame(()=>card.classList.add('shown'));
            go.focus();
            void e;
        });
    }

    let exitPayload=null,resolveExit;
    const exited=new Promise(resolve=>{resolveExit=resolve;});
    function finish({finished}){
        if(disposed)return;disposed=true;epoch++;
        for(const fn of [...skipResolvers])fn();
        doc.removeEventListener('keydown',onKey);
        layer.removeEventListener('click',onClick);
        narration?.stop();stage.dispose();dialog.dispose();cinema.dispose();layer.remove();
        exitPayload={finished,school:state.school,appearance:state.appearance,draft:state.draft,battles:state.battles,written:!!state.written};
        try{onExit(exitPayload);}finally{resolveExit(exitPayload);}
    }

    // Warm the first images before revealing the first frame; the rest load in the background.
    const order=[...new Set(script.scenes.flatMap(s=>s.beats).filter(b=>b.art).map(b=>b.art))];
    await Promise.race([cinema.preload(order.slice(0,2)),new Promise(r=>setTimeout(r,4000))]);
    void cinema.preload(order.slice(2));
    loading.remove();layer.focus?.();
    const startArt=runner.artAt();if(startArt)cinema.showArt(startArt.art,startArt.move||'still');

    (async()=>{
        while(!disposed&&!runner.done){
            current=runner.current();const e=epoch;
            try{await Promise.race([playBeat(current.beat),skipped()]);}
            catch(error){if(!(error instanceof Skip)){console.error('序章镜头失败',current.scene,error);status.textContent=error.message;await new Promise(r=>setTimeout(r,1200));}}
            if(disposed)break;
            if(e!==epoch)continue; // skip already moved the cursor
            runner.next();
        }
        if(!disposed)finish({finished:true});
    })();

    return {destroy:()=>finish({finished:false}),exited,get state(){return state;},skip,tap};
}
