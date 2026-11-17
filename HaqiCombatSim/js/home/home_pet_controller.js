// home/home_pet_controller.js — 家园宠物常驻、毯子互动路径、心愿反馈与宠物安置保存。
import { chunkKey, footprint } from '../home_core.js';
import { findHomePath, stepHomeWalk } from '../home_walk_core.js';
import { buildingItem, obstruction } from '../home_building_core.js';
import { ownedPetRecords } from '../adventure_pet_files_core.js';
import { homeItemLanguage, homeWishLine } from '../home_language_core.js';
import { starterBlanketReaction } from '../home_starter_room_core.js';

export function createHomePetController(bridge) {
 const {
  check,
  getContext,
  parts,
  catalog,
  remote,
  list,
  languageGame,
  currentObjects,
  isStarterFurniture,
  lang,
 } = bridge;

 let petFurnitureVisit = null;
 let home = null,
  pets = [],
  selection = null,
  preview = null,
  wish = null,
  translation = false,
  status = '',
  pending = null,
  mutation = Promise.resolve(),
  busy = false;

 function pull() {
  const s = bridge.getState();
  home = s.home;
  pets = s.pets;
  selection = s.selection;
  preview = s.preview;
  wish = s.wish;
  translation = s.translation;
  status = s.status;
  pending = s.pending;
  mutation = s.mutation;
  busy = s.busy;
 }

 function push() {
  bridge.setState({ home, selection, preview, wish, translation, status, pending, mutation, busy });
 }

 const store = {
  ...bridge.store,
  get: (...args) => bridge.store.get(...args),
  mutate: async (...args) => {
   pull();
   return bridge.store.mutate(...args);
  },
 };

 function roster() {
  push();
  bridge.roster();
  pets = bridge.getState().pets;
 }

 function emit() {
  push();
  bridge.emit();
 }

 function showRetry() {
  push();
  bridge.showRetry();
 }

 function invitePetToBlanket(object){
  if(!object||object.itemId!=='blanket')return;
  const objects=currentObjects(),area=footprint(object,catalog.items);
  const target={x:area.x+area.w/2,y:area.y+area.h*.85};
  const pet=pets.filter(p=>selection?.petId!==p.id&&Math.hypot(p.x-target.x,p.y-target.y)<=6)
   .sort((a,b)=>Math.hypot(a.x-target.x,a.y-target.y)-Math.hypot(b.x-target.x,b.y-target.y))[0];
  if(!pet)return;
  const route=petFurnitureRoute(pet,target,objects);
  const starter=isStarterFurniture(object);
  if(starter){wish=null;translation=false;}
  if(!route&&!starter)return;
  const previous=pets.find(p=>p.id===petFurnitureVisit?.petId);
  if(petFurnitureVisit?.homeId===home.id&&previous?.targetId===petFurnitureVisit.objectId&&previous.activity===petFurnitureVisit.activity){
   Object.assign(previous,{activity:null,until:0,targetId:null});
  }
  Object.assign(pet,{activity:null,until:0,targetId:null});
  const activity=starter?starterBlanketReaction(object,objects):'sleep';
  petFurnitureVisit={homeId:home.id,petId:pet.id,objectId:object.id,x:object.x,y:object.y,route,target,activity,starter};
  if(!route)showBlockedPetVisit();
 }
 function petFurnitureRoute(pet,target,objects){
  const route=findHomePath(pet,target,objects,catalog.items,home.seed,
   point=>Object.hasOwn(parts,`chunk:${chunkKey(point.x,point.y)}`));
  const end=route.at(-1);
  return end&&Math.hypot(end.x-target.x,end.y-target.y)<=.1?route:null;
 }
 function showBlockedPetVisit(){
  petFurnitureVisit.route=null;
  status='抱抱龙过不去。试试挪开挡路的家具。';
  emit();
 }
 function retryBlockedPetVisit(){
  const visit=petFurnitureVisit;
  if(!visit||visit.route||home.id!==visit.homeId)return;
  const objects=currentObjects(),object=objects.find(row=>row.id===visit.objectId);
  const pet=pets.find(row=>row.id===visit.petId);
  if(!pet||pet.activity||!object||object.x!==visit.x||object.y!==visit.y)return;
  const route=petFurnitureRoute(pet,visit.target,objects);
  if(route){visit.route=route;status='路让出来了，抱抱龙接着走。';emit();}
  else showBlockedPetVisit();
 }
 function stepPetFurnitureVisit(dt,objects){
  if(!petFurnitureVisit)return;
  const visit=petFurnitureVisit,pet=pets.find(p=>p.id===visit.petId);
  const object=objects.find(o=>o.id===visit.objectId);
  if(home.id!==visit.homeId||!pet||selection?.petId===pet.id||
   !object||object.x!==visit.x||object.y!==visit.y){
   if(home.id===visit.homeId&&pet?.targetId===visit.objectId&&pet.activity===visit.activity){
    Object.assign(pet,{activity:null,targetId:null,until:0});
   }
   petFurnitureVisit=null;return;
  }
  if(!visit.route)return;
  if(!visit.route.length){
   if(pet.targetId!==visit.objectId||pet.activity!==visit.activity||pet.until<=Date.now())petFurnitureVisit=null;
   return;
  }
  if(pet.activity){petFurnitureVisit=null;return;}
  const target=visit.route[0];
  const step=stepHomeWalk(pet,target,dt,objects,catalog.items,home.seed);
  Object.assign(pet,{x:step.x,y:step.y});
  if(Math.hypot(pet.x-target.x,pet.y-target.y)<.08){
   visit.route.shift();
   if(!visit.route.length){
    Object.assign(pet,{activity:visit.activity,targetId:object.id,until:Date.now()+10000});
    if(isStarterFurniture(object)){
     status=visit.activity==='sunbathe'?'抱抱龙跑到窗边晒太阳了。':'抱抱龙在毯子上睡着了。';
     emit();
    }
   }
  }else if(dt>0&&!step.moving){
   if(visit.starter)showBlockedPetVisit();
   else petFurnitureVisit=null;
  }
 }
 async function restoreEdit(){
 }
 function wishFeedback(action){
  if(!wish)return;const itemId=action.itemId||action.object?.itemId||currentObjects().find(o=>o.id===action.id)?.itemId;if(itemId!==wish.itemId)return;
  const item=catalog.items.find(i=>i.id===itemId),language=lang(),other=language==='en'?'zh':'en';let key;
  if(action.type==='summon'){wish.phase='place';key='HOME-PLACE';}
  else if(action.type==='use'){key='HOME-USE';wish.phase='done';}
  else if(['place','move'].includes(action.type)){const object=action.object||currentObjects().find(o=>o.id===action.id),pet=pets.find(p=>p.id===wish.petId);if(!object||!pet||Math.hypot(object.x-pet.x,object.y-pet.y)>5)return;key='HOME-READY';wish.phase='done';}
  if(!key)return;const line=locale=>(homeWishLine(key,item,locale)||(catalog.dialogue?.[key]?.[locale]||'')).replace('{item}',homeItemLanguage(item,locale)).replace('{action}',catalog.activityWords?.[item.activity]?.[locale]||'');wish={...wish,language,text:line(language),translation:line(other),until:Date.now()+18000};translation=false;
 }
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
   if(target&&pet?.activity)languageGame.event({kind:'pet-use',objectId:target.id,petId:id,activity:pet.activity});
   if(target&&wish?.petId===id)wishFeedback({type:'use',itemId:target.itemId});
   selection=null;preview=null;status=position?'宠物已安置，位置已保存到本机':'宠物已收回家园宠物背包';emit();
  };
  const next=mutation.catch(()=>{}).then(job);mutation=next;return next;
 }
 async function sync(){check();if(pending)throw Error('请先重试本机保存');if(!remote)throw Error('请在冒险中登录 Keepwork 后再打开家园');if(busy)throw Error('请等待当前操作完成');busy=true;const id=home.id;status='正在同步家园…';emit();try{await mutation;const result=await remote.sync(id);check();if(home?.id===id)home=await store.get(id);status=result.conflict?'云端变化已保留为副本，再次同步可上传当前家园。':home?.dirty?'此前版本已同步，仍有本地待同步修改。':'家园已同步到云端';await list();}finally{busy=false;emit();}}

 const wrapSync = fn => (...args) => {
  pull();
  const res = fn(...args);
  push();
  return res;
 };

 const wrapAsync = fn => (...args) => {
  pull();
  const p = fn(...args);
  push();
  return p.finally(push);
 };

 return {
  resetPetFurnitureVisit: () => {
   petFurnitureVisit = null;
  },
  blockedPetId: () => (petFurnitureVisit?.route === null ? petFurnitureVisit.petId : null),
  isVisitingPet: id => petFurnitureVisit?.petId === id,
  hasSameVisit: prev => petFurnitureVisit === prev,
  snapshotVisit: () => petFurnitureVisit,
  invitePetToBlanket: wrapSync(invitePetToBlanket),
  retryBlockedPetVisit: wrapSync(retryBlockedPetVisit),
  stepPetFurnitureVisit: wrapSync(stepPetFurnitureVisit),
  wishFeedback: wrapSync(wishFeedback),
  movePet: wrapAsync(movePet),
  savePetPlacement: wrapAsync(savePetPlacement),
  sync: wrapAsync(sync),
 };
}
