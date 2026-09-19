import { equipmentAttributes,EQUIPMENT_SLOTS } from './adventure_equipment_core.js';
import { canEquip, equipmentBlockReason } from './adventure_core.js';
import { showPetDetails } from './view_adventure_pet_details.js';
import { STARTERS,STAGE_NAMES,petStage,petCapacity,petLessons,productPrice,petParams,FOOD_ID } from './adventure_pets_core.js';
export function petPortrait(assets,id,stage=0,size=96){
 const box=document.createElement('div');box.className='pet-sheet';box.style.width=box.style.height=`${size}px`;
 const art=assets.content.pets[id]?.art;if(!art)return box;
 box.style.backgroundImage=`url("${assets.mode==='local'?art.local:art.cdn}")`;
 box.style.backgroundSize='400% 400%';box.style.backgroundPosition=`0% ${stage*100/3}%`;box.setAttribute('role','img');box.setAttribute('aria-label',assets.content.pets[id].name);return box;
}
export function starterPicker(assets,onSelect,{el,button}){
 const row=el('div','starter-choices');for(const id of STARTERS){const b=button([petPortrait(assets,id,0,72),el('span','',assets.content.pets[id].name)],()=>{for(const child of row.children){child.classList.remove('selected');child.setAttribute('aria-pressed','false');}b.classList.add('selected');b.setAttribute('aria-pressed','true');onSelect(id);},'secondary');b.dataset.petId=id;b.setAttribute('aria-pressed',String(id===STARTERS[0]));if(id===STARTERS[0])b.classList.add('selected');row.append(b);}return row;
}
export function renderPetCollection(body,model,cb,{el,button}){
 const {save,assets}=model,c=assets.content,p=petParams(c);
 body.append(el('p','muted',`非战斗时，角色每秒恢复最大生命的 ${p.heroRegenPerSecond*100}%，宠物每分钟恢复最大生命的 ${p.regenPerMinute*100}%；携带宠物每分钟减少 ${p.hungerPerMinute} 饱食。低于 ${p.feedThreshold} 时自动进食，每份恢复 ${p.foodRestore}。离线只恢复生命。`));
 if(Object.values(save.pets).some(pet=>pet.hunger===0))body.append(el('p','pet-supply-notice','有伙伴饱食为 0，已暂停自然回血。请到商店购买营养餐并喂食。'));
 if(!save.starterChosen)body.append(el('h3','','领取初始抱抱龙（选择后立即领取）'),starterPicker(assets,id=>cb.action({type:'starter',petId:id}),{el,button}));
 const formation=el('div','pet-formation'),slots=[...save.formation];let heroSlot=save.heroSlot;
 for(let i=0;i<4;i++){
  const select=el('select','');select.setAttribute('aria-label',`卡位${i+1}宠物`);select.append(new Option('空位',''));
  for(const id of Object.keys(save.pets))select.append(new Option(c.pets[id].name,id));select.value=slots[i]||'';select.onchange=()=>{slots[i]=select.value||null;};
  formation.append(el('label','',`卡位 ${i+1}`,select));
 }
 const hero=el('select','');hero.setAttribute('aria-label','主角卡位');for(let i=0;i<4;i++)hero.append(new Option(`主角站在卡位 ${i+1}`,i));hero.value=heroSlot;hero.onchange=()=>{heroSlot=Number(hero.value);};
 body.append(el('h3','','随行阵容'),el('p','muted','同位伙伴在地图跟随，战斗中通过“使用宠物卡”单独选牌；其他伙伴自动战斗。'),formation,hero,button('保存阵容',()=>cb.action({type:'formation',slots,heroSlot}),'primary'));
 const owned=el('select','');owned.setAttribute('aria-label','选择养成宠物');for(const id of Object.keys(save.pets))owned.append(new Option(c.pets[id].name,id));
 if(model.petView?.selected&&save.pets[model.petView.selected])owned.value=model.petView.selected;
 const detail=el('section','pet-detail');body.append(el('h3','',`宠物收藏 ${Object.keys(save.pets).filter(id=>!c.pets[id].legacy).length} / ${Object.keys(c.pets).filter(id=>!c.pets[id].legacy).length} · 另含教学伙伴`),owned,detail);
 function paint(){
  detail.replaceChildren();const pet=save.pets[owned.value];if(!pet)return;const def=c.pets[pet.speciesId];let draft=pet.deck.map(x=>({...x}));
  detail.append(petPortrait(assets,pet.speciesId,petStage(pet.level,c),120),el('h3','',def.name),el('p','',`${def.traits.elementalAttribute}系 · ${STAGE_NAMES[petStage(pet.level,c)]} · 等级 ${pet.level} · 经验 ${pet.xp}`),el('p','',`生命 ${Math.floor(pet.hp)} · 饱食 ${Math.floor(pet.hunger)} / 100 · 食物 ${save.inventory[FOOD_ID]||0}`),button('喂食',()=>cb.action({type:'pet-feed',petId:pet.speciesId}),'secondary'));
  detail.append(button('查看四阶段与卡片',()=>showPetDetails(assets,pet.speciesId,petPortrait,{el,button}),'secondary'));
  const count=el('p',''),update=()=>{count.textContent=`卡包 ${draft.reduce((n,x)=>n+x.count,0)} / ${petCapacity(pet,c)} 张`;};detail.append(count);update();
  const grid=el('div','pet-card-list');
  for(const lesson of petLessons(pet,c)){
   const input=el('input','');input.type='number';input.min=0;input.max=petParams(c).petCopies;input.value=draft.find(x=>x.key===lesson.key)?.count||0;input.disabled=pet.level<lesson.level;
   input.setAttribute('aria-label',`${assets.dataset.cards[lesson.key]?.name||lesson.key}份数`);input.onchange=()=>{draft=draft.filter(x=>x.key!==lesson.key);if(Number(input.value)>0)draft.push({key:lesson.key,count:Number(input.value)});update();};
   grid.append(el('label','',el('span','',`${lesson.level}级 · ${assets.dataset.cards[lesson.key]?.name||lesson.key}`),input));
  }
  detail.append(grid,button('保存宠物卡包',()=>cb.action({type:'pet-deck',petId:pet.speciesId,deck:draft}),'primary'));
 }
 owned.onchange=()=>{if(model.petView)model.petView.selected=owned.value;paint();};paint();
 body.append(button('前往宠物图鉴与商店',()=>cb.panel('shop'),'secondary'),el('h3','','自动进食记录'),...save.careLog.map(x=>el('p','muted',x)),el('h3','','宠物家园'),el('p','muted','MagicHaqi · 联动筹备中，当前冒险进度不会写入家园。'));
 if(c.homeUrl){const a=el('a','','打开宠物家园');a.href=c.homeUrl;a.target='_blank';a.rel='noopener noreferrer';body.append(a);}
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
