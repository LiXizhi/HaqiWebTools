import {preparePromoDeck} from './promo_deck_core.js';
// Isolated filming adapter: imports production renderers/rules, never the app,
// account clients, role store or saveLocal. All actors and mutations stay in memory.
import {configureLocale,loadLocaleFiles,textFor} from './locale.js';
import {createSocialActors,stepSocialActors,sampleActivitySpot} from './adventure_social_motion_core.js';
import {createActorSpeech} from './view_actor_speech.js';
import {loadResources} from './adventure_assets.js';
import * as A from './adventure_core.js';
import * as W from './adventure_world_core.js';
import * as P from './combat_pve_core.js';
import * as V from './view_adventure.js';
import {SimpleBot} from './combat_policy_core.js';
import {prepareDebugEdit} from './adventure_debug_core.js';
import {createRenderer} from './adventure_renderer.js';
import {createCreationPreview,tutorialCards} from './adventure_creation_preview.js';
import {renderCloud} from './view_adventure_cloud.js';
import {renderSocial} from './view_adventure_social.js';
import {renderDungeons} from './view_adventure_dungeons.js';
import {enterDungeon} from './adventure_dungeons_core.js';
import {createLearningChatView} from './view_learning_chat.js';
import {createJsonReader} from './runtime_data.js';
import {samplePromoMotion,planPromoPath,samplePromoZoom} from './promo_motion_core.js';
import {presentationEventDurationMs,samplePresentationClock} from './battle_presentation_core.js';

const $=id=>document.getElementById(id), noop=()=>{};
const nodes={entry:$('entry'),overlay:$('overlay'),battle:$('battle-layer')};
const callbacks=new Proxy({close:noop},{get:(target,key)=>target[key]||noop});
let assets,renderer,preview,save,world,shot,draft,learning,chatState,social,dungeon;
let frames=[],battleStart=0,lastBattleFrame=-1,path=[],origin,paused=true,previewPaused=false;
let deckClickAt=null,deckShowcase=null,checks=[],shownZoom=1,sceneSeed=530,locale='zh-CN',targetLocale='en',actors=[],actorProfiles=[],actorTime=0,speechSlot=-1,arrivalAt=null;
const speech=createActorSpeech();
const speechRoot=document.createElement('div');speechRoot.className='promo-speech';$('game').append(speechRoot);
// Film annotations only: the production deck keeps its original layout and hover card.
const deckPointer=document.createElement('div');deckPointer.className='promo-pointer';deckPointer.hidden=true;
deckPointer.setAttribute('aria-hidden','true');
deckPointer.innerHTML='<svg viewBox="0 0 60 80"><path d="M5 4 51 43 31 46 42 68 30 74 19 51 5 65Z" fill="#fff" stroke="#24372e" stroke-width="4" stroke-linejoin="round"/></svg>';
const deckRing=document.createElement('div');deckRing.className='promo-click-ring';deckRing.hidden=true;

for(const node of [deckRing,deckPointer]){node.setAttribute('aria-hidden','true');document.body.append(node);}
let pointerMotion=null;
const cardPoint=node=>{const r=node.getBoundingClientRect();return {x:r.left+r.width*.55,y:r.top+r.height*.55};};
function aimPointer(node,time){
    const to=cardPoint(node),from=pointerMotion?.to||{x:to.x+75,y:to.y+65};
    pointerMotion={from,to,time};deckPointer.hidden=false;
}
function sampleDeckPointer(elapsed){
    if(!pointerMotion)return;
    const p=Math.min(1,Math.max(0,(elapsed-pointerMotion.time)/.18)),ease=p*p*(3-2*p);
    const {from,to}=pointerMotion;
    const age=deckClickAt===null?-1:elapsed-deckClickAt;
    deckPointer.style.transform=`translate(${from.x+(to.x-from.x)*ease}px,${from.y+(to.y-from.y)*ease}px) scale(${age>=0&&age<.16?.82:1})`;
    deckRing.hidden=age<0||age>.5;
    if(!deckRing.hidden){deckRing.style.left=`${to.x}px`;deckRing.style.top=`${to.y}px`;deckRing.style.opacity=String(1-age/.5);deckRing.style.transform=`translate(-50%,-50%) scale(${.4+age*2})`;}
    if(deckClickAt!==null)nodes.overlay.deckPreview?.sampleAddition(age*1000);
}
async function setLocale(value){locale=value==='en'?'en':'zh-CN';targetLocale=locale==='en'?'zh-CN':'en';await loadLocaleFiles([locale]);configureLocale({locale});learning?.root.remove();learning=createLearningChatView(callbacks);}
function resetActors(){
    actors=createSocialActors(world,actorProfiles,sceneSeed);
    const used=[origin];for(const actor of actors){actor.position=sampleActivitySpot(world,origin,actor.rng,used);used.push(actor.position);}
    actorTime=0;speechSlot=-1;
}
function sampleActors(elapsed){
    if(elapsed<actorTime){resetActors();}
    while(actorTime+.05<=elapsed){const leader=path.length?samplePromoMotion(world,origin,path,Math.max(0,actorTime-4),{mountId:save.mountId,balanceParams:assets.content.balanceParams}).position:origin;stepSocialActors(actors,world,.05,{leader});actorTime+=.05;}
}
function paintSpeech(elapsed){
    const slot=Math.floor(elapsed/4);
    if(slot!==speechSlot){speech.clear();speechSlot=slot;
        const lines=locale==='en'?['Hello! Shall we explore together?','Yes! I am practising Chinese.','你好！一起去冒险吧！','That means: let’s go on an adventure!']:['你好！一起去冒险吧！','好呀，我想练习英语。','Hello! Let’s explore together!','这句是说：我们一起去探索吧！'];
        for(const turn of [slot-1,slot]){if(turn<0)continue;const actor=actors[turn%2];if(actor)speech.say(actor.profile.id,lines[turn%lines.length],{duration:8001});}
    }
    const anchors=Object.fromEntries(actors.map(a=>[a.profile.id,renderer.worldToScreen({x:a.position.x,y:a.position.y-100})]).filter(([,p])=>p.x>0&&p.y>0&&p.x<speechRoot.clientWidth&&p.y<speechRoot.clientHeight));
    const obstacles=[...$('hud').children].filter(n=>!n.hidden).map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});
    speech.render(speechRoot,anchors,elapsed*1000,obstacles);
}
function check(ok,message){if(!ok)throw Error(message);checks.push(message);}
function model(battle=null){return {assets,save,battle,selected:null,discarded:[],animating:false,membership:{},equipmentView:{tab:'gear',slot:0,item:null,query:''},petView:{tab:'follow',selected:null},shopView:{category:'pet',page:0,query:''},displayLocale:locale,social:null,deckAnimationClock:'manual'};}
function clear(){nodes.overlay.deckPreview?.clearAddition();speech.clear();speechRoot.replaceChildren();speechSlot=-1;arrivalAt=null;$('hud').replaceChildren();preview.stop();previewPaused=false;learning.close();for(const node of Object.values(nodes)){node.disposeDialogue?.();node.disposeHandGesture?.();node.disposeStatusTooltips?.();node.battleLayoutObserver?.disconnect();node.replaceChildren();node.className='';}nodes.entry.hidden=true;}
async function scene(){world=W.createWorld(save.zone,assets.content,save);if(!W.walkable(world,save.position.x,save.position.y))save.position={...world.center};save.position=W.clearTeleportSpot(world,save.position.x,save.position.y,world.encounters,120)||save.position;origin={...save.position};await assets.warmScenery(world);path=['world','island'].includes(shot.scene)?planPromoPath(world,origin):[];actorTime=0;actorProfiles=[{id:'promo-anna',name:locale==='en'?'Anna':'安娜',native:'en',target:'zh',school:'ice',appearance:'girl',level:3},{id:'promo-maple',name:locale==='en'?'Maple':'小枫',native:'zh',target:'en',school:'fire',appearance:'boy',level:3},{id:'promo-lily',name:locale==='en'?'Lily':'莉莉',native:'en',target:'zh',school:'life',appearance:'girl',level:4},{id:'promo-noah',name:locale==='en'?'Noah':'诺亚',native:'zh',target:'en',school:'storm',appearance:'boy',level:4}];resetActors();await assets.warmActors(world,save,actors);check(true,'场景角色图片已就绪');if(!['create','skills'].includes(shot.scene))V.renderHud($('hud'),model(),callbacks);check(!!world.layout,`地图可渲染：${save.zone}`);}
function creation(step=1,school='fire',changes={}){
    preview.stop();previewPaused=false;nodes.entry.hidden=false;draft={name:locale==='en'?'Star':'小星',appearance:'girl',starter:'dragon_green',...draft,...changes,step,school};
    V.renderEntry(nodes.entry,assets,null,{...callbacks,login:null,cloud:null,locale,secondLocale:targetLocale,setLocale:noop,setSecondLocale:noop,draft,previewChoices:s=>tutorialCards(assets,s),preview:(...args)=>preview.play(...args),stopPreview:()=>preview.stop(),pausePreview:()=>preview.togglePause()});
    check(!!nodes.entry.querySelector('form'),'角色创建表单已显示');
}
function panel(kind){V.renderPanel(nodes.overlay,kind,model(),kind==='deck'?{...callbacks,action:value=>A.applyAction(save,assets.content,value),close:noop}:callbacks);check(!!nodes.overlay.querySelector('.modal'),`${kind} 窗口已显示`);}
function friends(){renderSocial(nodes.overlay,social,'mail',callbacks);}
function paintChat(){learning.render(chatState);}
function digest(b){return JSON.stringify([b.winner,b.turn,Object.values(b.unitsById).map(u=>[u.id,u.hp]),b.events]);}
function filmBattle(id,start=0){
    A.beginEncounter(save,assets.content,id);const arena=P.restorePveBattle(assets.dataset,assets.content,save.pendingEncounter),bot=new SimpleBot();frames=[];
    const snap=()=>JSON.parse(JSON.stringify(arena));
    const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const remember=event=>{
        const card=event?.card?arena.resolved.cards[event.card]:null;
        const hp=event?.type==='damage'?arena.unitsById[event.target]?.hp??0:0;
        frames.push({arena:snap(),event:event??null,duration:presentationEventDurationMs(event,{effects:assets.effects,card,hp,reducedMotion})});
    };
    remember(null);
    for(let round=0;!arena.finished&&round<100;round++){
        const decision=bot.pick(arena,arena.sides.near[0]);
        arena.onEvent=event=>{
            if(['cast','damage','heal','fizzle','combat_end'].includes(event.type))remember(event);
        };
        try{P.playPveRound(arena,decision);}finally{delete arena.onEvent;}
        A.recordDecision(save,decision,arena);
    }
    check(arena.finished,'战斗按真实规则结束');
    check(!Object.keys(arena.unsupported||{}).length,'战斗没有未支持卡型');
    check(digest(P.restorePveBattle(assets.dataset,assets.content,save.pendingEncounter))===digest(arena),'固定种子与决定序列重演一致');
    const settled=structuredClone(save);A.settleEncounter(settled,assets.content,arena);
    check(!settled.pendingEncounter,'战斗结算清除检查点');
    remember(null);battleStart=start;lastBattleFrame=-1;
}
async function prepare(next,seed){
    clear();pointerMotion=null;for(const node of [deckPointer,deckRing])node.hidden=true;deckClickAt=null;deckShowcase=null;sceneSeed=seed;shot=next;checks=[];frames=[];path=[];draft=null;lastBattleFrame=-1;
    save=A.createAdventure(assets.content,{name:locale==='en'?'Star':'小星',appearance:'girl',seed});
    save.languageLearning={...save.languageLearning,enabled:true,native:locale,target:targetLocale};
    if(!['create','account','skills','world','learning','battle'].includes(shot.scene))save=prepareDebugEdit(save,assets.content,{level:15}).save;
    if(shot.zone)A.applyAction(save,assets.content,{type:'travel',zone:shot.zone});
    await scene();
    if(shot.scene==='create')await Promise.all(shot.cues.flatMap(cue=>['boy','girl'].flatMap(appearance=>{
        const bodyId=cue.look?.bodyChoices?.[appearance],headId=cue.look?.headChoices?.[appearance];
        return bodyId?[assets.hero.ensure({gender:appearance==='girl'?'female':'male',bodyId,headId})]:[];
    })));
    switch(shot.scene){
        case 'world':case 'island':break;
        case 'create':creation();break;
        case 'skills':creation(3);break;
        case 'account':renderCloud(nodes.overlay,{local:save,owner:null,paths:[],message:'演示镜头：登录与注册在 Keepwork 安全窗口完成。'},callbacks);check(!!nodes.overlay.querySelector('.cloud-actions'),'登录入口可渲染（未连接账号服务）');break;
        case 'deck':deckShowcase=preparePromoDeck(save,assets.content,assets.dataset);save=deckShowcase.save;panel('deck');check(A.deckLimits(save,assets.content).capacity>=20,'真实大卡包已装备');break;
        case 'pet':case 'equipment':panel(shot.scene);break;
        case 'battle':filmBattle('fire-scout');break;
        case 'friends':social={owner:locale==='en'?'Demo character':'演示角色',mailTab:'friends',mailAvailable:false,applies:[{id:'promo-request',nickname:locale==='en'?'Luna (demo companion)':'小月（演示伙伴）'}],friends:[]};friends();check(!!nodes.overlay.querySelector('button'),'好友申请视图（固定演示数据）');break;
        case 'dungeons':dungeon=assets.content.dungeons.filter(d=>d.playable).sort((a,b)=>a.recommendedLevel-b.recommendedLevel)[0];check(!!dungeon,'存在可进入副本');await assets.dungeons.load(dungeon.id);renderDungeons(nodes.overlay,model(),callbacks);check(!!nodes.overlay.querySelector('.dungeon-list'),'副本目录可渲染');break;
        case 'learning':{
            const data=await createJsonReader()('data/adventure/camp-conversations.json');const profile=data.profiles.find(p=>p.stories?.length),story=profile.stories[0];
            chatState={profile,story,index:0,locale:targetLocale,showChinese:true,portrait:assets.mode==='local'?profile.portrait.local:profile.portrait.cdn,messages:[{role:'assistant',text:story.opening},{role:'assistant',text:story.turns[0].question}],status:'剧本对话演示',hintLevel:0,done:false};paintChat();check(!!learning.root.querySelector('.camp-chat'),'真实双语对话组件与课程已加载');break;
        }
        default:throw Error(`未支持的镜头：${shot.scene}`);
    }
    await warmArt();tick(0);return result();
}
async function action(cue){
    switch(cue.action){
        case 'creation':
            if(cue.step===2&&draft?.step===2&&cue.look?.starter){
                nodes.entry.querySelector(`[data-pet-id="${cue.look.starter}"]`)?.click();arrivalAt=cue.time;
            }else{creation(cue.step,'fire',cue.look||{});arrivalAt=null;}
            break;
        case 'school':creation(3,cue.school);check(tutorialCards(assets,cue.school).length>0,`${cue.school} 技能可预览`);break;
        case 'deck-hover':{
            const key=deckShowcase.featured[cue.card],ui=nodes.overlay.deckPreview,anchor=ui.libraryCard(key);
            check(!!anchor,'策略卡牌存在');anchor.scrollIntoView({block:'nearest',inline:'nearest'});
            // Allow the original scroll handler to dismiss the previous card first.
            await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
            aimPointer(anchor,cue.time);deckClickAt=null;ui.clearAddition();
            check(ui.previewCard(key),'策略卡牌悬停说明已显示');break;
        }
        case 'deck-click':{
            const key=deckShowcase.featured[cue.card],ui=nodes.overlay.deckPreview,anchor=ui.libraryCard(key);
            aimPointer(anchor,cue.time-.18);
            check(ui.clickCard(key),'模拟点击已将卡牌放入卡包');
            deckClickAt=cue.time;break;
        }
        case 'save-deck':aimPointer(nodes.overlay.deckPreview.saveButton,cue.time-.18);nodes.overlay.deckPreview.save();nodes.overlay.deckPreview.clearAddition();deckClickAt=cue.time;check(save.tips.deckEdited&&save.deck.reduce((n,row)=>n+row.count,0)===20,'20张配卡通过正式保存按钮校验');break;
        case 'friend-accept':social.applies=[];social.friends=[{name:locale==='en'?'Luna (demo companion)':'小月（演示伙伴）',userId:'promo-friend'}];friends();check(!!nodes.overlay.querySelector('button'),'好友列表视图切换（未发送好友请求）');break;
        case 'enter-dungeon':clear();enterDungeon(save,assets.content,dungeon.id);await scene();check(save.zone===dungeon.id,'通过正式规则进入副本');break;
        case 'dungeon-battle':filmBattle(dungeon.arenas[0].id,cue.time);break;
        case 'learning-reply':chatState.messages.push({role:'user',text:chatState.story.turns[0].answer});paintChat();check(chatState.messages.length===3,'剧本回答已显示（未调用语音或 AI）');break;
        case 'learning-next':chatState.messages.push({role:'assistant',text:chatState.story.turns[0].response},{role:'assistant',text:chatState.story.turns[1].question});chatState.index=1;paintChat();break;
        default:throw Error(`未支持的剧本动作：${cue.action}`);
    }
    await warmArt();return result();
}
async function warmArt(){
    const keys=frames.map(f=>f.event?.card).filter(Boolean);
    if(deckShowcase)keys.push(...deckShowcase.keys,...Object.keys(save.cards));
    if(draft&&!nodes.entry.hidden&&draft.step===3)keys.push(...tutorialCards(assets,draft.school).map(c=>c.key));
    await Promise.all([...new Set(keys.map(key=>assets.effects.cards[key]?.base).filter(Boolean))].map(base=>assets.skillArt.ensure(base)));
}
function tick(elapsed){
    if(!renderer||!save)return;
    sampleDeckPointer(elapsed);
    const zoom=samplePromoZoom(elapsed,shot.duration,shot.camera?.zoomIn||0,matchMedia('(prefers-reduced-motion: reduce)').matches);
    shownZoom=renderer.zoomBy(zoom/shownZoom);
    if(path.length&&!frames.length&&['world','island'].includes(shot.scene)){
        const moved=samplePromoMotion(world,origin,path,Math.max(0,elapsed-4),{mountId:save.mountId,balanceParams:assets.content.balanceParams});
        save.position=moved.position;save.facing=moved.facing;
        sampleActors(elapsed);renderer.render(world,save,elapsed*1000,{moving:moved.moving,socialActors:actors});
    }
    else {sampleActors(elapsed);renderer.render(world,save,elapsed*1000,{socialActors:actors});}
    speechRoot.hidden=!['world','island'].includes(shot.scene)||frames.length>0;
    if(!speechRoot.hidden)paintSpeech(elapsed);
    if(arrivalAt!==null)for(const animation of nodes.entry.getAnimations({subtree:true})){if(['companion-arrive','companion-bound'].includes(animation.animationName)){animation.pause();animation.currentTime=Math.max(0,(elapsed-arrivalAt)*1000);}}
    if(frames.length){
        const played=samplePresentationClock(frames,elapsed-battleStart),f=frames[played.index];
        if(played.index!==lastBattleFrame){V.renderBattle(nodes.battle,model(f.arena),callbacks);lastBattleFrame=played.index;check(!!$('battle-canvas')||f.arena.finished,'战斗界面可渲染');}
        const canvas=$('battle-canvas');if(canvas)renderer.renderBattle(canvas,f.arena,save,elapsed*1000,{event:f.event,progress:played.progress,hp:f.hp});
    }
}
function validateFrames(){for(const fraction of [0,.2,.5,.8,1])tick(battleStart+(shot.duration-battleStart-.01)*fraction);return result();}
function translateAttributes(){
    for(const node of document.querySelectorAll('[title],[aria-label]'))for(const key of ['title','aria-label']){const value=node.getAttribute(key);if(value){const translated=textFor(value,locale);if(translated!==value)node.setAttribute(key,translated);}}
    document.title=textFor('魔法哈奇 · 初心之旅',locale);
}
function result(){translateAttributes();return {shot:shot?.id,checks:[...new Set(checks)],scope:shot?.fixture?'fixture':'game',zone:save?.zone,battle:frames.length?{finished:frames.at(-1).arena.finished,winner:frames.at(-1).arena.winner}:null};}
function setPaused(value){paused=value;if(draft&& !nodes.entry.hidden&&draft.step===3&&previewPaused!==paused){preview.togglePause();previewPaused=paused;}}
const ready=(async()=>{assets=await loadResources();renderer=createRenderer($('world'),assets);preview=createCreationPreview(assets);learning=createLearningChatView(callbacks);})();
window.promoStage={ready,setLocale,prepare,action,tick,setPaused,result,validateFrames};
ready.catch(error=>{nodes.entry.hidden=false;nodes.entry.textContent=`演示舞台加载失败：${error.message}`;});
