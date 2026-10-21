import {createHomeEditHistory,homeEditDelta,applyHomeEditDelta} from './home_edit_history_core.js';
import {compareDungeonSpeech} from './dungeon_speech_core.js';
import {homeCapacity,assertHomeCapacity} from './home_capacity_core.js';
import {roofAt,isRoofDecoration,roofSections} from './home_building_core.js';
import {TEMPLATE_PRACTICE,buildingTemplateObjects,validateTemplatePlacement} from './home_building_templates_core.js';
import {buildingPlacement,obstruction,buildingItem,replacementFor} from './home_building_core.js';
import {recordHomePractice} from './home_practice.js';
import {assignedKeyboardAction,normalizePlayerInputs} from './player_input_core.js';
import {normalizeLocalKeys} from './local_controls_core.js';
import {createPlayerInput} from './player_input.js';
import {homeDuoStep,homeDuoCamera,homeDuoScale} from './home_local_core.js';
import {createIslandSceneLoadingView} from './view_island_scene_loading.js';
import {stepHomeWalk,findHomePath} from './home_walk_core.js';
import {requiresReading,homeObjectInteractive,createHome,homeScope,chunkKey,visibleChunkKeys,matchHomeSpell,canPlace,footprint,initializeHomeResidents,homeResidentPets,petWish,summonSentences} from './home_core.js';
import {homeObjects,applyHomeAction} from './home_actions_core.js';
import {createHomeStore} from './home_store.js';
import {createHomeCloud} from './home_cloud.js';
import {createHomeView} from './view_home.js';
import {createLearningVoice} from './language_adventure_voice.js';
import {ownedPetRecords} from './adventure_pet_files_core.js';
import {hashSeed} from './rng_core.js';
const directories=new Map();
export async function primeHomeDirectory(cloud,role){if(!cloud?.owner||!role)return;const key=homeScope(cloud.owner,role);try{directories.set(key,await cloud.homeRead(`homes/${role}/index.json`,{refresh:true})||{version:1,entries:{}});}catch{directories.delete(key);}}
export async function openHomeSystem({root,getContext,close,cloud,assetMode='cdn',loadingAssets,warmHero=()=>{},drawHero,drawTree,onScene=()=>{},catalog:providedCatalog,store:providedStore,voice:providedVoice,initialHomeId,initialCategory,initialPosition={x:0,y:0}}){
 const context=getContext(),scope=homeScope(context.owner,context.roleId),store=providedStore||createHomeStore(scope);
 let entering=false,entryTicket=0,retryEntry=null;
 let speechSession=null;
 let spellEpoch=0;let showRoofs=true;
 const editHistory=createHomeEditHistory();
 let objectCache=[],chunkRefs=[];
 function currentObjects(){const refs=Object.entries(parts).filter(([k])=>k.startsWith('chunk:'));if(refs.length!==chunkRefs.length||refs.some(([k,v],i)=>chunkRefs[i]?.[0]!==k||chunkRefs[i]?.[1]!==v)){chunkRefs=refs;objectCache=homeObjects(parts);}return objectCache;}


 let dead=false,home=null,parts={},homes=[],guests=null,selection=null,preview=null,pets=[],petBag=[],camera={x:0,y:0},scale=40,status='正在加载家园…',pending=null,candidates=[],quiet=false,wish=null,translation=false,rotation=0,loadTicket=0,round=0,recording=null,mutation=Promise.resolve(),busy=false;
 let secondHero={x:1.5,y:0,facing:0},secondDestination=null,secondPath=[];
 const held=[new Set(),new Set()];
 const duo=()=>!!getContext().secondSave;
 const pointerOwner=()=>duo()&&getContext().mouseOwner===1?1:0;
 const stopInput=owner=>{if(owner){secondDestination=null;secondPath=[];secondHero={...secondHero,moving:false};}else{destination=null;walkPath=[];hero={...hero,moving:false};}};
 const clearInput=()=>{held.forEach((keys,owner)=>{if(keys.size)stopInput(owner);keys.clear();});};
 const typing=()=>!!document.activeElement?.closest?.('input,textarea,select,[contenteditable=true]');
 const pads=createPlayerInput({settings:()=>getContext().settings||{},enabled:()=>duo()&&!!home&&!entering&&!document.hidden&&!typing(),dispatch:(owner,{action,down})=>{if(['up','down','left','right'].includes(action)){held[owner][down?'add':'delete'](action);if(!down&&!held[owner].size)stopInput(owner);}}});
 const keyboard=(event,down)=>{
  if(!duo()||!home||event.ctrlKey||event.metaKey||event.altKey)return;
  const settings=getContext().settings||{},key=assignedKeyboardAction(normalizePlayerInputs(settings.playerInputs),normalizeLocalKeys(settings.localKeys),event.code);
  if(!key)return;
  if(!down){held[key.owner].delete(key.action);if(!held[key.owner].size)stopInput(key.owner);}
  if(typing())return;
  event.stopImmediatePropagation();event.preventDefault();
  if(!entering&&down&&['up','down','left','right'].includes(key.action))held[key.owner].add(key.action);
 };
 const keyDown=e=>keyboard(e,true),keyUp=e=>keyboard(e,false);
 window.addEventListener('keydown',keyDown,true);window.addEventListener('keyup',keyUp,true);
 window.addEventListener('blur',clearInput);document.addEventListener('visibilitychange',clearInput);
 let walkChunk=null;let hero={x:0,y:0,facing:0}, destination=null,build=false,walkPath=[];
 const valid=()=>{const c=getContext();return !dead&&!!c.roleId&&scope===homeScope(c.owner,c.roleId)&&c.active!==false;};
 const check=()=>{if(!valid())throw Error('角色或账号已变化');};
 const abort=new AbortController(),catalog=providedCatalog||await fetch('data/adventure/home/catalog.json',{signal:abort.signal}).then(r=>{if(!r.ok)throw Error('家园目录加载失败');return r.json();});
 check();
 const loading=createIslandSceneLoadingView({title:'向家园出发',exitLabel:'返回家园列表',retry:()=>{if(retryEntry)void enter(retryEntry).catch(error);},exit:()=>{entryTicket++;entering=false;loading.hide();void back().catch(error);}});
 const showLoading=state=>loading.show(state,{assets:loadingAssets,save:getContext().save,scope,roleId:context.roleId});
 const lang=()=>getContext().save?.languageLearning?.target==='zh-CN'?'zh':'en';
 const voice=providedVoice||createLearningVoice({getSettings:()=>getContext().save?.languageLearning||{}});
 const remote=context.owner&&cloud?.owner===context.owner?createHomeCloud({store,roleId:context.roleId,catalog:catalog.items,valid,io:{read:async(path,options)=>{if(path.endsWith('/index.json')&&!options?.refresh&&directories.has(scope))return directories.get(scope);const value=await cloud.homeRead(path,options);if(path.endsWith('/index.json'))directories.set(scope,value||{version:1,entries:{}});return value;},write:async(path,value)=>{await cloud.homeWrite(path,value);if(path.endsWith('/index.json'))directories.set(scope,value);}}}):null;

 function at(itemId,position,extra={}){
  const px=position.x,py=position.y;
  const obj={id:crypto.randomUUID(),itemId,color:selection?.color||'',rotation,...extra,x:px,y:py};
  const item=catalog.items.find(i=>i.id===itemId);
  if(item?.layer==='top'){
   const parent=currentObjects().filter(o=>{const b=footprint(o,catalog.items);return b.item.slots&&px>=b.x&&py>=b.y&&px<b.x+b.w&&py<b.y+b.h;}).at(-1);
   obj.parentId=parent?.id;
  }
  if(item&&!item.building){
   const objects=currentObjects(),candidate={...obj,y:py+1.4},roof=showRoofs?roofAt(candidate,objects,catalog.items):null;
   const sections=roof?roofSections(objects,catalog.items):null;
   const indoors=roof&&[hero,...(duo()?[secondHero]:[])].some(h=>{const above=roofAt(h,objects,catalog.items);return above&&sections.get(above.id)===sections.get(roof.id);});
   if(roof&&!indoors){obj.y=candidate.y;obj.properties={...obj.properties,surface:'roof'};obj.parentId=roof.id;}
   else if(isRoofDecoration(obj)){obj.properties={...obj.properties,surface:'ground'};delete obj.parentId;}
  }
  return buildingPlacement(obj,item);
 }

 function resolvePlacement(itemId,position,extra={}){
  return at(itemId,position,extra);
 }

 async function placeItemAt(itemId,color='',position,{fromInventory=false,group}={}){
  const obj=resolvePlacement(itemId,position,{color});
  const item=catalog.items.find(i=>i.id===itemId);
  if(!requiresReading(item))return commit({type:'create',object:obj,group});
  const test=canPlace(obj,currentObjects(),catalog.items);
  if(!test.ok)throw Error(test.reason);
  select(itemId,color);
  selection.spellPosition={x:obj.x,y:obj.y};
  preview={...obj,valid:true};
  emit();
  view.openSummon();
 }

 const view=createHomeView(root,{
  initialCategory,
  drawHero,
  drawTree,
  walk:p=>{if(pointerOwner()){secondPath=[];secondDestination=p;}else{walkPath=[];destination=p;}},
  stopWalk:()=>{if(pointerOwner()){secondPath=[];secondDestination=null;secondHero={...secondHero,moving:false};}else{walkPath=[];destination=null;hero={...hero,moving:false};}emit();},
  mode:value=>{if(!!value!==build)showRoofs=!value;if(!value)spellEpoch++;build=!!value;if(!build){selection=null;preview=null;}emit();},
  step:dt=>{
   if(entering||!home)return;
   if(duo())scale=homeDuoScale([hero,secondHero],scale,view.size);
   pads.poll(performance.now());
   if(typing())clearInput();
   const objects=currentObjects(),before=hero;
   const directed=(owner,h)=>{const keys=held[owner],x=Number(keys.has('right'))-Number(keys.has('left')),y=Number(keys.has('down'))-Number(keys.has('up'));return x||y?{x:h.x+x*3,y:h.y+y*3}:null;};
   const firstInput=duo()?directed(0,hero):null,secondInput=duo()?directed(1,secondHero):null;
   if(firstInput){walkPath=[];destination=firstInput;}
   if(secondInput){secondPath=[];secondDestination=secondInput;}
   if(duo()&&getContext().secondFollowing&&!secondInput){
    if(Math.hypot(hero.x-secondHero.x,hero.y-secondHero.y)>2&&!secondPath.length)navigate(hero,1);
    if(Math.hypot(hero.x-secondHero.x,hero.y-secondHero.y)<=2){secondPath=[];secondDestination=null;}
   }
   const targets=[walkPath[0]||destination,secondPath[0]||secondDestination];
   if(duo()){
    [hero,secondHero]=homeDuoStep([hero,secondHero],targets,dt,objects,catalog.items,home.seed,{...view.size,scale});
   }else if(destination)hero=stepHomeWalk(hero,targets[0],dt,objects,catalog.items,home.seed);
   for(const [owner,h] of [hero,secondHero].entries()){
    if(owner&&!duo())continue;
    const route=owner?secondPath:walkPath,target=targets[owner];
    if(route.length&&target&&Math.hypot(h.x-target.x,h.y-target.y)<.08)route.shift();
    if(!h.moving&&!route.length){if(owner)secondDestination=null;else destination=null;}
   }
   if(!duo()&&walkPath.length&&Math.hypot(hero.x-before.x,hero.y-before.y)<.0001&&dt>0)walkPath=[];
   camera=duo()?homeDuoCamera([hero,secondHero]):{x:hero.x,y:hero.y};
   emit();
   if(chunkKey(camera.x,camera.y)!==walkChunk){
    walkChunk=chunkKey(camera.x,camera.y);
    void loadChunks().catch(error);
   }
  },
  retry:async()=>{const job=pending;pending=null;try{await job?.();status='已保存到本机';emit();}catch(e){pending=job;error(e);}},
  close:()=>close(),
  error,
  create,
  enter,
  back,
  refresh,
  guests:showGuests,
  copyGuest,
  rename,
  remove,
  sync,
  camera:next=>{if(next)navigate(next);emit();},
  zoom:factor=>{scale=Math.max(24,Math.min(72,scale*factor));if(duo())scale=homeDuoScale([hero,secondHero],scale,view.size);emit();void loadChunks().catch(error);},
  resize:()=>{if(!entering)void loadChunks().catch(error);},
  reload:()=>loadChunks(),
  take:async(row,p)=>{
   await placeItemAt(row.itemId,row.color||'',p,{fromInventory:row.fromInventory,group:row.group});
  },
  color:value=>{if(selection){spellEpoch++;selection.color=value;if(preview)preview.color=value;emit();}},
  helpWish:()=>{
   if(wish){
    select(wish.itemId,wish.color||'',wish.phase==='place');
    view.setInput('');
    view.openSummon?.();
   }
  },
  speakWish:()=>wish?voice.speak(wish.text,lang()==='en'?'en':'zh-CN',abort.signal):null,
  openWish:()=>{if(wish){wish={...wish,expanded:true,until:Date.now()+22000};translation=false;emit();}},
  practiceTemplate:templateId=>{select('template-'+templateId);view.openSummon();},
  select,
  practice:(itemId,color='')=>{select(itemId,color);view.openSummon();},
  tap,
  drop,
  hover,
  rotate,
  roofs:()=>{showRoofs=!showRoofs;emit();},
  properties:properties=>selection?.id?commit({type:'properties',id:selection.id,properties}):null,
  resizeFurniture:delta=>build&&selection?.id?commit({type:'resize',id:selection.id,delta}):null,
  recall,
  erase:(id,group)=>build?commit({type:'recall',id,group}):null,
  undo:()=>restoreEdit(true),
  redo:()=>restoreEdit(false),
  pick:id=>{const o=currentObjects().find(o=>o.id===id);if(o){rotation=o.rotation||0;select(o.itemId,o.color||'');}},
  recallPet:id=>savePetPlacement(id,null),
  toggleActive:()=>build&&selection?.id?commit({type:buildingItem(selection,catalog.items)?.building?.type==='door'?'door':'toggleInteraction',id:selection.id}):null,
  cancel:()=>{spellEpoch++;selection=null;preview=null;emit();},
  quiet:()=>{quiet=!quiet;emit();},
  findPet:id=>{const p=pets.find(p=>p.id===id);if(p){navigate(p);emit();}},
  translate:()=>{translation=!translation;emit();},
  speak:text=>voice.speak(text,lang()==='en'?'en':'zh-CN',abort.signal),
  summon:text=>summon(text,'text'),
  choose,
  record,
  finish,
  cancelVoice:()=>{spellEpoch++;recording=null;return voice.cancel();}
 });

 function navigate(p,owner=pointerOwner()){
  const actor=owner?secondHero:hero;
  const route=home?findHomePath(actor,p,currentObjects(),catalog.items,home.seed,point=>Object.hasOwn(parts,`chunk:${chunkKey(point.x,point.y)}`)):[];
  if(owner){secondPath=route;secondDestination=route.at(-1)||null;secondHero={...secondHero,moving:route.length>0};}
  else{walkPath=route;destination=route.at(-1)||null;hero={...hero,moving:route.length>0};}
 }
 function emit(){if(valid())view.render({history:editHistory.state(),showRoofs,hero,secondHero:duo()?secondHero:null,secondSave:getContext().secondSave,pointerOwner:pointerOwner(),destination,heroSave:getContext().save,build,home,homes,guests,catalog,practiceItems:TEMPLATE_PRACTICE,objects:currentObjects(),pets,petBag,camera,scale,status,selection,preview,candidates,quiet,wish,translation,unsaved:!!pending,lang:lang(),assetMode});}
 function error(e){if(!valid())return;status=pending?'未保存：本机存储写入失败，请重试保存。':e.message||'操作未完成，请重试';emit();}
 async function refresh(){check();if(!remote)throw Error('请在冒险中登录 Keepwork 后再打开家园');status='正在读取云端目录…';emit();await remote.list(true);await list();}
 async function list(){check();const local=await store.list();check();let index=directories.get(scope);if(remote&&!index){try{index=await remote.list();}catch(e){status=`本地家园已加载；${e.message}`;}}
  const rows=Object.values(index?.entries||{}).filter(row=>!local.some(h=>h.id===row.id));homes=[...local,...rows.map(row=>({...row,cloudOnly:true}))];emit();}
 async function create(name){check();const id=crypto.randomUUID();await store.create(createHome(id,name,hashSeed(id)));check();await enter({id});}
 function roster(){
  const records=ownedPetRecords(getContext().save),saved=parts.residents||{},previous=new Map(pets.map(p=>[p.id,p]));
  const describe=pet=>{const definition=getContext().content.pets[pet.speciesId]||{};return {...pet,name:pet.name||definition.name||'宠物',art:definition.art,stage:pet.appearanceStage??Math.min(3,[1,10,25,40].filter(n=>pet.level>=n).length-1)};};
  pets=homeResidentPets(records,saved).map(pet=>{const old=previous.get(pet.id);return {...describe(pet),...saved[pet.id],...(old&&old.homeId===home.id?{x:old.x,y:old.y,activity:old.activity,until:old.until,targetId:old.targetId}:{}),homeId:home.id};});
  petBag=Object.values(records).filter(p=>!Object.hasOwn(saved,p.id)).map(describe);
 }
 async function enter(row){check();spellEpoch++;await mutation.catch(()=>{});check();if(pending)throw Error('请先重试保存未完成的操作');
  editHistory.clear();const ticket=++entryTicket;const checkEntry=()=>{check();if(ticket!==entryTicket)throw Error('家园加载已取消');};entering=true;retryEntry=row;showLoading({phase:'assets',message:'正在读取家园地块…'});
  try{loadTicket++;await voice.cancel();checkEntry();recording=null;selection=null;preview=null;wish=null;pets=[];parts={};
  if(row.cloudOnly){if(!remote)throw Error('请先登录');await remote.download(row);checkEntry();}
  const loadedHome=store.measureCapacity?await store.measureCapacity(row.id):await store.get(row.id);checkEntry();if(!loadedHome||loadedHome.deleted)throw Error('家园已移除');let residents=remote?await remote.loadPart(loadedHome,'residents'):await store.read(loadedHome.id,'residents');checkEntry();if(residents.$selection?.version!==1){const result=await store.mutate(loadedHome.id,['residents'],(_,data)=>{data.residents=initializeHomeResidents(data.residents,ownedPetRecords(getContext().save),loadedHome.seed);});checkEntry();Object.assign(loadedHome,result.home);residents=result.data.residents;}home=loadedHome;parts.residents=residents;camera={...initialPosition};hero={...initialPosition,facing:0};secondHero={x:1.5,y:0,facing:0};secondDestination=null;secondPath=[];clearInput();destination=null;walkPath=[];build=false;walkChunk=null;visitElapsed=0;visitClock=performance.now();visitCheckpoint=0;nextPetThink=Date.now()+20000;onScene(true);status='已保存到本机；点击草地控制主角移动。';roster();emit();await loadChunks();
  if(ticket!==entryTicket||!valid())return;
  await warmHero();await view.prepare({isCurrent:()=>valid()&&ticket===entryTicket,onProgress:showLoading});
  if(ticket!==entryTicket||!valid())return;
  entering=false;loading.hide();void drainPractice(home.id).catch(e=>{pending=()=>drainPractice(home.id);error(e);});
  }catch(e){if(ticket===entryTicket&&valid())showLoading({phase:'error',message:e.message||'家园暂时未能加载，请重试。'});}
 }
 async function back(){spellEpoch++;await mutation.catch(()=>{});check();if(pending)throw Error('请先点击重试保存');await saveVisit(true);await voice.cancel();loadTicket++;onScene(false);clearInput();secondDestination=null;secondPath=[];destination=null;walkPath=[];home=null;editHistory.clear();parts={};pets=[];selection=null;preview=null;wish=null;await list();}
 async function loadChunks(){if(!home||!valid())return;const ticket=++loadTicket,id=home.id,{width,height}=view.size,keys=visibleChunkKeys(camera,width,height,scale).map(k=>`chunk:${k}`);const values=await Promise.all(keys.map(k=>remote?remote.loadPart(home,k):store.read(id,k)));if(ticket!==loadTicket||home?.id!==id||!valid())return;for(const k of Object.keys(parts))if(k.startsWith('chunk:')&&!keys.includes(k))delete parts[k];keys.forEach((k,i)=>{parts[k]=values[i];});if(walkPath.length&&destination)navigate(destination,0);if(secondPath.length&&secondDestination)navigate(secondDestination,1);emit();}

 function select(itemId,color='',fromInventory=false){
  spellEpoch++;
  if(!build)showRoofs=false;build=true;
  selection={itemId,color,fromInventory,rotation};
  preview=null;
  const item=catalog.items.find(i=>i.id===itemId);
  if(item)status=requiresReading(item)?`你需要读出下面句子才能召唤${item.zh}`:'点击或拖动摆放，可连续创建；按 R 旋转。';
  view.setInput('');view.setSpeechFeedback(null);
  emit();
 }

 function hover(position,hit){
  if(!home||hit?.kind==='pet')return;
  if(!position){preview=null;emit();return;}
  const selected=hit?.kind==='object'?currentObjects().find(o=>o.id===hit.id):selection;
  if(selected?.itemId?.startsWith('template-'))return;
  if(!selected?.itemId||(!build&&(!hit||!homeObjectInteractive(selected,catalog.items))))return;
  const obj=at(selected.itemId,position,selected);
  const test=canPlace(obj,currentObjects(),catalog.items);
  const capacity=homeCapacity(home),hasRoom=capacity.used===null||capacity.used<capacity.limit||!!selected.id||!!replacementFor(obj,currentObjects(),catalog.items);
  const block=obstruction(obj,buildingItem(obj,catalog.items));
  const occupied=block&&[hero,...(duo()?[secondHero]:[])].some(p=>p.x+.18>block.x&&p.x-.18<block.x+block.w&&p.y+.12>block.y&&p.y-.12<block.y+block.h);
  const loaded=Object.hasOwn(parts,'chunk:'+chunkKey(obj.x,obj.y));
  preview={...obj,valid:test.ok&&hasRoom&&!occupied&&loaded,reason:!loaded?'土地尚未加载':!hasRoom?'家园容量已满':occupied?'这里有角色':test.ok?'':test.reason};
  emit();
 }

 async function placeTemplate(templateId,practiceAttempt){
  if(!home)return;
  const capacity=homeCapacity(home);if(capacity.used!==null)assertHomeCapacity(capacity.used,capacity.used+buildingTemplateObjects(templateId).length);
  const id=home.id,prefix=crypto.randomUUID(),actors=[hero,...(duo()?[secondHero]:[])];
  // Search only the loaded neighborhood. The transaction reloads neighboring chunks
  // and validates again before writing any objects.
  for(let radius=2;radius<=24;radius+=2)for(let dy=-radius;dy<=radius;dy+=2)for(let dx=-radius;dx<=radius;dx+=2){
   if(Math.abs(dx)!==radius&&Math.abs(dy)!==radius)continue;
   const x=Math.round(hero.x)+dx,y=Math.round(hero.y)+dy,rows=buildingTemplateObjects(templateId,x,y,prefix);
   if(!rows.every(o=>Object.hasOwn(parts,'chunk:'+chunkKey(o.x,o.y))))continue;
   if(!validateTemplatePlacement(rows,currentObjects(),catalog.items,actors,home.seed))continue;
   if(home.id!==id)return;
   await commit({type:'template',templateId,x,y,prefix,seed:home.seed,object:{x,y},receipt:practiceAttempt.receipt,practice:practiceAttempt.practiceValid?{id:practiceAttempt.receipt,input:practiceAttempt.input,itemId:'template-'+templateId,language:practiceAttempt.language,at:practiceAttempt.at}:null});
   build=true;showRoofs=false;camera={x:x+3.5,y:y+3.5};status='完整建筑已放置，点击任意积木可单独编辑。';emit();return;
  }
  throw Error('附近没有足够的空地，请走到更开阔的位置再放置');
 }

 async function tap(hit,p){
  if(build&&selection&&!selection.id&&!requiresReading(buildingItem(selection,catalog.items))){return placeItemAt(selection.itemId,selection.color,p,{fromInventory:true});}
  if(!build&&hit?.kind==='object'){const o=currentObjects().find(o=>o.id===hit.id);if(buildingItem(o,catalog.items)?.building?.type==='door')return commit({type:'door',id:o.id});}
  if(selection?.petId)return movePet(selection.petId,p);
  // Clicking another placed item selects it instead of moving the previous one onto it.
  if(build&&hit?.kind==='object'){
   const found=currentObjects().find(o=>o.id===hit.id);
   if(found){selection={...found,fromInventory:false};preview=null;emit();return;}
  }
  if(hit?.kind==='pet'){
   wish=wish?.petId===hit.id
    ?{...wish,expanded:true,until:Date.now()+22000}
    :{petId:hit.id,...petWish(hit.id,round++,catalog.items,lang()),expanded:true,until:Date.now()+22000};
   translation=false;
   emit();
   return;
  }
  if(build&&hit?.kind==='object'){
   const found=currentObjects().find(o=>o.id===hit.id);
   if(found){
    selection={...found,fromInventory:false};
    emit();
    return;
   }
  }
  navigate(p);
  emit();
 }

 async function drop(hit,p){
  if(hit.kind==='pet')return movePet(hit.id,p);
  const obj=currentObjects().find(o=>o.id===hit.id);
  if(obj&&(build||homeObjectInteractive(obj,catalog.items)))return commit({type:'move',id:obj.id,position:resolvePlacement(obj.itemId,p,obj)});
 }

 async function rotate(){if(!build)return;rotation=((selection?.rotation??rotation)+1)%4;if(selection?.id)await commit({type:'move',id:selection.id,position:{rotation}});else if(selection){selection.rotation=rotation;if(preview){preview.rotation=rotation;preview.valid=canPlace(preview,currentObjects(),catalog.items).ok;}emit();}}
 async function recall(){if(!build)return;if(selection?.id)await commit({type:'recall',id:selection.id});else{status='先点击地面上的家具，再收回。';emit();}}
 async function commit(action){
  check();if(!home)throw Error('请先进入家园');const id=home.id;if(pending)throw Error('有未保存的操作，请先重试保存');
  const job=async()=>{check();if(home?.id!==id)throw Error('家园已切换');if(pending)throw Error('有未保存的操作，请先重试保存');loadTicket++;
   if(store.measureCapacity&&homeCapacity(home).used===null){
    const measured=await store.measureCapacity(id);check();if(home?.id!==id)throw Error('家园已切换');home=measured;
    const missing=Object.keys(home.parts||{}).filter(k=>k.startsWith('chunk:')&&!Number.isSafeInteger(home.objectCounts?.[k]));
    if(missing.length){status='正在核对家园总容量…';emit();for(const key of missing){if(!remote)throw Error('家园地块缺失，无法核对总容量');await remote.loadPart(home,key);check();if(home?.id!==id)throw Error('家园已切换');}const measured=await store.measureCapacity(id);check();if(home?.id!==id)throw Error('家园已切换');home=measured;}
   }
   const target=action.object||action.position||currentObjects().find(o=>o.id===action.id);
   if(target&&Number.isFinite(target.x)){for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const key='chunk:'+chunkKey(target.x+dx*32,target.y+dy*32);if(!Object.hasOwn(parts,key))parts[key]=remote?await remote.loadPart(home,key):await store.read(id,key);}}
   check();if(home?.id!==id)throw Error('家园已切换');
   action.actors=[hero,...(duo()?[secondHero]:[])];
   const keys=Object.keys(parts).filter(k=>k.startsWith('chunk:'));if(action.receipt)keys.push(`receipt:${action.receipt}`,'local:practice');
   try{let changes=[];const result=await store.mutate(id,keys,(_,data)=>{const before=structuredClone(data);const changed=applyHomeAction(data,action,catalog.items);changes=homeEditDelta(before,data);return changed;});check();if(home?.id!==id)return;editHistory.record(changes,action.group);home=result.home;for(const [key,value]of Object.entries(result.data))if(!key.startsWith('receipt:'))parts[key]=value;selection=['resize','toggleInteraction','properties','door','move'].includes(action.type)&&selection?.id===action.id?{...currentObjects().find(o=>o.id===action.id)}:(catalog.items.find(i=>i.id===(action.object?.itemId||action.itemId))?.building||action.type==='create')?{itemId:action.object?.itemId||action.itemId,color:action.object?.color||action.color||'',fromInventory:true,rotation}:null;preview=null;candidates=[];status='已保存到本机';wishFeedback(action);if(walkPath.length&&destination)navigate(destination,0);if(secondPath.length&&secondDestination)navigate(secondDestination,1);emit();if(action.practice){try{await drainPractice(id);}catch(e){pending=()=>drainPractice(id);error(e);}}}
   catch(e){if(/存储|保存|quota|abort|unknown|disk/i.test(`${e.name} ${e.message}`)){pending=()=>job();status='未保存：本机存储写入失败。点击下方重试保存。';showRetry();}else error(e);throw e;}
  };const next=mutation.catch(()=>{}).then(job);mutation=next;return next;
 }
 async function restoreEdit(reverse){
  check();if(!home||!build)return;const id=home.id;
  const job=async()=>{
   check();if(home?.id!==id)throw Error('家园已切换');if(pending)throw Error('请先重试保存');
   const entry=editHistory.peek(reverse);if(!entry)return;
   const keys=[...new Set(entry.changes.map(c=>c.key))];loadTicket++;
   const result=await store.mutate(id,keys,(_,data)=>applyHomeEditDelta(data,entry.changes,reverse,{catalog:catalog.items,actors:[hero,...(duo()?[secondHero]:[])]}));
   check();if(home?.id!==id)return;
   editHistory.finish(reverse);home=result.home;Object.assign(parts,result.data);
   selection=null;preview=null;status=reverse?'已撤销，可重做':'已重做';
   if(walkPath.length&&destination)navigate(destination,0);if(secondPath.length&&secondDestination)navigate(secondDestination,1);emit();
  };
  const next=mutation.catch(()=>{}).then(job);mutation=next;return next;
 }
 function wishFeedback(action){
  if(!wish)return;const itemId=action.itemId||action.object?.itemId||currentObjects().find(o=>o.id===action.id)?.itemId;if(itemId!==wish.itemId)return;
  const item=catalog.items.find(i=>i.id===itemId),language=lang(),other=language==='en'?'zh':'en';let key;
  if(action.type==='summon'){wish.phase='place';key='HOME-PLACE';}
  else if(action.type==='use'){key='HOME-USE';wish.phase='done';}
  else if(['place','move'].includes(action.type)){const object=action.object||currentObjects().find(o=>o.id===action.id),pet=pets.find(p=>p.id===wish.petId);if(!object||!pet||Math.hypot(object.x-pet.x,object.y-pet.y)>5)return;key='HOME-READY';wish.phase='done';}
  if(!key)return;const line=locale=>(catalog.dialogue?.[key]?.[locale]||'').replace('{item}',item[locale==='en'?'en':'zh']).replace('{action}',catalog.activityWords?.[item.activity]?.[locale]||'');wish={...wish,text:line(language),translation:line(other),until:Date.now()+18000};translation=false;
 }
 function showRetry(){emit();}

 let attempt=null;
 async function summon(text,input){
  if(busy)throw Error('正在召唤，请稍候');
  check();
  const key=JSON.stringify([home?.id,spellEpoch,selection?.itemId,selection?.color,lang()]);
  if(speechSession?.key!==key)speechSession={key,count:0};
  if(input==='speech'&&/[\p{L}\p{N}]/u.test(text||''))speechSession.count++;
  const result=matchHomeSpell(text,[...catalog.items,...TEMPLATE_PRACTICE],lang(),selection?.id?null:selection,{input,speechAttempts:speechSession.count});
  view.setSpeechFeedback(result.feedback);
  candidates=[];attempt=null;

  if(!result.candidates.length)throw Error(result.error);
  attempt={receipt:crypto.randomUUID(),input,language:lang(),at:Date.now(),homeId:home?.id,selection,text};
  candidates=result.candidates;
  if(candidates.length>1){status='请选择你想要的物品';emit();return;}
  await choose(candidates[0]);
 }
 async function choose(candidate){
  check();
  if(!attempt||home?.id!==attempt.homeId||selection!==attempt.selection)throw Error('召唤已过期，请重新说一句');
  if(!candidates.some(c=>c.itemId===candidate.itemId&&c.color===candidate.color))throw Error('请重新完成召唤句子');
  if(busy)return;
  busy=true;
  try{
   const item=[...catalog.items,...TEMPLATE_PRACTICE].find(i=>i.id===candidate.itemId);
   attempt.practiceValid=compareDungeonSpeech(attempt.text,item[attempt.language==='en'?'en':'zh'],attempt.language==='en'?'en':'zh-CN').accuracy===1;
   const template=TEMPLATE_PRACTICE.find(i=>i.id===candidate.itemId);
   if(template){await placeTemplate(template.templateId,attempt);attempt=null;speechSession=null;view.setInput('');view.closeSummon();return;}
   const object=spellPlacement(candidate);
   const practice=attempt.practiceValid?{id:attempt.receipt,input:attempt.input,itemId:candidate.itemId,language:attempt.language,at:attempt.at}:null;
   await commit({type:'summon',...candidate,receipt:attempt.receipt,input:attempt.input,object,practice});
   attempt=null;speechSession=null;
   view.setInput('');view.closeSummon();
  }finally{busy=false;}
 }
 async function drainPractice(id){
  if(!store.updateLocal)return;
  const queued=await store.read(id,'local:practice');
  for(const event of Object.values(queued)){
   if(!valid()||home?.id!==id)return;
   const recorded=await recordHomePractice({...event,item:[...catalog.items,...TEMPLATE_PRACTICE].find(i=>i.id===event.itemId)},()=>valid()&&home?.id===id);
   if(recorded===false)return;
   if(!valid()||home?.id!==id)return;
   await store.updateLocal(id,'local:practice',rows=>{delete rows[event.id];});
  }
 }
 function spellPlacement(candidate){
  const fixed=selection?.spellPosition;
  const positions=fixed?[fixed]:Array.from({length:81},(_,i)=>({x:hero.x+2+(i%9)*2,y:hero.y-8+Math.floor(i/9)*2})).sort((a,b)=>Math.hypot(a.x-hero.x,a.y-hero.y)-Math.hypot(b.x-hero.x,b.y-hero.y));
  for(const p of positions){
   if(!Object.hasOwn(parts,`chunk:${chunkKey(p.x,p.y)}`))continue;
   const obj=at(candidate.itemId,p,{color:candidate.color});
   if(canPlace(obj,currentObjects(),catalog.items).ok)return obj;
  }
  throw Error('这里放不下，请从建造目录拖到一处空地，再念咒语。');
 }
 async function record(){check();if(recording)return;const token={id:home?.id,epoch:spellEpoch,selection,language:lang(),color:selection?.color,starting:null};recording=token;status='正在准备麦克风…';emit();token.starting=voice.start(abort.signal,{onPartial:text=>{if(recording===token&&valid()&&token.epoch===spellEpoch&&token.selection===selection&&token.language===lang()&&token.color===selection?.color)view.setSpeechFeedback(matchHomeSpell(text,[...catalog.items,...TEMPLATE_PRACTICE],lang(),selection?.id?null:selection).feedback);}});try{await token.starting;if(recording===token&&valid()){status='正在听，松开后召唤';emit();}}catch(e){if(recording===token)recording=null;throw e;}}
 async function finish(){const token=recording;if(!token)return;await token.starting;if(recording!==token||!valid())return;if(token.finishing)return;token.finishing=true;let text;try{text=await voice.finish();}catch(e){if(recording===token)recording=null;throw e;}if(recording!==token)return;recording=null;if(token.epoch!==spellEpoch||token.id!==home?.id||!valid()||token.selection!==selection||token.language!==lang()||token.color!==selection?.color)return;await summon(text,'speech');}
 async function movePet(id,p){check();if(!parts[`chunk:${chunkKey(p.x,p.y)}`])throw Error('土地尚未加载，请重试加载后安置宠物');const target=currentObjects().findLast(o=>{const b=footprint(o,catalog.items);return b.item.activity&&p.x>=b.x&&p.x<b.x+b.w&&p.y>=b.y&&p.y<b.y+b.h;});
  if(target&&pets.some(pet=>pet.id!==id&&pet.targetId===target.id&&pet.until>Date.now()))throw Error('这个设施已有宠物在使用');
  const obstacle=currentObjects().find(o=>{const item=buildingItem(o,catalog.items),b=obstruction(o,item);return b&&!item.activity&&p.x>=b.x&&p.x<b.x+b.w&&p.y>=b.y&&p.y<b.y+b.h;});if(obstacle)throw Error('这里有障碍，请换一个位置');
  if(target){const b=footprint(target,catalog.items);p={x:b.x+b.w/2,y:b.y+b.h*.85};}await savePetPlacement(id,p,target);}
 async function savePetPlacement(id,position,target=null){
  check();if(!home)throw Error('请先进入家园');if(pending)throw Error('请先重试保存未完成的操作');
  const homeId=home.id;
  const job=async()=>{
   check();if(home?.id!==homeId)throw Error('家园已切换');
   if(!Object.hasOwn(ownedPetRecords(getContext().save),id))throw Error('宠物已不在背包中');
   let result;
   try{result=await store.mutate(homeId,['residents'],(_,data)=>{if(position)data.residents[id]={x:position.x,y:position.y};else delete data.residents[id];});}
   catch(e){pending=job;showRetry();throw e;}
   check();if(home?.id!==homeId)return;home=result.home;parts.residents=result.data.residents;roster();
   const pet=pets.find(p=>p.id===id);
   if(pet&&position)Object.assign(pet,{...position,activity:target?catalog.items.find(i=>i.id===target.itemId).activity:null,targetId:target?.id,until:Date.now()+20000});
   if(!position&&wish?.petId===id)wish=null;
   if(target&&wish?.petId===id)wishFeedback({type:'use',itemId:target.itemId});
   selection=null;preview=null;status=position?'宠物已安置，位置已保存到本机':'宠物已收回家园宠物背包';emit();
  };
  const next=mutation.catch(()=>{}).then(job);mutation=next;return next;
 }
 async function sync(){check();if(pending)throw Error('请先重试本机保存');if(!remote)throw Error('请在冒险中登录 Keepwork 后再打开家园');if(busy)throw Error('请等待当前操作完成');busy=true;const id=home.id;status='正在同步家园…';emit();try{await mutation;const result=await remote.sync(id);check();if(home?.id===id)home=await store.get(id);status=result.conflict?'云端变化已保留为副本，再次同步可上传当前家园。':home?.dirty?'此前版本已同步，仍有本地待同步修改。':'家园已同步到云端';await list();}finally{busy=false;emit();}}
 async function rename(row,nextName){const name=nextName!==undefined?nextName:prompt('家园的新名字',row.name);if(!name?.trim())return;try{if(row.cloudOnly)await remote.download(row);await store.mutate(row.id,[],h=>{h.name=name.trim().slice(0,40);});if(home?.id===row.id)home=await store.get(row.id);await list();}catch(e){error(e);}}
 async function remove(row,confirmed=false){if(!confirmed&&!confirm(`删除“${row.name}”？${remote?'将同时移除云端目录入口。':''}此操作不能撤销。`))return;try{if(remote)await remote.remove(row.id);if(!row.cloudOnly)await store.remove(row.id);if(home?.id===row.id)await back();else await list();}catch(e){error(e);}}
 async function showGuests(){if(!context.owner)throw Error('登录后可将访客家园复制到当前角色');const guestStore=createHomeStore(homeScope(null,context.roleId));guests=await guestStore.listGuests();await guestStore.close();if(!guests.length)status='此角色没有可复制的访客家园';emit();}
 async function copyGuest(row){const guestStore=createHomeStore(row.sourceScope);try{const snapshot=await guestStore.snapshot(row.id);check();const copied={...snapshot.home,id:crypto.randomUUID(),name:`${snapshot.home.name}（访客副本）`,baseRevision:null,remote:null,dirty:true};await store.install(copied,snapshot.parts);guests=null;await list();}finally{await guestStore.close();}}
 let visitVisible=!document.hidden,visitElapsed=0,visitClock=performance.now(),visitSaving=Promise.resolve(),visitCheckpoint=0;
 function accountVisit(){const now=performance.now();if(home&&visitVisible)visitElapsed+=Math.max(0,Math.min(2000,now-visitClock));visitClock=now;}
 function saveVisit(screenshot=false){if(!home)return visitSaving;accountVisit();const id=home.id,elapsedMs=visitElapsed;visitElapsed=0;let preview=null;try{if(screenshot)preview=view.capture();}catch(e){console.warn('Home preview unavailable',e.name);}
  visitSaving=visitSaving.catch(()=>{}).then(()=>store.saveVisit(id,{elapsedMs,preview})).catch(e=>{if(home?.id===id)visitElapsed+=elapsedMs;throw e;});return visitSaving;
 }
 const pageExit=()=>{void saveVisit(true).catch(()=>{});},visibility=()=>{accountVisit();visitVisible=!document.hidden;if(document.hidden)void saveVisit(false).catch(error);};
 window.addEventListener('pagehide',pageExit);document.addEventListener('visibilitychange',visibility);
 let nextPetThink=Date.now()+20000,petTurn=0;
 const timer=setInterval(()=>{if(!valid()){dispose();return;}accountVisit();if(entering||!home||document.hidden)return;if(++visitCheckpoint%15===0)void saveVisit().catch(error);roster();
  const now=Date.now(),{width,height}=view.size,near=pets.filter(p=>Math.abs(p.x-camera.x)<width/scale/2&&Math.abs(p.y-camera.y)<height/scale/2);
  for(const pet of near)if(pet.until&&pet.until<=now){pet.activity=null;pet.targetId=null;pet.until=0;}
  if(now>=nextPetThink){nextPetThink=now+20000;
   const available=near.filter(p=>!p.activity&&selection?.petId!==p.id),pet=available.length?available[petTurn++%available.length]:null;
   if(pet){const facility=currentObjects().find(o=>{const b=footprint(o,catalog.items);return b.item.activity&&pet.x>=b.x&&pet.x<b.x+b.w&&pet.y>=b.y&&pet.y<b.y+b.h&&!pets.some(other=>other.targetId===o.id&&other.until>now);});
    if(facility){pet.activity=catalog.items.find(i=>i.id===facility.itemId).activity;pet.targetId=facility.id;pet.until=now+10000;}
    if(!quiet&&(!wish||now>wish.until)){wish={petId:pet.id,...petWish(pet.id,round++,catalog.items,lang()),until:now+15000};translation=false;}
   }
  }
  emit();
 },1000);
 function dispose(){if(dead)return;clearInput();window.removeEventListener('keydown',keyDown,true);window.removeEventListener('keyup',keyUp,true);window.removeEventListener('blur',clearInput);document.removeEventListener('visibilitychange',clearInput);const finalVisit=saveVisit(true);window.removeEventListener('pagehide',pageExit);document.removeEventListener('visibilitychange',visibility);dead=true;entryTicket++;loading.dispose();onScene(false);clearInterval(timer);abort.abort();loadTicket++;void voice.cancel();view.dispose();void Promise.allSettled([mutation,finalVisit]).then(()=>store.close()).catch(()=>{});}
 try{status='家园自动保存到本机，云端同步由你手动开启。';await list();if(initialHomeId)await enter({id:initialHomeId});}catch(e){error(e);}
 return {dispose,renderStats:()=>view.stats(),canClose:()=>!pending||confirm('仍有未保存操作，离开会丢失这些操作。确定离开？')};
}
