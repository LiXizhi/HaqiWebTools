import {deckLimits,recommendedDeck,playerSpec,availableCardLessons,SCHOOL_NAMES} from './adventure_core.js';
const SCHOOL_LABELS={...SCHOOL_NAMES,balance:'平衡'};
const PAGE_SIZE=36;

// Original bag / collection split, with a transient full-card preview instead of a third column.
export function renderDeckEditor(body,{assets,save},cb,{el,button,spellFace}) {
    body.closest?.('.modal')?.classList.add('deck-editor-modal');
    const content=assets.content,cards=assets.dataset.cards,limits=deckLimits(save,content);
    const layouts=JSON.parse(JSON.stringify(save.deckLayouts||[{name:'卡包一',deck:save.deck}]));
    let active=save.activeDeckLayout||0,school=save.school,page=0,query='',ownedOnly=false,previewPinned=false,hideTimer;
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
    function closePreview(){clearTimeout(hideTimer);detail.hidden=true;previewPinned=false;}
    function inspect(key,removable=false,anchor=null,pinned=true) {
        clearTimeout(hideTimer);previewPinned=pinned;
        const card=cards[key],lesson=lessonMap.get(key);
        const close=button('×',closePreview,'bag-preview-close');close.setAttribute('aria-label','关闭卡牌预览');
        detail.replaceChildren(close,spellFace(assets,card));
        if(removable)detail.append(button('移出一张',()=>remove(key),'secondary'));
        else if(lesson){
            const canLearn=save.level>=lesson.level&&lesson.supported!==false;
            const action=button(owned[key]?'放入一张':canLearn?'学习并放入':lesson.supported===false?'效果暂未支持':`${lesson.level} 级可学习`,()=>add(key),'primary');
            action.disabled=!owned[key]&&!canLearn;detail.append(action);
        }
        detail.hidden=false;
        // Desktop popover stays beside the hovered icon; narrow screens use a centered sheet.
        const rect=anchor?.getBoundingClientRect?.();
        if(rect&&typeof window!=='undefined'){
            const x=rect.right+190<window.innerWidth?rect.right+8:Math.max(8,rect.left-190);
            detail.style.left=`${x}px`;detail.style.top=`${Math.max(8,Math.min(rect.top,window.innerHeight-350))}px`;
        }
    }
    function previewEvents(node,key,removable=false){
        node.onpointerenter=e=>{if(e.pointerType==='mouse'&&!previewPinned)inspect(key,removable,node,false);};
        node.onpointerleave=()=>{if(!previewPinned)hideTimer=setTimeout(closePreview,130);};
        node.onfocus=()=>{if(!previewPinned)inspect(key,removable,node,false);};
        node.onkeydown=e=>{if(e.key==='Escape')closePreview();};
    }
    detail.onpointerenter=()=>clearTimeout(hideTimer);
    detail.onpointerleave=()=>{if(!previewPinned)closePreview();};
    function remove(key) {
        const row=layouts[active].deck.find(row=>row.key===key);if(!row)return;
        if(total()===1){say('卡包至少保留一张');return;}
        row.count--;layouts[active].deck=layouts[active].deck.filter(row=>row.count>0);
        closePreview();mark();paintCards();
    }
    function add(key) {
        const lesson=lessonMap.get(key),deck=layouts[active].deck,row=deck.find(row=>row.key===key),count=row?.count||0;
        if(!lesson||lesson.supported===false){say('此卡牌效果暂未支持');return;}
        if(!owned[key]&&save.level<lesson.level){say(`${lesson.level} 级可学习`);return;}
        if(total()>=limits.capacity){say('卡包已满，请先移出卡牌');return;}
        if(count>=Math.min(owned[key]||lesson.copies,limits.eachCapacity)){say('已达到单卡上限');return;}
        if(!owned[key]){owned[key]=lesson.copies;learned.add(key);}
        if(row)row.count++;else deck.push({key,count:1});mark();paintCards();
    }
    function bindRemoval(node,key) {
        let timer=null,start=null,held=false,dragging=false,pointerId=null;
        const cancel=()=>{clearTimeout(timer);timer=null;node.classList.remove('holding');};
        const end=()=>{cancel();start=null;dragging=false;slots.classList.remove('dragging');node.classList.remove('dragging');};
        node.onpointerdown=e=>{
            if(e.button!==0)return;cancel();held=false;dragging=false;pointerId=e.pointerId;start={x:e.clientX,y:e.clientY};
            node.setPointerCapture?.(pointerId);node.classList.add('holding');
            timer=setTimeout(()=>{cancel();if(!node.isConnected||dragging)return;held=true;end();remove(key);},550);
        };
        node.onpointermove=e=>{
            if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>10){cancel();dragging=true;slots.classList.add('dragging');node.classList.add('dragging');closePreview();}
        };
        node.onpointerup=e=>{
            const rect=slots.getBoundingClientRect?.();
            const outside=rect&&(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom);
            const shouldRemove=dragging&&outside;held=held||dragging;
            end();if(node.hasPointerCapture?.(pointerId))node.releasePointerCapture(pointerId);
            if(shouldRemove)remove(key);
        };
        node.onpointercancel=()=>{held=true;end();};node.onlostpointercapture=()=>{end();};
        node.oncontextmenu=e=>{e.preventDefault();cancel();if(!held){held=true;remove(key);}};
        node.onclick=()=>{if(!held)inspect(key,true,node);held=false;};
        node.onkeydown=e=>{if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove(key);}if(e.key==='Escape')closePreview();};
    }
    const filters=el('div','bag-school-tabs');
    for(const [id,label] of [['all','全部'],...Object.entries(SCHOOL_LABELS)]){
        const tab=button(id===save.school?`${label}·本系`:label,()=>{school=id;page=0;paintLibrary();},'bag-school');tab.dataset.school=id;filters.append(tab);
    }
    const search=el('input','bag-search');search.type='search';search.placeholder='搜索卡牌';search.setAttribute('aria-label','搜索卡牌');
    search.oninput=()=>{query=search.value.trim().toLowerCase();page=0;paintLibrary();};
    const toggle=button('只看已学',()=>{ownedOnly=!ownedOnly;toggle.setAttribute('aria-pressed',String(ownedOnly));page=0;paintLibrary();},'bag-filter');toggle.setAttribute('aria-pressed','false');
    const countLabel=el('span','bag-page-count'),previous=button('上一页',()=>{page--;paintLibrary();},'bag-page'),next=button('下一页',()=>{page++;paintLibrary();},'bag-page');
    function paintLibrary(){
        for(const tab of filters.children)tab.setAttribute('aria-pressed',String(tab.dataset.school===school));
        const rows=lessons.filter(row=>(school==='all'||row.school===school)&&(!ownedOnly||owned[row.key])&&(!query||`${cards[row.key]?.name||row.name||''} ${row.key}`.toLowerCase().includes(query)));
        const pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));page=Math.max(0,Math.min(page,pages-1));
        countLabel.textContent=`${rows.length} 张 · ${page+1}/${pages}`;previous.disabled=page===0;next.disabled=page>=pages-1;
        library.replaceChildren();
        for(const lesson of rows.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE)){
            const card=cards[lesson.key];if(!card)continue;
            const n=layouts[active].deck.find(row=>row.key===lesson.key)?.count||0;
            const preview=button(subject(card),()=>inspect(lesson.key,false,preview),'bag-library-icon');preview.setAttribute('aria-label',`预览${card.name}`);previewEvents(preview,lesson.key);
            const available=lesson.supported!==false&&(owned[lesson.key]||save.level>=lesson.level);
            const addButton=button('+',()=>add(lesson.key),'bag-quick-add');addButton.setAttribute('aria-label',`${owned[lesson.key]?'放入':'学习并放入'}${card.name}`);addButton.disabled=!available||n>=Math.min(owned[lesson.key]||lesson.copies,limits.eachCapacity)||total()>=limits.capacity;
            const label=lesson.supported===false?'暂未支持':owned[lesson.key]?`已放 ${n}/${Math.min(owned[lesson.key],limits.eachCapacity)}`:save.level>=lesson.level?'可学习':`${lesson.level}级学习`;
            library.append(el('div',`bag-library-card ${available?'':'locked'}`,preview,el('span','bag-card-name',card.name),el('small','muted',label),addButton));
        }
        if(!rows.length)library.append(el('p','muted','没有符合条件的卡牌'));
    }
    function paintCards(){
        counter.textContent=`${total()}/${limits.capacity} 张 · 单卡最多 ${limits.eachCapacity}`;slots.replaceChildren();
        for(const row of layouts[active].deck)for(let i=0;i<row.count;i++){
            const card=cards[row.key],slot=button(subject(card),()=>{},'bag-slot');
            slot.setAttribute('aria-label',`${card.name}，第 ${i+1} 张，长按或按删除键移出`);previewEvents(slot,row.key,true);bindRemoval(slot,row.key);slots.append(slot);
        }
        for(let i=total();i<limits.capacity;i++){const slot=el('span','bag-slot empty');slot.setAttribute('aria-hidden','true');slots.append(slot);}
        paintLibrary();
    }
    function paintTabs(){
        closePreview();tabs.replaceChildren();layouts.forEach((layout,index)=>{
            const tab=button(layout.name,()=>{active=index;mark();paintTabs();paintCards();},'bag-tab');tab.setAttribute('aria-pressed',String(index===active));tabs.append(tab);
        });
        tabs.append(create);create.disabled=layouts.length>=6;drop.disabled=layouts.length===1;name.value=layouts[active].name;name.hidden=true;
    }
    name.oninput=()=>{layouts[active].name=name.value;mark();tabs.children[active].textContent=name.value||'未命名';};
    const rename=button('改名',()=>{name.hidden=!name.hidden;if(!name.hidden)name.focus();},'text-button');
    const create=button('+',()=>{layouts.push({name:`卡包${layouts.length+1}`,deck:layouts[active].deck.map(row=>({...row}))});active=layouts.length-1;mark();paintTabs();paintCards();},'bag-tab bag-add');create.setAttribute('aria-label','新建卡包');create.title='新建卡包';
    const drop=button('删除布局',()=>{if(layouts.length<=1)return;layouts.splice(active,1);active=Math.max(0,active-1);mark();paintTabs();paintCards();},'text-button');
    const equipment=el('div','bag-slots equipment-card-slots');
    for(const row of playerSpec(save,content).fixedCards)for(let i=0;i<row.count;i++){
        const card=cards[row.key];if(!card)continue;const slot=button(subject(card),()=>inspect(row.key,false,slot),'bag-slot');slot.setAttribute('aria-label',card.name+'，装备附卡');previewEvents(slot,row.key);equipment.append(slot);
    }
    const saveButton=button('保存并使用',()=>{
        if(layouts.some(row=>!row.name.trim())){say('请填写卡包名称');return;}
        cb.action({type:'deck-layouts',layouts,active,learnedKeys:[...learned]});
    },'primary');
    const bag=el('section','bag-main',el('div','bag-section-bar',counter,button('推荐',()=>{layouts[active].deck=recommendedDeck({...save,cards:owned},content);mark();paintCards();},'secondary'),rename,drop),name,slots,
        el('p','bag-hint','拖出格子区 / 右键 / 长按：移出一张'),
        el('details','bag-equipment',el('summary','',`装备附卡 ${equipment.children.length} 张 · 不占卡位`),equipment));
    const collection=el('section','bag-collection',el('div','bag-section-bar',el('strong','','法术牌库'),search,toggle),filters,
        el('p','bag-hint','本系、平衡系及其他系别均可选择；点图标看大卡，点 + 学习或放入。'),library,el('div','bag-pager',countLabel,previous,next));
    body.append(tabs,el('div','bag-workspace',bag,collection),el('div','bag-footer',status,saveButton),detail);
    paintTabs();paintCards();say('当前使用：'+layouts[active].name);
}
