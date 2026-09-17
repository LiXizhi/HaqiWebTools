// Browser controller: input, rendering, audio and persistence live outside the pure rules.
import { effectDuration } from './spell_effects_core.js';
import { HIT_DURATION_MS } from './actor_animation_core.js';
import * as A from './adventure_core.js';
import * as W from './adventure_world_core.js';
import * as P from './combat_pve_core.js';
import * as V from './view_adventure.js';
import { loadResources,saveLocal,readLocal,downloadSave,localUpdatedAt,replaceLocalWithBackup,readBackup } from './adventure_assets.js';
import { createRenderer } from './adventure_renderer.js';
import { createCloudClient } from './adventure_cloud.js';
import { checkedProgress } from './adventure_cloud_core.js';
import { renderCloud } from './view_adventure_cloud.js';

const $=id=>document.getElementById(id);
const nodes={world:$('world'),hud:$('hud'),entry:$('entry'),overlay:$('overlay'),battle:$('battle-layer'),toast:$('toast')};
let assets,renderer,save,world,battle,stage='loading',panel=null,dialog=null,dialogDone=null;
let path=[],destination=null,moving=false,lastFrame=0,lastMap=0,lastSave=0,toastTimer=0;
let selected=null,discarded=[],animation=null,music=null,storageWarning=false;
let cloudClient;
const cloud={owner:null,busy:'',error:'',message:'',paths:[],preview:null};
const keys=new Set();
let joystick={x:0,y:0},heldPointer=null;
function resetMovementInput(){keys.clear();joystick={x:0,y:0};heldPointer=null;document.querySelector('.touch-joystick')?.resetInput();}
const model=()=>({assets,save,battle,selected,discarded,animating:!!animation});
function toast(message) {nodes.toast.textContent=message;nodes.toast.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>nodes.toast.classList.remove('visible'),4200);}
function safely(fn) {try{return fn();}catch(e){toast(e.message);return false;}}
function persist() {
    if(!save||stage==='title')return;
    try {saveLocal(save);storageWarning=false;}catch {if(!storageWarning)toast('浏览器无法保存进度，请在设置中导出存档。');storageWarning=true;}
    const indicator=document.querySelector('.save-indicator');if(indicator)indicator.textContent=storageWarning?'请导出备份':'已存档';
    lastSave=performance.now();
}
function close() {panel=null;dialog=null;dialogDone=null;nodes.overlay.replaceChildren();nodes.overlay.className='overlay';resetMovementInput();nodes.world.focus({preventScroll:true});}
function paintHud() {resetMovementInput();V.renderHud(nodes.hud,model(),{panel:openPanel,track,interact:interactNearest,steer:(x,y)=>{joystick={x,y};path=[];destination=null;heldPointer=null;}});}
function paintPanel() {if(panel==='cloud'){paintCloud();return;}if(panel)V.renderPanel(nodes.overlay,panel,model(),{close,action,track,cloud:openCloud,music:toggleMusic,export:()=>downloadSave(save),import:importFile,title:showTitle});}
function openPanel(kind) {if(stage!=='world')return;close();path=[];destination=null;panel=kind;paintPanel();}
function cloudLocal() {if(stage!=='title')return save;try{const raw=readLocal();return raw?A.parseSave(raw,assets.content):null;}catch{return null;}}
function openCloud() {persist();close();path=[];destination=null;if(!cloud.busy){cloud.preview=null;cloud.error='';cloud.message=cloud.owner?'请选择一份记录查看，或保存当前旅程。':'';}panel='cloud';paintCloud();}
function paintCloud() {
    if(panel!=='cloud')return;
    renderCloud(nodes.overlay,{...cloud,local:cloudLocal(),localUpdatedAt:localUpdatedAt(),hasBackup:!!readBackup()},{close,
        connect:()=>cloudAction('正在连接 Keepwork…',async()=>{cloud.owner=await cloudClient.connect();cloud.paths=await cloudClient.list();cloud.message=cloud.paths.length?'请选择一份记录查看。':'未找到云端记录。你可以保存当前进度，或刷新重试。';}),
        refresh:()=>cloudAction('正在读取云端目录…',async()=>{cloud.paths=await cloudClient.list();cloud.message=cloud.paths.length?'云端目录已刷新。':'未找到云端记录，可刷新重试。';}),
        upload:()=>cloudAction('正在保存并核验云端进度…',async()=>{const current=cloudLocal();if(!current)throw new Error('请先开始一段冒险。');const result=await cloudClient.upload(current);cloud.paths=[result.path,...cloud.paths.filter(p=>p!==result.path)].sort().reverse().slice(0,30);cloud.message='已保存到云端，并核验远端内容。';}),
        preview:path=>cloudAction('正在校验存档与战斗记录…',async()=>{const localRaw=readLocal();const preview=await cloudClient.read(path);if(readLocal()!==localRaw)throw new Error('本地进度已变化，请重新查看这份记录。');cloud.preview={...preview,localRaw};cloud.message='请比较两份进度，确认后恢复。';}),
        cancelPreview:()=>{cloud.preview=null;paintCloud();},restore:()=>safely(()=>{
            cloudClient.assertPreview(cloud.preview);
            const restored=checkedProgress(cloud.preview.save,assets.content,assets.dataset);
            replaceLocalWithBackup(restored.save,localStorage,cloud.preview.localRaw);cloud.preview=null;
            enterWorld(restored.save,restored.battle);toast('云端进度已恢复。原本地进度已保留为备份。');
        }),backup:()=>safely(()=>{downloadSave(checkedProgress(readBackup(),assets.content,assets.dataset).save);}),
    });
}
async function cloudAction(label,fn) {
    if(cloud.busy)return;
    cloud.busy=label;cloud.error='';cloud.message='';cloud.preview=null;paintCloud();
    try{await fn();}catch(e){cloud.error=e.message;}finally{cloud.busy='';cloud.owner=cloudClient.owner;paintCloud();}
}
function action(value) {safely(()=>{A.applyAction(save,assets.content,value);persist();paintHud();paintPanel();const text={equip:'已经装备。属性将在下一场战斗中生效。',upgrade:'晶石法杖强化成功！',hatch:'咕噜噜从蛋里探出了头，开始跟随你。',feed:'咕噜噜吃饱了，获得了经验！',deck:'卡包已保存。'};toast(text[value.type]||'进度已保存');});}
function enterWorld(newSave,restoredBattle=null) {
    save=newSave;world=W.createWorld(save.zone,assets.content);stage='world';path=[];destination=null;animation=null;close();
    if(!W.walkable(world,save.position.x,save.position.y))save.position={...world.center};
    nodes.entry.replaceChildren();nodes.entry.className='';nodes.entry.hidden=true;nodes.hud.hidden=false;
    nodes.battle.replaceChildren();nodes.battle.className='battle-layer';battle=null;paintHud();
    if(save.pendingEncounter){battle=restoredBattle||P.restorePveBattle(assets.dataset,assets.content,save.pendingEncounter);stage='battle';nodes.hud.hidden=true;paintBattle();}
    persist();updateMusic();
}
function showTitle() {
    persist();close();stage='title';keys.clear();path=[];destination=null;animation=null;battle=null;
    music?.pause();nodes.hud.hidden=true;nodes.battle.replaceChildren();nodes.battle.className='battle-layer';nodes.entry.hidden=false;
    let stored=null,error='';try {const raw=readLocal();if(raw)stored=A.parseSave(raw,assets.content);}catch(e){error=`存档暂时无法读取：${e.message}。可开启新旅程，或在设置中导入备份。`;}
    save=stored||A.createAdventure(assets.content);world=W.createWorld(save.zone,assets.content);
    V.renderEntry(nodes.entry,assets,!!stored,{create:options=>safely(()=>{enterWorld(A.createAdventure(assets.content,{...options,seed:Date.now()}));toast('欢迎来到魔法营地！点击右侧「追踪目标」，去见青龙导师。');}),continue:()=>safely(()=>{
        const restored=stored.pendingEncounter?P.restorePveBattle(assets.dataset,assets.content,stored.pendingEncounter):null;
        enterWorld(stored,restored);
    }),cloud:openCloud},error);
}
async function importFile(file) {
    try {
        if(file.size>1024*1024)throw new Error('存档文件过大');
        const imported=A.parseSave(await file.text(),assets.content);
        const restored=imported.pendingEncounter?P.restorePveBattle(assets.dataset,assets.content,imported.pendingEncounter):null;
        enterWorld(imported,restored);toast('存档已导入，欢迎回来！');
    }catch(e){toast(`未导入存档：${e.message}`);}
}
function updateMusic() {
    if(!assets||!save)return;
    if(!music){music=new Audio(assets.urlFor(assets.content.extras.music.id));music.loop=true;music.volume=.24;music.onerror=()=>{if(save.music)toast('背景音乐暂时不可用，可以继续游玩。');};}
    if(save.music&&stage!=='title')music.play().catch(()=>{if(music.error)toast('背景音乐暂时不可用，可以继续游玩。');});else music.pause();
}
function toggleMusic(){save.music=!save.music;persist();updateMusic();paintPanel();}
function travel(zone){safely(()=>{A.applyAction(save,assets.content,{type:'travel',zone});enterWorld(save);toast(zone==='town'?'欢迎来到哈奇小镇！第一章已经完成。':'你回到了熟悉的魔法营地。');});}
function paintDialogue(){if(dialog)V.renderDialogue(nodes.overlay,model(),dialog,{close,next:nextDialogue,startQuest:q=>startLines(q.startDialog,'接取任务',()=>{
    A.applyAction(save,assets.content,{type:'accept',questId:q.id,npcId:q.startNpc});toast(`已接取：${q.title}`);
}),finishQuest:q=>startLines(q.endDialog,'领取奖励',()=>{
    const level=save.level;const rewards=A.rewardsFor(save,assets.content,q);
    A.applyAction(save,assets.content,{type:'claim',questId:q.id,npcId:q.endNpc});
    toast(`${rewards.map(r=>`${assets.content.items[r.id].name} ×${r.count}`).join(' · ')}${save.level>level?`　升到 ${save.level} 级！`:''}`);
}),questTalk:(q,talk)=>startLines(talk.dialog,'谢谢你，我知道了',()=>A.applyAction(save,assets.content,{type:'talk',npcId:talk.npcId})),panel:openPanel,travel,track});}
function startLines(lines,finishLabel,done) {
    dialog.lines=lines;dialog.index=0;dialog.finishLabel=finishLabel;dialogDone=done;
    if(!lines.length)nextDialogue();else paintDialogue();
}
function nextDialogue() {
    if(!dialog)return;
    if(dialog.index+1<dialog.lines.length){dialog.index++;paintDialogue();return;}
    safely(()=>{const npcId=dialog.npcId;dialogDone?.();dialogDone=null;persist();paintHud();dialog={npcId};paintDialogue();});
}
function interact(target) {
    if(stage!=='world'||!target)return;
    path=[];destination=null;keys.clear();persist();
    if(target.kind==='npc'){close();dialog={npcId:target.id};paintDialogue();}
    if(target.kind==='portal')travel(target.zone);
    if(target.kind==='encounter')safely(()=>{
        A.beginEncounter(save,assets.content,target.id);persist();
        battle=P.restorePveBattle(assets.dataset,assets.content,save.pendingEncounter);stage='battle';close();nodes.hud.hidden=true;
        selected=null;discarded=[];animation=null;paintBattle();
    });
}
function interactNearest(){if(!panel&&!dialog)interact(W.nearestInteraction(world,save.position));}
function walkTo(target,autoInteract=false) {
    close();path=W.findPath(world,save.position,target);destination=autoInteract?target:null;
    if(autoInteract&&W.distance(save.position,target)<85){interact(target);return;}
    if(!path.length)toast('这里暂时走不过去，试试旁边的小路。');
}
function track() {
    if(stage!=='world')return;close();
    const c=assets.content,q=A.currentQuest(save,c);
    if(!q){walkTo({...world.portal,kind:'portal'},true);return;}
    const npc=id=>({...c.npcs[id],kind:'npc'}),state=A.questState(save,q.id);
    if(!state.accepted){walkTo(npc(q.startNpc),true);return;}
    if(A.questReady(save,q)){walkTo(npc(q.endNpc),true);return;}
    const goal=A.questProgress(save,q).find(g=>g.value<g.count);
    if(goal.kind==='talk')walkTo(npc(goal.id),true);
    if(goal.kind==='defeat') {
        const monster=Object.values(c.monsters).find(m=>m.goalId===goal.id);
        walkTo({...world.encounters.find(e=>e.monsterId===monster.id),kind:'encounter'},true);
    }
    if(goal.kind==='action')openPanel(goal.id==='hatch-pet'||goal.id===79019?'pet':goal.id===79037&&save.equipment[24]===24003?'deck':'inventory');
}
function paintBattle(){V.renderBattle(nodes.battle,model(),{cloud:openCloud,export:()=>downloadSave(save),select:h=>{if(animation||battle.finished)return;selected=h;paintBattle();},discard:seq=>{
    if(animation||battle.finished)return;discarded=discarded.includes(seq)?discarded.filter(x=>x!==seq):[...discarded,seq];if(selected?.seq===seq)selected=null;paintBattle();
},target:id=>{if(!selected||animation||battle.finished)return;playRound({...selected,targetId:id,discardSeqs:discarded});},pass:()=>playRound({pass:true,discardSeqs:discarded}),retreat:()=>{
    A.applyAction(save,assets.content,{type:'retreat'});enterWorld(save);toast('你回到了安全地点。已保留物品与任务进度。');
},finish:()=>safely(()=>{A.settleEncounter(save,assets.content,battle);enterWorld(save);})});}
function playRound(decision) {
    if(animation||battle.finished)return;
    safely(()=>{
        const start=battle.events.length,hp=Object.fromEntries(Object.values(battle.unitsById).map(u=>[u.id,u.hp]));
        P.playPveRound(battle,decision);A.recordDecision(save,decision);persist();selected=null;discarded=[];
        const events=battle.events.slice(start).filter(e=>['cast','damage','heal','dot','hot','speak','fizzle','pass'].includes(e.type));
        animation={events:events.map(e=>({...e,type:e.type==='dot'?'damage':e.type==='hot'?'heal':e.type})),index:0,start:performance.now(),hp,entered:-1};paintBattle();
    });
}
function tickAnimation(now) {
    if(!animation)return null;
    const a=animation,e=a.events[a.index];
    if(!e){animation=null;paintBattle();return null;}
    if(a.entered!==a.index){a.entered=a.index;
        if(e.type==='damage')a.hp[e.target]=Math.max(0,a.hp[e.target]-e.amount);
        if(e.type==='heal')a.hp[e.target]=Math.min(battle.unitsById[e.target].maxHp,a.hp[e.target]+e.amount);
        const text=V.eventLabel(e,battle,assets);if(text)$('cast-announcement').textContent=text;
    }
    const duration=e.type==='speak'?1300:e.type==='cast'?effectDuration(assets.effects,battle.resolved.cards[e.card],matchMedia('(prefers-reduced-motion: reduce)').matches):e.type==='pass'?300:e.type==='damage'&&a.hp[e.target]>0?HIT_DURATION_MS:600;
    const progress=Math.min(1,(now-a.start)/duration);
    if(progress===1){a.index++;a.start=now;}
    return{event:{...e,school:e.school||battle.resolved.cards[e.card]?.spellSchool},progress,hp:a.hp};
}
const directionKeys={w:'up',arrowup:'up',s:'down',arrowdown:'down',a:'left',arrowleft:'left',d:'right',arrowright:'right'};
window.addEventListener('keydown',e=>{
    if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;
    const key=e.key.toLowerCase();if(directionKeys[key]&&stage==='world'&&!panel&&!dialog){e.preventDefault();heldPointer=null;keys.add(directionKeys[key]);path=[];destination=null;}
    if(e.repeat)return;
    if(key==='escape'){if(panel||dialog)close();else if(stage==='world')openPanel('settings');}
    if(stage!=='world'||panel||dialog)return;
    if(key==='e'){e.preventDefault();interactNearest();}
    if(key==='j')openPanel('quests');if(key==='b'||key==='i')openPanel('inventory');if(key==='c')openPanel('deck');if(key==='p')openPanel('pet');
});
window.addEventListener('keyup',e=>{keys.delete(directionKeys[e.key.toLowerCase()]);});
window.addEventListener('blur',()=>{resetMovementInput();path=[];destination=null;persist();});
window.addEventListener('pagehide',persist);
document.addEventListener('visibilitychange',()=>{if(document.hidden){resetMovementInput();path=[];destination=null;persist();music?.pause();}else updateMusic();});
nodes.world.addEventListener('pointerdown',e=>{
    if(stage!=='world'||panel||dialog||e.button!==0)return;e.preventDefault();nodes.world.focus({preventScroll:true});
    const rect=nodes.world.getBoundingClientRect(),p=renderer.screenToWorld(e.clientX-rect.left,e.clientY-rect.top);
    const targets=[...world.npcs.map(n=>({...n,kind:'npc'})),...world.encounters.map(n=>({...n,kind:'encounter'})),{...world.portal,kind:'portal'}];
    const target=targets.filter(n=>Math.abs(n.x-p.x)<48&&p.y>n.y-100&&p.y<n.y+35).sort((a,b)=>W.distance(a,p)-W.distance(b,p))[0];
    walkTo(target||p,!!target);
    if(e.pointerType==='mouse'&&!target){heldPointer={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,since:performance.now(),active:false};nodes.world.setPointerCapture(e.pointerId);}
});
nodes.world.addEventListener('pointermove',e=>{if(heldPointer?.id===e.pointerId){heldPointer.x=e.clientX;heldPointer.y=e.clientY;if(Math.hypot(e.clientX-heldPointer.startX,e.clientY-heldPointer.startY)>6){heldPointer.active=true;path=[];destination=null;}}});
function releaseWorldPointer(e){if(heldPointer?.id!==e.pointerId)return;if(heldPointer.active||e.type!=='pointerup'){path=[];destination=null;}heldPointer=null;}
for(const event of ['pointerup','pointercancel','lostpointercapture'])nodes.world.addEventListener(event,releaseWorldPointer);
function frame(now) {
    requestAnimationFrame(frame);if(!renderer||!save)return;
    const dt=Math.min(.055,(now-lastFrame)/1000||0);lastFrame=now;const wasMoving=moving;moving=false;
    if(stage==='world'&&!panel&&!dialog) {
        let dx=Number(keys.has('right'))-Number(keys.has('left')),dy=Number(keys.has('down'))-Number(keys.has('up'));
        if(!dx&&!dy){dx=joystick.x;dy=joystick.y;}
        if(heldPointer&&(heldPointer.active||now-heldPointer.since>=180)){
            heldPointer.active=true;path=[];destination=null;
            const rect=nodes.world.getBoundingClientRect(),target=renderer.screenToWorld(heldPointer.x-rect.left,heldPointer.y-rect.top);
            const x=target.x-save.position.x,y=target.y-save.position.y,distance=Math.hypot(x,y);
            if(!dx&&!dy&&distance>6){const scale=Math.min(1,(distance-6)/(W.WALK_SPEED*dt||1));dx=x/distance*scale;dy=y/distance*scale;}
        }
        if(!dx&&!dy&&path.length){
            const previous=save.position,next=W.followPath(world,save.position,path,W.WALK_SPEED*dt);
            save.position=next.position;path=next.path;dx=save.position.x-previous.x;dy=save.position.y-previous.y;moving=Math.hypot(dx,dy)>.01;
            if(next.blocked&&destination)path=W.findPath(world,save.position,destination);
        }else if(dx||dy){
            const length=Math.max(1,Math.hypot(dx,dy)),previous=save.position;
            save.position=W.movePosition(world,save.position,dx/length*W.WALK_SPEED*dt,dy/length*W.WALK_SPEED*dt);moving=W.distance(previous,save.position)>.01;
        }
        if(moving)save.facing=Math.abs(dx)>Math.abs(dy)?(dx<0?1:2):(dy<0?3:0);
        if(destination&&W.distance(save.position,destination)<82)interact(destination);
        const near=W.nearestInteraction(world,save.position),button=$('interact');
        if(button){button.hidden=!near;if(near)button.textContent=near.kind==='npc'?`与${near.name}交谈`:near.kind==='portal'?near.name:`挑战${assets.content.monsters[near.monsterId].name}`;}
        if((wasMoving&&!moving)||(moving&&now-lastSave>3000))persist();
    }
    renderer.render(world,save,now,{moving,path,title:stage==='title'});
    if(stage==='world'&&now-lastMap>200){const mini=$('minimap');if(mini)renderer.minimap(mini,world,save);lastMap=now;}
    if(stage==='battle'){const presentation=tickAnimation(now),canvas=$('battle-canvas');if(canvas)renderer.renderBattle(canvas,battle,save,now,presentation);}
}
async function boot(){
    try {
        assets=await loadResources(p=>{const bar=$('load-progress');if(bar)bar.value=p;});
        if(assets.content.schemaVersion!==1||!assets.content.quests?.length||!assets.dataset.cards)throw new Error('章节数据格式不正确，请重新导出并检查资源。');
        cloudClient=createCloudClient({content:assets.content,dataset:assets.dataset,onAccountChange:()=>{cloud.owner=null;cloud.paths=[];cloud.preview=null;cloud.message='登录状态已变化，请重新连接。';paintCloud();}});
        renderer=createRenderer(nodes.world,assets);showTitle();requestAnimationFrame(frame);
    }catch(e){stage='error';nodes.entry.replaceChildren(V.el('section','loading-card',V.el('h1','','冒险暂时无法开始'),V.el('p','',e.message),V.el('p','muted','请通过 HTTP 静态服务器打开游戏；恢复 data/adventure 中的章节文件，并运行 npm run assets:adventure 检查美术资源。'),V.button('重新尝试',()=>location.reload(),'primary')));}
}
boot();
