import {withBattlePointer} from './battle_pointer_core.js';
// prologue_stage.js — interactive beats of the prologue: battles on the real battle view and renderer,
// the embedded 光 writing story, the card forge, and catching the spark.
import * as V from './view_adventure.js';
import * as A from './adventure_core.js';
import {heroPortrait} from './hero_renderer.js';
import {createCloseButton} from './view_adventure_controls.js';
import {validTargets} from './combat_arena_core.js';
import {presentationEventDurationMs,presentationEventProgress,samplePresentationClock} from './battle_presentation_core.js';
import {connectHanziAnimation} from './hanzi_animation_bridge.js';
import {textFor} from './locale.js';
import {speakBrowserText} from './browser_speech.js';
import {
    createMastersArena,
    wizardAttackHand,
    mastersResolve,
    createFinaleArena,
    finaleResolve,
    MASTER_LOOKS,
    MASTERS_ORDER,
    MASTER_SPEAKER_ID,
} from './prologue_battle_core.js';

const HANZI_PAGE=new URL('../hanzi/hanzi_guang.html',import.meta.url).href;
const QINGLONG_PORTRAIT='texture/aries/penote/npcs/qinglong_32bits.png';
const CHILD_LOOK={school:'balance',appearance:'boy',bodyId:'male1',headId:'classic-boy'};
// Display-only monster art bindings; engine units stay non-mob.
const DISPLAY_MOBS={
    'dark-lord':{appearanceSource:'prologue-dark-lord',attributes:{asset:'prologue-dark-lord'},portrait:'prologue-dark-lord'},
    imp:{appearanceSource:'config/aries/mob/mobtemplate_undeadmonkey.xml',attributes:{asset:'character/v5/10mobs/haqitown/undeadmonkey/undeadmonkey.x'},portrait:'boss-40118'},
};
const SCHOOL_PROMPTS={
    fire:{
        battle1:{'zh-CN':'选择一张烈火系的卡牌。','en':'Choose a Fire school card.'},
        battle2:{'zh-CN':'选择一张烈火系的卡牌，或打出「光」之文字卡。','en':'Choose a Fire school card, or play the "Light" word card.'},
    },
    ice:{
        battle1:{'zh-CN':'选择一张寒冰系的卡牌。','en':'Choose an Ice school card.'},
        battle2:{'zh-CN':'选择一张寒冰系的卡牌，或打出「光」之文字卡。','en':'Choose an Ice school card, or play the "Light" word card.'},
    },
    storm:{
        battle1:{'zh-CN':'选择一张风暴系的卡牌。','en':'Choose a Storm school card.'},
        battle2:{'zh-CN':'选择一张风暴系的卡牌，或打出「光」之文字卡。','en':'Choose a Storm school card, or play the "Light" word card.'},
    },
    life:{
        battle1:{'zh-CN':'选择一张生命系的卡牌。','en':'Choose a Life school card.'},
        battle2:{'zh-CN':'选择一张生命系的卡牌，或打出「光」之文字卡。','en':'Choose a Life school card, or play the "Light" word card.'},
    },
};
const UI={
    pick:{'zh-CN':'点选中央的卡牌施放魔法','en':'Click a card in the center to cast'},
    continue:{'zh-CN':'继续','en':'Continue'},
    exitHanzi:{'zh-CN':'退出书写并继续','en':'Exit writing and continue'},
    newCard:{'zh-CN':'获得文字卡','en':'New word card'},
};

function loadDarkLordImage(url){
    return new Promise((resolve,reject)=>{
        const img=new Image();img.crossOrigin='anonymous';
        img.onload=()=>{if(img.decode)img.decode().then(()=>resolve(img),()=>resolve(img));else resolve(img);};
        img.onerror=()=>reject(new Error(`无法加载黑暗魔王图片 ${url}`));
        img.src=url;
    });
}

export function createPrologueStage({root,assets,renderer,spellSound,speakers,artManifest,getPair,say,showPrompt=()=>{},setPromptProgress=()=>{},wait,reducedMotion,hideDialog=()=>{}}){
    const doc=root.ownerDocument;
    const make=(tag,cls,text)=>{const n=doc.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
    const ui=key=>UI[key][getPair().native];
    const battleRoot=make('div','battle-layer pl-battle');battleRoot.hidden=true;
    const banner=make('div','pl-banner');banner.hidden=true;
    const layer=make('div','pl-interact');
    root.append(battleRoot,banner,layer);
    let raf=0,disposed=false,cleanup=[];
    const noop=()=>{};
    const params=()=>assets.content.balanceParams;
    const now=()=>performance.now();

    // Register the dedicated winged Dark Lord WebP into monsterArt + assets.images.
    let darkLordReady=Promise.resolve();
    const darkEntry=artManifest?.entries?.['dark-lord-boss'];
    if(darkEntry){
        if(assets.monsterArt){
            assets.monsterArt.entries['prologue-dark-lord']=darkEntry;
            assets.monsterArt.bindings['prologue-dark-lord|prologue-dark-lord']={kind:'portrait',id:'prologue-dark-lord'};
        }
        const url=assets.mode==='local'?darkEntry.local:(darkEntry.cdn||darkEntry.local);
        darkLordReady=loadDarkLordImage(url).then(img=>{assets.images?.set('monster:prologue-dark-lord',img);}).catch(()=>{});
    }

    function warmPortraits(){
        const jobs=[
            darkLordReady,
            assets.ensureImage?.(QINGLONG_PORTRAIT)?.catch?.(()=>{}),
            assets.ensureImage?.('monster:boss-40118')?.catch?.(()=>{}),
            assets.hero?.ensure?.(assets.hero.appearance({...CHILD_LOOK,gender:'male'}))?.catch?.(()=>{}),
        ];
        for(const look of Object.values(MASTER_LOOKS)){
            jobs.push(assets.hero?.ensure?.(assets.hero.appearance({...look,gender:look.appearance==='girl'?'female':'male'}))?.catch?.(()=>{}));
        }
        return Promise.all(jobs);
    }
    void warmPortraits();

    function speakerAvatar(speakerId){
        if(MASTER_LOOKS[speakerId])return heroPortrait(assets,MASTER_LOOKS[speakerId],64,68);
        if(speakerId==='child')return heroPortrait(assets,CHILD_LOOK,64,68);
        if(speakerId==='dark-lord')return V.art(assets,'monster:prologue-dark-lord',64,68,'pl-avatar-art');
        if(speakerId==='imp')return V.art(assets,'monster:boss-40118',64,68,'pl-avatar-art');
        return V.art(assets,QINGLONG_PORTRAIT,64,68,'pl-avatar-art');
    }

    function names(){
        const pair=getPair(),out={};
        for(const [id,s] of Object.entries(speakers||{}))out[id]=s[pair.native];
        return out;
    }
    function heroSave(look){
        const save=A.createAdventure(assets.content,{name:look.name,school:look.school,appearance:look.appearance,bodyId:look.bodyId,headId:look.headId,seed:2026});
        if(!look.pet){save.heroSlot=null;}
        return save;
    }
    function markDisplay(arena,far){
        if(arena.__display)return arena;arena.__display=true;
        const mark=unit=>{if(!unit||unit.side!=='far')return;const art=DISPLAY_MOBS[unit.id==='dark-lord'?'dark-lord':'imp'];unit.isMob=true;unit.template={id:unit.id,name:unit.name,...art};};
        for(const unit of arena.sides.far)mark(unit);for(const unit of Object.values(arena.unitsById))mark(unit);
        arena.monsterTemplates=[{name:far}];
        return arena;
    }
    const liveCopy=(arena,far)=>markDisplay((({onEvent,resolved,...s})=>({...JSON.parse(JSON.stringify(s)),resolved}))(arena),far);
    async function warm(arena,save){
        const jobs=[
            warmPortraits(),
            assets.hero.ensure(assets.hero.appearance({...save,gender:save.appearance==='girl'?'female':'male'})).catch(()=>{}),
        ];
        for(const unit of Object.values(arena.unitsById))if(unit.arenaProfile)jobs.push(assets.hero.ensure(assets.hero.appearance(unit.arenaProfile)).catch(()=>{}));
        jobs.push(assets.warmBattle?.(arena)?.catch?.(()=>{}));
        const keys=new Set(Object.values(arena.unitsById).flatMap(u=>(u.deckSeq||[])));
        for(const key of keys){const base=assets.effects.cards[key]?.base;if(base)jobs.push(assets.skillArt.ensure(base).catch(()=>{}));}
        await Promise.race([Promise.all(jobs),new Promise(r=>setTimeout(r,6000))]);
    }
    function model(battle,save,extra={}){
        return {assets,save,battle,selected:null,discarded:[],animating:false,membership:{},displayLocale:getPair().native,social:null,deckAnimationClock:'manual',soundEnabled:true,...extra};
    }
    function callbacks(over={}){return new Proxy({...over},{get:(t,k)=>t[k]||noop});}
    function renderBattleLayer(battle,save,extra,cb){
        V.renderBattle(battleRoot,model(battle,save,extra),callbacks(cb));
        battleRoot.classList.add('pl-battle');
    }

    /** Plays recorded groups on the real battle view; resolves when the last frame ends. */
    function playGroups(groups,save,far){
        const frames=[];
        for(const g of groups){
            frames.push({arena:g.before,event:null,duration:220});
            for(const f of g.frames){
                const previous=frames.findLast(row=>row.event?.caster)?.event.caster||'hero';
                for(const event of withBattlePointer([f.event],previous)){
                    const card=f.arena.resolved?.cards?.[event.card];
                    frames.push({arena:f.arena,event,duration:presentationEventDurationMs(event,{effects:assets.effects,card,hp:f.arena.unitsById[event.target]?.hp??0,reducedMotion:reducedMotion()})||260});
                }
            }
            frames.push({arena:g.after,event:null,duration:220});
        }
        hideDialog();
        return new Promise(resolve=>{
            const start=now();let shown=-1;
            const step=()=>{
                if(disposed)return resolve();
                const elapsed=(now()-start)/1000,total=frames.reduce((n,f)=>n+f.duration,0)/1000;
                const played=samplePresentationClock(frames,elapsed),f=frames[played.index],battle=markDisplay(f.arena,far);
                if(played.index!==shown){shown=played.index;renderBattleLayer(battle,save,{animating:true});const label=f.event&&f.event.type!=='pass'?V.eventLabel(f.event,battle,assets):'';const status=battleRoot.querySelector('#cast-announcement');if(status)status.textContent=label||'';}
                const canvas=battleRoot.querySelector('#battle-canvas');
                const progress=presentationEventProgress(f.event,played.progress,{effects:assets.effects,card:battle.resolved.cards[f.event?.card],reducedMotion:reducedMotion()});
                if(canvas)renderer.renderBattle(canvas,battle,save,now(),{event:f.event,progress});
                if(f.event?.type==='cast'||f.event?.type==='fizzle')spellSound?.track?.(assets.effects,battle.resolved.cards[f.event.card],progress,{active:!doc.hidden,failed:f.event.type==='fizzle',reducedMotion:reducedMotion(),instance:String(played.index)});
                else spellSound?.stopCast?.();
                if(elapsed>=total){spellSound?.stopCast?.();raf=0;return resolve();}
                raf=requestAnimationFrame(step);
            };
            raf=requestAnimationFrame(step);
        });
    }
    /** Real hand + targeting for one decision. Shows the wizard's prompt in the bottom dialogue box and centers the cards. */
    function choose(arena,save,far,{unitId='hero',hand=null,prompt=null,promptSpeakerId=null,promptText=null,oneClickTarget=null,autoSeconds=15,auto}){
        return new Promise(resolve=>{
            let selected=null,done=false,started=now(),live=null;
            const finish=pick=>{if(done)return;done=true;cancelAnimationFrame(raf);raf=0;banner.hidden=true;setPromptProgress(0);spellSound?.play?.('select');resolve(pick);};
            const paint=()=>{
                live=liveCopy(arena,far);
                renderBattleLayer(live,save,{selected,hand,controlledUnitId:unitId},{
                    select:h=>{
                        if(!h)return;
                        if(oneClickTarget){finish({seq:h.seq,key:h.key,targetId:oneClickTarget});return;}
                        selected=h;spellSound?.play?.('select');paint();
                    },
                    reselect:()=>{selected=null;paint();},
                    pass:()=>finish({pass:true}),
                    target:id=>{
                        if(!selected)return;const unit=arena.unitsById[unitId],card=arena.resolved.cards[selected.key];
                        if(!validTargets(arena,unit,card).some(t=>t.id===id))return;
                        finish({seq:selected.seq,key:selected.key,targetId:id});
                    },
                });
                for(const b of battleRoot.querySelectorAll('.battle-heading-actions button.secondary'))b.hidden=true;
            };
            if(promptSpeakerId&&promptText){
                banner.hidden=true;
                showPrompt({speaker:promptSpeakerId,text:promptText});
            }else{
                hideDialog();banner.textContent=prompt||ui('pick');banner.hidden=false;
            }
            paint();
            const tick=()=>{
                if(done||disposed)return;
                const canvas=battleRoot.querySelector('#battle-canvas');
                if(canvas&&live)renderer.renderBattle(canvas,live,save,now(),null);
                const elapsed=(now()-started)/1000,left=autoSeconds-elapsed;
                if(autoSeconds>0)setPromptProgress(elapsed/autoSeconds);
                banner.dataset.countdown=autoSeconds?String(Math.max(0,Math.ceil(left))):'';
                if(autoSeconds&&left<=0)return finish(auto());
                raf=requestAnimationFrame(tick);
            };
            raf=requestAnimationFrame(tick);
        });
    }
    async function lines(list){for(const line of list||[])await say(line);}
    /** Renders a still battle state every frame while dialogue plays over the battlefield. */
    async function idle(battle,save,list){
        if(!list?.length)return;
        renderBattleLayer(battle,save,{animating:true});
        const status=battleRoot.querySelector('#cast-announcement');if(status)status.textContent='';
        let on=true;const loop=()=>{if(!on||disposed)return;const canvas=battleRoot.querySelector('#battle-canvas');if(canvas)renderer.renderBattle(canvas,battle,save,now(),null);raf=requestAnimationFrame(loop);};
        raf=requestAnimationFrame(loop);
        try{await lines(list);}finally{on=false;cancelAnimationFrame(raf);raf=0;}
    }

    async function mastersBattle(beat){
        const n=names(),far=n['dark-lord'];
        const arena=createMastersArena(assets.dataset,params(),{names:n});
        const look=MASTER_LOOKS['master-ice'];
        const save=heroSave({...look,name:n['master-ice']});
        await warm(arena,save);
        battleRoot.hidden=false;
        await idle(liveCopy(arena,far),save,beat.lines?.start);
        const picks={};
        for(const unitId of MASTERS_ORDER){
            if(disposed)break;
            const speakerId=MASTER_SPEAKER_ID[unitId];
            const school=MASTER_LOOKS[speakerId].school;
            const hand=wizardAttackHand(arena,unitId);
            picks[unitId]=await choose(arena,save,far,{
                unitId,
                hand,
                promptSpeakerId:speakerId,
                promptText:SCHOOL_PROMPTS[school].battle1,
                oneClickTarget:'dark-lord',
                autoSeconds:beat.autoSeconds??15,
                auto:()=>({...hand[0],targetId:'dark-lord'}),
            });
        }
        const groups=mastersResolve(arena,picks);
        await playGroups(groups,save,far);
        if(arena.winner==='near')spellSound?.play?.('victory');
        await idle(liveCopy(arena,far),save,beat.lines?.end);
        battleRoot.hidden=true;battleRoot.replaceChildren();
        return {picks:Object.fromEntries(Object.entries(picks).map(([k,v])=>[k,v.key])),winner:arena.winner,turn:arena.turn};
    }
    async function finaleBattle(beat,{wordCard}){
        const n=names(),far=n.imp;
        const arena=createFinaleArena(assets.dataset,params(),{names:n,wordCard});
        const look=MASTER_LOOKS['master-ice'];
        const save=heroSave({...look,name:n['master-ice']});
        await warm(arena,save);
        battleRoot.hidden=false;
        await idle(liveCopy(arena,far),save,beat.lines?.hint);
        const picks={};
        let usedWord=false;
        for(const [index,unitId] of MASTERS_ORDER.entries()){
            if(disposed)break;
            const speakerId=MASTER_SPEAKER_ID[unitId];
            const school=MASTER_LOOKS[speakerId].school;
            const hand=wizardAttackHand(arena,unitId);
            const defaultTarget=index%2===0?'imp-1':'imp-2';
            const defaultCard=unitId===MASTERS_ORDER.at(-1)&&!usedWord?(hand.find(c=>c.wordCard)||hand[0]):hand[0];
            const pick=await choose(arena,save,far,{
                unitId,
                hand,
                promptSpeakerId:speakerId,
                promptText:SCHOOL_PROMPTS[school].battle2,
                oneClickTarget:defaultTarget,
                autoSeconds:beat.autoSeconds??15,
                auto:()=>({...defaultCard,targetId:defaultTarget}),
            });
            picks[unitId]=pick;
            if(arena.unitsById[unitId]?.wordCards?.[pick.seq])usedWord=true;
        }
        if(usedWord){
            flashWord(getPair());
            await idle(liveCopy(arena,far),save,beat.lines?.word);
        }
        const groups=finaleResolve(arena,picks);
        await playGroups(groups,save,far);
        spellSound?.play?.(arena.winner==='near'?'victory':'defeat');
        await idle(liveCopy(arena,far),save,arena.winner==='near'?beat.lines?.win:beat.lines?.lose);
        battleRoot.hidden=true;battleRoot.replaceChildren();
        return {picks:Object.fromEntries(Object.entries(picks).map(([k,v])=>[k,v.key])),winner:arena.winner,turn:arena.turn,usedWord};
    }
    function flashWord(pair){
        const flash=make('div','pl-word-flash');flash.append(make('strong','','光'));if(pair.native==='en'||pair.target==='en')flash.append(make('small','','light'));
        root.append(flash);setTimeout(()=>flash.remove(),1800);
    }

    function hanzi(beat){
        const pair=getPair();
        return new Promise(resolve=>{
            const holder=make('section','pl-hanzi');
            const iframe=make('iframe');iframe.title='光';iframe.sandbox='allow-scripts allow-same-origin';iframe.referrerPolicy='no-referrer';iframe.src=HANZI_PAGE;iframe.setAttribute('allow','autoplay');
            const closeBtn=createCloseButton(()=>done(),ui('exitHanzi'),'pl-hanzi-close');
            const next=make('button','primary pl-hanzi-next',ui('continue'));next.type='button';next.hidden=true;
            let written=false,finished=false;
            const done=()=>{if(finished)return;finished=true;disconnect();holder.remove();resolve({written});};
            next.onclick=done;
            const sub=pair.target!=='zh-CN'?pair.target:pair.native;
            const translate=(text,loc)=>loc&&loc!=='zh-CN'?textFor(text,loc):text;
            const disconnect=connectHanziAnimation(iframe,{entryId:beat.entryId,sessionId:`prologue:${Date.now()}`,locale:pair.native,subtitleLocale:sub,translate,
                onWritten:()=>{written=true;next.hidden=false;spellSound?.play?.('victory');},
                onComplete:()=>{next.hidden=false;if(written)setTimeout(done,900);}});
            holder.append(iframe,closeBtn,next);layer.append(holder);
            cleanup.push(()=>{if(!finished){finished=true;disconnect();holder.remove();resolve({written});}});
        });
    }
    async function cardForge(row,pair,{reveal}){
        const wrap=make('section','pl-forge');
        const card=make('div','pl-card');
        const face=make('div','pl-card-face');
        face.append(make('div','pl-card-glyph',reveal.glyph));
        if(pair.target==='en'){const eq=make('div','pl-card-eq');eq.append(make('span','',reveal.glyph),make('em','','='),make('span','pl-card-word',reveal.word));face.append(eq);}
        else face.append(make('div','pl-card-pinyin',reveal.pinyin));
        face.append(make('h3','',row.title),make('p','',pair.native==='zh-CN'?row.readText||row.description:(row.readTranslation||row.description)));
        if(pair.native==='zh-CN'&&row.readTranslation)face.append(make('p','pl-card-sub',row.readTranslation));
        if(pair.native==='en'&&row.language==='zh')face.append(make('p','pl-card-sub',row.readText));
        card.append(face);
        wrap.append(make('p','pl-forge-label',ui('newCard')),card);
        layer.append(wrap);
        requestAnimationFrame(()=>wrap.classList.add('shown'));
        if(pair.target==='en')setTimeout(()=>speakBrowserText(reveal.word,'en-US'),700);
        else setTimeout(()=>speakBrowserText(reveal.glyph,'zh-CN'),700);
        await wait(3.6);
        wrap.classList.add('leaving');setTimeout(()=>wrap.remove(),500);
    }
    function catchSpark(beat){
        const pair=getPair();
        return new Promise(resolve=>{
            const wrap=make('section','pl-spark-wrap'),spark=make('button','pl-spark');spark.type='button';spark.setAttribute('aria-label',beat.prompt[pair.native]);
            const prompt=make('p','pl-spark-prompt',beat.prompt[pair.native]);const sub=make('small','',beat.prompt[pair.target]);prompt.append(sub);
            wrap.append(spark,prompt);layer.append(wrap);
            let done=false;const timer=setTimeout(()=>finish(),Math.max(1,beat.autoSeconds||12)*1000);
            function finish(){if(done)return;done=true;clearTimeout(timer);spark.classList.add('caught');spellSound?.play?.('select');setTimeout(()=>{wrap.remove();resolve();},700);}
            spark.onclick=finish;cleanup.push(()=>{clearTimeout(timer);if(!done){done=true;wrap.remove();resolve();}});
        });
    }

    function abort(){cancelAnimationFrame(raf);raf=0;spellSound?.stopCast?.();for(const fn of cleanup.splice(0))fn();layer.replaceChildren();banner.hidden=true;battleRoot.hidden=true;battleRoot.disposeHandGesture?.();battleRoot.disposeStatusTooltips?.();battleRoot.battleLayoutObserver?.disconnect();battleRoot.replaceChildren();}
    function dispose(){disposed=true;abort();battleRoot.remove();banner.remove();layer.remove();}
    return {mastersBattle,finaleBattle,hanzi,cardForge,catchSpark,speakerAvatar,warmPortraits,abort,dispose};
}
