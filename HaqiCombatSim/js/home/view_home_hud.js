import {buildingItem,buildingConnectionMask} from '../home_building_core.js';
import {BUILDING_TEMPLATES,buildingTemplateObjects} from '../home_building_templates_core.js';
import {requiresReading,summonSentences,COLORS,homeInteractiveKind} from '../home_core.js';
import {starterLampExercise} from '../home_starter_room_core.js';
import {tr} from '../locale_runtime.js';
import {homeItemLanguage} from '../home_language_core.js';
import {drawHomeObject} from './view_home_object_art.js';
import {drawBuilding} from './view_home_building.js';
import {el,button,activities,COLOR_HEX,INTERACTIVE_BADGES,CATEGORY_PRIORITY,DEFAULT_SUMMON_TIP} from './view_home_modals.js';

export function renderHomeSummonExample({next,example,cb,run,syncSpellTip,setSpellTip,closeSummonDrawer}){
 if(next.selection?.itemId&&!next.selection.id){
  const selectedItem=[...next.catalog.items,...(next.practiceItems||[])].find(i=>i.id===next.selection.itemId);
  const item=next.selection.starterLamp?starterLampExercise(selectedItem):selectedItem;
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
  const tip=el('span','home-spell-tip',DEFAULT_SUMMON_TIP);
  setSpellTip(tip);
  syncSpellTip();
  swatchRow.append(tip,button('取消召唤',()=>{const returnToRoom=!!next.selection?.starterLamp;cb.cancel();closeSummonDrawer(returnToRoom);},'home-speak-btn'));
  example.append(chipRow,swatchRow);
 }else{
  const tip=el('span','home-spell-tip',DEFAULT_SUMMON_TIP);
  setSpellTip(tip);
  syncSpellTip();
  example.replaceChildren(tip);
 }
}

export function renderHomeCatalogSidebar({next,category,petMode,tabs,side,catPills,items,summary,imageFor,cb,run}){
 tabs.textContent=tr(petMode?'家园宠物背包':'户外与家园设施');
 side.setAttribute('aria-label',tabs.textContent);
 category.hidden=petMode;
 catPills.hidden=petMode;
 if(!petMode){
  [...catPills.children].forEach(p=>p.classList.toggle('is-active',p.dataset.cat===category.value));
 }
 items.replaceChildren();
 if(petMode){
  const pets=next.petBag||next.pets||[];
  summary.textContent=tr('拖入场景放出宠物；拖回背包或底部宠物背包按钮即可收回。');
  if(!pets.length)items.append(el('p','home-empty-hint',(next.pets||[]).length?'场景里的宠物可以拖回背包。':'还没有宠物。先在冒险里结识一只伙伴。'));
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
  const targetName=homeItemLanguage(item,next.lang)||item.zh;
  const variants=[{color:''}];
  for(const v of variants){
   const isSelected=next.selection?.itemId===item.id&&(next.selection?.color||'')===v.color;
   const card=button('',()=>{
    if(!requiresReading(item))cb.select(item.id,v.color,true);
    else cb.practice(item.id,v.color);
   },'home-item'+(isSelected?' is-selected':''));
   card.setAttribute('aria-label',`${COLORS[v.color]||''}${item.zh}`);
   card.title=`${COLORS[v.color]||''}${item.zh} · ${targetName}`;
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
   meta.append(el('strong','',`${COLORS[v.color]||''}${item.zh}`),el('small','',isSelected?tr(!requiresReading(item)?'直接摆放 · R旋转':'念咒语召唤'):targetName));
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
