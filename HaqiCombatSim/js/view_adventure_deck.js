import {createCloseButton} from './view_adventure_controls.js';
import {deckLimits,deckCardCopies,deckLayoutCapacity,canEquip,recommendedDeck,playerSpec,availableCardLessons,SCHOOL_NAMES} from './adventure_core.js';
import {clampDeck} from './combat_unit_core.js';
import {skillLearningStatus,trainingPoints} from './adventure_learning_core.js';
const SCHOOL_LABELS={...SCHOOL_NAMES,balance:'平衡'};
const PAGE_SIZE=36;
const HOVER_DELAY=350;

// Keep the full card above/below the icon row, shrinking proportionally on short screens.
export function hoverPreviewPosition(rect,viewportWidth,viewportHeight) {
    const gap=8,above=Math.max(0,rect.top-gap*2),below=Math.max(0,viewportHeight-rect.bottom-gap*2);
    const desiredHeight=230;
    const useBelow=below>=desiredHeight||below>=above;
    const height=Math.min(desiredHeight,useBelow?below:above,Math.max(0,viewportWidth-gap*2)*230/151);
    const width=height*151/230;
    return {width,height,left:Math.max(gap,Math.min((rect.left+rect.right-width)/2,viewportWidth-width-gap)),
        top:useBelow?rect.bottom+gap:rect.top-gap-height};
}

// Original bag / collection split, with a transient full-card preview instead of a third column.
export function renderDeckEditor(body,{assets,save,shopView},cb,{el,button,spellFace}) {
    body.closest?.('.modal')?.classList.add('deck-editor-modal');
    const content=assets.content,cards=assets.dataset.cards;
    if(save.tips.bagRulesAdjusted)body.append(el('p','bag-hint','旧存档中不符合等级或学系要求的口袋已卸下，物品仍保留在背包中。'));
    let bagItemId=save.equipment[24],limits=deckLimits(save,content);
    let trainingPointsSpent=save.trainingPointsSpent||0;
    const draftSave=()=>({...save,cards:owned,trainingPointsSpent,equipment:{...save.equipment,...(bagItemId?{24:bagItemId}:{})}});
    const copies=key=>deckCardCopies(draftSave(),content,key);
    const layouts=JSON.parse(JSON.stringify(save.deckLayouts||[{name:'卡包一',deck:save.deck}]));
    let active=save.activeDeckLayout||0,school='all',page=0,query='',ownedOnly=true,previewPinned=false,hoverTimer;
    const owned={...save.cards},learned=new Set(),lessons=availableCardLessons(save,content),lessonMap=new Map(lessons.map(row=>[row.key,row]));
    layouts[active].deck=save.deck.map(row=>({...row}));
    const tabs=el('div','bag-tabs'),slots=el('div','bag-slots'),library=el('div','bag-library'),detail=el('div','bag-detail');
    detail.hidden=true;detail.setAttribute('role','dialog');detail.setAttribute('aria-label','卡牌预览');
    const status=el('span','bag-status');status.setAttribute('aria-live','polite');
    const counter=el('strong',''),name=el('input','bag-name');name.maxLength=16;name.setAttribute('aria-label','卡包名称');name.hidden=true;
    const total=()=>layouts[active].deck.reduce((n,row)=>n+row.count,0);
    const say=text=>{status.textContent=text;};
    const mark=()=>say('有修改待保存');
    function subject(card) {
        const canvas=el('canvas','bag-subject');canvas.width=96;canvas.height=96;
        const base=assets.effects.cards[card.key]?.base;
        if(base){
            const draw=()=>assets.skillArt.drawSubject(canvas.getContext('2d'),base,0,0,96,96);
            if(!draw()&&assets.skillArt.ensure)assets.skillArt.ensure(base).then(()=>{if(canvas.isConnected)draw();}).catch(()=>{});
        }
        canvas.setAttribute('aria-hidden','true');return canvas;
    }
    function closePreview(){clearTimeout(hoverTimer);detail.hidden=true;previewPinned=false;}
    function inspect(key,removable=false,anchor=null,pinned=true) {
        clearTimeout(hoverTimer);previewPinned=pinned;
        detail.dataset.previewMode=pinned?'click':'hover';
        detail.setAttribute('role',pinned?'dialog':'tooltip');
        detail.style.width='';detail.style.height='';
        if(!pinned){
            detail.replaceChildren(spellFace(assets,cards[key]));
            const rect=anchor?.getBoundingClientRect?.();
            if(rect&&typeof window!=='undefined'){
                const position=hoverPreviewPosition(rect,window.innerWidth,window.innerHeight);
                for(const [property,value]of Object.entries(position))detail.style[property]=`${value}px`;
                detail.style.setProperty('--hover-left',`${position.left}px`);detail.style.setProperty('--hover-top',`${position.top}px`);
            }
            detail.hidden=false;return;
        }
        const card=cards[key],lesson=lessonMap.get(key);
        const close=createCloseButton(closePreview,'关闭卡牌预览','bag-preview-close');
        detail.replaceChildren(close,spellFace(assets,card));
        if(removable)detail.append(button('移出一张',()=>remove(key),'secondary'));
        else if(lesson){
            const learning=skillLearningStatus(draftSave(),content,lesson);
            const action=button(owned[key]?'放入一张':learning.allowed?`学习并放入（${learning.reason}）`:learning.reason,()=>add(key),'primary');
            action.disabled=!learning.allowed;detail.append(action);
        }
        detail.hidden=false;
        // Desktop popover stays beside the hovered icon; narrow screens use a centered sheet.
        const rect=anchor?.getBoundingClientRect?.();
        if(rect&&typeof window!=='undefined'){
            const x=rect.right+190<window.innerWidth?rect.right+8:Math.max(8,rect.left-190);
            detail.style.left=`${x}px`;detail.style.top=`${Math.max(8,Math.min(rect.top,window.innerHeight-detail.offsetHeight-8))}px`;
        }
    }
    function previewEvents(node,key,removable=false){
        const schedule=()=>{
            if(previewPinned)return;
            closePreview();
            hoverTimer=setTimeout(()=>{if(node.isConnected&&!previewPinned)inspect(key,removable,node,false);},HOVER_DELAY);
        };
        node.onpointerenter=e=>{if(e.pointerType==='mouse')schedule();};
        node.onpointerleave=()=>{if(!previewPinned)closePreview();};
        node.onpointerdown=()=>{if(!previewPinned)closePreview();};
        node.onfocus=schedule;
        node.onblur=()=>{if(!previewPinned)closePreview();};
        node.onkeydown=e=>{if(e.key==='Escape')closePreview();};
    }
    // Scrolling changes the anchor position; never leave a floating preview over another row.
    body.addEventListener?.('scroll',()=>{if(!previewPinned)closePreview();},true);
    function remove(key) {
        const row=layouts[active].deck.find(row=>row.key===key);if(!row)return;
        if(total()===1){say('卡包至少保留一张');return;}
        row.count--;layouts[active].deck=layouts[active].deck.filter(row=>row.count>0);
        closePreview();mark();paintCards();
    }
    function add(key) {
        const lesson=lessonMap.get(key),deck=layouts[active].deck,row=deck.find(row=>row.key===key),count=row?.count||0;
        const learning=skillLearningStatus(draftSave(),content,lesson);
        if(!learning.allowed){say(learning.reason);return;}
        if(total()>=limits.capacity){say('卡包已满，请先移出卡牌');return;}
        if(count>=(owned[key]?copies(key):limits.eachCapacity)){say('已达到单卡上限');return;}
        if(!owned[key]){owned[key]=lesson.copies;learned.add(key);trainingPointsSpent+=learning.cost;}
        if(row)row.count++;else deck.push({key,count:1});mark();paintCards();
    }
    // One reusable visual follows the pointer; it never intercepts drop events.
    const dragGhost=el('div','bag-drag-ghost');dragGhost.hidden=true;dragGhost.setAttribute('aria-hidden','true');
    function bindCardGesture(node,key,removable=false,onClick=()=>inspect(key,removable,node)) {
        let timer=null,start=null,suppressClick=false,dragging=false,pointerId=null;
        const cancel=()=>{clearTimeout(timer);timer=null;};
        const end=()=>{cancel();start=null;dragging=false;dragGhost.hidden=true;dragGhost.remove();slots.classList.remove('dragging');node.classList.remove('dragging');};
        node.onpointerdown=e=>{
            closePreview();
            if(e.button!==0||e.isPrimary===false)return;
            end();suppressClick=false;pointerId=e.pointerId;start={x:e.clientX,y:e.clientY};
            if(removable)node.setPointerCapture?.(pointerId);
            if(e.pointerType==='touch'||e.pointerType==='pen')timer=setTimeout(()=>{
                cancel();if(!node.isConnected||dragging)return;
                suppressClick=true;end();inspect(key,removable,node);
            },550);
        };
        node.onpointermove=e=>{
            if(!start)return;
            if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>10){
                cancel();suppressClick=true;
                if(!removable){start=null;return;} // Let the collection scroll normally.
                if(!dragging){
                    dragging=true;closePreview();slots.classList.add('dragging');node.classList.add('dragging');
                    const rect=node.getBoundingClientRect();
                    dragGhost.style.width=`${rect.right-rect.left}px`;dragGhost.style.height=`${rect.bottom-rect.top}px`;
                    dragGhost.replaceChildren(subject(cards[key]));document.body.append(dragGhost);dragGhost.hidden=false;
                }
            }
            if(dragging){dragGhost.style.left=`${e.clientX}px`;dragGhost.style.top=`${e.clientY}px`;}
        };
        node.onpointerup=e=>{
            const rect=slots.getBoundingClientRect();
            const outside=e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom;
            const shouldRemove=dragging&&outside;
            end();if(node.hasPointerCapture?.(pointerId))node.releasePointerCapture(pointerId);
            if(shouldRemove)remove(key);
        };
        node.onpointercancel=()=>{suppressClick=true;end();};
        node.onlostpointercapture=()=>{if(start||dragging)suppressClick=true;end();};
        node.oncontextmenu=e=>{e.preventDefault();suppressClick=true;end();inspect(key,removable,node);};
        node.onclick=()=>{if(!suppressClick)onClick();suppressClick=false;};
        node.onkeydown=e=>{
            if(e.key==='Escape'){suppressClick=true;end();closePreview();}
            if(removable&&(e.key==='Delete'||e.key==='Backspace')){e.preventDefault();end();remove(key);}
            if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();inspect(key,removable,node);}
        };
    }
    const filters=el('div','bag-school-tabs');
    for(const [id,label] of [['all','全部'],...Object.entries(SCHOOL_LABELS)]){
        const tab=button(id===save.school?`${label}·本系`:label,()=>{school=id;page=0;paintLibrary();},'bag-school');tab.dataset.school=id;filters.append(tab);
    }
    const search=el('input','bag-search');search.type='search';search.placeholder='搜索卡牌';search.setAttribute('aria-label','搜索卡牌');
    search.oninput=()=>{query=search.value.trim().toLowerCase();page=0;paintLibrary();};
    const toggle=button('只看已学',()=>{ownedOnly=!ownedOnly;toggle.setAttribute('aria-pressed',String(ownedOnly));page=0;paintLibrary();},'bag-filter');toggle.setAttribute('aria-pressed','true');
    const points=el('span','bag-training-points');points.title='本系课程免费；外系课程消耗训练点。升级获得训练点，保存后才扣除。';
    const countLabel=el('span','bag-page-count'),previous=button('上一页',()=>{page--;paintLibrary();},'bag-page'),next=button('下一页',()=>{page++;paintLibrary();},'bag-page');
    function paintLibrary(){
        points.textContent=`训练点：${trainingPoints(draftSave(),content)}`;
        for(const tab of filters.children)tab.setAttribute('aria-pressed',String(tab.dataset.school===school));
        const rows=lessons.filter(row=>(school==='all'||row.school===school)&&(!ownedOnly||owned[row.key])&&(!query||`${cards[row.key]?.name||row.name||''} ${row.key}`.toLowerCase().includes(query)));
        const pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));page=Math.max(0,Math.min(page,pages-1));
        countLabel.textContent=`${rows.length} 张 · ${page+1}/${pages}`;previous.disabled=page===0;next.disabled=page>=pages-1;
        library.replaceChildren();
        for(const lesson of rows.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE)){
            const card=cards[lesson.key];if(!card)continue;
            const n=layouts[active].deck.find(row=>row.key===lesson.key)?.count||0;
            const learning=skillLearningStatus(draftSave(),content,lesson),available=learning.allowed;
            const label=owned[lesson.key]?`已放 ${n}/${copies(lesson.key)}`:learning.reason;
            const entry=button([el('span','bag-library-icon',subject(card)),el('span','bag-card-name',card.name),el('small','muted',label)],()=>{},`bag-library-card ${available?'':'locked'}`);
            entry.setAttribute('aria-label',`${owned[lesson.key]?'放入':'学习并放入'}${card.name}`);
            entry.setAttribute('aria-disabled',String(!available||n>=(owned[lesson.key]?copies(lesson.key):limits.eachCapacity)||total()>=limits.capacity));
            previewEvents(entry,lesson.key);bindCardGesture(entry,lesson.key,false,()=>add(lesson.key));library.append(entry);
        }
        if(!rows.length)library.append(el('p','muted','没有符合条件的卡牌'));
    }
    function paintCards(){
        counter.textContent=`${total()}/${limits.capacity} 张 · 单卡最多 ${limits.eachCapacity}`;slots.replaceChildren();
        for(const row of layouts[active].deck)for(let i=0;i<row.count;i++){
            const card=cards[row.key],slot=button(subject(card),()=>{},'bag-slot');
            slot.setAttribute('aria-label',`${card.name}，第 ${i+1} 张，拖出移除，长按或右键查看详情`);previewEvents(slot,row.key,true);bindCardGesture(slot,row.key,true);slots.append(slot);
        }
        for(let i=total();i<limits.capacity;i++){const slot=el('span','bag-slot empty');slot.setAttribute('aria-hidden','true');slots.append(slot);}
        paintLibrary();
    }
    function paintTabs(){
        closePreview();tabs.replaceChildren();layouts.forEach((layout,index)=>{
            const tab=button(layout.name,()=>{active=index;mark();paintTabs();paintCards();},'bag-tab');tab.setAttribute('aria-pressed',String(index===active));tabs.append(tab);
        });
        create.disabled=layouts.length>=deckLayoutCapacity(save,content);
        create.title=create.disabled?'没有多余的可用卡包，请先到商店购买':'使用已拥有的卡包';
        tabs.append(create);drop.disabled=layouts.length===1;name.value=layouts[active].name;name.hidden=true;
    }
    name.oninput=()=>{layouts[active].name=name.value;mark();tabs.children[active].textContent=name.value||'未命名';};
    const rename=button('改名',()=>{name.hidden=!name.hidden;if(!name.hidden)name.focus();},'text-button');
    const create=button('+',()=>{if(layouts.length>=deckLayoutCapacity(save,content)){say('没有多余的可用卡包，请先到商店购买');return;}layouts.push({name:`卡包${layouts.length+1}`,deck:layouts[active].deck.map(row=>({...row}))});active=layouts.length-1;mark();paintTabs();paintCards();},'bag-tab bag-add');create.setAttribute('aria-label','使用多余卡包');
    const drop=button('删除布局',()=>{if(layouts.length<=1)return;layouts.splice(active,1);active=Math.max(0,active-1);mark();paintTabs();paintCards();},'text-button');
    const equipment=el('div','bag-slots equipment-card-slots');
    for(const row of playerSpec(save,content).fixedCards)for(let i=0;i<row.count;i++){
        const card=cards[row.key];if(!card)continue;const slot=button(subject(card),()=>inspect(row.key,false,slot),'bag-slot');slot.setAttribute('aria-label',card.name+'，装备附卡');previewEvents(slot,row.key);equipment.append(slot);
    }
    const saveButton=button('保存并使用',()=>{
        if(layouts.some(row=>!row.name.trim())){say('请填写卡包名称');return;}
        cb.action({type:'deck-layouts',layouts,active,learnedKeys:[...learned],...(bagItemId?{bagItemId}:{})});
    },'primary');
    const bag=el('section','bag-main',el('div','bag-section-bar',counter,button('推荐',()=>{layouts[active].deck=recommendedDeck(draftSave(),content);mark();paintCards();},'secondary'),rename,drop),name,slots,
        el('p','bag-hint','拖出移除；长按 / 右键查看详情'),
        el('details','bag-equipment',el('summary','',`装备附卡 ${equipment.children.length} 张 · 不占卡位`),equipment));
    const collection=el('section','bag-collection',el('div','bag-section-bar',el('strong','','法术牌库'),search,toggle),filters,
        library,el('div','bag-pager',countLabel,points,previous,next));
    const selector=el('select','bag-equipment-select');selector.setAttribute('aria-label','选择已拥有的卡包装备');
    if(!bagItemId){const option=el('option','','未装备口袋 · 基础配卡');option.value='';selector.append(option);}
    for(const item of Object.values(content.items).filter(item=>item.slot===24&&(save.inventory[item.id]||0)>0)){
        const option=el('option','',`${item.name} · ${item.stats[167]}张 / 单卡${item.stats[170]}张${canEquip(save,item,content)?'':' · 不符合使用条件'}`);
        option.value=String(item.id);option.disabled=!canEquip(save,item,content);selector.append(option);
    }
    selector.value=String(bagItemId||'');
    selector.onchange=()=>{
        bagItemId=Number(selector.value)||undefined;limits=deckLimits(draftSave(),content);
        let removed=0;
        for(const layout of layouts){const result=clampDeck(layout.deck,limits);layout.deck=result.deck;removed+=result.trimmed;}
        paintCards();say(removed?`更换口袋将从配卡方案中移出 ${removed} 张，已学法术保留；保存后生效`:'更换口袋待保存');
    };
    const shop=button('购买卡包',()=>{if(shopView)Object.assign(shopView,{category:'bag',subcategory:0,selected:null,query:'',school:'',slot:'',ownership:'',level:'',page:0});cb.panel('shop');},'secondary');
    shop.title='前往商店购买卡包；当前修改需先保存';
    body.append(el('div','bag-toolbar',tabs,selector,shop),el('div','bag-workspace',bag,collection),el('div','bag-footer',status,saveButton),detail);
    paintTabs();paintCards();say('当前使用：'+layouts[active].name);
}
