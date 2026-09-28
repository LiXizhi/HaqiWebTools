// Isolated filming adapter: imports production renderers/rules, never the app,
// account clients, role store or saveLocal. All actors and mutations stay in memory.
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
let checks=[],shownZoom=1;
function check(ok,message){if(!ok)throw Error(message);checks.push(message);}
function model(battle=null){return {assets,save,battle,selected:null,discarded:[],animating:false,membership:{},equipmentView:{tab:'gear',slot:0,item:null,query:''},petView:{tab:'follow',selected:null},shopView:{category:'pet',page:0,query:''},displayLocale:'zh-CN',social:null};}
function clear(){preview.stop();previewPaused=false;learning.close();for(const node of Object.values(nodes)){node.disposeDialogue?.();node.disposeHandGesture?.();node.disposeStatusTooltips?.();node.battleLayoutObserver?.disconnect();node.replaceChildren();node.className='';}nodes.entry.hidden=true;}
async function scene(){world=W.createWorld(save.zone,assets.content,save);if(!W.walkable(world,save.position.x,save.position.y))save.position={...world.center};save.position=W.clearTeleportSpot(world,save.position.x,save.position.y,world.encounters,120)||save.position;origin={...save.position};await assets.warmScenery(world);path=['world','island'].includes(shot.scene)?planPromoPath(world,origin):[];check(!!world.layout,`地图可渲染：${save.zone}`);}
function creation(step=1,school='fire',changes={}){
    preview.stop();previewPaused=false;nodes.entry.hidden=false;draft={name:'小星',appearance:'girl',starter:'dragon_green',...draft,...changes,step,school};
    V.renderEntry(nodes.entry,assets,null,{...callbacks,draft,previewChoices:s=>tutorialCards(assets,s),preview:(...args)=>preview.play(...args),stopPreview:()=>preview.stop(),pausePreview:()=>preview.togglePause()});
    check(!!nodes.entry.querySelector('form'),'角色创建表单已显示');
}
function panel(kind){V.renderPanel(nodes.overlay,kind,model(),callbacks);check(!!nodes.overlay.querySelector('.modal'),`${kind} 窗口已显示`);}
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
    clear();shot=next;checks=[];frames=[];path=[];draft=null;lastBattleFrame=-1;
    save=A.createAdventure(assets.content,{name:'小星',appearance:'girl',seed});
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
        case 'deck':case 'pet':case 'equipment':panel(shot.scene);break;
        case 'battle':filmBattle('fire-scout');break;
        case 'friends':social={owner:'演示角色',mailTab:'friends',mailAvailable:false,applies:[{id:'promo-request',nickname:'小月（演示伙伴）'}],friends:[]};friends();check(nodes.overlay.textContent.includes('同意'),'好友申请视图（固定演示数据）');break;
        case 'dungeons':dungeon=assets.content.dungeons.filter(d=>d.playable).sort((a,b)=>a.recommendedLevel-b.recommendedLevel)[0];check(!!dungeon,'存在可进入副本');await assets.dungeons.load(dungeon.id);renderDungeons(nodes.overlay,model(),callbacks);check(!!nodes.overlay.querySelector('.dungeon-list'),'副本目录可渲染');break;
        case 'learning':{
            const data=await createJsonReader()('data/adventure/camp-conversations.json');const profile=data.profiles.find(p=>p.stories?.length),story=profile.stories[0];
            chatState={profile,story,index:0,locale:'en',showChinese:true,portrait:assets.mode==='local'?profile.portrait.local:profile.portrait.cdn,messages:[{role:'assistant',text:story.opening},{role:'assistant',text:story.turns[0].question}],status:'剧本对话演示',hintLevel:0,done:false};paintChat();check(!!learning.root.querySelector('.camp-chat'),'真实双语对话组件与课程已加载');break;
        }
        default:throw Error(`未支持的镜头：${shot.scene}`);
    }
    await warmArt();tick(0);return result();
}
async function action(cue){
    switch(cue.action){
        case 'creation':creation(cue.step,'fire',cue.look||{});break;
        case 'school':creation(3,cue.school);check(tutorialCards(assets,cue.school).length>0,`${cue.school} 技能可预览`);break;
        case 'save-deck':A.applyAction(save,assets.content,{type:'deck',deck:save.deck.map(c=>({...c}))});panel('deck');check(save.tips.deckEdited,'卡包通过规则校验并保存至演示内存');break;
        case 'friend-accept':social.applies=[];social.friends=[{name:'小月（演示伙伴）',userId:'promo-friend'}];friends();check(nodes.overlay.textContent.includes('邀请组队'),'好友列表视图切换（未发送好友请求）');break;
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
    if(draft&&!nodes.entry.hidden&&draft.step===3)keys.push(...tutorialCards(assets,draft.school).map(c=>c.key));
    await Promise.all([...new Set(keys.map(key=>assets.effects.cards[key]?.base).filter(Boolean))].map(base=>assets.skillArt.ensure(base)));
}
function tick(elapsed){
    if(!renderer||!save)return;
    const zoom=samplePromoZoom(elapsed,shot.duration,shot.camera?.zoomIn||0,matchMedia('(prefers-reduced-motion: reduce)').matches);
    shownZoom=renderer.zoomBy(zoom/shownZoom);
    if(path.length&&!frames.length&&['world','island'].includes(shot.scene)){
        const moved=samplePromoMotion(world,origin,path,elapsed,{mountId:save.mountId,balanceParams:assets.content.balanceParams});
        save.position=moved.position;save.facing=moved.facing;
        renderer.render(world,save,elapsed*1000,{moving:moved.moving});
    }
    else renderer.render(world,save,elapsed*1000);
    if(frames.length){
        const played=samplePresentationClock(frames,elapsed-battleStart),f=frames[played.index];
        if(played.index!==lastBattleFrame){V.renderBattle(nodes.battle,model(f.arena),callbacks);lastBattleFrame=played.index;check(!!$('battle-canvas')||f.arena.finished,'战斗界面可渲染');}
        const canvas=$('battle-canvas');if(canvas)renderer.renderBattle(canvas,f.arena,save,elapsed*1000,{event:f.event,progress:played.progress,hp:f.hp});
    }
}
function validateFrames(){for(const fraction of [0,.2,.5,.8,1])tick(battleStart+(shot.duration-battleStart-.01)*fraction);return result();}
function result(){return {shot:shot?.id,checks:[...new Set(checks)],scope:shot?.fixture?'fixture':'game',zone:save?.zone,battle:frames.length?{finished:frames.at(-1).arena.finished,winner:frames.at(-1).arena.winner}:null};}
function setPaused(value){paused=value;if(draft&& !nodes.entry.hidden&&draft.step===3&&previewPaused!==paused){preview.togglePause();previewPaused=paused;}}
const ready=(async()=>{assets=await loadResources();renderer=createRenderer($('world'),assets);preview=createCreationPreview(assets);learning=createLearningChatView(callbacks);})();
window.promoStage={ready,prepare,action,tick,setPaused,result,validateFrames};
ready.catch(error=>{nodes.entry.hidden=false;nodes.entry.textContent=`演示舞台加载失败：${error.message}`;});
