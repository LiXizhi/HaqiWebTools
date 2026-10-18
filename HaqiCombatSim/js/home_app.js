import {stepHomeWalk,findHomePath} from './home_walk_core.js';
import {homeObjectInteractive,createHome,homeScope,chunkKey,inventoryKey,visibleChunkKeys,parseSummon,canPlace,footprint,petHomePosition,petWish,summonSentences} from './home_core.js';
import {homeObjects,applyHomeAction} from './home_actions_core.js';
import {createHomeStore} from './home_store.js';
import {createHomeCloud} from './home_cloud.js';
import {createHomeView} from './view_home.js';
import {createLearningVoice} from './language_adventure_voice.js';
import {ownedPetRecords} from './adventure_pet_files_core.js';
import {hashSeed} from './rng_core.js';
const directories=new Map();
export async function primeHomeDirectory(cloud,role){if(!cloud?.owner||!role)return;const key=homeScope(cloud.owner,role);try{directories.set(key,await cloud.homeRead(`homes/${role}/index.json`,{refresh:true})||{version:1,entries:{}});}catch{directories.delete(key);}}
export async function openHomeSystem({root,getContext,close,cloud,assetMode='cdn',drawHero,drawTree,onScene=()=>{},catalog:providedCatalog,store:providedStore,voice:providedVoice}){
 const context=getContext(),scope=homeScope(context.owner,context.roleId),store=providedStore||createHomeStore(scope);
 let dead=false,home=null,parts={},homes=[],guests=null,selection=null,preview=null,inventory={},pets=[],camera={x:0,y:0},scale=40,status='正在加载家园…',pending=null,candidates=[],quiet=false,wish=null,translation=false,rotation=0,loadTicket=0,round=0,recording=null,mutation=Promise.resolve(),busy=false;
 let walkChunk=null;let hero={x:0,y:0,facing:0}, destination=null,build=false,walkPath=[];
 const valid=()=>{const c=getContext();return !dead&&!!c.roleId&&scope===homeScope(c.owner,c.roleId)&&c.active!==false;};
 const check=()=>{if(!valid())throw Error('角色或账号已变化');};
 const abort=new AbortController(),catalog=providedCatalog||await fetch('data/adventure/home/catalog.json',{signal:abort.signal}).then(r=>{if(!r.ok)throw Error('家园目录加载失败');return r.json();});
 check();
 const lang=()=>getContext().save?.languageLearning?.target==='zh-CN'?'zh':'en';
 const voice=providedVoice||createLearningVoice({getSettings:()=>getContext().save?.languageLearning||{}});
 const remote=context.owner&&cloud?.owner===context.owner?createHomeCloud({store,roleId:context.roleId,catalog:catalog.items,valid,io:{read:async(path,options)=>{if(path.endsWith('/index.json')&&!options?.refresh&&directories.has(scope))return directories.get(scope);const value=await cloud.homeRead(path,options);if(path.endsWith('/index.json'))directories.set(scope,value||{version:1,entries:{}});return value;},write:async(path,value)=>{await cloud.homeWrite(path,value);if(path.endsWith('/index.json'))directories.set(scope,value);}}}):null;

 function at(itemId,position,extra={}){
  const px=Math.round(position.x),py=Math.round(position.y);
  const obj={id:crypto.randomUUID(),itemId,color:selection?.color||'',rotation,...extra,x:px,y:py};
  const item=catalog.items.find(i=>i.id===itemId);
  if(item?.layer==='top'){
   const parent=homeObjects(parts).filter(o=>{const b=footprint(o,catalog.items);return b.item.slots&&px>=b.x&&py>=b.y&&px<b.x+b.w&&py<b.y+b.h;}).at(-1);
   obj.parentId=parent?.id;
  }
  return obj;
 }

 function resolvePlacement(itemId,position,extra={}){
  const objs=homeObjects(parts);
  const offsets=[[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1],[2,0],[-2,0],[0,2],[0,-2]];
  for(const [dx,dy] of offsets){
   const cand=at(itemId,{x:Math.round(position.x)+dx,y:Math.round(position.y)+dy},extra);
   if(canPlace(cand,objs,catalog.items).ok)return cand;
  }
  return at(itemId,position,extra);
 }

 async function placeItemAt(itemId,color='',position,extra={}){
  const obj=resolvePlacement(itemId,position,{...extra,color});
  const key=inventoryKey(itemId,color);
  if((inventory[key]||0)>0){
   return commit({type:'place',object:obj});
  }
  return commit({
   type:'summon',
   receipt:crypto.randomUUID(),
   input:'build',
   itemId,
   color:color||'',
   object:obj
  });
 }

 const view=createHomeView(root,{
  drawHero,
  drawTree,
  walk:p=>{walkPath=[];destination=p;},
  stopWalk:()=>{walkPath=[];destination=null;hero={...hero,moving:false};emit();},
  mode:value=>{build=!!value;if(!build){selection=null;preview=null;}emit();},
  step:dt=>{
   if(!home||!destination)return;
   const target=walkPath[0]||destination,previous=hero;
   hero=stepHomeWalk(hero,target,dt,homeObjects(parts),catalog.items,home.seed);
   if(walkPath.length){
    if(Math.hypot(hero.x-target.x,hero.y-target.y)<.08)walkPath.shift();
    else if(Math.hypot(hero.x-previous.x,hero.y-previous.y)<.0001&&dt>0)walkPath=[];
    hero={...hero,moving:walkPath.length>0};
   }
   camera={x:hero.x,y:hero.y};
   if(!hero.moving)destination=null;
   emit();
   if(chunkKey(camera.x,camera.y)!==walkChunk){
    walkChunk=chunkKey(camera.x,camera.y);
    void loadChunks().catch(error);
   }
  },
  retry:async()=>{const job=pending;pending=null;try{await job?.();}catch(e){error(e);}},
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
  zoom:factor=>{scale=Math.max(24,Math.min(72,scale*factor));emit();void loadChunks().catch(error);},
  resize:()=>void loadChunks().catch(error),
  reload:()=>loadChunks(),
  take:async(row,p)=>{
   await placeItemAt(row.itemId,row.color||'',p);
  },
  color:value=>{if(selection){selection.color=value;if(preview)preview.color=value;emit();}},
  helpWish:()=>{
   if(wish){
    select(wish.itemId,wish.color||'',wish.phase==='place');
    const item=catalog.items.find(i=>i.id===wish.itemId);
    if(item)view.setInput(lang()==='en'?`I want ${/^[aeiou]/.test(item.en)?'an':'a'} ${item.en}.`:`我想要一个${item.zh}。`);
    view.openSummon?.();
   }
  },
  speakWish:()=>wish?voice.speak(wish.text,lang()==='en'?'en':'zh-CN',abort.signal):null,
  select,
  tap,
  drop,
  hover,
  rotate,
  resizeFurniture:delta=>build&&selection?.id?commit({type:'resize',id:selection.id,delta}):null,
  recall,
  toggleActive:()=>build&&selection?.id?commit({type:'toggleInteraction',id:selection.id}):null,
  cancel:()=>{selection=null;preview=null;emit();},
  quiet:()=>{quiet=!quiet;emit();},
  findPet:id=>{const p=pets.find(p=>p.id===id);if(p){navigate(p);emit();}},
  translate:()=>{translation=!translation;emit();},
  speak:text=>voice.speak(text,lang()==='en'?'en':'zh-CN',abort.signal),
  summon:text=>summon(text,'text'),
  choose,
  record,
  finish,
  cancelVoice:()=>{recording=null;return voice.cancel();}
 });

 function navigate(p){
  walkPath=home?findHomePath(hero,p,homeObjects(parts),catalog.items,home.seed,point=>Object.hasOwn(parts,`chunk:${chunkKey(point.x,point.y)}`)):[];
  destination=walkPath.at(-1)||null;
  hero={...hero,moving:walkPath.length>0};
 }
 function emit(){if(valid())view.render({hero,destination,heroSave:getContext().save,build,home,homes,guests,catalog,inventory,objects:homeObjects(parts),pets,camera,scale,status,selection,preview,candidates,quiet,wish,translation,unsaved:!!pending,lang:lang(),assetMode});}
 function error(e){if(!valid())return;status=pending?'未保存：本机存储写入失败，请重试保存。':e.message||'操作未完成，请重试';emit();}
 async function refresh(){check();if(!remote)throw Error('请在冒险中登录 Keepwork 后再打开家园');status='正在读取云端目录…';emit();await remote.list(true);await list();}
 async function list(){check();const local=await store.list();check();let index=directories.get(scope);if(remote&&!index){try{index=await remote.list();}catch(e){status=`本地家园已加载；${e.message}`;}}
  const rows=Object.values(index?.entries||{}).filter(row=>!local.some(h=>h.id===row.id));homes=[...local,...rows.map(row=>({...row,cloudOnly:true}))];emit();}
 async function create(name){check();const id=crypto.randomUUID();await store.create(createHome(id,name,hashSeed(id)));check();await enter({id});}
 function roster(){const records=ownedPetRecords(getContext().save),saved=parts.residents||{},previous=new Map(pets.map(p=>[p.id,p]));pets=Object.values(records).map((pet,i)=>{const definition=getContext().content.pets[pet.speciesId]||{},position=saved[pet.id]||petHomePosition(home.seed,pet.id,i),old=previous.get(pet.id);return {...pet,name:pet.name||definition.name||'宠物',art:definition.art,stage:pet.appearanceStage??Math.min(3,[1,10,25,40].filter(n=>pet.level>=n).length-1),...position,...(old&&old.homeId===home.id?{x:old.x,y:old.y,activity:old.activity,until:old.until,targetId:old.targetId}:{}),homeId:home.id};});}
 async function enter(row){check();if(pending)throw Error('请先重试保存未完成的操作');loadTicket++;await voice.cancel();recording=null;selection=null;preview=null;wish=null;pets=[];parts={};
  if(row.cloudOnly){if(!remote)throw Error('请先登录');await remote.download(row);check();}
  home=await store.get(row.id);check();if(!home||home.deleted)throw Error('家园已移除');parts.residents=await store.read(home.id,'residents');inventory=await store.read(home.id,'inventory');parts.inventory=inventory;check();camera={x:0,y:0};hero={x:0,y:0,facing:0};destination=null;walkPath=[];build=false;walkChunk=null;visitElapsed=0;visitClock=performance.now();visitCheckpoint=0;nextPetThink=Date.now()+20000;onScene(true);status='已保存到本机；点击草地控制主角移动。';roster();emit();await loadChunks();}
 async function back(){if(pending)throw Error('请先点击重试保存');await saveVisit(true);await voice.cancel();loadTicket++;onScene(false);destination=null;walkPath=[];home=null;parts={};pets=[];selection=null;preview=null;wish=null;await list();}
 async function loadChunks(){if(!home||!valid())return;const ticket=++loadTicket,id=home.id,{width,height}=view.size,keys=visibleChunkKeys(camera,width,height,scale).map(k=>`chunk:${k}`);const values=await Promise.all(keys.map(k=>remote?remote.loadPart(home,k):store.read(id,k)));if(ticket!==loadTicket||home?.id!==id||!valid())return;for(const k of Object.keys(parts))if(k.startsWith('chunk:')&&!keys.includes(k))delete parts[k];keys.forEach((k,i)=>{parts[k]=values[i];});if(walkPath.length&&destination)navigate(destination);emit();}

 function select(itemId,color='',fromInventory=false){
  build=true;
  selection={itemId,color,fromInventory,rotation};
  preview=null;
  const item=catalog.items.find(i=>i.id===itemId);
  if(item)status=`已选择「${item.zh}」，按住物品拖到地面摆放`;
  emit();
 }

 function hover(position,hit){
  if(!home||hit?.kind==='pet')return;
  if(!position){preview=null;emit();return;}
  const selected=hit?.kind==='object'?homeObjects(parts).find(o=>o.id===hit.id):selection;
  if(!selected?.itemId||(!build&&(!hit||!homeObjectInteractive(selected,catalog.items))))return;
  const obj=at(selected.itemId,position,selected);
  const test=canPlace(obj,homeObjects(parts),catalog.items);
  preview={...obj,valid:test.ok};
  emit();
 }

 async function tap(hit,p){
  if(selection?.petId)return movePet(selection.petId,p);
  // Clicking another placed item selects it instead of moving the previous one onto it.
  if(build&&hit?.kind==='object'){
   const found=homeObjects(parts).find(o=>o.id===hit.id);
   if(found){selection={...found,fromInventory:false};preview=null;emit();return;}
  }
  if(hit?.kind==='pet'){
   wish={petId:hit.id,...petWish(hit.id,round++,catalog.items,lang()),until:Date.now()+22000};
   translation=false;
   emit();
   return;
  }
  if(build&&hit?.kind==='object'){
   const found=homeObjects(parts).find(o=>o.id===hit.id);
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
  const obj=homeObjects(parts).find(o=>o.id===hit.id);
  if(obj&&(build||homeObjectInteractive(obj,catalog.items)))return commit({type:'move',id:obj.id,position:resolvePlacement(obj.itemId,p,obj)});
 }

 async function rotate(){if(!build)return;rotation=(rotation+1)%4;if(selection?.id)await commit({type:'move',id:selection.id,position:{rotation}});else if(selection){selection.rotation=rotation;if(preview){preview.rotation=rotation;preview.valid=canPlace(preview,homeObjects(parts),catalog.items).ok;}emit();}}
 async function recall(){if(!build)return;if(selection?.id)await commit({type:'recall',id:selection.id});else{status='先点击地面上的家具，再收回。';emit();}}
 async function commit(action){
  check();if(!home)throw Error('请先进入家园');const id=home.id;if(pending)throw Error('有未保存的操作，请先重试保存');
  const job=async()=>{check();if(home?.id!==id)throw Error('家园已切换');loadTicket++;const keys=['inventory',...Object.keys(parts).filter(k=>k.startsWith('chunk:'))];if(action.receipt)keys.push(`receipt:${action.receipt}`);
   try{const result=await store.mutate(id,keys,(_,data)=>applyHomeAction(data,action,catalog.items));check();if(home?.id!==id)return;home=result.home;for(const [key,value]of Object.entries(result.data))if(!key.startsWith('receipt:'))parts[key]=value;inventory=parts.inventory;selection=['resize','toggleInteraction'].includes(action.type)&&selection?.id===action.id?{...homeObjects(parts).find(o=>o.id===action.id)}:null;preview=null;candidates=[];status='已保存到本机';wishFeedback(action);if(walkPath.length&&destination)navigate(destination);emit();}
   catch(e){if(/存储|保存|quota|abort|unknown|disk/i.test(`${e.name} ${e.message}`)){pending=()=>job();status='未保存：本机存储写入失败。点击下方重试保存。';showRetry();}else error(e);throw e;}
  };const next=mutation.catch(()=>{}).then(job);mutation=next;return next;
 }
 function wishFeedback(action){
  if(!wish)return;const itemId=action.itemId||action.object?.itemId||homeObjects(parts).find(o=>o.id===action.id)?.itemId;if(itemId!==wish.itemId)return;
  const item=catalog.items.find(i=>i.id===itemId),language=lang(),other=language==='en'?'zh':'en';let key;
  if(action.type==='summon'){wish.phase='place';key='HOME-PLACE';}
  else if(action.type==='use'){key='HOME-USE';wish.phase='done';}
  else if(['place','move'].includes(action.type)){const object=action.object||homeObjects(parts).find(o=>o.id===action.id),pet=pets.find(p=>p.id===wish.petId);if(!object||!pet||Math.hypot(object.x-pet.x,object.y-pet.y)>5)return;key='HOME-READY';wish.phase='done';}
  if(!key)return;const line=locale=>(catalog.dialogue?.[key]?.[locale]||'').replace('{item}',item[locale==='en'?'en':'zh']).replace('{action}',catalog.activityWords?.[item.activity]?.[locale]||'');wish={...wish,text:line(language),translation:line(other),until:Date.now()+18000};translation=false;
 }
 function showRetry(){emit();}

 let attempt=null;
 async function summon(text,input){
  if(busy)throw Error('正在召唤，请稍候');
  check();
  let phrase=String(text||'').trim();
  if(!phrase){
   const item=selection?.itemId?catalog.items.find(i=>i.id===selection.itemId):catalog.items.find(i=>i.id==='chair');
   phrase=item?summonSentences(item,lang(),selection?.color||'')[0]:(lang()==='en'?'I want a chair.':'我想要一把椅子。');
  }
  const result=parseSummon(phrase,catalog.items,lang());
  if(!result.candidates.length)throw Error(result.error);
  attempt={receipt:crypto.randomUUID(),input,homeId:home?.id};
  candidates=result.candidates;
  if(candidates.length>1){status='请选择你想要的物品';emit();return;}
  await choose(candidates[0]);
 }
 async function choose(candidate){
  check();
  if(!attempt||home?.id!==attempt.homeId)throw Error('召唤已过期，请重新说一句');
  if(busy)return;
  busy=true;
  try{
   const object=preview?.valid&&preview.itemId===candidate.itemId?{...preview,color:candidate.color,id:crypto.randomUUID()}:null;
   await commit({type:'summon',...candidate,...attempt,object});
   attempt=null;
   view.setInput('');
  }finally{busy=false;}
 }
 async function record(){check();if(recording)return;const token={id:home?.id,starting:null};recording=token;status='正在准备麦克风…';emit();token.starting=voice.start(abort.signal,{onPartial:text=>{if(recording===token&&valid())view.setInput(text);}});try{await token.starting;if(recording===token&&valid()){status='正在听，松开后召唤';emit();}}catch(e){if(recording===token)recording=null;throw e;}}
 async function finish(){const token=recording;if(!token)return;await token.starting;if(recording!==token||!valid())return;const text=await voice.finish();recording=null;if(token.id!==home?.id||!valid())return;view.setInput(text);await summon(text,'speech');}
 async function movePet(id,p){check();if(!parts[`chunk:${chunkKey(p.x,p.y)}`])throw Error('土地尚未加载，请重试加载后安置宠物');const target=homeObjects(parts).findLast(o=>{const b=footprint(o,catalog.items);return b.item.activity&&p.x>=b.x&&p.x<b.x+b.w&&p.y>=b.y&&p.y<b.y+b.h;});
  if(target&&pets.some(pet=>pet.id!==id&&pet.targetId===target.id&&pet.until>Date.now()))throw Error('这个设施已有宠物在使用');
  const obstacle=homeObjects(parts).find(o=>{const b=footprint(o,catalog.items);return b.item.layer==='solid'&&!b.item.activity&&p.x>=b.x&&p.x<b.x+b.w&&p.y>=b.y&&p.y<b.y+b.h;});if(obstacle)throw Error('这里有障碍，请换一个位置');
  if(target){const b=footprint(target,catalog.items);p={x:b.x+b.w/2,y:b.y+b.h*.85};}const homeId=home.id;let result;try{result=await store.mutate(homeId,['residents'],(_,data)=>{data.residents[id]={x:p.x,y:p.y};});}catch(e){pending=()=>{if(home?.id!==homeId)throw Error('家园已切换');return movePet(id,p);};showRetry();throw e;}check();if(home?.id!==homeId)return;home=result.home;parts.residents=result.data.residents;const pet=pets.find(p=>p.id===id);if(pet)Object.assign(pet,{x:p.x,y:p.y,activity:target?catalog.items.find(i=>i.id===target.itemId).activity:null,targetId:target?.id,until:Date.now()+20000});if(target&&wish?.petId===id)wishFeedback({type:'use',itemId:target.itemId});selection=null;preview=null;status='宠物已安置，位置已保存到本机';emit();}
 async function sync(){check();if(pending)throw Error('请先重试本机保存');if(!remote)throw Error('请在冒险中登录 Keepwork 后再打开家园');if(busy)throw Error('请等待当前操作完成');busy=true;const id=home.id;status='正在同步家园…';emit();try{await mutation;const result=await remote.sync(id);check();if(home?.id===id)home=await store.get(id);status=result.conflict?'云端变化已保留为副本，再次同步可上传当前家园。':home?.dirty?'此前版本已同步，仍有本地待同步修改。':'家园已同步到云端';await list();}finally{busy=false;emit();}}
 async function rename(row){const name=prompt('家园的新名字',row.name);if(!name?.trim())return;try{if(row.cloudOnly)await remote.download(row);await store.mutate(row.id,[],h=>{h.name=name.trim().slice(0,40);});if(home?.id===row.id)home=await store.get(row.id);await list();}catch(e){error(e);}}
 async function remove(row){if(!confirm(`删除“${row.name}”？${remote?'将同时移除云端目录入口。':''}此操作不能撤销。`))return;try{if(remote)await remote.remove(row.id);if(!row.cloudOnly)await store.remove(row.id);if(home?.id===row.id)await back();else await list();}catch(e){error(e);}}
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
 const timer=setInterval(()=>{if(!valid()){dispose();return;}accountVisit();if(!home||document.hidden)return;if(++visitCheckpoint%15===0)void saveVisit().catch(error);roster();
  const now=Date.now(),{width,height}=view.size,near=pets.filter(p=>Math.abs(p.x-camera.x)<width/scale/2&&Math.abs(p.y-camera.y)<height/scale/2);
  for(const pet of near)if(pet.until&&pet.until<=now){pet.activity=null;pet.targetId=null;pet.until=0;}
  if(now>=nextPetThink){nextPetThink=now+20000;
   const available=near.filter(p=>!p.activity&&selection?.petId!==p.id),pet=available.length?available[petTurn++%available.length]:null;
   if(pet){const facility=homeObjects(parts).find(o=>{const b=footprint(o,catalog.items);return b.item.activity&&pet.x>=b.x&&pet.x<b.x+b.w&&pet.y>=b.y&&pet.y<b.y+b.h&&!pets.some(other=>other.targetId===o.id&&other.until>now);});
    if(facility){pet.activity=catalog.items.find(i=>i.id===facility.itemId).activity;pet.targetId=facility.id;pet.until=now+10000;}
    if(!quiet&&(!wish||now>wish.until)){wish={petId:pet.id,...petWish(pet.id,round++,catalog.items,lang()),until:now+15000};translation=false;}
   }
  }
  emit();
 },1000);
 function dispose(){if(dead)return;const finalVisit=saveVisit(true);window.removeEventListener('pagehide',pageExit);document.removeEventListener('visibilitychange',visibility);dead=true;onScene(false);clearInterval(timer);abort.abort();loadTicket++;void voice.cancel();view.dispose();void Promise.allSettled([mutation,finalVisit]).then(()=>store.close()).catch(()=>{});}
 try{status='家园自动保存到本机，云端同步由你手动开启。';await list();}catch(e){error(e);}
 return {dispose,canClose:()=>!pending||confirm('仍有未保存操作，离开会丢失这些操作。确定离开？')};
}
