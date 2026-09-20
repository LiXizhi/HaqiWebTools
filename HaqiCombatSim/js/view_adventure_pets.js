import {createCloseButton} from './view_adventure_controls.js';
import { showPetDetails } from './view_adventure_pet_details.js';
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
export function renderPetCollection(body,model,cb,{el,button,spellFace,tile,icon}){
 const {save,assets}=model,c=assets.content,p=petParams(c);
 body.closest('.modal').classList.add('pet-collection-modal');
 body.closest('.modal').querySelector('.eyebrow')?.remove();
 const state=model.petView||(model.petView={}),ids=Object.keys(save.pets);
 const formation=el('div','pet-stage-line'),shelf=el('div','pet-shelf');
 const title=el('div','pet-section-heading pet-drag-help',el('small','muted','拖动角色'));
 const commit=(slots,heroSlot=save.heroSlot)=>cb.action({type:'formation',slots,heroSlot});
 function place(id,index){
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
  const art=node.querySelector('.pet-sheet,canvas'),bounds=art.getBoundingClientRect();
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
 body.append(title,formation);
 for(let index=0;index<4;index++){
  const id=save.formation[index],pet=save.pets[id],isHero=index===save.heroSlot;
  const slot=el('section',`pet-stage-slot${isHero?' is-hero':''}`);slot.dataset.slot=index;
  const stand=button([pet?el('span','pet-standing-art',petPortrait(assets,id,petStage(pet.level,c),120)):el('span','pet-empty','+'),...(pet?[el('strong','',c.pets[id].name)]:[])],()=>{if(id)open(id);else{state.targetSlot=index;paintShelf();shelf.querySelector('button')?.focus();}},'pet-stand');
  stand.setAttribute('aria-label',`卡位 ${index+1}：${pet?c.pets[id].name:'空位'}`);
    if(id)bindDrag(stand,id);
  slot.ondragover=event=>{event.preventDefault();slot.classList.add('drop-ready');};
  slot.ondragleave=()=>slot.classList.remove('drop-ready');
  slot.ondrop=event=>{event.preventDefault();slot.classList.remove('drop-ready');place(event.dataTransfer.getData('text/plain'),index);};
  if(isHero){
  const hero=button(tile(assets,'sprites',save.appearance==='girl'?12:8,96,120),()=>{},'pet-hero-figure');
   hero.setAttribute('aria-label',`主角，卡位 ${index+1}`);hero.title='拖动主角换位';bindDrag(hero,'hero');
   hero.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();place('hero',(index+(event.key==='ArrowLeft'?3:1))%4);}});
   slot.append(hero);
  }
  slot.append(stand);formation.append(slot);
 }
 if(!save.starterChosen)body.append(el('h3','','领取初始抱抱龙（选择后立即领取）'),starterPicker(assets,id=>cb.action({type:'starter',petId:id}),{el,button}));
 const query=el('input','pet-search');query.placeholder='搜索我的伙伴';query.setAttribute('aria-label','搜索我的伙伴');query.value=state.query||'';
 const previous=button('‹',()=>shelf.scrollBy({left:-shelf.clientWidth,behavior:'smooth'}),'pet-page-arrow'),next=button('›',()=>shelf.scrollBy({left:shelf.clientWidth,behavior:'smooth'}),'pet-page-arrow');
 previous.setAttribute('aria-label','上一页宠物');next.setAttribute('aria-label','下一页宠物');previous.title='上一页宠物';next.title='下一页宠物';
 const status=el('span','muted');status.setAttribute('aria-live','polite');
 body.append(el('div','pet-section-heading',el('h3','',`我的收藏 ${ids.filter(id=>!c.pets[id].legacy).length} / ${Object.values(c.pets).filter(pet=>!pet.legacy).length}`),query,previous,next),status,shelf);
 function paintShelf(){
  shelf.replaceChildren();const visible=ids.filter(id=>c.pets[id].name.includes(query.value.trim()));
  status.textContent=state.targetSlot!=null?`选择卡位 ${state.targetSlot+1} 的伙伴`:`${visible.length} 位伙伴 · 营养餐 ${save.inventory[FOOD_ID]||0}`;
  if(state.targetSlot!=null)status.append(button('取消',()=>{delete state.targetSlot;paintShelf();},'pet-inline-button'));
  for(const id of visible){
   const pet=save.pets[id],slot=save.formation.indexOf(id);
   const item=button([petPortrait(assets,id,petStage(pet.level,c),96),el('strong','',c.pets[id].name),el('small','',`等级 ${pet.level} · ${slot>=0?`卡位 ${slot+1}`:'休息中'}`)],()=>{if(state.targetSlot!=null){const index=state.targetSlot;delete state.targetSlot;place(id,index);}else open(id);},'pet-owned');
    item.dataset.petId=id;bindDrag(item,id,true);shelf.append(item);
  }
  if(!visible.length)shelf.append(el('p','muted','没有找到伙伴'));
  requestAnimationFrame(updatePager);
 }
 function updatePager(){previous.disabled=shelf.scrollLeft<=1;next.disabled=shelf.scrollLeft+shelf.clientWidth>=shelf.scrollWidth-1;}
 shelf.onscroll=updatePager;query.oninput=()=>{state.query=query.value;paintShelf();};paintShelf();
 const notes=el('details','pet-care-notes',el('summary','','照料与自动进食'),el('p','muted',`非战斗时角色每秒恢复 ${p.heroRegenPerSecond*100}% 生命，宠物每分钟恢复 ${p.regenPerMinute*100}%。携带伙伴每分钟减少 ${p.hungerPerMinute} 饱食，低于 ${p.feedThreshold} 自动进食，每份恢复 ${p.foodRestore}。离线只恢复生命。`),...save.careLog.slice(-3).map(text=>el('p','muted',text)));
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
