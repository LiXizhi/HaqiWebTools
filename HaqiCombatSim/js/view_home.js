import {renderSpeechWords} from './view_bilingual_dialogue.js';
import {homeCapacity} from './home_capacity_core.js';
import {BUILDING_TEMPLATES,buildingTemplateObjects} from './home_building_templates_core.js';
import {createHomeBuildingCache} from './home_building_cache.js';
import {drawBuilding,buildingVisualBounds} from './view_home_building.js';
import {homeDoorIsOpen,isRoofDecoration,buildingItem,obstruction,buildingBounds,buildingConnectionMask,buildingWallFeet,isEdge} from './home_building_core.js';
import {openBuildingProperties} from './view_home_building_properties.js';
import {createHomeTerrainCache} from './home_terrain_cache.js';
import {createCloseButton} from './view_adventure_controls.js';
import {DetailDialog} from './view_detail_dialog.js';
import {collectHomeWorldTrees,drawHomeObject,drawHomeWorldTree,homeObjectVisualBounds} from './view_home_art.js';
import {requiresReading,homeObjectInteractive,footprint,summonSentences,COLORS,HOME_BIOMES,homeBiomeAt,homeInteractiveKind} from './home_core.js';
import {createMotionTrail,drawMotionAccessory,drawMotionTrail,motionStyle} from './adventure_motion_effects.js';
import {createHeroActor,updateHeroActor} from './hero_pose_core.js';
import {loadHeroLibrary} from './hero_renderer.js';
import {loadEnvironmentArt} from './adventure_environment_art.js';
import {fetchJson} from './runtime_data.js';
import {tr} from './locale_runtime.js';
import {petIdleLift} from './view_adventure_pet_mood.js';
import {homeHeldPointerTarget} from './home_walk_core.js';
import {homeFurnitureDragPosition,homeStrokeCells} from './home_edit_core.js';
import {createFrameMeter,createFramePacer} from './frame_meter_core.js';

const el=(tag,cls='',...children)=>{
 const e=document.createElement(tag);
 if(cls)e.className=cls;
 for(const child of children){
  if(child==null)continue;
  e.append(typeof child==='object'?child:tr(child));
 }
 return e;
};
const button=(text,fn,cls='secondary')=>{const b=el('button',cls,text);b.type='button';b.onclick=fn;return b;};
const activities={sleep:'睡觉',sit:'坐下休息',eat:'吃饭',drink:'喝水',bathe:'洗澡',swing:'荡秋千',slide:'玩滑梯',ball:'玩球',read:'读书',water:'浇花',dance:'跳舞',picnic:'野餐'};
const COLOR_HEX={red:'#dc7065',blue:'#70a5ce',green:'#8eb679',yellow:'#eac773',pink:'#e4a2b3',purple:'#b19ac9',white:'#f5efdf',orange:'#e5a061',brown:'#b98b61'};
const INTERACTIVE_BADGES={light:'可点亮',music:'可演奏',water:'流水互动',cook:'烹饪互动',screen:'屏幕互动'};
const CATEGORY_PRIORITY={blocks:-1,garden:0,play:1,building:2,party:3,living:4,bedroom:5,kitchen:6,bathroom:7};

export function createHomeView(root,cb){
 root.replaceChildren();root.className='overlay visible';
 const modal=el('section','modal home-modal'),header=el('header','modal-header'),title=el('h2','','家园'),body=el('div','home-body'),status=el('p','home-status');
 modal.setAttribute('role','dialog');modal.setAttribute('aria-label','宠物家园');modal.setAttribute('aria-modal','true');status.setAttribute('role','status');
 header.append(title,createCloseButton(cb.close));modal.append(header,body,status);root.append(modal);
 let model=null,mode='',signature='',exampleSignature='',gesture=null,catalogDrag=null,hits=[],frame=0,dead=false,lastPaint=0,activeDialog=null;
 const images=new Map(),terrain=createHomeTerrainCache();
 const frameMeter=createFrameMeter(),framePacer=createFramePacer();
 let fpsLabel,spellTip=null,summonAudioCtx=null;
 let statusTimer=0,lastStatus='';
 const summonEffects=[];
 const DEFAULT_SUMMON_TIP='读出或输入上方任意句子即可建造';
 function playSummonChime(){
  if(model?.quiet||document.hidden)return;
  const AudioCtx=globalThis.AudioContext||globalThis.webkitAudioContext;
  if(!AudioCtx)return;
  try{
   summonAudioCtx??=new AudioCtx();
   if(summonAudioCtx.state==='suspended')void summonAudioCtx.resume().catch(()=>{});
   const now=summonAudioCtx.currentTime;
   [523.25,659.25,783.99,1046.5].forEach((freq,i)=>{
    const osc=summonAudioCtx.createOscillator(),gain=summonAudioCtx.createGain();
    osc.type=i===3?'triangle':'sine';
    const t=now+i*.075,dur=i===3?.28:.18;
    osc.frequency.setValueAtTime(freq,t);
    osc.frequency.exponentialRampToValueAtTime(freq*1.02,t+dur);
    gain.gain.setValueAtTime(.0001,t);
    gain.gain.exponentialRampToValueAtTime(.08,t+.015);
    gain.gain.exponentialRampToValueAtTime(.0001,t+dur);
    osc.connect(gain);gain.connect(summonAudioCtx.destination);
    osc.start(t);osc.stop(t+dur+.02);
   });
  }catch{}
 }
 let canvas,ctx,stage,side,items,category,catPills,tabs,input,example,bubble,bubbleText,tools,choice,summary,portal,edit,petMode=false;
 const motionTrail=createMotionTrail(7319);
 const heroActor=createHeroActor(7419),secondActor=createHeroActor(7420);
 let prevSecondPos=null;
 let prevHeroPos=null,fallbackHero=null,fallbackHeroLoading=false;
 let envArt=null,decorArt=null;

 const imageFor=art=>{
  const url=model?.assetMode==='local'&&art?.local?art.local:art?.cdn||art?.local;
  if(!url)return null;
  let image=images.get(url);
  if(!image){
   image=new Image();
   image.crossOrigin='anonymous';
   image.src=url;
   images.set(url,image);
   if(images.size>128)images.delete(images.keys().next().value);
  }
  return image;
 };

 const buildings=createHomeBuildingCache({imageFor,enabled:!new URLSearchParams(location.search).has('noBuildingCache')});
 let paintStroke=null,eraseStroke=null,hoverPoint=null,buildTip=null,historyTools=null,showGrid=false;
 let cancelScenePointer=()=>{};
 let worldAtlasesPromise=null,terrainMissing=Infinity;
 function ensureWorldAtlases(){
  if(worldAtlasesPromise)return worldAtlasesPromise;
  const modeKey=model?.assetMode==='local'?'local':'cdn';
  worldAtlasesPromise=Promise.all([
   loadEnvironmentArt(modeKey,fetchJson,'data/adventure/environment-art.json'),
   loadEnvironmentArt(modeKey,fetchJson,'data/adventure/terrain-decoration-art.json')
  ]).then(async([env,decor])=>{
   await Promise.all([[env,['camp','campTrees','islandTrees','trees']],[decor,['meadow','stones','shore']]].flatMap(([art,keys])=>keys.filter(key=>art.manifest.atlases[key]).map(key=>art.ensure(key))));
   if(dead)return;
   envArt=env;decorArt=decor;terrain.clear();terrainMissing=Infinity;
  }).catch(error=>{worldAtlasesPromise=null;throw error;});
  return worldAtlasesPromise;
 }

 function ensureFallbackHero(){
  if(cb.drawHero||fallbackHero||fallbackHeroLoading)return;
  fallbackHeroLoading=true;
  loadHeroLibrary(fetchJson,{mounts:[],mountByItem:{}},{local:model?.assetMode==='local'}).then(h=>{
   if(!dead)fallbackHero=h;
  }).catch(()=>{});
 }

 const editKey=e=>{
  if(!model?.home||e.target.closest?.('input,textarea,select,[contenteditable=true],dialog')||modal.querySelector('dialog[open]')||e.altKey)return;
  const key=e.key.toLowerCase(),command=e.ctrlKey||e.metaKey;
  if(model.build&&command&&(key==='z'||key==='y')){e.preventDefault();e.stopPropagation();if(!e.repeat){cancelScenePointer();run(key==='y'||e.shiftKey?cb.redo:cb.undo);}return;}
  if(model.build&&!command&&key==='g'){e.preventDefault();if(!e.repeat){showGrid=!showGrid;render(model);}}
 };
 window.addEventListener('keydown',editKey);
 const blurEdit=()=>cancelScenePointer();
 window.addEventListener('blur',blurEdit);
 const hideEdit=()=>{if(document.hidden)cancelScenePointer();};
 document.addEventListener('visibilitychange',hideEdit);
 const run=fn=>Promise.resolve().then(fn).catch(cb.error);

 function openNameDialog({trigger,home:targetHome=null}={}){
  activeDialog?.destroy();
  const isRename=!!targetHome;
  const dialog=new DetailDialog(modal,{el,title:tr(isRename?'重命名':'新建家园'),className:'equipment-item-dialog home-name-dialog'});
  activeDialog=dialog;
  dialog.dialog.addEventListener('close',()=>{if(activeDialog===dialog)activeDialog=null;dialog.dialog.remove();});

  const banner=el('div','home-dialog-banner');
  const biomeBadges=el('div','home-dialog-biomes');
  for(const b of [HOME_BIOMES.meadow,HOME_BIOMES.blossom,HOME_BIOMES.mystic]){
   const badge=el('span','home-dialog-biome-pill',b.name);
   badge.style.setProperty('--biome-dot',b.grassA);
   biomeBadges.append(badge);
  }
  banner.append(
   biomeBadges,
   el('strong','home-dialog-lead','为伙伴创造一个家'),
   el('p','home-dialog-sub','说出一句话，召唤一件家具。拖动宠物，一起生活。')
  );

  const existing=new Set((model?.homes||[]).map(h=>h.name));
  const presetBiomes=Object.values(HOME_BIOMES);
  const heroDefault=model?.heroSave?.name?`${model.heroSave.name}${tr('的家园')}`:'';
  const defaultName=isRename
   ?targetHome.name
   :(heroDefault&&!existing.has(heroDefault)?heroDefault:tr((presetBiomes.find(b=>!existing.has(tr(b.name)))||presetBiomes[0]).name));

  const form=el('form','home-dialog-form');
  const label=el('label','home-dialog-label','新家园的名字');
  label.htmlFor='home-name-input';
  const nameInput=el('input','home-name-input');
  nameInput.id='home-name-input';
  nameInput.type='text';
  nameInput.maxLength=40;
  nameInput.autocomplete='off';
  nameInput.placeholder=tr('给家园起个名字，开始创造。');
  nameInput.value=defaultName;

  const presets=el('div','home-name-presets');
  const presetBtns=presetBiomes.map(b=>{
   const text=tr(b.name);
   const chip=button(b.name,()=>{
    nameInput.value=text;
    refreshState();
    nameInput.focus();
   },'home-name-chip');
   chip.style.setProperty('--biome-dot',b.grassA);
   presets.append(chip);
   return {chip,text};
  });

  const cancelBtn=button('取消',()=>dialog.close(),'secondary');
  const submitBtn=button(isRename?'重命名':'新建家园',()=>submit(),'primary');

  function refreshState(){
   const trimmed=nameInput.value.trim();
   submitBtn.disabled=!trimmed;
   for(const {chip,text} of presetBtns){
    const active=trimmed===text;
    chip.classList.toggle('is-active',active);
    chip.setAttribute('aria-pressed',String(active));
   }
  }
  function submit(){
   const trimmed=nameInput.value.trim().slice(0,40);
   if(!trimmed)return;
   dialog.close();
   if(isRename)run(()=>cb.rename(targetHome,trimmed));
   else run(()=>cb.create(trimmed));
  }
  nameInput.oninput=refreshState;
  form.onsubmit=e=>{e.preventDefault();submit();};
  form.append(label,nameInput,presets);
  dialog.body.append(banner,form);
  dialog.footer.append(cancelBtn,submitBtn);
  refreshState();
  dialog.open(trigger);
  nameInput.focus({preventScroll:true});
  nameInput.select();
 }

 function openRemoveDialog(targetHome,trigger){
  if(!targetHome)return;
  activeDialog?.destroy();
  const dialog=new DetailDialog(modal,{el,title:tr('删除家园'),className:'equipment-item-dialog home-name-dialog'});
  activeDialog=dialog;
  dialog.dialog.addEventListener('close',()=>{if(activeDialog===dialog)activeDialog=null;dialog.dialog.remove();});
  const msg=el('p','home-dialog-confirm-text');
  msg.textContent=`${tr('删除')}“${targetHome.name}”？${tr('此操作不能撤销。')}`;
  const cancelBtn=button('取消',()=>dialog.close(),'secondary');
  const confirmBtn=button('删除家园',()=>{dialog.close();run(()=>cb.remove(targetHome,true));},'primary danger');
  dialog.body.append(msg);
  dialog.footer.append(cancelBtn,confirmBtn);
  dialog.open(trigger);
 }

 function manager(){
  body.replaceChildren();body.className='home-body home-manager';
  const heroBanner=el('div','home-manager-banner');
  const bannerText=el('div','home-manager-banner-text');
  bannerText.append(el('h3','','选择或创建家园'));
  heroBanner.append(bannerText);
  const list=el('div','home-directory');list.setAttribute('aria-label','家园列表');
  for(const home of model.homes||[]){
   const card=button('',()=>run(()=>cb.enter(home)),'home-card home-entry');
   card.setAttribute('aria-label',home.name);
   if(home.visit?.preview?.startsWith('data:image/')||home.localVisit?.preview?.startsWith('data:image/')){
    const previewUrl=home.localVisit?.preview||home.visit?.preview;
    const preview=el('img','home-entry-preview');
    preview.src=previewUrl;preview.width=400;preview.height=300;preview.alt=tr('上次离开时的家园');
    card.append(preview);
   }else{
    const placeholder=el('div','home-entry-placeholder');
    const b=homeBiomeAt(home.seed||1,0,0);
    placeholder.style.background=`linear-gradient(135deg, ${b.grassA}, ${b.waterShallow})`;
    placeholder.append(el('span','home-entry-biome-tag',b.name));
    card.append(placeholder);
   }
   const info=el('span','home-entry-info');
   info.append(el('strong','',home.name));
   const visit=home.localVisit,updated=Math.max(home.updatedAt||0,visit?.lastPlayedAt||0);
   info.append(
    el('small','',`${tr('更新于')} ${updated?new Date(updated).toLocaleString():tr('暂无记录')}`),
    el('small','',`${tr('已游玩')} ${visit?.playedMs?Math.floor(visit.playedMs/60000)>0?`${Math.floor(visit.playedMs/60000)} ${tr('分钟')}`:tr('不足1分钟'):tr('暂无记录')}`)
   );
   card.append(info);list.append(card);
  }
  const createBtn=button('新建家园',e=>openNameDialog({trigger:e.currentTarget}),'home-card home-entry home-new');
  list.append(createBtn);
  body.append(heroBanner,list);
 }

 function closeSummonDrawer(){if(!body)return;body.dataset.drawer='build';signature='';render(model);canvas?.focus();}
 function openSummonDrawer(){
  if(!body)return;
  body.dataset.drawer='summon';
  petMode=false;
  cb.mode(true);
  signature='';
  render(model);
  input?.focus();
 }

 function scene(){
  void ensureWorldAtlases().catch(()=>{});
  ensureFallbackHero();
  terrain.clear();
  exampleSignature='';body.dataset.drawer='';body.replaceChildren();body.className='home-body home-play';
  const main=el('div','home-main');

  // Settings Drawer Toolbar (only shown when dock '家园设置' is active)
  tools=el('div','home-toolbar');
  tools.append(
   button('同步当前家园',()=>run(cb.sync)),
   button('重试加载',()=>run(cb.reload)),
   button('听宠物愿望',()=>run(cb.speakWish)),
   button('帮它实现',cb.helpWish),
   button('重命名',e=>openNameDialog({trigger:e.currentTarget,home:model.home})),
   button('删除家园',e=>openRemoveDialog(model.home,e.currentTarget)),
   button('安静模式',cb.quiet)
  );

  stage=el('div','home-stage');
  canvas=el('canvas','home-canvas');
  canvas.tabIndex=0;
  canvas.setAttribute('aria-label','家园土地，点击地面或方向键控制主角移动，按住设施拖动摆放');
  ctx=canvas.getContext('2d');

  // Interactive Pet Wish Bubble
  bubble=el('div','home-bubble-wrap');
  bubble.hidden=true;
  bubbleText=button('',()=>model.wish?.expanded?cb.translate():cb.openWish(),'home-bubble');
  const bubbleActions=el('div','home-bubble-actions');
  const listenBtn=button('朗读',()=>run(cb.speakWish),'home-bubble-mini');
  const fulfillBtn=button('帮它实现',cb.helpWish,'home-bubble-mini primary');
  bubbleActions.append(listenBtn,fulfillBtn);
  bubble.append(bubbleText,bubbleActions);

  // Invisible accessible hit target over the (0,0) crystal portal
  portal=button('返回冒险',cb.close,'home-portal');
  portal.setAttribute('aria-label',tr('返回冒险'));
  fpsLabel=el('div','home-fps','FPS —');
  fpsLabel.setAttribute('aria-label','家园帧率');
  frameMeter.sample(0,false);
  stage.append(canvas,portal,bubble,fpsLabel);
  main.append(tools,stage);

  // Magic Voice / Summon Spell Bar — ONLY visible when summoning (data-drawer="summon")
  const form=el('form','home-summon');
  input=el('input');
  input.placeholder='I want a chair.';
  input.maxLength=200;
  input.setAttribute('aria-label','召唤句子');
  input.autocomplete='off';
  const mic=button('按住说话',()=>{});
  mic.classList.add('home-mic');
  mic.onpointerdown=e=>{e.preventDefault();mic.setPointerCapture(e.pointerId);run(cb.record);};
  mic.onpointerup=()=>run(cb.finish);
  mic.onpointercancel=()=>run(cb.cancelVoice);
  mic.onkeydown=e=>{if(e.code==='Space'&&!e.repeat){e.preventDefault();run(cb.record);}};
  mic.onkeyup=e=>{if(e.code==='Space'){e.preventDefault();run(cb.finish);}};
  const readingClose=createCloseButton(()=>{cb.cancel();run(cb.cancelVoice);closeSummonDrawer();});readingClose.setAttribute('aria-label','关闭阅读');
  form.append(readingClose,input,button('召唤',()=>run(()=>cb.summon(input.value)),'primary'),mic);
  form.onsubmit=e=>{e.preventDefault();run(()=>cb.summon(input.value));};

  example=el('div','home-example');
  choice=el('div','home-choices');
  const composer=el('section','home-composer',example,choice,form);
  main.append(composer);

  // Build & Inventory Sidebar Drawer
  side=el('aside','home-sidebar');
  const trayHeader=el('div','home-sidebar-header');
  tabs=el('strong','home-drawer-title',tr('户外与家园设施'));
  const trayClose=createCloseButton(()=>{body.dataset.drawer='';cb.mode(false);signature='';render(model);});
  const done=button('完成布置',()=>{body.dataset.drawer='';cb.mode(false);canvas.focus();},'primary home-edit-done');
  trayHeader.append(tabs,done,trayClose);

  category=el('select','home-category-select');
  category.setAttribute('aria-label','物品分类');
  category.append(new Option(tr('全部分类'),''));
  for(const c of model.catalog.categories)category.append(new Option(tr(c.name),c.id));
  category.value=cb.initialCategory||'';
  category.onchange=()=>{signature='';render(model);};

  // Visual Category Filter Pills (outdoor categories first)
  catPills=el('div','home-category-pills');
  const allPill=button('全部',()=>{category.value='';signature='';render(model);},'home-cat-pill');
  allPill.dataset.cat='';
  catPills.append(allPill);
  for(const c of model.catalog.categories){
   const p=button(c.name,()=>{category.value=c.id;signature='';render(model);},'home-cat-pill');
   p.dataset.cat=c.id;
   catPills.append(p);
  }

  summary=el('p','home-summary');
  items=el('div','home-items');
  trayHeader.insertBefore(catPills,done);
  side.append(trayHeader,summary,items);
  // Capture on the stable tray: selecting an item may rebuild its card.
  let trayGesture=null,suppressTrayClick=false,petGhost=null;
  const overScene=e=>document.elementFromPoint(e.clientX,e.clientY)===canvas;
  const finishTray=(e,cancelled=false)=>{
   if(!trayGesture||trayGesture.id!==e.pointerId)return;
   const g=trayGesture;trayGesture=null;catalogDrag=null;
   petGhost?.remove();petGhost=null;
   body.classList.remove('is-dragging-item');
   if(side.hasPointerCapture(e.pointerId))side.releasePointerCapture(e.pointerId);
   if(g.active){
    suppressTrayClick=true;
    if(!cancelled&&overScene(e)){
     const point=position(e);
     if(g.petId){
      const rect=canvas.getBoundingClientRect();
      point.x=model.camera.x+(point.sx-rect.width/2)/model.scale;
      point.y=model.camera.y+(point.sy-rect.height/2)/model.scale;
     }
     run(()=>g.petId?cb.drop({kind:'pet',id:g.petId},point):cb.take(g.row,point));
    }
    else cb.cancel();
    signature='';render(model);
   }
  };
  side.onpointerdown=e=>{
   // A new gesture must not inherit the synthetic-click suppression of a drag.
   suppressTrayClick=false;
   const card=e.target.closest('.home-item,.home-pet-card');
   if(!card||card.classList.contains('home-template')||e.button!==0||trayGesture)return;
   suppressTrayClick=false;
   trayGesture={id:e.pointerId,x:e.clientX,y:e.clientY,row:{...card.homeItem},petId:card.homePetId,card,active:false};
  };
  side.onpointermove=e=>{
   const g=trayGesture;if(!g||g.id!==e.pointerId)return;
   const dx=e.clientX-g.x,dy=e.clientY-g.y;
   if(!g.active){
    if(Math.hypot(dx,dy)<8)return;
    // Horizontal swipes remain native tray scrolling; upward pulls pick up furniture.
    if(Math.abs(dx)>Math.abs(dy))return;
    side.setPointerCapture(e.pointerId);
    g.active=true;catalogDrag=g.row;
    if(g.petId){
     cb.stopWalk();
     petGhost=el('div','home-pet-drag-preview');
     const portrait=g.card.querySelector('canvas'),copy=el('canvas');
     copy.width=portrait.width;copy.height=portrait.height;
     copy.getContext('2d').drawImage(portrait,0,0);
     petGhost.append(copy,el('span','',g.card.textContent));
     petGhost.setAttribute('aria-hidden','true');body.append(petGhost);
    }else cb.select(g.row.itemId,g.row.color,g.row.fromInventory);
    body.classList.add('is-dragging-item');
   }
   e.preventDefault();
   if(petGhost){petGhost.style.left=`${e.clientX}px`;petGhost.style.top=`${e.clientY}px`;}
   else cb.hover(overScene(e)?position(e):null);
  };
  side.onpointerup=e=>finishTray(e);
  side.onpointercancel=e=>finishTray(e,true);
  side.onlostpointercapture=e=>finishTray(e,true);
  side.addEventListener('click',e=>{if(suppressTrayClick){e.preventDefault();e.stopPropagation();suppressTrayClick=false;}},true);
  side.addEventListener('keydown',e=>{
   if(e.key==='Escape'&&trayGesture){e.stopPropagation();finishTray({pointerId:trayGesture.id},true);}
  });

  // Clean Bottom Game Hotbar Dock (no extra roam button; summon button reveals 按住说话)
  const dock=el('nav','home-dock');
  dock.setAttribute('aria-label','家园操作栏');
  const show=kind=>{
   const same=body.dataset.drawer===kind;
   body.dataset.drawer=same?'':kind;
   petMode=kind==='pets';
   cb.mode(!same&&(kind==='build'||kind==='stock'||kind==='summon'));
   signature='';
   render(model);
   if(!same&&kind==='summon')input?.focus();
  };
  dock.append(
   button('建造',()=>show('build'),'home-dock-button'),
   button('语音召唤',()=>show('summon'),'home-dock-button'),
   button('宠物背包',()=>show('pets'),'home-dock-button'),
   button('家园设置',()=>show('settings'),'home-dock-button')
  );
  const dockPaths=[
   'M4 20 14 10 M12 4 16 2 22 8 18 12 12 6Z',
   'M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3Z M19 10v1a7 7 0 0 1-14 0v-1 M12 18v4 M8 22h8',
   'M7 13 Q12 8 17 13 L20 18 Q20 22 15 20 Q12 18 9 20 Q4 22 4 18Z M5 5 5 8 M10 2 10 6 M15 2 15 6 M20 5 20 8',
   'M4 6 20 6 M4 12 20 12 M4 18 20 18 M8 3 8 9 M16 9 16 15 M10 15 10 21'
  ];
  [...dock.children].forEach((b,i)=>{
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS(svg.namespaceURI,'path');
   svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
   path.setAttribute('d',dockPaths[i]);svg.append(path);b.prepend(svg);
  });

  // World-space contextual floating action wheel for selected objects
  edit=el('div','home-edit-actions');
  const iconAction=(label,path,fn,cls='')=>{
   const b=button('',()=>run(fn),'home-wheel-btn '+cls);
   b.title=tr(label);b.setAttribute('aria-label',tr(label));
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
   svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
   const shape=document.createElementNS(svg.namespaceURI,'path');shape.setAttribute('d',path);
   svg.append(shape);b.append(svg);return b;
  };
  const enlarge=iconAction('放大家具','M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5 M8 12h8 M12 8v8',()=>cb.resizeFurniture(.25));
  const shrink=iconAction('缩小家具','M4 9h5V4 M15 4v5h5 M20 15h-5v5 M9 20v-5H4 M10 12h4',()=>cb.resizeFurniture(-.25));
  enlarge.dataset.resize='up';shrink.dataset.resize='down';
  edit.append(
   iconAction('旋转','M20 8a8 8 0 1 0 0 8 M20 3v5h-5',cb.rotate),
   iconAction('互动','M12 3v9 M6.3 5.6a8 8 0 1 0 11.4 0',()=>cb.toggleActive?.(),'home-interaction-toggle'),
   enlarge,shrink,
   iconAction('物品属性','M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',()=>{if(!model.selection?.id)return;activeDialog?.destroy();activeDialog=openBuildingProperties(modal,{el,button,obj:model.selection,item:buildingItem(model.selection,model.catalog.items),save:cb.properties});}),
   iconAction('收回','M3 9h18v12H3Z M3 9l3-5h3 M21 9l-3-5h-3 M12 2v12 M8 10l4 4 4-4',cb.recall,'danger'),
   iconAction('取消选择','m6 6 12 12 M18 6 6 18',cb.cancel)
  );
  main.append(edit);

  // Minimal Top-Left Island Pill + Top-Right Standard Close Button
  const topbar=el('div','home-world-heading');
  const closeBtn=button('返回',cb.close,'home-return-button');
  topbar.append(
   closeBtn,
   button('家园列表',()=>run(cb.back),'home-nav-pill'),
   el('strong','home-world-name',model.home.name),
   el('span','home-capacity home-nav-pill'),
   button('显示屋顶',cb.roofs,'home-roof-toggle home-nav-pill')
  );

  historyTools=el('div','home-build-tools');
  const undo=button('撤销',()=>{cancelScenePointer();run(cb.undo);});undo.dataset.history='undo';undo.title='撤销（Ctrl / ⌘ + Z）';
  const redo=button('重做',()=>{cancelScenePointer();run(cb.redo);});redo.dataset.history='redo';redo.title='重做（Ctrl + Y / ⌘ + Shift + Z）';
  historyTools.append(undo,redo);
  buildTip=el('div','home-build-tip');buildTip.setAttribute('role','tooltip');buildTip.hidden=true;
  body.append(main,side,topbar,dock,historyTools,buildTip);

  canvas.onpointerdown=e=>{
   if(gesture||paintStroke||eraseStroke)return;
   const target=hitAt(position(e));
   if(e.button===1&&model.build){e.preventDefault();if(target?.kind==='object')cb.pick(target.id);return;}
   if(e.button===2&&model.build){e.preventDefault();canvas.focus();canvas.setPointerCapture(e.pointerId);eraseStroke={id:e.pointerId,group:crypto.randomUUID(),seen:new Set()};eraseAt(position(e));return;}
   if(e.button!==0)return;
   canvas.focus();
   canvas.setPointerCapture(e.pointerId);
   const p=position(e);
   const hit=hitAt(p);hoverPoint=p;
   if(model.build&&model.selection&&!model.selection.id&&buildingItem(model.selection,model.catalog.items)?.building&&hit?.kind!=='object'&&hit?.kind!=='pet'){
    paintStroke={seen:new Set(),row:{...model.selection},id:e.pointerId,group:crypto.randomUUID()};paintAt(p);return;
   }
   gesture={
    pendingPaint:model.build&&hit?.kind==='object'&&model.selection&&!model.selection.id&&buildingItem(model.selection,model.catalog.items)?.building?{...model.selection}:null,
    start:p,
    last:p,
    hit,
    origin:hit?.kind==='object'?model.objects.find(o=>o.id===hit.id):null,
    id:e.pointerId,
    since:performance.now(),
    steering:false,
    moved:false
   };
  };
  canvas.oncontextmenu=e=>{if(model.build)e.preventDefault();};
  canvas.onpointerleave=()=>{if(!gesture&&!paintStroke&&!eraseStroke){hoverPoint=null;cb.hover(null);if(buildTip)buildTip.hidden=true;}};
  canvas.onpointermove=e=>{
   hoverPoint=model.build?position(e):null;
   if((paintStroke||eraseStroke)&&document.elementFromPoint(e.clientX,e.clientY)!==canvas){if(paintStroke)paintStroke.last=null;if(eraseStroke)eraseStroke.last=null;hoverPoint=null;cb.hover(null);return;}
   if(eraseStroke){if(eraseStroke.id===e.pointerId)eraseAt(hoverPoint);return;}
   if(paintStroke){if(paintStroke.id===e.pointerId)paintAt(position(e));return;}
   if(!gesture&&model.build&&model.selection&&!model.selection.id&&buildingItem(model.selection,model.catalog.items)?.building)cb.hover(position(e));
   if(gesture&&gesture.id!==e.pointerId)return;
   const p=position(e);
   if(!gesture)return;
   if(Math.hypot(p.sx-gesture.start.sx,p.sy-gesture.start.sy)>6)gesture.moved=true;
   if(gesture.moved&&gesture.pendingPaint){paintStroke={seen:new Set(),row:gesture.pendingPaint,id:e.pointerId,group:crypto.randomUUID()};const start=gesture.start;gesture=null;paintAt(start);paintAt(p);return;}
   if(gesture.moved&&gesture.hit&&(gesture.hit.kind==='pet'||gesture.hit.kind==='object')){
    cb.hover(gesture.origin&&!(gesture.origin.properties?.snap??buildingItem(gesture.origin,model.catalog.items)?.building?.snap??false)?homeFurnitureDragPosition(gesture.origin,gesture.start,p,model.scale):gesture.origin?{x:p.x+Math.floor(gesture.origin.x)-Math.floor(gesture.start.x),y:p.y+Math.floor(gesture.origin.y)-Math.floor(gesture.start.y)}:p,gesture.hit);
   }
   gesture.last=p;
  };
  canvas.onpointerup=e=>{
   if(eraseStroke?.id===e.pointerId){eraseStroke=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);return;}
   if(paintStroke?.id===e.pointerId){paintStroke=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);return;}
   if(!gesture||gesture.id!==e.pointerId)return;
   const g=gesture,p=position(e);
   gesture=null;
   if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
   if(g.steering){cb.stopWalk();return;}
   if(document.elementFromPoint(e.clientX,e.clientY)!==canvas&&g.hit?.kind!=='pet'){cb.hover(null);return;}
   if(g.pendingPaint&&!g.moved){run(()=>cb.take(g.pendingPaint,p));return;}
   if(g.moved&&g.hit&&(g.hit.kind==='pet'||g.hit.kind==='object')){
    run(()=>{
     if(g.hit.kind==='pet'){
      const dropTarget=document.elementFromPoint(e.clientX,e.clientY);
      if((body.dataset.drawer==='pets'&&side.contains(dropTarget))||dock.children[2].contains(dropTarget))return cb.recallPet(g.hit.id);
      const point=petDragPoint(g),r=canvas.getBoundingClientRect();
      return cb.drop(g.hit,{
       x:model.camera.x+(point.x-r.width/2)/model.scale,
       y:model.camera.y+(point.y-r.height/2)/model.scale
      });
     }
     return cb.drop(g.hit,g.origin&&!(g.origin.properties?.snap??buildingItem(g.origin,model.catalog.items)?.building?.snap??false)?homeFurnitureDragPosition(g.origin,g.start,p,model.scale):g.origin?{x:p.x+Math.floor(g.origin.x)-Math.floor(g.start.x),y:p.y+Math.floor(g.origin.y)-Math.floor(g.start.y)}:p);
    });
   }else if(!g.moved){
    if(g.hit?.kind==='portal')cb.close();
    else run(()=>cb.tap(g.hit,p));
   }
  };
  const cancelPointer=()=>{const id=gesture?.id??paintStroke?.id??eraseStroke?.id;paintStroke=null;eraseStroke=null;hoverPoint=null;if(gesture?.steering)cb.stopWalk();gesture=null;cb.hover(null);if(buildTip)buildTip.hidden=true;if(id!==undefined&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);};
  cancelScenePointer=cancelPointer;
  canvas.onpointercancel=cancelPointer;
  canvas.onlostpointercapture=cancelPointer;
  canvas.onwheel=e=>{e.preventDefault();cb.zoom(e.deltaY>0?.9:1.1);};
  canvas.onkeydown=e=>{
   if(e.ctrlKey||e.metaKey||e.altKey)return;
   const moves={
    ArrowLeft:[-3,0],a:[-3,0],A:[-3,0],
    ArrowRight:[3,0],d:[3,0],D:[3,0],
    ArrowUp:[0,-3],w:[0,-3],W:[0,-3],
    ArrowDown:[0,3],s:[0,3],S:[0,3]
   };
   if(moves[e.key]){
    e.preventDefault();
    cb.walk({x:model.hero.x+moves[e.key][0],y:model.hero.y+moves[e.key][1]});
   }
   if(e.key==='Escape'){e.stopPropagation();cancelPointer();cb.cancel();}
   if(e.key.toLowerCase()==='r'&&!e.repeat)cb.rotate();
   if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();if(!e.repeat)run(cb.recall);}
  };
 }

 function hitAt(p){return [...hits].reverse().find(h=>p.sx>=h.sx&&p.sx<=h.sx+h.sw&&p.sy>=h.sy&&p.sy<=h.sy+h.sh);}
 function eraseAt(p){
  hoverPoint=p;const stroke=eraseStroke;if(!stroke)return;const from=stroke.last||p,steps=Math.max(1,Math.ceil(Math.hypot(p.sx-from.sx,p.sy-from.sy)/6));
  for(let i=0;i<=steps;i++){const hit=hitAt({sx:from.sx+(p.sx-from.sx)*i/steps,sy:from.sy+(p.sy-from.sy)*i/steps});if(hit?.kind!=='object'||stroke.seen.has(hit.id))continue;stroke.seen.add(hit.id);run(()=>cb.erase(hit.id,stroke.group));}stroke.last=p;
 }
 function paintAt(p){
  const stroke=paintStroke;if(!stroke)return;cb.hover(p);
  for(const cell of homeStrokeCells(stroke.last||p,p)){
   const key=`${cell.x},${cell.y}`;if(stroke.seen.has(key))continue;stroke.seen.add(key);
   run(()=>cb.take({...stroke.row,fromInventory:true,group:stroke.group},cell));
  }
  stroke.last=p;
 }
 function petDragPoint(g){return {x:g.last.sx+g.hit.sx+g.hit.sw/2-g.start.sx,y:g.last.sy+g.hit.sy+g.hit.sh-20-g.start.sy};}
 function position(e){
  const r=canvas.getBoundingClientRect();
  return {
   sx:e.clientX-r.left,
   sy:e.clientY-r.top,
   x:model.camera.x+(e.clientX-r.left-r.width/2)/model.scale,
   y:model.camera.y+(e.clientY-r.top-r.height/2)/model.scale
  };
 }

 function render(next){
  if(dead)return;
  framePacer.wake();
  model=next;
  if(next.home){const capacity=homeCapacity(next.home),label=body.querySelector('.home-capacity');if(label){label.textContent=`容量 ${capacity.used===null?'待统计':capacity.used.toLocaleString('en-US')} / ${capacity.limit.toLocaleString('en-US')}`;label.title='每块积木或摆设占用1件容量；地形和宠物不计入';}}
  status.textContent=tr(next.status||'');
  if(next.unsaved)status.append(button('重试保存',()=>run(cb.retry),'primary'));
  const shouldHideStatus=!next.unsaved&&(!next.status||next.status===DEFAULT_SUMMON_TIP||body?.dataset.drawer==='summon'||next.status.startsWith('已保存到本机')||next.status==='宠物已安置，位置已保存到本机'||!next.home&&next.status==='家园自动保存到本机，云端同步由你手动开启。');
  const isSummonTipTransient=Boolean(next.status&&next.status!==DEFAULT_SUMMON_TIP&&!next.status.startsWith('已保存到本机')&&next.status!=='宠物已安置，位置已保存到本机'&&next.status!=='点击或拖动摆放，可连续创建；按 R 旋转。');
  const syncSpellTip=(transient=isSummonTipTransient)=>{
   if(!spellTip)return;
   spellTip.textContent=tr(transient?next.status:DEFAULT_SUMMON_TIP);
   spellTip.classList.toggle('is-transient',transient);
  };
  const statusKey=`${next.unsaved}:${next.status||''}`;
  if(statusKey!==lastStatus){
   lastStatus=statusKey;
   clearTimeout(statusTimer);
   status.hidden=shouldHideStatus;
   syncSpellTip(isSummonTipTransient);
   if((!shouldHideStatus||isSummonTipTransient)&&!next.unsaved){
    statusTimer=setTimeout(()=>{
     if(dead)return;
     if(!model?.unsaved)status.hidden=true;
     if(spellTip){spellTip.textContent=tr(DEFAULT_SUMMON_TIP);spellTip.classList.remove('is-transient');}
    },3000);
   }
  }else if(shouldHideStatus||next.unsaved){
   status.hidden=shouldHideStatus;
  }
  title.textContent=next.home?.name||tr('家园');
  const worldName=body.querySelector('.home-world-name');
  if(worldName)worldName.textContent=next.home?.name||'';
  const nextMode=next.home?'scene':'manager';
  root.classList.toggle('home-world-active',nextMode==='scene');
  modal.classList.toggle('home-world',nextMode==='scene');
  header.hidden=nextMode==='scene';
  modal.setAttribute('role',nextMode==='scene'?'region':'dialog');
  modal.setAttribute('aria-modal',String(nextMode!=='scene'));
  if(mode!==nextMode){
   mode=nextMode;signature='';paintStroke=null;eraseStroke=null;gesture=null;hoverPoint=null;
   if(mode==='scene')scene();
  }
  if(mode==='manager'){
   buildings.clear();terrain.clear();
   if(status.parentElement!==modal)modal.append(status);
   const key=JSON.stringify([next.homes,next.guests]);
   if(signature!==key){signature=key;manager();}
   return;
  }
  body.classList.toggle('is-building',!!next.build);

  if(historyTools){historyTools.hidden=!next.build;historyTools.querySelector('[data-history=undo]').disabled=!next.history?.canUndo||next.unsaved;historyTools.querySelector('[data-history=redo]').disabled=!next.history?.canRedo||next.unsaved;}
  if(!next.build){paintStroke=null;eraseStroke=null;hoverPoint=null;if(buildTip)buildTip.hidden=true;}
  const roofToggle=body.querySelector('.home-roof-toggle');if(roofToggle){roofToggle.setAttribute('aria-pressed',String(next.showRoofs));roofToggle.textContent=tr(next.showRoofs?'隐藏屋顶':'显示屋顶');}
  body.classList.toggle('has-selection',!!next.build&&!!next.selection?.id);
  if(edit){
   const size=next.selection?.sizeScale??1;
   const toggle=edit.querySelector('.home-interaction-toggle'),enabled=homeObjectInteractive(next.selection,next.catalog.items);
   toggle.disabled=!next.selection?.id;
   toggle.setAttribute('aria-pressed',String(enabled));
   const door=buildingItem(next.selection,next.catalog.items)?.building?.type==='door';
   const label=door?tr(next.selection?.doorOpen?'关门':'开门'):tr(enabled?'互动已开启，点击关闭自由拖动':'互动已关闭，点击开启自由拖动');
   toggle.setAttribute('aria-label',label);toggle.title=label;
   toggle.querySelector('path').setAttribute('d',enabled?'M12 3v9 M6.3 5.6a8 8 0 1 0 11.4 0':'M12 3v9 M6.3 5.6a8 8 0 1 0 11.4 0 M3 3l18 18');

   edit.querySelector('[data-resize=up]').disabled=!next.selection?.id||size>=2;
   edit.querySelector('[data-resize=down]').disabled=!next.selection?.id||size<=.5;
  }

  const drawerIdx={build:0,summon:1,pets:2,settings:3}[body.dataset.drawer];
  [...body.querySelectorAll('.home-dock-button')].forEach((b,i)=>b.setAttribute('aria-pressed',String(i===drawerIdx)));
  if(next.transcript!==undefined&&document.activeElement!==input)input.value=next.transcript;
  input.placeholder=next.lang==='en'?'I want a chair.':'我想要一把椅子。';
  tools.lastChild.setAttribute('aria-pressed',String(next.quiet));

  const nextExample=JSON.stringify([next.selection?.itemId,next.selection?.color,next.lang]);
  if(nextExample!==exampleSignature){
   exampleSignature=nextExample;
   if(next.selection?.itemId&&!next.selection.id){
    const item=[...next.catalog.items,...(next.practiceItems||[])].find(i=>i.id===next.selection.itemId);
    example.replaceChildren();
    const chipRow=el('div','home-example-chips');
    for(const [index,sentence] of summonSentences(item,next.lang,next.selection.color).entries()){
     const row=el('div','home-spell-line'),textSpan=el('span','home-spell-text',sentence);
     textSpan.dataset.sentence=sentence;
     row.append(el('span','home-spell-level',['简单','进阶','挑战'][index]),textSpan,button('听示范',()=>run(()=>cb.speak(sentence)),'home-sentence-chip'));
     chipRow.append(row);
    }
    const swatchRow=el('div','home-swatch-row');
    const colors=el('select','home-color-select-sr');
    colors.setAttribute('aria-label','家具颜色');
    colors.append(new Option('原色',''));
    for(const [key,label] of Object.entries(COLORS))colors.append(new Option(tr(label),key));
    colors.value=next.selection.color||'';
    colors.onchange=()=>cb.color(colors.value);
    swatchRow.append(colors);
    const defaultDot=button('原色',()=>cb.color(''),'home-color-dot'+(next.selection.color?'':' is-active'));
    if(!item.templateId)swatchRow.append(defaultDot);
    for(const [key,label] of (item.templateId?[]:Object.entries(COLORS))){
     const dot=button('',()=>cb.color(key),'home-color-dot'+(next.selection.color===key?' is-active':''));
     dot.style.setProperty('--swatch',COLOR_HEX[key]||'#ccc');
     dot.title=tr(label);
     dot.setAttribute('aria-label',`染为${tr(label)}`);
     swatchRow.append(dot);
    }
    if(!item.templateId)swatchRow.append(el('span','home-swatch-break'));
    spellTip=el('span','home-spell-tip',DEFAULT_SUMMON_TIP);
    syncSpellTip();
    swatchRow.append(spellTip,button('取消召唤',()=>{cb.cancel();body.dataset.drawer='build';signature='';render(model);},'home-speak-btn'));
    example.append(chipRow,swatchRow);
   }else{
    spellTip=el('span','home-spell-tip',DEFAULT_SUMMON_TIP);
    syncSpellTip();
    example.replaceChildren(spellTip);
   }
  }

  choice.replaceChildren();
  for(const candidate of next.candidates||[]){
   const item=[...next.catalog.items,...(next.practiceItems||[])].find(i=>i.id===candidate.itemId);
   choice.append(button(item.zh,()=>run(()=>cb.choose(candidate))));
  }

  const key=JSON.stringify([category.value,petMode,(next.petBag||next.pets)?.map(p=>[p.id,p.name,p.stage,p.art,p.activity]),next.selection?.itemId,next.selection?.color]);
  if(catalogDrag||key===signature)return;
  signature=key;
  tabs.textContent=tr(petMode?'家园宠物背包':'户外与家园设施');
  side.setAttribute('aria-label',tabs.textContent);
  category.hidden=petMode;
  catPills.hidden=petMode;
  if(!petMode){
   [...catPills.children].forEach(p=>p.classList.toggle('is-active',p.dataset.cat===category.value));
  }
  items.replaceChildren();
  if(petMode){
   const pets=next.petBag||next.pets;
   summary.textContent=tr('拖入场景放出宠物；拖回背包或底部宠物背包按钮即可收回。');
   for(const pet of pets){
    const row=el('div','home-pet-card');
    row.homePetId=pet.id;
    const infoBtn=button('',()=>{},'home-pet-name-btn');
    const portrait=el('canvas','home-pet-portrait');
    portrait.width=80;portrait.height=80;portrait.setAttribute('aria-hidden','true');
    const portraitImage=imageFor(pet.art);
    const drawPortrait=()=>{
     const c=portrait.getContext('2d');c.clearRect(0,0,80,80);
     if(portraitImage?.complete&&portraitImage.naturalWidth){
      const cols=pet.art.cols||1,rows=pet.art.rows||1,stageIdx=Math.max(0,Math.min(rows-1,pet.stage||0));
      const w=portraitImage.naturalWidth/cols,h=portraitImage.naturalHeight/rows,k=72/Math.max(w,h);
      c.drawImage(portraitImage,0,stageIdx*h,w,h,(80-w*k)/2,(80-h*k)/2,w*k,h*k);
     }else{c.fillStyle='#58734a';c.font='bold 32px sans-serif';c.textAlign='center';c.fillText(Array.from(pet.name||'?')[0],40,51);}
    };
    if(portraitImage&&!portraitImage.complete)portraitImage.addEventListener('load',()=>{if(portrait.isConnected)drawPortrait();},{once:true});
    drawPortrait();
    infoBtn.append(portrait,el('span','home-pet-name',pet.name));
    row.append(infoBtn);
    items.append(row);
   }
   return;
  }

  // Sort items so outdoor facilities (garden, play, building, party) appear first
  const rows=next.catalog.items
   .filter(i=>!category.value||i.category===category.value)
   .slice()
   .sort((a,b)=>(CATEGORY_PRIORITY[a.category]??9)-(CATEGORY_PRIORITY[b.category]??9));

  summary.textContent=tr('点击物品练习召唤；拖到场景可指定召唤位置。');
  if(category.value==='blocks'){
   for(const template of BUILDING_TEMPLATES){

    const card=button('',()=>run(()=>cb.practiceTemplate(template.id)),'home-item home-template');
    card.setAttribute('aria-label',template.name+'模板');
    card.title='阅读后创建完整建筑';
    const thumb=el('canvas','home-item-thumb');thumb.width=120;thumb.height=92;
    const c=thumb.getContext('2d');c.translate(8,20);c.scale(100/(template.width*40),65/(template.depth*40));
    const objects=buildingTemplateObjects(template.id);
    for(const o of objects.filter(o=>!o.itemId.endsWith('-roof')).sort((a,b)=>a.y-b.y)){const item=buildingItem(o,next.catalog.items);drawBuilding(c,item,o,imageFor(item.art),buildingConnectionMask(o,objects,next.catalog.items));}
    const meta=el('div','home-item-meta');meta.append(el('strong','',template.name+' · 模板'),el('small','','阅读后创建完整建筑'));
    card.append(thumb,meta);items.append(card);
   }
  }
  for(const item of rows){
   const variants=[{color:''}];
   for(const v of variants){
    const isSelected=next.selection?.itemId===item.id&&(next.selection?.color||'')===v.color;
    const card=button('',()=>{
     if(!requiresReading(item))cb.select(item.id,v.color,true);
     else cb.practice(item.id,v.color);
    },'home-item'+(isSelected?' is-selected':''));
    card.setAttribute('aria-label',`${COLORS[v.color]||''}${item.zh}`);
    card.title=`${COLORS[v.color]||''}${item.zh} · ${item.en}`;
    card.homeItem={itemId:item.id,color:v.color,fromInventory:false};
    card.draggable=false;
    const thumb=el('canvas','home-item-thumb');
    thumb.width=120;thumb.height=92;
    const artImg=imageFor(item.art);
    if(artImg&&!artImg.complete){
     artImg.addEventListener('load',()=>{if(thumb.isConnected)drawHomeObject(thumb.getContext('2d'),item,{color:v.color},10,12,100,68,artImg,0,true);},{once:true});
    }
    drawHomeObject(thumb.getContext('2d'),item,{color:v.color},10,12,100,68,artImg,0,true);
    const meta=el('div','home-item-meta');
    meta.append(el('strong','',`${COLORS[v.color]||''}${item.zh}`),el('small','',isSelected?tr(!requiresReading(item)?'直接摆放 · R旋转':'念咒语召唤'):item.en));
    const kind=homeInteractiveKind(item.id);
    if(kind||item.activity){
     const badge=el('span','home-item-badge',tr(INTERACTIVE_BADGES[kind]||activities[item.activity]||'可互动'));
     card.append(badge);
    }
    card.append(thumb,meta);
    items.append(card);
   }
  }
  if(!items.children.length)items.append(el('p','home-empty-hint','这里还没有物品，请在「建造」中选择物品并练习召唤咒语。'));
 }

 function paint(now){
  frame=requestAnimationFrame(paint);
  if(dead||mode!=='scene'||!canvas?.isConnected||document.hidden){lastPaint=0;framePacer.reset();frameMeter.sample(0,false);return;}
  for(let i=summonEffects.length-1;i>=0;i--)if(now-summonEffects[i].since>=1200)summonEffects.splice(i,1);
  const sceneActive=Boolean(model.hero?.moving||model.secondHero?.moving||model.destination||gesture||paintStroke||eraseStroke||hoverPoint||model.preview||terrainMissing>0||summonEffects.length>0);
  if(!framePacer.shouldRender(now,sceneActive))return;
  const dt=lastPaint?Math.min(.065,(now-lastPaint)/1000):0;
  lastPaint=now;
  if(model.build&&gesture?.hit?.kind==='object'&&!gesture.moved&&now-gesture.since>=550){
   eraseStroke={id:gesture.id,group:crypto.randomUUID(),seen:new Set()};const p=gesture.last;gesture=null;cb.hover(null);eraseAt(p);
  }
  if(gesture&&!gesture.hit&&(gesture.moved||now-gesture.since>=180)){
   gesture.steering=true;
   const bounds=canvas.getBoundingClientRect();
   // Reproject the held screen position every frame as the camera follows the hero.
   cb.walk(homeHeldPointerTarget(model.camera,gesture.last,bounds,model.scale));
  }
  cb.step?.(dt);
  const r=canvas.getBoundingClientRect();
  if(!r.width||!r.height)return;
  const ratio=Math.min(devicePixelRatio||1,2);
  if(canvas.width!==Math.round(r.width*ratio)||canvas.height!==Math.round(r.height*ratio)){
   canvas.width=Math.round(r.width*ratio);
   canvas.height=Math.round(r.height*ratio);
   cb.resize(r.width,r.height);
  }
  ctx.setTransform(ratio,0,0,ratio,0,0);
  const scale=model.scale;
  const project=(x,y)=>({x:(x-model.camera.x)*scale+r.width/2,y:(y-model.camera.y)*scale+r.height/2});
  const sec=now/1000;
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;

  const objects=model.objects||[];
  const worldRect={
   x:(model.camera.x-r.width/scale/2)*40-80,
   y:(model.camera.y-r.height/scale/2)*40-80,
   w:(r.width/scale)*40+160,
   h:(r.height/scale)*40+160
  };

  // 1. Blit static 512x512 baked terrain texture tiles (ground, biomes, static river + lilies, roads, plaza & bridges)
  ctx.save();
  ctx.translate(r.width/2-model.camera.x*scale,r.height/2-model.camera.y*scale);
  ctx.scale(scale/40,scale/40);
  // Match Haqi world: camera zoom transforms cached world-space images;
  // only device pixel density controls raster resolution, never camera scale.
  terrainMissing=terrain.draw(ctx,model.home.seed,worldRect,envArt,decorArt,ratio,objects);
  ctx.restore();

  hits=[];
  const groups=buildings.prepare(objects,model.catalog.items,worldRect,ratio,model.selection?.id||gesture?.hit?.id||'');
  const sections=buildings.sections(),hiddenRoofs=new Set();
  for(const actor of [model.hero,model.secondHero].filter(Boolean)){for(const o of objects){const item=buildingItem(o,model.catalog.items);if(item?.building?.type!=='roof')continue;const b=buildingBounds(o,item);if(actor.x>=b.x&&actor.x<=b.x+b.w&&actor.y>=b.y&&actor.y<=b.y+b.h)hiddenRoofs.add(sections.get(o.id)?.[0]?.id);}}
  const wallFades=({o,item,connections})=>item.building&&['wall','window'].includes(item.building.type)&&buildingWallFeet(o,connections).some(b=>[model.hero,model.secondHero].filter(Boolean).some(h=>h.x>=b.x-.3&&h.x<=b.x+b.w+.3&&h.y<b.y+b.h&&h.y>b.y-1.4));
  function drawGroup(g){
   if(g.roof&&hiddenRoofs.has(g.section))return;
   if(g.dynamic){g.rows.forEach(row=>drawObject(row.o,true,row));return;}
   ctx.save();ctx.translate(r.width/2-model.camera.x*scale,r.height/2-model.camera.y*scale);ctx.scale(scale/40,scale/40);
   if(g.rows.some(wallFades)){for(const row of g.rows)buildings.draw(ctx,{...g,rows:[row]},{alpha:wallFades(row)?.4:1,forceLive:true});}
   else buildings.draw(ctx,g);
   ctx.restore();for(const row of g.rows)drawObject(row.o,false,row);
  }


  function drawObject(o,draw=true,buildingRow){
   const item=model.catalog.items.find(i=>i.id===o.itemId);
   if(!item)return;
   const b=footprint(o,model.catalog.items),p=project(o.x,o.y-(isRoofDecoration(o)?1.4:0));
   if(p.x>r.width+60||p.y>r.height+120||p.x+b.w*scale<-60||p.y+b.h*scale<-60)return;
   ctx.save();
   if(gesture?.moved&&gesture.hit?.id===o.id)ctx.globalAlpha=.25;
   let bounds;
   if(item.building){const visual=buildingVisualBounds(o,item);bounds={x:project(visual.x/40,visual.y/40).x,y:project(visual.x/40,visual.y/40).y,w:visual.w*scale/40,h:visual.h*scale/40};if(draw){ctx.translate(p.x,p.y);ctx.scale(scale/40,scale/40);ctx.translate(-o.x*40,-o.y*40);drawBuilding(ctx,item,item.building.type==='door'?{...o,doorOpen:homeDoorIsOpen(o,[model.hero,model.secondHero],buildingRow?.connections)}:o,imageFor(item.art),buildingRow?.connections,buildingRow?.ao);}}
   else if(draw)bounds=drawHomeObject(ctx,item,o,p.x,p.y,b.w*scale,b.h*scale,imageFor(item.art),sec);
   else bounds=homeObjectVisualBounds(item,o,p.x,p.y,b.w*scale,b.h*scale);
   ctx.restore();
   if(model.build||item.building?.type==='door'||homeObjectInteractive(o,model.catalog.items)){
    if(isEdge(item)){const height=(item.building.type==='fence'?.7:1.25)*(o.sizeScale??1);for(const foot of buildingWallFeet(o,buildingRow?.connections)){const q=project(foot.x,foot.y-height);hits.push({kind:'object',id:o.id,sx:q.x-3,sy:q.y-2,sw:foot.w*scale+6,sh:(foot.h+height)*scale+4});}}
    else hits.push({kind:'object',id:o.id,sx:bounds?.x??p.x,sy:bounds?.y??p.y-12,sw:bounds?.w??b.w*scale,sh:bounds?.h??b.h*scale+12});
   }
   if(model.build&&model.selection?.id===o.id){
    ctx.save();
    ctx.strokeStyle='#ffe885';
    ctx.lineWidth=3;
    ctx.shadowColor='rgba(255,215,90,0.65)';
    ctx.shadowBlur=8;
    ctx.beginPath();
    ctx.roundRect(p.x-2,p.y-2,(item.building?o.sizeScale??1:b.w)*scale+4,(item.building?o.sizeScale??1:b.h)*scale+4,3);
    ctx.stroke();
    const block=obstruction(o,item);if(block&&o.properties){const q=project(block.x,block.y);ctx.strokeStyle='#e96655';ctx.lineWidth=2;ctx.setLineDash([4,3]);ctx.strokeRect(q.x,q.y,block.w*scale,block.h*scale);}
    ctx.restore();
   }
  }
  groups.filter(g=>g.ground&&!g.roof).forEach(drawGroup);

  // Position contextual floating action wheel directly above the selected object
  if(edit){
   if(model.selection?.id){
    const selObj=objects.find(o=>o.id===model.selection.id);
    if(selObj){
     const b=footprint(selObj,model.catalog.items),sp=project(selObj.x+b.w/2,selObj.y);
     edit.style.left=`${Math.max(154,Math.min(r.width-154,sp.x))}px`;
     edit.style.top=`${Math.max(58,Math.min(r.height-130,sp.y-22))}px`;
    }
   }else{
    edit.style.left='50%';
    edit.style.top='76px';
   }
  }

  // 2. Step & Draw Main-World Hero Motion Trail (Footprints, Dust Puffs, Elemental Trail)
  const heroSave=model.heroSave||{school:'life',level:1};
  const style=motionStyle({...heroSave,mountId:null,facing:model.hero.facing});
  motionTrail.step(
   {x:model.hero.x*40,y:model.hero.y*40},
   now,
   style,
   {moving:!!model.hero.moving,reducedMotion,scope:model.home?.id,hidden:document.hidden}
  );
  ctx.save();
  ctx.translate(r.width/2-model.camera.x*scale,r.height/2-model.camera.y*scale);
  ctx.scale(scale/40,scale/40);
  drawMotionTrail(ctx,motionTrail.state,now);
  ctx.restore();

  // 3. Draw Main-World Walk Path & Target Rune when walking
  if(model.destination&&model.hero.moving&&!gesture?.steering){
   const hp=project(model.hero.x,model.hero.y),dp=project(model.destination.x,model.destination.y);
   ctx.save();
   ctx.strokeStyle='rgba(255,244,184,0.72)';
   ctx.lineWidth=2.5;
   ctx.setLineDash([7,6]);
   ctx.beginPath();
   ctx.moveTo(hp.x,hp.y);
   ctx.lineTo(dp.x,dp.y);
   ctx.stroke();
   ctx.setLineDash([]);
   const ring=10+Math.sin(sec*5)*2.5;
   ctx.strokeStyle='rgba(168,246,233,0.9)';
   ctx.lineWidth=2;
   ctx.beginPath();
   ctx.ellipse(dp.x,dp.y,ring,ring*.55,0,0,Math.PI*2);
   ctx.stroke();
   ctx.restore();
  }

  // 4. Spawn Portal Crystal Pillars on the Carved Stone Plaza at (0,0)
  const spawn=project(0,0);
  ctx.save();
  ctx.translate(spawn.x,spawn.y);
  ctx.scale(scale/40,scale/40);
  ctx.strokeStyle='rgba(181,255,242,0.72)';
  ctx.lineWidth=2.5;
  ctx.beginPath();
  ctx.ellipse(0,-2,48,20,0,0,Math.PI*2);
  ctx.stroke();
  const gemBob=reducedMotion?0:Math.sin(sec*2.6)*3;
  for(const x of [-64,64]){
   ctx.fillStyle='#718e84';ctx.fillRect(x-6,-42,12,40);
   ctx.fillStyle='#a8f6e9';
   ctx.beginPath();
   ctx.moveTo(x,-66+gemBob);ctx.lineTo(x+10,-48+gemBob);ctx.lineTo(x,-34+gemBob);ctx.lineTo(x-10,-48+gemBob);
   ctx.closePath();ctx.fill();
  }
  ctx.restore();
  hits.push({kind:'portal',sx:spawn.x-72*scale/40,sy:spawn.y-65*scale/40,sw:144*scale/40,sh:95*scale/40});
  portal.style.left=`${spawn.x}px`;
  portal.style.top=`${spawn.y-24*scale/40}px`;
  portal.hidden=spawn.x<-100||spawn.x>r.width+100||spawn.y<-100||spawn.y>r.height+100;

  // 5. Depth-sorted Natural Haqi Island Trees, 3D Furniture, Resident Pets, and Hero
  const actors=(model.pets||[]).filter(p=>Math.abs(p.x-model.camera.x)<r.width/scale/2+3&&Math.abs(p.y-model.camera.y)<r.height/scale/2+3);
  const worldTrees=collectHomeWorldTrees(model.home.seed,worldRect,objects);
  const landscape=worldTrees.map(t=>({kind:'tree',o:t,y:t.ty}));

  const sorted=[
   ...landscape,
   ...groups.filter(g=>!g.ground&&!g.roof).map(g=>({kind:'group',o:g,y:g.depth})),
   ...actors.map(o=>({kind:'pet',o,y:o.y+1})),
   {kind:'hero',o:model.hero,y:model.hero.y,owner:0},
   ...(model.secondHero?[{kind:'hero',o:model.secondHero,y:model.secondHero.y,owner:1}]:[])
  ].sort((a,b)=>a.y-b.y);

  for(const row of sorted){
   if(row.kind==='tree'){
    const p=project(row.o.tx,row.o.ty);
    ctx.save();
    if([model.hero,model.secondHero].filter(Boolean).some(h=>Math.abs(h.x-row.o.tx)<1.7&&h.y<row.o.ty&&h.y>row.o.ty-4))ctx.globalAlpha=.45;
    if(envArt){
     drawHomeWorldTree(ctx,row.o,p.x,p.y,scale/40,envArt);
    }else if(cb.drawTree){
     cb.drawTree(ctx,p.x,p.y,scale*3.2,Math.abs(Math.round(row.o.tx+row.o.ty))%4);
    }
    ctx.restore();
    continue;
   }
   if(row.kind==='hero'){
    const h=row.o,p=project(h.x,h.y),save=row.owner?model.secondSave:heroSave,previous=row.owner?prevSecondPos:prevHeroPos;
    const dx=previous?(h.x-previous.x)*40:0;
    const dy=previous?(h.y-previous.y)*40:0;
    if(row.owner)prevSecondPos={x:h.x,y:h.y};else prevHeroPos={x:h.x,y:h.y};
    const pose=updateHeroActor(row.owner?secondActor:heroActor,{
     dx,dy,x:h.x*40,y:h.y*40,time:sec,facing:h.facing,
     npcs:actors.map(pet=>({id:pet.id,x:pet.x*40,y:pet.y*40})),
     reducedMotion
    });
    ctx.fillStyle='rgba(28,48,26,0.26)';
    ctx.beginPath();
    ctx.ellipse(p.x,p.y+2,scale*.45,scale*.16,0,0,Math.PI*2);
    ctx.fill();
    if(!row.owner)drawMotionAccessory(ctx,p.x,p.y,now,motionTrail.state);
    const heroDrawOpts={mounted:false,head:pose.head,breath:pose.breath,walkTime:pose.walkTime,reducedMotion};
    if(cb.drawHero){
     cb.drawHero(ctx,{...save,mountId:null,facing:h.facing},p.x,p.y,sec,!!h.moving,scale/40,heroDrawOpts);
    }else if(fallbackHero){
     fallbackHero.drawSave(ctx,{...save,mountId:null,facing:h.facing},p.x,p.y,sec,!!h.moving,scale/40,heroDrawOpts);
    }else{
     ctx.fillStyle='#e8be72';ctx.beginPath();ctx.arc(p.x,p.y-scale*.9,scale*.23,0,0,Math.PI*2);ctx.fill();
     ctx.fillStyle='#537e91';ctx.fillRect(p.x-scale*.2,p.y-scale*.65,scale*.4,scale*.6);
    }
    ctx.fillStyle='#fff8dc';
    ctx.font='bold 13px sans-serif';
    ctx.textAlign='center';
    ctx.fillText(model.secondHero?`${row.owner+1}号 · ${save?.name||'玩家'}`:'我',p.x,p.y+22);
    continue;
   }
   if(row.kind==='group'){
    drawGroup(row.o);
    continue;
   }
   const pet=row.o;
   const dragging=gesture?.moved&&gesture.hit?.kind==='pet'&&gesture.hit.id===pet.id;
   const p=dragging?petDragPoint(gesture):project(pet.x,pet.y);
   const image=imageFor(pet.art),activity=pet.activity,phase=reducedMotion?0:now/450;
   let dx=0,dy=activity||dragging?0:-petIdleLift(now,reducedMotion)*scale/40,angle=0;
   if(['dance','ball','slide'].includes(activity)){dy=-Math.abs(Math.sin(phase))*8;dx=Math.sin(phase)*5;}
   if(activity==='swing'){dx=Math.sin(phase)*12;angle=Math.sin(phase)*.12;}
   if(['eat','drink','read','water','picnic'].includes(activity))angle=Math.sin(phase)*.04;
   if(activity==='sleep')angle=.12;
   const size=scale*1.8;
   ctx.save();
   ctx.translate(p.x,p.y);
   ctx.fillStyle='#35503325';
   ctx.beginPath();
   ctx.ellipse(0,3,size*.35,6,0,0,Math.PI*2);
   ctx.fill();
   ctx.translate(dx,dy);
   ctx.rotate(angle);
   if(image?.complete&&image.naturalWidth){
    const cols=pet.art.cols||1,rows=pet.art.rows||1,stageIdx=Math.min(rows-1,pet.stage||0),col=activity==='sleep'?Math.min(1,cols-1):activity?Math.min(2,cols-1):0;
    ctx.drawImage(image,col*image.naturalWidth/cols,stageIdx*image.naturalHeight/rows,image.naturalWidth/cols,image.naturalHeight/rows,-size/2,-size,size,size);
   }else{
    ctx.fillStyle='#f2ddb4';ctx.beginPath();ctx.ellipse(0,-size*.4,size*.3,size*.4,0,0,Math.PI*2);ctx.fill();
   }
   if(activity==='sleep'){
    ctx.strokeStyle='rgba(255,252,230,0.85)';
    ctx.lineWidth=1.6;
    for(let i=0;i<2;i++){
     ctx.beginPath();
     ctx.arc(size*(.22+i*.12),-size*(.72+i*.14),3+i*2,0,Math.PI*2);
     ctx.stroke();
    }
   }
   if(activity==='bathe'){
    ctx.strokeStyle='#e5f6ee';
    for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(-10+i*12,-10-Math.sin(phase+i)*6,4,0,Math.PI*2);ctx.stroke();}
   }
   if(['eat','drink','picnic'].includes(activity)){
    ctx.fillStyle='#f1d6a1';ctx.beginPath();ctx.ellipse(10,0,10,activity==='drink'?8:4,0,0,Math.PI*2);ctx.fill();
   }
   if(activity==='read'){
    ctx.fillStyle='#fff2cb';ctx.fillRect(-15,-5,30,13);ctx.strokeStyle='#aa936e';ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(0,8);ctx.stroke();
   }
   if(activity==='water'){
    ctx.fillStyle='#8acada';
    for(let i=0;i<4;i++){ctx.beginPath();ctx.arc(22+i*3,-8+(phase*8+i*5)%20,2,0,Math.PI*2);ctx.fill();}
   }
   if(activity==='ball'){
    ctx.fillStyle='#efbf77';ctx.beginPath();ctx.arc(25+Math.sin(phase)*8,2,8,0,Math.PI*2);ctx.fill();
   }
   ctx.restore();
   ctx.fillStyle='rgba(24,42,28,0.52)';
   ctx.beginPath();
   ctx.roundRect(p.x-34,p.y+6,68,17,8);
   ctx.fill();
   ctx.fillStyle='#f7f4e4';
   ctx.font='bold 12px sans-serif';
   ctx.textAlign='center';
   ctx.fillText(pet.name,p.x,p.y+18);
   hits.push({kind:'pet',id:pet.id,sx:p.x-size/2,sy:p.y-size,sw:size,sh:size+20});
  }

  if(model.showRoofs)groups.filter(g=>g.roof).sort((a,b)=>Number(a.decoration)-Number(b.decoration)||a.depth-b.depth).forEach(drawGroup);

  // 7. Placement Preview Ghost
  if(model.preview){
   const o=model.preview,item=model.catalog.items.find(i=>i.id===o.itemId);
   if(item){
    const b=footprint(o,model.catalog.items),p=project(o.x,o.y-(isRoofDecoration(o)?1.4:0));
    ctx.save();
    ctx.globalAlpha=.68;
    if(item.building){ctx.translate(p.x,p.y);ctx.scale(scale/40,scale/40);ctx.translate(-o.x*40,-o.y*40);drawBuilding(ctx,item,o,imageFor(item.art),buildingConnectionMask(o,[...objects,o],model.catalog.items));}else drawHomeObject(ctx,item,o,p.x,p.y,b.w*scale,b.h*scale,imageFor(item.art),sec);
    ctx.restore();
    ctx.fillStyle=o.valid?'rgba(154,230,140,0.22)':'rgba(220,90,82,0.28)';
    ctx.strokeStyle=o.valid?'#b8f59e':'#ff7b72';
    ctx.lineWidth=2.5;
    ctx.beginPath();
    ctx.roundRect(p.x,p.y,(item.building?o.sizeScale??1:b.w)*scale,(item.building?o.sizeScale??1:b.h)*scale,3);
    ctx.fill();
    ctx.stroke();
   }
  }

  if(model.build&&showGrid){
   ctx.save();ctx.strokeStyle='rgba(255,250,224,.25)';ctx.lineWidth=1;ctx.beginPath();
   const left=Math.floor(model.camera.x-r.width/scale/2),top=Math.floor(model.camera.y-r.height/scale/2);
   for(let x=left;x<=left+r.width/scale+1;x++){const q=project(x,0);ctx.moveTo(q.x,0);ctx.lineTo(q.x,r.height);}
   for(let y=top;y<=top+r.height/scale+1;y++){const q=project(0,y);ctx.moveTo(0,q.y);ctx.lineTo(r.width,q.y);}
   ctx.stroke();ctx.restore();
  }
  if(model.build&&model.preview){
   const o=model.preview,item=buildingItem(o,model.catalog.items);
   if(isEdge(item)){ctx.save();ctx.strokeStyle=o.valid?'#b8f59e':'#ff7b72';ctx.lineWidth=2;
    for(const foot of buildingWallFeet(o,buildingConnectionMask(o,[...objects,o],model.catalog.items))){const q=project(foot.x,foot.y);ctx.strokeRect(q.x,q.y,foot.w*scale,foot.h*scale);}ctx.restore();}
  }
  if(buildTip){
   const p=hoverPoint,hit=p&&hitAt(p),o=model.preview||(hit?.kind==='object'&&objects.find(o=>o.id===hit.id)),item=o&&buildingItem(o,model.catalog.items);
   buildTip.hidden=!model.build||!p||!item;
   if(!buildTip.hidden){
    const holding=gesture?.hit?.kind==='object'&&!gesture.moved;
    const detail=eraseStroke?'拖动连续拆除':holding?'长按拆除 · 移动可拖拽':model.preview?(model.preview.valid?'可放置':model.preview.reason||'此处不可放置'):'右键或长按拆除 · 中键取样';
    buildTip.textContent=`${item.zh} · ${Math.floor(o.x)}, ${Math.floor(o.y)}\n${detail}`;
    buildTip.classList.toggle('is-invalid',model.preview?.valid===false);
    buildTip.style.left=`${Math.max(8,Math.min(r.width-buildTip.offsetWidth-8,p.sx+18))}px`;
    const tray=side?.getBoundingClientRect(),bottom=tray&&tray.height&&tray.top<r.bottom?tray.top-r.top:r.height;
    buildTip.style.top=`${Math.max(8,Math.min(bottom-buildTip.offsetHeight-8,p.sy-buildTip.offsetHeight-18))}px`;
    if(holding){ctx.save();ctx.strokeStyle='#ffb26e';ctx.lineWidth=4;ctx.beginPath();ctx.arc(p.sx,p.sy,15,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.min(1,(now-gesture.since)/550));ctx.stroke();ctx.restore();}
   }
  }

  for(const fx of summonEffects){
   const progress=Math.max(0,Math.min(1,(now-fx.since)/1200)),fade=1-progress,p=project(fx.x,fx.y),radius=Math.max(1.4,Math.hypot(fx.w||2,fx.h||2)*.48)*scale;
   ctx.save();
   ctx.strokeStyle=`rgba(255,233,138,${(fade*.85).toFixed(3)})`;
   ctx.lineWidth=3*fade+1;
   ctx.beginPath();
   ctx.ellipse(p.x,p.y,radius*(.45+progress*.75),radius*(.24+progress*.4),0,0,Math.PI*2);
   ctx.stroke();
   ctx.strokeStyle=`rgba(168,246,233,${(fade*.75).toFixed(3)})`;
   ctx.lineWidth=2;
   ctx.beginPath();
   ctx.ellipse(p.x,p.y-progress*18,radius*(.3+progress*.55),radius*(.16+progress*.28),0,0,Math.PI*2);
   ctx.stroke();
   if(!reducedMotion){
    for(let i=0;i<10;i++){
     const a=i*Math.PI*.2+progress*2.2,dist=radius*(.2+progress*.65)*(.65+(i%3)*.18);
     const sx=p.x+Math.cos(a)*dist,sy=p.y+Math.sin(a)*dist*.45-progress*(28+(i%4)*14);
     const sr=(3.5+(i%3)*1.5)*fade;
     ctx.fillStyle=i%2?'#ffe98a':'#a8f6e9';
     ctx.globalAlpha=fade;
     ctx.beginPath();
     ctx.moveTo(sx,sy-sr*1.5);ctx.lineTo(sx+sr*.5,sy-sr*.5);ctx.lineTo(sx+sr*1.5,sy);ctx.lineTo(sx+sr*.5,sy+sr*.5);
     ctx.lineTo(sx,sy+sr*1.5);ctx.lineTo(sx-sr*.5,sy+sr*.5);ctx.lineTo(sx-sr*1.5,sy);ctx.lineTo(sx-sr*.5,sy-sr*.5);
     ctx.closePath();ctx.fill();
    }
   }
   ctx.restore();
  }

  // 8. Pet Wish Speech Bubble
  const wish=model.wish,pet=wish&&actors.find(p=>p.id===wish.petId);
  bubble.hidden=!pet||model.quiet;
  if(pet&&!model.quiet){
   const p=gesture?.moved&&gesture.hit?.kind==='pet'&&gesture.hit.id===pet.id?petDragPoint(gesture):project(pet.x,pet.y);
   bubble.classList.toggle('is-collapsed',!wish.expanded);
   bubbleText.textContent=wish.expanded?(model.translation?`${wish.text}\n${wish.translation}`:wish.text):'…';
   bubbleText.setAttribute('aria-label',wish.expanded?bubbleText.textContent:tr('听宠物愿望'));
   bubble.style.left=`${p.x+28}px`;
   bubble.style.top=`${p.y-scale*1.8}px`;
   bubble.hidden=p.x<0||p.x>r.width||p.y<0||p.y>r.height;
  }
  const meter=frameMeter.sample(now),fpsText=meter?`FPS ${meter.fps}`:'FPS —';
  if(fpsLabel.textContent!==fpsText)fpsLabel.textContent=fpsText;
 }

 frame=requestAnimationFrame(paint);
 return {
  render,
  async prepare({isCurrent=()=>!dead,onProgress=()=>{}}={}){
   await ensureWorldAtlases();
   const art=[...(model.objects||[]).map(o=>model.catalog.items.find(i=>i.id===o.itemId)?.art),...(model.pets||[]).map(p=>p.art)].filter(Boolean);
   await Promise.all([...new Set(art.map(imageFor))].filter(Boolean).map(async image=>{
    try{await image.decode();}catch(error){images.delete(image.src);throw Error('家园图片加载失败，请重试。');}
   }));
   terrainMissing=Infinity;
   const started=performance.now();
   while(!dead&&isCurrent()){
    await new Promise(resolve=>setTimeout(resolve,32));
    if(dead||!isCurrent())break;
    if(terrainMissing===0)return;
    if(performance.now()-started>30000)throw Error('家园地块准备时间较长，请重试。');
    onProgress({phase:'assets',message:'正在准备家园地块和环境细节…'});
   }
   throw Error('家园加载已取消');
  },
  openSummon:openSummonDrawer,
  closeSummon:closeSummonDrawer,
  celebrateSummon(pos={}){
   playSummonChime();
   summonEffects.push({x:pos.x??model?.hero?.x??0,y:pos.y??model?.hero?.y??0,w:pos.w??2,h:pos.h??2,since:performance.now()});
   framePacer.wake();
  },
  capture(){
   if(mode!=='scene'||!canvas?.width||!canvas?.height)return null;
   const shot=document.createElement('canvas');
   shot.width=400;shot.height=300;
   const c=shot.getContext('2d');
   const crop=Math.min(canvas.width/4,canvas.height/3);
   c.drawImage(canvas,(canvas.width-crop*4)/2,(canvas.height-crop*3)/2,crop*4,crop*3,0,0,400,300);
   return shot.toDataURL('image/webp',.8);
  },
  setInput:text=>{if(input)input.value=text;},
  setSpeechFeedback:(feedback)=>{
   if(!example)return;
   const spans=[...example.querySelectorAll('.home-spell-text')];
   spans.forEach(span=>{if(span.dataset.sentence)span.textContent=span.dataset.sentence;});
   if(feedback?.parts?.length){
    const target=spans[feedback.lineIndex??0]||spans[0];
    if(target)renderSpeechWords(target,feedback.parts);
   }
  },
  dispose(){
   clearTimeout(statusTimer);
   void summonAudioCtx?.close?.().catch(()=>{});summonAudioCtx=null;
   cancelScenePointer();dead=true;
   window.removeEventListener('keydown',editKey);window.removeEventListener('blur',blurEdit);document.removeEventListener('visibilitychange',hideEdit);
   activeDialog?.destroy();
   root.classList.remove('home-world-active');
   cancelAnimationFrame(frame);
   images.clear();
   terrain.dispose();buildings.dispose();
  },
  stats:()=>({terrain:terrain.stats(),buildings:buildings.stats()}),
  get size(){
   const r=canvas?.getBoundingClientRect();
   return {width:r?.width||800,height:r?.height||500};
  }
 };
}
