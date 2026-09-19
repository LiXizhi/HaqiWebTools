import { equipmentAttributes,EQUIPMENT_SLOTS } from './adventure_equipment_core.js';
import { canEquip, equipmentBlockReason } from './adventure_core.js';
import { showPetDetails } from './view_adventure_pet_details.js';
import { STARTERS,STAGE_NAMES,petStage,productPrice,petParams,FOOD_ID } from './adventure_pets_core.js';
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
  const exit=button('×',close,'close-button');exit.setAttribute('aria-label','关闭教学伙伴');
  const content=el('div','modal-body',tile(assets,'creatures',save.pet?6:7,120,128));
  if(save.pet){content.append(el('h3','',save.pet.name),el('p','',`等级 ${save.pet.level} · 经验 ${save.pet.xp} · 口粮 ${save.inventory[17172]||0} 包`),button('喂养一包战宠口粮',()=>{close();cb.action({type:'feed'});},'primary'));}
  else content.append(el('p','','完成青龙的强化指导，领取出奇蛋。'),button('打开出奇蛋',()=>{close();cb.action({type:'hatch'});},'primary'));
  dialog.append(el('header','modal-header',el('h2','','初心之旅 · 咕噜噜'),exit),content);document.body.append(dialog);dialog.addEventListener('keydown',event=>event.stopPropagation());dialog.addEventListener('close',()=>{dialog.remove();teaching.focus();},{once:true});dialog.showModal();
 },'secondary');
 const footer=el('footer','pet-collection-footer',button('图鉴与商店',()=>cb.panel('shop'),'secondary'),teaching,notes);
 if(c.homeUrl){const link=el('a','pet-home-link',icon('shop'),el('span','','宠物家园'));link.href=c.homeUrl;link.target='_blank';link.rel='noopener noreferrer';link.title='联动筹备中，当前冒险进度不会写入家园';footer.append(link);}
 body.append(footer);
}
export function renderShop(body,model,cb,{el,button,art}){
 const {save,assets}=model,c=assets.content,state=model.shopView||{category:'pet',query:'',school:'',slot:'',ownership:'',page:0};
 body.append(el('p','',`奇豆 ${save.inventory[100]||0} · 当前等级 ${save.level} / 50`));
 let category=state.category;
 const filters=el('div','shop-filters'),query=el('input',''),school=el('select',''),ownership=el('select',''),slot=el('select','');
 const tabs=el('nav','shop-category-tabs');tabs.setAttribute('aria-label','商品分类');
 for(const [value,label] of [['gear','装备'],['bag','卡包'],['pet','宠物'],['supply','补给']]){
  const tab=button(label,()=>{category=value;state.category=value;slot.value='';if(value==='supply')school.value='';updateFilters();body.scrollTop=0;},'secondary shop-category-tab');
  tab.dataset.category=value;tabs.append(tab);
 }
 const header=body.closest('.modal').querySelector('.modal-header');header.classList.add('shop-header');header.insertBefore(tabs,header.querySelector('.close-button'));
 query.placeholder='搜索物种或装备名称';query.setAttribute('aria-label','搜索商品');
 for(const [v,n] of [['','所有学系'],['fire','烈火'],['ice','寒冰'],['storm','风暴'],['life','生命 / 自然'],['death','死亡'],['all','通用']])school.append(new Option(n,v));
 for(const [v,n] of [['','所有收藏'],['owned','已拥有'],['new','未拥有']])ownership.append(new Option(n,v));
 slot.append(new Option('所有部位',''));school.setAttribute('aria-label','商品学系');ownership.setAttribute('aria-label','收藏筛选');slot.setAttribute('aria-label','装备部位');
 for(const id of [...new Set(c.shop.filter(x=>x.slot).map(x=>x.slot))].sort((a,b)=>a-b))slot.append(new Option(EQUIPMENT_SLOTS.find(x=>x.id===id)?.name||`装备部位 ${id}`,id));
 query.value=state.query;school.value=state.school;slot.value=state.slot;ownership.value=state.ownership;
 filters.append(query,school,slot,ownership);body.append(filters);
 const tree=el('div','shop-tree'),pager=el('div','shop-pager');body.append(tree,pager);let page=state.page;
 const owned=item=>item.kind==='pet'?!!save.pets[item.petId]:(save.inventory[item.itemId]||0)>0;
 function paint(){
  for(const tab of tabs.children){const selected=tab.dataset.category===category;tab.classList.toggle('active',selected);tab.setAttribute('aria-pressed',String(selected));}
  slot.hidden=category!=='gear';school.hidden=category==='supply';
  tree.replaceChildren();pager.replaceChildren();
  const rows=c.shop.filter(x=>(category==='bag'?x.kind==='gear'&&x.slot===24:x.kind===category)&&x.name.includes(query.value)&&(!school.value||x.school===school.value)&&(!slot.value||String(x.slot)===slot.value)&&(!ownership.value||owned(x)===(ownership.value==='owned'))).sort((a,b)=>a.level-b.level||a.name.localeCompare(b.name,'zh'));
  page=Math.min(page,Math.max(0,Math.ceil(rows.length/24)-1));state.page=page;let last=-1;
  for(const item of rows.slice(page*24,page*24+24)){
   if(last!==item.level){tree.append(el('h3','shop-tier',`${item.level}级解锁 ${save.level>=item.level?'· 已解锁':'· 待成长'}`));last=item.level;}
   const cost=productPrice(item,c),card=el('article','shop-card');
   if(item.petId){
    card.append(petPortrait(assets,item.petId));
    card.append(button('查看四阶段与卡片',()=>showPetDetails(assets,item.petId,petPortrait,{el,button}),'secondary pet-details-button'));
   }
   if(item.kind==='gear'){const gear=c.items[item.itemId],image=art(assets,gear.art,80,80,'shop-gear-icon');image.setAttribute('role','img');image.setAttribute('aria-label',item.name);card.append(image);if(gear.iconFallback)card.append(el('small','muted','原图缺失 · 同部位示意图'));}
   card.append(el('strong','',item.name),el('p','muted',`${cost} 奇豆${owned(item)?' · 已拥有':''}`));
   if(item.kind==='gear'){const gear=c.items[item.itemId];card.append(el('p','',gear.description||''),el('small','',`属性：${equipmentAttributes(gear,save,c).map(x=>`${x.label} ${x.value}${x.unit}`).join(' · ')}`));if(gear.unsupportedStats?.length)card.append(el('small','muted',`当前未生效属性：${gear.unsupportedStats.join('、')}`));}
   const buy=button('购买',()=>cb.action({type:'buy',productId:item.id}),'primary');buy.disabled=save.level<item.level||(save.inventory[100]||0)<cost||item.kind==='pet'&&owned(item);card.append(buy);
   if(item.slot===24){
    buy.disabled ||= owned(item);
    card.append(el('small','muted',`${item.school==='all'?'全学系通用':{fire:'烈火',ice:'寒冰',storm:'风暴',life:'生命',death:'死亡'}[item.school]+'系专用'} · ${item.level}级可装备`));
    if(owned(item)){
     const gear=c.items[item.itemId],equipped=save.equipment[24]===item.itemId;
     const equip=button(equipped?'已装备':'前往卡包配卡',()=>cb.panel('deck'),'secondary');
     equip.disabled=equipped||!canEquip(save,gear,c);card.append(equip);
     if(!canEquip(save,gear,c))card.append(el('small','muted',equipmentBlockReason(save,gear,c)));
    }
   }
   if(item.kind==='pet'){const capture=button('寻找并捕获',()=>cb.encounter('wild:'+item.petId),'secondary');capture.disabled=save.level<item.level;card.append(capture);}
   tree.append(card);
  }
  pager.append(button('上一页',()=>{page=Math.max(0,page-1);paint();},'secondary'),el('span','',`${page+1} / ${Math.max(1,Math.ceil(rows.length/24))} · 共${rows.length}项`),button('下一页',()=>{page++;paint();},'secondary'));
 }
 function updateFilters(){page=0;Object.assign(state,{category,query:query.value,school:school.value,slot:slot.value,ownership:ownership.value,page});paint();}
 for(const input of [query,school,slot,ownership])input.oninput=updateFilters;paint();
 const trial=el('select','');trial.setAttribute('aria-label','试炼等级');for(let level=1;level<=50;level++){const option=new Option(`${level}级试炼${level>save.level?'（未解锁）':''}`,level);option.disabled=level>save.level;trial.append(option);}trial.value=save.level;
 body.append(el('h3','','魔法试炼 · 经验与奇豆'),trial,button('开始试炼',()=>cb.encounter('trial:'+trial.value),'primary'));
}
