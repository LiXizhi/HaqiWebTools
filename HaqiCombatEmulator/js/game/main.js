// Haqi.html bootstrap: title / character creation -> overworld <-> dialog / panels <-> battle.
import {loadGameData,CURRENCY,itemName} from './data.js';
import {loadImage,assetURL,hasAsset} from './assets/cdn.js';
import {loadSprites,spriteNames,drawSprite} from './render/sprites.js';
import {createWorldMap} from './world/map.js';
import {buildMask,carve,createCollision,readPixels,applyOverride} from './world/collision.js';
import {createCamera} from './world/camera.js';
import {createInput} from './world/input.js';
import {createEntities,updateMobs,movePlayer,nearest,pick,npcPortrait,mobSprite} from './world/entities.js';
import {drawOverworld,drawMinimap} from './render/overworld.js';
import {renderStatus,renderTracker,setHint,toast,notice,showDialog,hideDialog,openModal,closeModal,modalOpen,schoolIconPath} from './render/hud.js';
import {createProfile,addExp,addItem,ensureDeck,expToNext} from './progression.js';
import {saveProfile,loadProfile,importProfile} from './save.js';
import {readJSON} from '../storage.js';
import {questsAtNPC,markerFor,acceptQuest,finishQuest,recordKill,recordDialog,goalProgress,rewardChoices,skipUnplayableTutorial,playableWorlds,questOutlook} from './quest/quests.js';
import {createDialogRun,currentPage,chooseButton,npcMenu} from './quest/dialog.js';
import {createEncounter} from './combat/encounter.js';
import {createBattleScene} from './render/battle-scene.js';
import {showJournal,showInventory,showDeck,showShop,showSystem} from './ui/panels.js';
import {SCHOOL_NAMES,SCHOOLS} from '../rules/formulas.js';
import {esc} from '../views/dom.js';
const $=s=>document.querySelector(s);
const MAP_SCALE=3,STEP=1/60,INTERACT_RANGE=46,AGGRO_RANGE=30;
const game={data:null,profile:null,screen:'title',world:null,worldMap:null,mapImage:null,collision:null,entities:null,camera:null,input:null,time:0,acc:0,last:0,hover:null,dialog:null,battle:null,cooldown:0,markers:new Map(),autosave:0,pendingInteract:null};
const canvas=$('#game'),ctx=canvas.getContext('2d');
function resize(){const dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.floor(innerWidth*dpr);canvas.height=Math.floor(innerHeight*dpr);canvas.style.width=innerWidth+'px';canvas.style.height=innerHeight+'px';ctx.setTransform(dpr,0,0,dpr,0,0);game.camera?.resize(innerWidth,innerHeight);}
window.addEventListener('resize',resize);
// ------------------------------------------------------------------ title
async function boot() {
  resize();
  try{[game.data]=await Promise.all([loadGameData('kids'),loadSprites()]);}
  catch(e){$('#title-status').textContent=`加载失败：${e.message}`;$('#title-status').className='warning';console.error(e);return;}
  $('#title-status').textContent=`数据就绪 · ${game.data.quests.length} 个任务 · ${Object.keys(game.data.mobs).length} 种怪物 · 引擎 ${game.data.ruleset.version}`;
  $('#create-school').innerHTML=SCHOOLS.map((s,i)=>`<button type="button" class="pick" data-school="${s}" aria-pressed="${i===0}"><img src="${assetURL(schoolIconPath(s))??''}" alt=""><span>${SCHOOL_NAMES[s]}</span></button>`).join('');
  $('#create-school').addEventListener('click',e=>{const b=e.target.closest('[data-school]');if(!b)return;$('#create-school').querySelectorAll('.pick').forEach(x=>x.setAttribute('aria-pressed',x===b));previewGender();});
  $('#create-gender').addEventListener('click',e=>{const b=e.target.closest('[data-gender]');if(!b)return;$('#create-gender').querySelectorAll('.pick').forEach(x=>x.setAttribute('aria-pressed',x===b));});
  previewGender();
  $('#create').addEventListener('submit',e=>{e.preventDefault();try{const profile=createProfile({name:$('#create-name').value,school:$('#create-school [aria-pressed=true]').dataset.school,gender:$('#create-gender [aria-pressed=true]').dataset.gender});startGame(profile);}catch(err){notice(err.message,true);}});
  $('#import-profile').addEventListener('change',async e=>{try{const profile=importProfile(await readJSON(e.target.files[0]));await startGame(profile);}catch(err){notice(err.message,true);}});
  const saved=await loadProfile('kids').catch(()=>null);
  if(saved){const box=$('#title-continue');box.hidden=false;box.innerHTML=`<div class="row spread"><div><strong>${esc(saved.name)}</strong> · Lv ${saved.level} ${SCHOOL_NAMES[saved.school]} · ${esc(game.data.worldByName[saved.world]?.title??saved.world)}</div><button class="primary" id="continue">继续冒险</button></div>`;$('#continue').addEventListener('click',()=>startGame(saved));}
  loop(performance.now());
}
function previewGender(){const school=$('#create-school [aria-pressed=true]')?.dataset.school??'fire';for(const c of document.querySelectorAll('[data-preview]')){const g=c.getContext('2d');g.clearRect(0,0,c.width,c.height);drawSprite(g,`player_${c.dataset.preview}_${school}`,'down',0,24,62,{scale:2});}}
// ------------------------------------------------------------------ world
async function startGame(profile) {
  game.profile=profile;ensureDeck(profile,game.data.ruleset);
  const skipped=skipUnplayableTutorial(profile,game.data,hasAsset);
  if(skipped.length)setTimeout(()=>toast(`魔法营地暂无 2D 地图，已跳过 ${skipped.length} 个新手任务`),1200);
  $('#title').hidden=true;$('#hud').hidden=false;
  try{await enterWorld(profile.world||'61HaqiTown');}
  catch(e){notice(`${e.message}，已返回哈奇小镇`,true);profile.world='61HaqiTown';profile.pos=null;await enterWorld('61HaqiTown');}
  refreshHUD();await saveProfile(profile).catch(e=>console.warn(e));
}
export async function enterWorld(name,spawn=null) {
  const world=game.data.worldByName[name];
  if(!world)throw new Error(`未知世界 ${name}`);
  if(world.anchors.length<3||!world.mapImage)throw new Error(`${world.title??name} 尚无可用的 2D 地图`);
  game.screen='loading';setHint(`正在进入 ${world.title??world.label}…`);
  const image=await loadImage(world.mapImage);
  if(!image)throw new Error(`地图图片加载失败：${world.mapImage}`);
  const worldMap=createWorldMap(world,{width:image.width,height:image.height,scale:MAP_SCALE});
  const pixels=readPixels(image,image.width,image.height);
  let mask=buildMask(pixels,image.width,image.height);
  const override=await new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>resolve(null);img.src=new URL(`../../assets/masks/${name}.png`,import.meta.url);});
  if(override)mask=applyOverride(mask,image.width,image.height,readPixels(override,image.width,image.height));
  const points=[worldMap.fit.toMap(world.bornPos.x,world.bornPos.z)];
  for(const n of game.data.npcs[name]??[])points.push(worldMap.fit.toMap(n.pos[0],n.pos[2]));
  for(const a of game.data.arenas[name]??[])points.push(worldMap.fit.toMap(a.pos[0],a.pos[2]));
  for(const p of world.portals??[])points.push(worldMap.fit.toMap(p.pos[0],p.pos[2]));
  carve(mask,image.width,image.height,points,7);
  const collision=createCollision(mask,image.width,image.height,MAP_SCALE);
  const profile=game.profile;
  if(profile.world!==name||spawn){profile.world=name;profile.pos=spawn?{x:spawn[0],y:spawn[1]}:null;}
  const entities=createEntities(game.data,world,worldMap,spriteNames(),profile);
  if(!collision.walkable(entities.player.x,entities.player.y)){entities.player.x=worldMap.born[0];entities.player.y=worldMap.born[1];}
  Object.assign(game,{world,worldMap,mapImage:image,collision,entities,camera:createCamera(worldMap)});
  game.camera.resize(innerWidth,innerHeight);game.camera.follow(entities.player.x,entities.player.y,0,true);
  game.input??=createInput(canvas);
  $('#world-name').textContent=world.title??world.label;
  refreshMarkers();game.screen='world';setHint(null);
  // Warm the CDN caches for markers and portraits used in this world.
  for(const p of ['texture/aries/headon/exclamation.png','texture/aries/headon/question.png','texture/aries/headon/question_grey.png','texture/aries/headon/portal_32bits.png'])loadImage(p);
}
function refreshMarkers(){game.markers.clear();for(const n of game.entities.npcs){const m=markerFor(game.profile,game.data,n.id);if(m)game.markers.set(n.id,m);}}
function refreshHUD(){renderStatus(game.profile,game.data);renderTracker(game.profile,game.data,questOutlook(game.profile,game.data,hasAsset));refreshMarkers();}
async function persist(){if(!game.profile)return;if(game.entities){game.profile.pos={x:game.entities.player.x,y:game.entities.player.y};}try{await saveProfile(game.profile);}catch(e){console.warn('save failed',e);}}
// ------------------------------------------------------------------ loop
function loop(now) {
  requestAnimationFrame(loop);
  const dt=Math.min(.1,(now-game.last)/1000||0);game.last=now;game.time+=dt;
  if(game.screen==='title'||game.screen==='loading'){return;}
  game.acc+=dt;
  while(game.acc>=STEP){update(STEP);game.acc-=STEP;}
  draw();
}
function update(dt) {
  const input=game.input.poll();
  if(game.profile)game.profile.stats.playtime+=dt;
  game.autosave+=dt;if(game.autosave>30){game.autosave=0;persist();}
  if(game.screen==='battle'){game.battle.scene.update(dt);if(input.tap){const p=tapToCanvas(input.tap);game.battle.scene.tap(p.x,p.y);}if(input.cancel)game.battle.scene.cancelTarget();return;}
  if(modalOpen()){if(input.cancel)closeModal();return;}
  if(game.screen==='dialog'){if(input.cancel)endDialog();return;}
  if(game.screen!=='world')return;
  const {entities,collision,camera}=game;const player=entities.player;
  if(input.menu)openMenu({j:'journal',i:'inventory',b:'deck',m:'map'}[input.menu]);
  if(input.tap){const [wx,wy]=camera.toWorld(input.tap.x,input.tap.y);const hit=pick(entities,wx,wy);if(hit){player.target={x:hit.x,y:hit.y};game.pendingInteract=hit;}else if(collision.walkable(wx,wy)){player.target={x:wx,y:wy};game.pendingInteract=null;}}
  movePlayer(player,input.axis,collision,dt);
  updateMobs(entities,collision,dt,game.time*1000);
  camera.follow(player.x,player.y,dt);
  game.cooldown=Math.max(0,game.cooldown-dt);
  const npc=nearest(entities,player.x,player.y,['npc'],INTERACT_RANGE),portal=nearest(entities,player.x,player.y,['portal'],28);
  game.hover=npc;
  if(portal&&game.cooldown<=0){travel(portal);return;}
  if(npc?.data.hasDialog||npc?.data.desc){setHint(`E · 与 ${npc.name} 交谈`);if(input.interact||(game.pendingInteract===npc&&Math.hypot(npc.x-player.x,npc.y-player.y)<INTERACT_RANGE)){game.pendingInteract=null;player.target=null;openNPC(npc);return;}}
  else setHint(null);
  if(game.cooldown<=0){const mob=nearest(entities,player.x,player.y,['mob'],AGGRO_RANGE);if(mob&&mob.alive){startBattle(mob);return;}}
}
function tapToCanvas(tap){return {x:tap.x,y:tap.y};}
function draw() {
  const w=innerWidth,h=innerHeight;
  if(game.screen==='battle'){game.battle.scene.draw(ctx,w,h);return;}
  drawOverworld(ctx,{camera:game.camera,worldMap:game.worldMap,mapImage:game.mapImage,entities:game.entities,markers:game.markers,hover:game.hover,time:game.time});
  if(w>700)drawMinimap(ctx,{mapImage:game.mapImage,worldMap:game.worldMap,entities:game.entities,box:{x:w-172,y:h-96,w:160,h:80}});
  if(game.input?.joystick){const j=game.input.joystick;ctx.fillStyle='#ffffff33';ctx.beginPath();ctx.arc(j.cx,j.cy,40,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffffff88';ctx.beginPath();ctx.arc(j.x,j.y,18,0,Math.PI*2);ctx.fill();}
}
// ------------------------------------------------------------------ NPC dialog
function portraitFor(npc){return {sprite:npc.sprite,cdnPath:npcPortrait(npc.data)};}
function openNPC(npc) {
  game.screen='dialog';game.input.clear();setHint(null);
  const {available,completable,inProgress}=questsAtNPC(game.profile,game.data,npc.id);
  // ClientDialogNPC goals take priority: the quest scripted a conversation with this NPC.
  for(const q of inProgress){const d=q.dialogNPCs.find(x=>x.npcId===npc.id&&!game.profile.quests.active[q.id]?.progress.dialogs[npc.id]);if(d&&d.dialog.length){runDialog(createDialogRun(d.dialog,{kind:'talk',quest:q,npcId:npc.id}),npc);return;}}
  const greeting=npc.data.hello?.length?npc.data.hello[Math.floor(Math.random()*npc.data.hello.length)]:null;
  const page=npcMenu({...npc.data,id:npc.id,name:npc.name},{available,completable,inProgress,shop:!!game.data.shops[String(npc.id)],greeting:npc.data.desc||greeting});
  if(isCaptain(npc))for(const w of playableWorlds(game.data,hasAsset).filter(w=>w.name!==game.world.name))page.buttons.splice(page.buttons.length-1,0,{action:'travel',label:`乘船前往 ${w.title??w.label}${w.minLevel>game.profile.level?`（需 Lv ${w.minLevel}）`:''}`,world:w});
  showDialog({name:npc.title?`${npc.name} ${npc.title}`:npc.name,text:page.content,buttons:page.buttons,portrait:portraitFor(npc)},index=>{
    const b=page.buttons[index];
    if(b.action==='quest-start')runDialog(createDialogRun(b.quest.startDialog.length?b.quest.startDialog:[{npcId:npc.id,content:b.quest.detail,buttons:[{action:'doaccept',label:'接受任务'}]}],{kind:'start',quest:b.quest,npcId:npc.id}),npc);
    else if(b.action==='quest-finish')runDialog(createDialogRun(b.quest.endDialog.length?b.quest.endDialog:[{npcId:npc.id,content:'做得好！这是你的奖励。',buttons:[{action:'dofinished',label:'完成任务'}]}],{kind:'finish',quest:b.quest,npcId:npc.id}),npc);
    else if(b.action==='quest-progress'){const rows=goalProgress(game.profile,b.quest,game.data);showDialog({name:npc.name,text:`${b.quest.detail}\n\n${rows.map(r=>`${r.label} ${r.have}/${r.need}${r.place?`（${r.place}）`:''}`).join('\n')}`,buttons:[{action:'close',label:'我会继续努力'}],portrait:portraitFor(npc)},()=>endDialog());}
    else if(b.action==='travel'){hideDialog();game.screen='world';if(b.world.minLevel>game.profile.level){toast(`等级不足，需要 Lv ${b.world.minLevel}`);return;}sail(b.world);}
    else if(b.action==='shop'){hideDialog();showShop(game.profile,game.data,{...npc.data,id:npc.id,name:npc.name},{onChange:refreshHUD});game.screen='world';game.cooldown=.5;}
    else endDialog(npc);
  });
}
function runDialog(run,npc) {
  const page=currentPage(run);
  const speaker=page.npcId===npc.id||!page.npcId?npc:game.entities.npcs.find(n=>n.id===page.npcId)??npc;
  showDialog({name:speaker.name,text:page.content.replace(/#\w+#/g,game.profile.name),buttons:page.buttons,portrait:portraitFor(speaker)},index=>{
    const outcome=chooseButton(run,index);
    if(outcome.type==='next'){runDialog(run,npc);return;}
    if(outcome.type==='accept'){try{acceptQuest(game.profile,outcome.quest,game.data);toast(`接受任务：${outcome.quest.title}`);}catch(e){toast(e.message);}}
    if(outcome.type==='talked'){recordDialog(game.profile,game.data,outcome.npcId);toast(`任务进展：${outcome.quest.title}`);}
    if(outcome.type==='finish'){completeQuest(outcome.quest,npc);return;}
    endDialog(npc);
  });
}
function completeQuest(quest,npc) {
  const choices=rewardChoices(game.profile,quest).filter(c=>!c.fixed);
  const finish=(choice)=>{try{const r=finishQuest(game.profile,quest,game.data,choice);toast(`完成任务：${quest.title}${r.exp?` · 经验 +${r.exp}`:''}`);for(const i of r.items)toast(`获得 ${itemName(game.data,i.gsid)} ×${i.count}`);if(r.levels)toast(`升到 Lv ${game.profile.level}！`);}catch(e){toast(e.message);}endDialog(npc);persist();};
  if(!choices.length){finish({});return;}
  const group=choices[0];
  showDialog({name:npc.name,text:'请选择一份奖励：',buttons:group.items.map(i=>({action:'pick',label:`${itemName(game.data,i.gsid)} ×${i.count}`})),portrait:portraitFor(npc)},index=>finish({[group.index]:index}));
}
function endDialog(npc){hideDialog();game.screen='world';game.cooldown=.4;if(npc?.data.goodbye?.length&&Math.random()<.5)toast(`${npc.name}：${npc.data.goodbye[Math.floor(Math.random()*npc.data.goodbye.length)]}`);refreshHUD();}
// ------------------------------------------------------------------ battle
function startBattle(mobEntity) {
  const seed=`${game.profile.name}:${game.profile.stats.battles}:${mobEntity.arenaId}:${Date.now()}`;
  let encounter;
  try{encounter=createEncounter(game.profile,game.data,mobEntity.party,seed);}
  catch(e){notice(`无法开始战斗：${e.message}`,true);mobEntity.alive=false;mobEntity.respawnAt=game.time*1000+mobEntity.respawn;game.cooldown=1;return;}
  game.profile.stats.battles++;game.screen='battle';game.input.clear();setHint(null);
  const p=game.entities.player,k=game.worldMap.scale,aspect=innerWidth/Math.max(1,innerHeight),sh=90,sw=Math.round(sh*aspect);
  const backdrop={image:game.mapImage,sx:Math.max(0,Math.min(game.worldMap.imageWidth-sw,p.x/k-sw/2)),sy:Math.max(0,Math.min(game.worldMap.imageHeight-sh,p.y/k-sh/2)),sw,sh};
  const scene=createBattleScene({encounter,profile:game.profile,data:game.data,backdrop,playerSprite:game.entities.player.sprite,mobSprites:mobEntity.party.map(m=>mobSprite(m,spriteNames())),
    onFinished:(rewards,result)=>finishBattle(mobEntity,rewards,result,scene),onFlee:()=>{scene.close();game.screen='world';game.cooldown=2;pushBack(mobEntity);toast('你逃离了战斗');}});
  game.battle={encounter,scene,mob:mobEntity};scene.open();
}
function pushBack(mobEntity){const p=game.entities.player;const dx=p.x-mobEntity.x,dy=p.y-mobEntity.y,d=Math.hypot(dx,dy)||1;const [nx,ny]=game.collision.move(p.x,p.y,dx/d*AGGRO_RANGE*1.6,dy/d*AGGRO_RANGE*1.6,4);p.x=nx;p.y=ny;}
function finishBattle(mobEntity,rewards,result,scene) {
  const profile=game.profile,lines=[];
  if(result.winner===0) {
    mobEntity.alive=false;mobEntity.respawnAt=game.time*1000+mobEntity.respawn;
    const exp=addExp(profile,rewards.exp);profile.stats.kills+=mobEntity.party.length;
    if(rewards.joybeans)addItem(profile,CURRENCY.coin,rewards.joybeans);
    for(const l of rewards.loot)addItem(profile,l.gsid,l.count);
    const drops=[];for(const m of mobEntity.party)drops.push(...recordKill(profile,game.data,m.template,Math.random));
    lines.push(`<h2>胜利！</h2><p>经验 +${rewards.exp}${rewards.joybeans?` · ${itemName(game.data,CURRENCY.coin)} +${rewards.joybeans}`:''}</p>`);
    if(rewards.loot.length||drops.length)lines.push(`<div class="loot">${[...rewards.loot,...drops].map(l=>`<span class="pill">${esc(itemName(game.data,l.gsid))} ×${l.count}</span>`).join('')}</div>`);
    if(exp.levels)lines.push(`<p class="warning">升级！现在是 Lv ${profile.level}，生命上限提升，可能有新卡牌可用。</p>`);
    else lines.push(`<p class="muted">距离升级还需 ${expToNext(profile.level)-profile.exp} 经验</p>`);
  } else {
    profile.stats.defeats++;
    lines.push(`<h2>战败……</h2><p class="muted">你被送回了出生点。怪物会在原地等你。</p>`);
  }
  lines.push(`<button id="battle-continue" class="primary">继续</button>`);
  scene.showResult(lines.join(''));
  $('#battle-continue').addEventListener('click',()=>{scene.close();game.screen='world';game.cooldown=1.5;if(result.winner!==0){const p=game.entities.player;[p.x,p.y]=game.worldMap.born;game.camera.follow(p.x,p.y,0,true);}refreshHUD();persist();});
}
// ------------------------------------------------------------------ travel & menus
// Captains (法斯特船长 and island counterparts) ferry players between islands, as in the source client.
const isCaptain=npc=>/船长/.test(npc.name)||/captain/i.test(npc.data.assetChar??'');
async function sail(world){game.cooldown=3;try{await enterWorld(world.name);toast(`抵达 ${game.world.title}`);refreshHUD();persist();}catch(e){game.screen='world';notice(e.message,true);}}
async function travel(portal) {
  game.cooldown=3;
  const target=findPortalTarget(portal);
  if(!target){toast(`${portal.name}：目的地尚未开放`);pushBack(portal);return;}
  try{await enterWorld(target.world,target.spawn);toast(`来到 ${game.world.title}`);persist();}
  catch(e){game.screen='world';notice(e.message,true);pushBack(portal);}
}
// Portal gsids are shared across islands; a portal leads to the sibling world that hosts a portal with the same gsid.
function findPortalTarget(portal) {
  for(const w of game.data.worlds){if(w.name===game.world.name||w.anchors.length<3||!w.mapImage)continue;const twin=w.portals.find(p=>p.gsid===portal.gsid);if(twin){const wm=createWorldMap(w,{scale:MAP_SCALE});const [x,y]=wm.toMap(twin.pos[0],twin.pos[2]);return {world:w.name,spawn:[x+40,y]};}}
  return null;
}
function openMenu(kind) {
  if(!kind||game.screen!=='world')return;
  game.input.clear();
  if(kind==='journal')showJournal(game.profile,game.data,{onChange:refreshHUD});
  if(kind==='inventory')showInventory(game.profile,game.data);
  if(kind==='deck')showDeck(game.profile,game.data,{onChange:refreshHUD});
  if(kind==='map')showMap();
  if(kind==='system')showSystem(game.profile,game.data,{onSave:async()=>{await persist();toast('已保存');},onReset:async()=>{const {save}=await import('../storage.js');await save(`haqi-game:${game.profile.version}`,null);location.reload();},onImport:async file=>{try{const profile=importProfile(await readJSON(file));closeModal();await startGame(profile);toast('存档已导入');}catch(e){notice(e.message,true);}}});
}
function showMap() {
  const {worldMap,mapImage,entities}=game;
  openModal(`${game.world.title} · 地图`,`<canvas id="map-canvas" width="${worldMap.imageWidth}" height="${worldMap.imageHeight}" style="width:100%;image-rendering:pixelated;border-radius:8px"></canvas><p class="muted">黄点：可对话 NPC · 红点：怪物 · 蓝点：你 · 青点：传送门。点击地图可自动前往（仅可行走区域）。</p>`);
  const c=$('#map-canvas'),g=c.getContext('2d');g.imageSmoothingEnabled=false;g.drawImage(mapImage,0,0);
  const k=1/worldMap.scale;g.fillStyle='#ffe066';for(const n of entities.npcs)if(n.data.hasDialog)g.fillRect(n.x*k-1.5,n.y*k-1.5,3,3);
  g.fillStyle='#ff5a3a';for(const m of entities.mobs)if(m.alive)g.fillRect(m.x*k-1.5,m.y*k-1.5,3,3);
  g.fillStyle='#4ff';for(const p of entities.portals)g.fillRect(p.x*k-2,p.y*k-2,4,4);
  g.fillStyle='#3af';g.fillRect(entities.player.x*k-3,entities.player.y*k-3,6,6);g.strokeStyle='#fff';g.strokeRect(entities.player.x*k-3,entities.player.y*k-3,6,6);
  c.addEventListener('click',e=>{const box=c.getBoundingClientRect();const x=(e.clientX-box.left)/box.width*worldMap.width,y=(e.clientY-box.top)/box.height*worldMap.height;if(game.collision.walkable(x,y)){entities.player.target={x,y};closeModal();}else toast('那里无法到达');});
}
$('#menu-bar').addEventListener('click',e=>{const b=e.target.closest('[data-menu]');if(b)openMenu(b.dataset.menu);});
$('#modal-close').addEventListener('click',closeModal);
$('#modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal();});
window.addEventListener('pagehide',()=>{persist();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)persist();});
export const debug={game,enterWorld,startBattle,openNPC,persist};
window.haqi=debug;
boot();
