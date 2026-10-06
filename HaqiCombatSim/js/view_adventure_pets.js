import {DetailDialog} from './view_detail_dialog.js';
import {petDisplayScale} from './adventure_pet_interactions_core.js';
import {renderPetFood} from './view_adventure_pet_food.js';
import {ownedPetRecords} from './adventure_pet_files_core.js';
import {setText, tr,fill} from './locale_runtime.js';
import {createCloseButton} from './view_adventure_controls.js';
import { showPetDetails } from './view_adventure_pet_details.js';
import { createMountPreview } from './view_adventure_mount_preview.js';
import { createPetStatus } from './view_adventure_pet_status.js';
import { ItemDetails } from './view_adventure_item_details.js';
import { drawSchoolIcon } from './card_renderer.js';
import { STARTERS,petAppearanceStage,petParams,FOOD_ID } from './adventure_pets_core.js';
const SCHOOL_NAMES={fire:'烈火',ice:'寒冰',storm:'风暴',life:'生命',death:'死亡',balance:'平衡'};
function petSchoolIcon(school,el){
 const name=SCHOOL_NAMES[school]||'魔法';
 const canvas=el('canvas','pet-name-school');canvas.width=32;canvas.height=32;
 canvas.setAttribute('role','img');canvas.setAttribute('aria-label',fill(`{v0}系`,{v0:String(name)}).text);
 const context=canvas.getContext?.('2d');if(typeof context?.save==='function')drawSchoolIcon(context,school||'balance',16,16,30);
 return canvas;
}
function petNameLine(def,el){return el('span','pet-name-line',petSchoolIcon(def.school,el),el('strong','',def.name));}
export function petPortrait(assets,id,stage=0,size=96){
 const box=document.createElement('div');box.className='pet-sheet';box.style.width=box.style.height=`${size}px`;
 const art=assets.content.pets[id]?.art;if(!art)return box;
 box.style.backgroundImage=`url("${assets.mode==='local'?art.local:art.cdn}")`;
 if(art.static){box.classList.add('is-static');box.style.backgroundSize='contain';box.style.backgroundPosition='center';}
 else{box.style.backgroundSize='400% 400%';box.style.backgroundPosition=`0% ${stage*100/3}%`;}
 box.setAttribute('role','img');box.setAttribute('aria-label',assets.content.pets[id].name);return box;
}
export function starterPicker(assets,onSelect,{el,button}){
 const row=el('div','starter-choices');for(const id of STARTERS){const b=button([petPortrait(assets,id,0,72),el('span','',assets.content.pets[id].name)],()=>{for(const child of row.children){child.classList.remove('selected');child.setAttribute('aria-pressed','false');}b.classList.add('selected');b.setAttribute('aria-pressed','true');onSelect(id);},'secondary');b.dataset.petId=id;b.setAttribute('aria-pressed',String(id===STARTERS[0]));if(id===STARTERS[0])b.classList.add('selected');row.append(b);}return row;
}
export function renderPetCollection(body,model,cb,{el,button,spellFace,tile,icon,art}){
 const {save,assets}=model,c=assets.content,p=petParams(c);
 const modal=body.closest('.modal');
 modal.classList.add('pet-collection-modal');
 const heading=modal.querySelector('.modal-header h2');
 if(heading)heading.parentElement.prepend(heading);
 const state=model.petView||(model.petView={}),records=ownedPetRecords(save),ids=Object.keys(records);
 state.tab=state.tab==='mount'?'mount':'follow';
 const mounts=Object.values(c.items).filter(item=>(save.inventory[item.id]||0)>0&&c.mountByItem?.[item.id]);
 const formation=el('div','pet-stage-line'),shelf=el('div','pet-shelf');
 const commit=(slots,heroSlot=save.heroSlot)=>cb.action({type:'formation',slots,heroSlot});
 async function place(id,index){
  if(save.pendingEncounter)return;
  if(String(id).startsWith('mount:')){
   const itemId=Number(String(id).slice(6));
   if(!save.pendingEncounter&&save.inventory[itemId]>0&&c.mountByItem?.[itemId]?.art?.cdn&&Number(save.mountId)!==itemId)cb.action({type:'ride',itemId});
   return;
  }
  if(id==='hero'){commit([...save.formation],index);return;}
  if(!save.pets[id]&&cb.loadPet)await cb.loadPet(id);if(!save.pets[id])return;
  const slots=[...save.formation],previous=slots.indexOf(id);
  if(previous>=0)slots[previous]=slots[index];
  slots[index]=id;commit(slots);
 }
 function rest(id){
  if(save.pendingEncounter||!save.pets[id]||!save.formation.includes(id))return;
  delete state.targetSlot;
  commit(save.formation.map(value=>value===id?null:value));
 }
 function overCollection(hit){return !!hit&&[shelf,shelfHeading,status].some(node=>node===hit||node.contains(hit));}
 function bindDrag(node,id,scrollable=false){
  let gesture=null,suppressClick=false;
  node.draggable=false;
  node.addEventListener('pointerdown',event=>{
   if(!event.isPrimary||event.button!==0||save.pendingEncounter)return;
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
   const hit=document.elementFromPoint(event.clientX,event.clientY),target=hit?.closest('.pet-stage-slot');
   for(const slot of formation.children)slot.classList.toggle('drop-ready',slot===target);
   shelf.classList.toggle('drop-ready',!scrollable&&!!save.pets[id]&&overCollection(hit));
  });
  const finish=event=>{
   if(!gesture)return;
  const moved=gesture.moved,mode=gesture.mode;gesture.ghost?.remove();gesture=null;node.classList.remove('is-dragging');
   for(const slot of formation.children)slot.classList.remove('drop-ready');
   shelf.classList.remove('drop-ready');
  if(moved){
   suppressClick=true;
   if(event.type!=='pointerup'||mode!=='drag')return;
   const hit=document.elementFromPoint(event.clientX,event.clientY),target=hit?.closest('.pet-stage-slot');
   if(target&&formation.contains(target))place(id,Number(target.dataset.slot));
   else if(!scrollable&&overCollection(hit))rest(id);
  }
  };
  node.addEventListener('pointerup',finish);node.addEventListener('pointercancel',finish);
  node.addEventListener('lostpointercapture',finish);
  node.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation();suppressClick=false;}},true);
 }
 const open=async id=>{
  if(!save.pets[id]&&cb.loadPet)await cb.loadPet(id);if(!save.pets[id])return;
  state.selected=id;
  showPetDetails(assets,id,petPortrait,{el,button,spellFace},{save,action:cb.action,shop:()=>cb.panel('shop',{category:'supply',subcategory:1}),tile});
 };
 let mountDetails;
 const openMount=(item,trigger)=>{
  mountDetails ||= new ItemDetails(body,model,{el,spellFace,tile});
  mountDetails.render(item,{owned:true});
  const mount=c.mountByItem[item.id],riding=Number(save.mountId)===Number(item.id),available=!!mount.art?.cdn;
  const ride=button(riding?'下骑':available?'骑上':'暂不可骑乘',()=>{
   mountDetails.close();cb.action(riding?{type:'dismount'}:{type:'ride',itemId:item.id});
  },riding?'secondary':'primary');
  ride.disabled=!!save.pendingEncounter||(!riding&&!available);
  mountDetails.footer.append(ride);
  if(save.pendingEncounter)mountDetails.footer.append(el('span','muted','战斗中无法换坐骑'));
  mountDetails.open(trigger);
 };
 body.append(formation);
 for(let index=0;index<4;index++){
  const id=save.formation[index],pet=save.pets[id],isHero=index===save.heroSlot;
  const slot=el('section',`pet-stage-slot${isHero?' is-hero':''}`);slot.dataset.slot=index;
  const def=pet&&c.pets[records[id]?.speciesId||id];
  const stand=button([pet?el('span','pet-standing-art',el('span','pet-status-portrait',createPetStatus(pet,c,el),petPortrait(assets,pet.speciesId,petAppearanceStage(pet,c),120*petDisplayScale(pet,c)))):el('span','pet-empty','+'),...(def?[petNameLine(def,el)]:[])],()=>{if(id)open(id);else{state.targetSlot=index;paintShelf();shelf.querySelector('button')?.focus();}},'pet-stand');
  stand.setAttribute('aria-label',fill(`卡位 {v0}：{v1}`,{v0:String(index+1),v1:String(def?def.name:'空位')}).text);
    if(id){bindDrag(stand,id);stand.addEventListener('keydown',event=>{if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();rest(id);}});}
  slot.ondragover=event=>{event.preventDefault();slot.classList.add('drop-ready');};
  slot.ondragleave=()=>slot.classList.remove('drop-ready');
  slot.ondrop=event=>{event.preventDefault();slot.classList.remove('drop-ready');place(event.dataTransfer.getData('text/plain'),index);};
  if(isHero){
  const preview=createMountPreview(assets,save,{el,tile});
  // Reserve the visible overhang inside the scrolling body without clipping it
  // to the hero slot or shrinking the art to that slot's width.
  formation.style.paddingTop=`max(26px, calc(8px + var(--pet-preview-height, 120px) * ${preview.dataset.overhang||0}))`;
  const hero=button(preview,()=>{},'pet-hero-figure');
   hero.setAttribute('aria-label',fill(`主角，卡位 {v0}`,{v0:String(index+1)}).text);hero.title='拖动主角换位';bindDrag(hero,'hero');
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
 for(const [id,label,count] of [['follow','跟随宠物',ids.filter(id=>!c.pets[records[id]?.speciesId||id].legacy).length],['mount','坐骑',mounts.length]]){
  const tab=button('',()=>{state.tab=id;delete state.targetSlot;shelf.scrollLeft=0;updateTabs();paintShelf();},'secondary');
  setText(tab,'{label}（{count}）',{label,count});tab.dataset.petTab=id;collection.append(tab);
 }
 function updateTabs(){
  for(const tab of collection.children)tab.setAttribute('aria-pressed',String(tab.dataset.petTab===state.tab));
  const label=state.tab==='mount'?'搜索我的坐骑':'搜索我的伙伴';query.placeholder=tr(label);query.setAttribute('aria-label',tr(label));query.value=(state.tab==='mount'?state.mountQuery:state.query)||'';
 }
 updateTabs();
 const shelfHeading=el('div','pet-section-heading',collection,query,previous,next);
 body.append(shelfHeading,status,shelf);
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
  const visible=ids.filter(id=>{const name=c.pets[records[id]?.speciesId||id].name;return !q||name.toLowerCase().includes(q)||tr(name).toLowerCase().includes(q);});
  if(state.targetSlot!=null)setText(status,'选择卡位 {slot} 的伙伴',{slot:state.targetSlot+1});
  else setText(status,visible.length===1?'1 位伙伴 · 营养餐 {food}':'{count} 位伙伴 · 营养餐 {food}',{count:visible.length,food:save.inventory[FOOD_ID]||0});
  if(state.targetSlot!=null)status.append(button('取消',()=>{delete state.targetSlot;paintShelf();},'pet-inline-button'));
  for(const id of visible){
   const pet=records[id],slot=save.formation.indexOf(id),def=c.pets[records[id]?.speciesId||id];
   const meta=el('small','');
   if(slot>=0)setText(meta,'等级 {level} · 卡位 {slot}',{level:pet.level,slot:slot+1});
   else setText(meta,'等级 {level} · 休息中',{level:pet.level});
   const item=button([el('span','pet-card-portrait',createPetStatus(pet,c,el),petPortrait(assets,pet.speciesId,petAppearanceStage(pet,c),96*petDisplayScale(pet.baby?{...pet,birth:{}}:pet,c))),petNameLine(def,el),meta],()=>{if(state.targetSlot!=null){const index=state.targetSlot;delete state.targetSlot;place(id,index);}else open(id);},'pet-owned');
    item.dataset.petId=id;bindDrag(item,id,true);shelf.append(item);
  }
  if(!visible.length)shelf.append(el('p','muted','没有找到伙伴'));
  requestAnimationFrame(updatePager);
 }
 function updatePager(){previous.disabled=shelf.scrollLeft<=1;next.disabled=shelf.scrollLeft+shelf.clientWidth>=shelf.scrollWidth-1;}
 shelf.onscroll=updatePager;query.oninput=()=>{state[state.tab==='mount'?'mountQuery':'query']=query.value;paintShelf();};paintShelf();
 let careDialog;
 const notes=button('说明',()=>{
  const dialog=careDialog??=new DetailDialog(body,{el,title:'照料与自动进食'});
  dialog.body.replaceChildren();
  dialog.body.append(el('p','muted',fill(`新获得的口粮会自动放入空食槽，可点击食槽取回。岛屿上非战斗时角色每秒恢复 {v0}% 生命，宠物每分钟恢复 {v1}%。副本中不会自动回血。携带伙伴每分钟减少 {v2} 饱食，低于 {v3} 时按左、右食槽顺序自动进食，不会消耗背包中未放入的口粮。未上阵的收藏宠物不消耗饱食和口粮，每分钟恢复 {v4} 饱食（离线也恢复，最多24小时）。离线生命恢复仅限岛屿。`,{v0:String(p.heroRegenPerSecond*100),v1:String(p.regenPerMinute*100),v2:String(p.hungerPerMinute),v3:String(p.feedThreshold),v4:String(p.restingHungerPerMinute)}).text),...save.careLog.slice(-3).map(text=>el('p','muted',text)));
  dialog.open(notes);
 },'secondary');
 const footer=el('footer','pet-collection-footer',button('图鉴与商店',()=>cb.panel('shop',{category:state.tab==='mount'?'mount':'pet'}),'secondary'),notes);
 footer.append(renderPetFood(body,model,cb,{el,button,art}));
 if(c.homeUrl){const link=el('a','pet-home-link',icon('shop'),el('span','','宠物家园'));link.href=c.homeUrl;link.target='_blank';link.rel='noopener noreferrer';link.title='联动筹备中，当前冒险进度不会写入家园';footer.append(link);}
 body.append(footer);
}
