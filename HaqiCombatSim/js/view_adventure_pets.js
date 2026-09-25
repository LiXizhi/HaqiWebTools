import { setText, tr } from './locale_runtime.js';
import {createCloseButton} from './view_adventure_controls.js';
import { showPetDetails } from './view_adventure_pet_details.js';
import { createMountPreview } from './view_adventure_mount_preview.js';
import { createPetStatus } from './view_adventure_pet_status.js';
import { ItemDetails } from './view_adventure_item_details.js';
import { equipmentAttributes, signedAttribute } from './adventure_equipment_core.js';
import { STARTERS,STAGE_NAMES,petStage,petParams,FOOD_ID } from './adventure_pets_core.js';
export function petPortrait(assets,id,stage=0,size=96){
 const box=document.createElement('div');box.className='pet-sheet';box.style.width=box.style.height=`${size}px`;
 const art=assets.content.pets[id]?.art;if(!art)return box;
 box.style.backgroundImage=`url("${assets.mode==='local'?art.local:art.cdn}")`;
 box.style.backgroundSize='400% 400%';box.style.backgroundPosition=`0% ${stage*100/3}%`;box.setAttribute('role','img');box.setAttribute('aria-label',assets.content.pets[id].name);return box;
}
export function starterPicker(assets,onSelect,{el,button}){
 const row=el('div','starter-choices');for(const id of STARTERS){const b=button([petPortrait(assets,id,0,72),el('span','',assets.content.pets[id].name)],()=>{for(const child of row.children){child.classList.remove('selected');child.setAttribute('aria-pressed','false');}b.classList.add('selected');b.setAttribute('aria-pressed','true');onSelect(id);},'secondary');b.dataset.petId=id;b.setAttribute('aria-pressed',String(id===STARTERS[0]));if(id===STARTERS[0])b.classList.add('selected');row.append(b);}return row;
}
export function renderPetCollection(body,model,cb,{el,button,spellFace,tile,icon,art}){
 const {save,assets}=model,c=assets.content,p=petParams(c);
 body.closest('.modal').classList.add('pet-collection-modal');
 body.closest('.modal').querySelector('.eyebrow')?.remove();
 const state=model.petView||(model.petView={}),ids=Object.keys(save.pets);
 state.tab=state.tab==='mount'?'mount':'follow';
 const mounts=Object.values(c.items).filter(item=>(save.inventory[item.id]||0)>0&&c.mountByItem?.[item.id]);
 const formation=el('div','pet-stage-line'),shelf=el('div','pet-shelf');
 const title=el('div','pet-section-heading pet-drag-help',el('small','muted','拖动角色'));
 const commit=(slots,heroSlot=save.heroSlot)=>cb.action({type:'formation',slots,heroSlot});
 function place(id,index){
  if(String(id).startsWith('mount:')){
   const itemId=Number(String(id).slice(6));
   if(!save.pendingEncounter&&save.inventory[itemId]>0&&c.mountByItem?.[itemId]?.art?.cdn&&Number(save.mountId)!==itemId)cb.action({type:'ride',itemId});
   return;
  }
  if(id==='hero'){commit([...save.formation],index);return;}
  if(!save.pets[id])return;
  const slots=[...save.formation],previous=slots.indexOf(id);
  if(previous>=0)slots[previous]=slots[index];
  slots[index]=id;commit(slots);
 }
 function bindDrag(node,id,scrollable=false){
  let gesture=null,suppressClick=false;
  node.draggable=false;
  node.addEventListener('pointerdown',event=>{
   if(!event.isPrimary||event.button!==0)return;
  const art=node.querySelector('.pet-mount-composite,.pet-sheet,canvas')||node.firstElementChild,bounds=art.getBoundingClientRect();
  suppressClick=false;gesture={x:event.clientX,y:event.clientY,scroll:shelf.scrollLeft,moved:false,art,bounds,ghost:null,mode:null};
   node.setPointerCapture(event.pointerId);
  });
  node.addEventListener('pointermove',event=>{
   if(!gesture)return;
   const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
   if(Math.hypot(dx,dy)<8&&!gesture.moved)return;
  gesture.moved=true;
  gesture.mode ||= scrollable&&Math.abs(dx)>Math.abs(dy)?'scroll':'drag';
  if(gesture.mode==='scroll'){shelf.scrollLeft=gesture.scroll-dx;return;}
  node.classList.add('is-dragging');
  if(!gesture.ghost){
   const ghost=gesture.art.cloneNode(true),bounds=gesture.bounds;
   ghost.className='pet-drag-preview';ghost.setAttribute('aria-hidden','true');
   ghost.style.width=`${bounds.width}px`;ghost.style.height=`${bounds.height}px`;
   ghost.style.left=`${bounds.left}px`;ghost.style.top=`${bounds.top}px`;
   if(ghost instanceof HTMLCanvasElement)ghost.getContext('2d').drawImage(gesture.art,0,0);
   else{const style=getComputedStyle(gesture.art);ghost.style.backgroundImage=style.backgroundImage;ghost.style.backgroundSize=style.backgroundSize;ghost.style.backgroundPosition=style.backgroundPosition;}
   document.body.append(ghost);gesture.ghost=ghost;
  }
  gesture.ghost.style.transform=`translate3d(${dx}px,${dy}px,0)`;
   const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('.pet-stage-slot');
   for(const slot of formation.children)slot.classList.toggle('drop-ready',slot===target);
  });
  const finish=event=>{
   if(!gesture)return;
  const moved=gesture.moved,mode=gesture.mode;gesture.ghost?.remove();gesture=null;node.classList.remove('is-dragging');
   for(const slot of formation.children)slot.classList.remove('drop-ready');
  if(moved){suppressClick=true;const target=event.type==='pointerup'&&mode==='drag'?document.elementFromPoint(event.clientX,event.clientY)?.closest('.pet-stage-slot'):null;if(target&&formation.contains(target))place(id,Number(target.dataset.slot));}
  };
  node.addEventListener('pointerup',finish);node.addEventListener('pointercancel',finish);
  node.addEventListener('lostpointercapture',finish);
  node.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation();suppressClick=false;}},true);
 }
 const open=id=>{
  state.selected=id;
  showPetDetails(assets,id,petPortrait,{el,button,spellFace},{save,action:cb.action,place,shop:()=>cb.panel('shop'),tile});
 };
 let mountDetails;
 const openMount=(item,trigger)=>{
  mountDetails ||= new ItemDetails(body,model,{el,spellFace});
  mountDetails.render(item,{owned:true});
  const mount=c.mountByItem[item.id],riding=Number(save.mountId)===Number(item.id),available=!!mount.art?.cdn;
  mountDetails.body.append(createMountPreview(assets,{...save,mountId:available?item.id:null},{el,tile}));
  mountDetails.body.append(el('p','muted',available?'骑乘后，这些属性加入角色战斗属性。':'这只坐骑还没有骑乘形象。'));
  for(const row of equipmentAttributes({stats:mount.stats||{}},save,c))mountDetails.body.append(el('p','',`${row.label} ${signedAttribute(row.value)}${row.unit}`));
  const ride=button(riding?'下骑':available?'骑上':'暂不可骑乘',()=>{
   mountDetails.close();cb.action(riding?{type:'dismount'}:{type:'ride',itemId:item.id});
  },riding?'secondary':'primary');
  ride.disabled=!!save.pendingEncounter||(!riding&&!available);
  mountDetails.footer.append(ride);
  if(save.pendingEncounter)mountDetails.footer.append(el('span','muted','战斗中无法换坐骑'));
  mountDetails.open(trigger);
 };
 body.append(title,formation);
 for(let index=0;index<4;index++){
  const id=save.formation[index],pet=save.pets[id],isHero=index===save.heroSlot;
  const slot=el('section',`pet-stage-slot${isHero?' is-hero':''}`);slot.dataset.slot=index;
  const stand=button([pet?el('span','pet-standing-art',el('span','pet-status-portrait',createPetStatus(pet,c,el),petPortrait(assets,id,petStage(pet.level,c),120))):el('span','pet-empty','+'),...(pet?[el('strong','',c.pets[id].name),el('small','pet-stage-level',`等级 ${pet.level} · ${STAGE_NAMES[petStage(pet.level,c)]}`)]:[])],()=>{if(id)open(id);else{state.targetSlot=index;paintShelf();shelf.querySelector('button')?.focus();}},'pet-stand');
  stand.setAttribute('aria-label',`卡位 ${index+1}：${pet?c.pets[id].name:'空位'}`);
    if(id)bindDrag(stand,id);
  slot.ondragover=event=>{event.preventDefault();slot.classList.add('drop-ready');};
  slot.ondragleave=()=>slot.classList.remove('drop-ready');
  slot.ondrop=event=>{event.preventDefault();slot.classList.remove('drop-ready');place(event.dataTransfer.getData('text/plain'),index);};
  if(isHero){
  const preview=createMountPreview(assets,save,{el,tile});
  // Reserve the visible overhang inside the scrolling body without clipping it
  // to the hero slot or shrinking the art to that slot's width.
  formation.style.paddingTop=`max(26px, calc(8px + var(--pet-preview-height, 120px) * ${preview.dataset.overhang||0}))`;
  const hero=button(preview,()=>{},'pet-hero-figure');
   hero.setAttribute('aria-label',`主角，卡位 ${index+1}`);hero.title='拖动主角换位';bindDrag(hero,'hero');
   hero.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();place('hero',(index+(event.key==='ArrowLeft'?3:1))%4);}});
   slot.append(hero);
  }
  slot.append(stand);formation.append(slot);
 }
 if(!save.starterChosen)body.append(el('h3','','领取初始抱抱龙（选择后立即领取）'),starterPicker(assets,id=>cb.action({type:'starter',petId:id}),{el,button}));
 const query=el('input','pet-search');
 const previous=button('‹',()=>shelf.scrollBy({left:-shelf.clientWidth,behavior:'smooth'}),'pet-page-arrow'),next=button('›',()=>shelf.scrollBy({left:shelf.clientWidth,behavior:'smooth'}),'pet-page-arrow');
 previous.setAttribute('aria-label','上一页宠物');next.setAttribute('aria-label','下一页宠物');previous.title='上一页宠物';next.title='下一页宠物';
 const status=el('span','muted');status.setAttribute('aria-live','polite');
 const collection=el('div','gui-tabs pet-collection-tabs');
 for(const [id,label,count] of [['follow','跟随宠物',ids.filter(id=>!c.pets[id].legacy).length],['mount','坐骑',mounts.length]]){
  const tab=button('',()=>{state.tab=id;delete state.targetSlot;shelf.scrollLeft=0;updateTabs();paintShelf();},'secondary');
  setText(tab,'{label}（{count}）',{label,count});tab.dataset.petTab=id;collection.append(tab);
 }
 function updateTabs(){
  for(const tab of collection.children)tab.setAttribute('aria-pressed',String(tab.dataset.petTab===state.tab));
  const label=state.tab==='mount'?'搜索我的坐骑':'搜索我的伙伴';query.placeholder=tr(label);query.setAttribute('aria-label',tr(label));query.value=(state.tab==='mount'?state.mountQuery:state.query)||'';
 }
 updateTabs();
 body.append(el('div','pet-section-heading',collection,query,previous,next),status,shelf);
 function paintShelf(){
  shelf.replaceChildren();
  const q=query.value.trim().toLowerCase();
  if(state.tab==='mount'){
   const visible=mounts.filter(item=>!q||item.name.toLowerCase().includes(q)||tr(item.name).toLowerCase().includes(q));
   setText(status,save.pendingEncounter?'战斗中无法换坐骑':'点击坐骑查看详情，或拖到上方骑乘。');
   for(const item of visible){
    const riding=Number(save.mountId)===Number(item.id),available=!!c.mountByItem[item.id].art?.cdn;
    const card=button([art(assets,item.art,112,100),el('strong','',item.name)],()=>openMount(item,card),'pet-owned pet-mount');
    card.dataset.mountId=item.id;card.setAttribute('aria-pressed',String(riding));card.setAttribute('aria-label',tr(item.name)+'，'+tr('查看详情'));card.setAttribute('aria-haspopup','dialog');
    if(!save.pendingEncounter&&available)bindDrag(card,`mount:${item.id}`,true);
    shelf.append(card);
   }
   if(!visible.length)shelf.append(el('p','muted',mounts.length?'没有找到坐骑':'还没有坐骑，可在商城或居民商店获取。'));
   requestAnimationFrame(updatePager);return;
  }
  const visible=ids.filter(id=>{const name=c.pets[id].name;return !q||name.toLowerCase().includes(q)||tr(name).toLowerCase().includes(q);});
  if(state.targetSlot!=null)setText(status,'选择卡位 {slot} 的伙伴',{slot:state.targetSlot+1});
  else setText(status,visible.length===1?'1 位伙伴 · 营养餐 {food}':'{count} 位伙伴 · 营养餐 {food}',{count:visible.length,food:save.inventory[FOOD_ID]||0});
  if(state.targetSlot!=null)status.append(button('取消',()=>{delete state.targetSlot;paintShelf();},'pet-inline-button'));
  for(const id of visible){
   const pet=save.pets[id],slot=save.formation.indexOf(id);
   const meta=el('small','');
   if(slot>=0)setText(meta,'等级 {level} · 卡位 {slot}',{level:pet.level,slot:slot+1});
   else setText(meta,'等级 {level} · 休息中',{level:pet.level});
   const item=button([el('span','pet-card-portrait',createPetStatus(pet,c,el),petPortrait(assets,id,petStage(pet.level,c),96)),el('strong','',c.pets[id].name),meta],()=>{if(state.targetSlot!=null){const index=state.targetSlot;delete state.targetSlot;place(id,index);}else open(id);},'pet-owned');
    item.dataset.petId=id;bindDrag(item,id,true);shelf.append(item);
  }
  if(!visible.length)shelf.append(el('p','muted','没有找到伙伴'));
  requestAnimationFrame(updatePager);
 }
 function updatePager(){previous.disabled=shelf.scrollLeft<=1;next.disabled=shelf.scrollLeft+shelf.clientWidth>=shelf.scrollWidth-1;}
 shelf.onscroll=updatePager;query.oninput=()=>{state[state.tab==='mount'?'mountQuery':'query']=query.value;paintShelf();};paintShelf();
 const notes=el('details','pet-care-notes',el('summary','','照料与自动进食'),el('p','muted',`岛屿上非战斗时角色每秒恢复 ${p.heroRegenPerSecond*100}% 生命，宠物每分钟恢复 ${p.regenPerMinute*100}%。副本中不会自动回血。携带伙伴每分钟减少 ${p.hungerPerMinute} 饱食，低于 ${p.feedThreshold} 自动进食，每份恢复 ${p.foodRestore}。未上阵的收藏宠物不消耗饱食和口粮，每分钟恢复 ${p.restingHungerPerMinute} 饱食（离线也恢复，最多24小时）。离线生命恢复仅限岛屿。`),...save.careLog.slice(-3).map(text=>el('p','muted',text)));
 const teaching=button('咕噜噜教学',()=>{
  const dialog=el('dialog','modal pet-growth-modal'),close=()=>dialog.close();
  const exit=createCloseButton(close,'关闭教学伙伴');
  const content=el('div','modal-body',tile(assets,'creatures',save.pet?6:7,120,128));
  if(save.pet){content.append(el('h3','',save.pet.name),el('p','',`等级 ${save.pet.level} · 经验 ${save.pet.xp} · 口粮 ${save.inventory[17172]||0} 包`),button('喂养一包战宠口粮',()=>{close();cb.action({type:'feed'});},'primary'));}
  else content.append(el('p','','完成青龙的强化指导，领取出奇蛋。'),button('打开出奇蛋',()=>{close();cb.action({type:'hatch'});},'primary'));
  dialog.append(el('header','modal-header',el('h2','','初心之旅 · 咕噜噜'),exit),content);document.body.append(dialog);dialog.addEventListener('keydown',event=>event.stopPropagation());dialog.addEventListener('close',()=>{dialog.remove();teaching.focus();},{once:true});dialog.showModal();
 },'secondary');
 const footer=el('footer','pet-collection-footer',button('图鉴与商店',()=>cb.panel('shop'),'secondary'),teaching,notes);
 if(c.homeUrl){const link=el('a','pet-home-link',icon('shop'),el('span','','宠物家园'));link.href=c.homeUrl;link.target='_blank';link.rel='noopener noreferrer';link.title='联动筹备中，当前冒险进度不会写入家园';footer.append(link);}
 body.append(footer);
}
