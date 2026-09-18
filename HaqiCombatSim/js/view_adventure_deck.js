import {deckLimits,recommendedDeck,playerSpec} from './adventure_core.js';

// Mirrors CombatCardDeckSubPage.html: bag tabs, individual slots, separate equipment cards.
export function renderDeckEditor(body,{assets,save},cb,{el,button,spellFace}) {
    const content=assets.content,cards=assets.dataset.cards,limits=deckLimits(save,content);
    const layouts=JSON.parse(JSON.stringify(save.deckLayouts||[{name:'卡包一',deck:save.deck}]));
    let active=save.activeDeckLayout||0;
    layouts[active].deck=save.deck.map(row=>({...row}));
    const tabs=el('div','bag-tabs'),slots=el('div','bag-slots'),library=el('div','bag-library'),detail=el('div','bag-detail');
    const status=el('p','bag-status');status.setAttribute('aria-live','polite');
    const counter=el('strong',''),name=el('input','bag-name');name.maxLength=16;name.setAttribute('aria-label','卡包名称');
    const total=()=>layouts[active].deck.reduce((n,row)=>n+row.count,0);
    const say=text=>{status.textContent=text;};
    const mark=()=>{say('尚未保存，点击“保存并使用”生效。');};
    function subject(card) {
        const canvas=el('canvas','bag-subject');canvas.width=112;canvas.height=112;
        const base=assets.effects.cards[card.key]?.base;
        if(base)assets.skillArt.drawSubject(canvas.getContext('2d'),base,0,0,112,112);
        canvas.setAttribute('aria-hidden','true');return canvas;
    }
    function inspect(key,removable=false,scroll=true) {
        const card=cards[key];detail.replaceChildren(spellFace(assets,card),el('strong','',card.name));
        if(removable)detail.append(button('移出一张',()=>remove(key),'secondary'));
        if(scroll)detail.scrollIntoView?.({block:'nearest'});
    }
    function remove(key) {
        const deck=layouts[active].deck,row=deck.find(row=>row.key===key);if(!row)return;
        if(total()===1){say('卡包至少保留一张卡牌。');return;}
        row.count--;layouts[active].deck=deck.filter(row=>row.count>0);mark();paint();inspect(key,true,false);
    }
    function add(key) {
        const deck=layouts[active].deck,row=deck.find(row=>row.key===key),count=row?.count||0;
        if(total()>=limits.capacity){say('卡包已满，请先移出卡牌。');return;}
        if(count>=Math.min(save.cards[key]||0,limits.eachCapacity)){say('已达到拥有数量或单卡上限。');return;}
        if(row)row.count++;else deck.push({key,count:1});mark();paint();inspect(key);
    }
    function bindHold(node,key) {
        let timer=null,start=null,held=false;
        const cancel=()=>{clearTimeout(timer);timer=null;node.classList.remove('holding');};
        node.onpointerdown=e=>{
            if(e.button!==0)return;cancel();held=false;start={x:e.clientX,y:e.clientY};
            node.classList.add('holding');timer=setTimeout(()=>{cancel();if(!node.isConnected)return;held=true;remove(key);},550);
        };
        node.onpointermove=e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>10)cancel();};
        node.onpointerup=cancel;node.onpointercancel=cancel;node.onpointerleave=cancel;
        node.oncontextmenu=e=>e.preventDefault();
        node.onclick=()=>{if(!held)inspect(key,true);held=false;};
        node.onkeydown=e=>{if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove(key);}};
    }
    function paint() {
        tabs.replaceChildren();layouts.forEach((layout,index)=>{
            const tab=button(layout.name,()=>{active=index;mark();paint();detail.replaceChildren(el('p','muted','点击图标查看卡牌，长按移出一张。'));},'bag-tab');
            tab.setAttribute('aria-pressed',String(index===active));tabs.append(tab);
        });
        name.value=layouts[active].name;counter.textContent=`${total()} / ${limits.capacity} 张 · 每种最多 ${limits.eachCapacity} 张`;
        slots.replaceChildren();
        for(const row of layouts[active].deck)for(let i=0;i<row.count;i++){
            const card=cards[row.key],slot=button(subject(card),()=>{},'bag-slot');slot.title=`${card.name} · 长按移出一张`;
            slot.setAttribute('aria-label',`${card.name}，第 ${i+1} 张，长按或按删除键移出`);bindHold(slot,row.key);slots.append(slot);
        }
        for(let i=total();i<limits.capacity;i++){const slot=el('span','bag-slot empty');slot.setAttribute('aria-hidden','true');slots.append(slot);}
        library.replaceChildren();
        for(const lesson of content.learn[save.school]){
            const card=cards[lesson.key],owned=save.cards[lesson.key]||0,count=layouts[active].deck.find(row=>row.key===lesson.key)?.count||0;
            const entry=button([subject(card),el('span','',card.name),el('small','muted',owned?`已放 ${count} / ${Math.min(owned,limits.eachCapacity)}`:`${lesson.level} 级解锁`)],()=>{add(lesson.key);},'bag-library-card');
            entry.disabled=!owned;library.append(entry);
        }
        create.disabled=layouts.length>=6;drop.disabled=layouts.length===1;
    }
    name.oninput=()=>{layouts[active].name=name.value;mark();tabs.children[active].textContent=name.value||'未命名卡包';};
    const create=button('新建卡包',()=>{layouts.push({name:`卡包${layouts.length+1}`,deck:layouts[active].deck.map(row=>({...row}))});active=layouts.length-1;mark();paint();},'secondary');
    const drop=button('删除此布局',()=>{if(layouts.length<=1)return;layouts.splice(active,1);active=Math.max(0,active-1);mark();paint();detail.replaceChildren();},'text-button');
    const equipment=el('div','bag-slots equipment-card-slots');
    for(const row of playerSpec(save,content).fixedCards)for(let i=0;i<row.count;i++){
        const card=cards[row.key];if(!card)continue;const slot=button(subject(card),()=>inspect(row.key),'bag-slot');slot.title=card.name;slot.setAttribute('aria-label',card.name+'，装备附卡');equipment.append(slot);
    }
    const saveButton=button('保存并使用',()=>{
        if(layouts.some(row=>!row.name.trim())){say('请为每个卡包填写名称。');return;}
        cb.action({type:'deck-layouts',layouts,active});
    },'primary');
    body.append(tabs,el('div','bag-controls',name,create,drop),el('p','muted','点击下方已学卡牌放入一张；长按卡包图标移出一张，也可点选后移出。切换、命名和配卡后请保存。'),
        el('div','bag-workspace',el('section','bag-main',el('div','deck-toolbar',counter,button('推荐配卡',()=>{layouts[active].deck=recommendedDeck(save,content);mark();paint();},'secondary')),slots,
        el('h4','','装备附卡 · 不占卡包位置'),equipment.children.length?equipment:el('p','muted','暂无装备附卡'),el('h3','','已学法术 · 点击放入'),library),detail),
        el('div','bag-footer',status,saveButton));
    detail.append(el('p','muted','点击卡包图标查看完整卡牌。'));paint();say('当前使用：'+layouts[active].name);
}
