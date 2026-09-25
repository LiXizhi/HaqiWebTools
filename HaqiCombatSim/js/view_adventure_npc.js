import {npcOffers,npcOfferStatus} from './adventure_npc_core.js';
import {trainingPoints} from './adventure_learning_core.js';
import {drawSchoolIcon} from './card_renderer.js';
import {ItemDetails} from './view_adventure_item_details.js';
import { fill, setText, tr } from './locale_runtime.js';

// Kids skill rows: CombatSkillLearn_panel.kids.html (icon, name, tip, school, level, study).
// Kids shop cells: NPCShopPage.html grid, 2 columns × 80px, icon + cost + buy.
const CLASS_SCHOOL={986:'fire',987:'ice',988:'storm',989:'balance',990:'life',991:'death',992:'balance'};
function localizeOffer(text) {
    const raw=String(text||'');
    const training=/^(\d+)训练点$/.exec(raw),need=/^需要(\d+)训练点$/.exec(raw),learn=/^(\d+)级可学习$/.exec(raw),level=/^(\d+)级$/.exec(raw);
    if(training)return fill('{count}训练点',{count:training[1]}).text;
    if(need)return fill('需要{count}训练点',{count:need[1]}).text;
    if(learn)return fill('{level}级可学习',{level:learn[1]}).text;
    if(level)return fill('{level}级',{level:level[1]}).text;
    return tr(raw);
}
const PAGE_SIZE=8;
function moneyLine(el,tag,cls,text){
    const node=el(tag,cls);
    const source=String(text||'');
    const parts=source.split('、');
    const rendered=[];
    for(const part of parts){
        const need=/^需要(\d+)(奇豆|魔豆|仙豆|训练点)$/.exec(part);
        const plain=/^(\d+)(奇豆|魔豆|仙豆|训练点)$/.exec(part);
        if(need)rendered.push(fill('需要 {count} {unit}',{count:need[1],unit:need[2]}).text);
        else if(plain)rendered.push(fill('{count} {unit}',{count:plain[1],unit:plain[2]}).text);
        else{setText(node,source);return node;}
    }
    node.textContent=rendered.join(', ');
    if(node.dataset)node.dataset.zh=source;
    return node;
}

export function renderNpcServices(body,model,cb,{el,button,spellFace,art}) {
    const {content,dataset}=model.assets,npc=model.serviceNpc;
    if(!npc)return;
    const offerStatus=row=>npcOfferStatus(model.save,content,row,{keepworkVip:model.membership?.isVip,expiresAt:model.membership?.expiresAt,now:model.now});
    const inspector=new ItemDetails(body,model,{el,spellFace});
    const modal=body.closest('.modal'),header=modal.querySelector('.modal-header');
    modal.classList.add('npc-services-modal');
    modal.setAttribute('aria-label',tr(npc.name));
    const title=header.querySelector('h2');setText(title,npc.name);
    const eyebrow=header.querySelector('.eyebrow');
    const role=(npc.subtitle||'').replace(/[()（）]/g,'').trim();
    if(role&&eyebrow)setText(eyebrow,role);else eyebrow?.remove();

    const state=model.npcServiceView||{};
    const offers=npcOffers(content,npc);
    const kinds=[...new Set(offers.map(row=>row.kind))];
    if(!kinds.includes(state.kind))state.kind=kinds[0]||'shop';
    const shopCategories=[...new Map(offers.filter(row=>row.kind==='shop'&&row.category).map(row=>[row.category,row.categoryName||row.category]))];
    if(state.kind==='shop'&&shopCategories.length&&!shopCategories.some(([id])=>id===state.category))state.category=shopCategories[0][0];

    const mentorId=Number(String(offers.find(row=>row.kind==='mentor')?.id||'').split(':')[1]);
    const mentorIntro=content.npcCatalog.mentors?.[mentorId]?.attributes?.desc?.trim()||'';
    const intro=el('p','npc-intro');
    const serviceTabs=el('nav','gui-tabs npc-service-tabs');
    serviceTabs.setAttribute('aria-label','服务');
    const categoryTabs=el('nav','gui-tabs npc-category-tabs');
    categoryTabs.setAttribute('aria-label','商品分类');
    const list=el('div',state.kind==='mentor'?'npc-skills':'npc-goods');
    const pager=el('nav','npc-pager');
    pager.setAttribute('aria-label','分页');
    const wallet=el('div','npc-wallet');
    const footer=el('footer','npc-service-footer',wallet,pager);
    const preview=el('div','npc-card-preview');
    preview.hidden=true;
    document.querySelectorAll('.npc-card-preview').forEach(node=>node.remove());
    document.body.append(preview);
    const root=modal.parentElement;
    if(root){
        const observer=new MutationObserver(()=>{if(!modal.isConnected){preview.remove();observer.disconnect();}});
        observer.observe(root,{childList:true});
    }
    let hoverTimer,page=state.page||0;
    const hidePreview=()=>{clearTimeout(hoverTimer);preview.hidden=true;preview.replaceChildren();};
    const showPreview=(anchor,card,name)=>{
        preview.replaceChildren(spellFace(model.assets,card,{...card,name}));
        preview.hidden=false;
        const rect=anchor.getBoundingClientRect(),width=151,height=230;
        let left=rect.right+8,top=Math.max(8,rect.top-40);
        if(left+width>innerWidth-8)left=Math.max(8,rect.left-width-8);
        if(top+height>innerHeight-8)top=Math.max(8,innerHeight-height-8);
        preview.style.left=`${left}px`;preview.style.top=`${top}px`;
    };
    const bindPreview=(node,card,name)=>{
        if(!card)return;
        node.addEventListener('pointerenter',()=>{clearTimeout(hoverTimer);hoverTimer=setTimeout(()=>{if(node.isConnected)showPreview(node,card,name);},280);});
        node.addEventListener('pointerleave',hidePreview);
        node.addEventListener('focus',()=>showPreview(node,card,name));
        node.addEventListener('blur',hidePreview);
        node.addEventListener('click',()=>{if(matchMedia('(hover:hover)').matches)return;if(preview.hidden)showPreview(node,card,name);else hidePreview();});
    };
    body.addEventListener('scroll',hidePreview,{passive:true});

    const offerCard=row=>{
        const cardKey=row.kind==='mentor'?content.cardItems[row.itemId]:(content.cardItems[row.itemId]||content.cardItems[row.itemId-1000]);
        return dataset.cards[cardKey]||null;
    };
    const offerName=row=>{
        const item=content.items[row.itemId],card=offerCard(row);
        return item?.name||row.name||card?.name||`物品 ${row.itemId}`;
    };
    const schoolOf=row=>{
        const card=offerCard(row);
        return card?.spellSchool||CLASS_SCHOOL[Number(row.class)]||'';
    };
    const schoolMark=school=>{
        if(!school)return null;
        const canvas=el('canvas','npc-school');canvas.width=48;canvas.height=48;canvas.setAttribute('aria-hidden','true');
        const context=canvas.getContext('2d');if(context)drawSchoolIcon(context,school,24,24,36);
        return canvas;
    };
    const thumbnail=(row,name)=>{
        const card=offerCard(row);
        const face=card?spellFace(model.assets,card,{...card,name}):null;
        const painted=face&&!face.classList.contains('spell-face-fallback');
        const itemArt=content.items[row.itemId]?.art;
        const icon=!painted&&itemArt?art(model.assets,itemArt,40,40):null;
        const thumb=button(painted?face:icon||tr(name).slice(0,1),()=>{
            if(row.kind!=='shop')return;
            hidePreview();
            const status=offerStatus(row);
            inspector.show(content.items[row.itemId],{trigger:thumb,source:npc.name,requirements:[status.price,!status.allowed?status.reason:''].filter(Boolean).join(' · '),requirementsLabel:'兑换条件'});
        },painted||icon?'npc-thumb':'npc-thumb npc-thumb-fallback');
        thumb.setAttribute('aria-label',row.kind==='shop'?`查看${name}详情`:card?`查看${name}卡面`:name);
        if(row.kind==='shop')thumb.setAttribute('aria-haspopup','dialog');
        else bindPreview(thumb,card,name);
        return thumb;
    };
    const actionButton=(row,status,name)=>{
        const learned=row.kind==='mentor'&&status.reason==='已学会';
        const label=row.kind==='mentor'?(learned?'已学会':'学习'):'购买';
        const purchase=()=>cb.action({type:'npc-purchase',npcInstanceId:npc.instanceId,offerId:row.id});
        const control=button(label,()=>{
            if(row.kind!=='shop'){purchase();return;}
            hidePreview();
            const current=offerStatus(row);
            const item=content.items[row.itemId]||{id:row.itemId,name};
            inspector.render(item,{source:npc.name});
            const quantity=el('p','');
            setText(quantity,'购买数量：{count}',{count:current.reward?.cnt||1});
            inspector.body.append(quantity,moneyLine(el,'p','',current.price||current.reason));
            if(!current.allowed)inspector.body.append(moneyLine(el,'p','npc-blocked',current.reason));
            let submitted=false;
            const confirm=button('确认购买',()=>{
                if(submitted)return;
                const latest=offerStatus(row);
                if(!latest.allowed){
                    confirm.disabled=true;
                    inspector.body.append(moneyLine(el,'p','npc-blocked',latest.reason));
                    return;
                }
                submitted=true;confirm.disabled=true;
                inspector.close();
                purchase();
            },'primary');
            confirm.disabled=!current.allowed;
            inspector.footer.append(button('取消',()=>inspector.close(),'secondary'),confirm);
            inspector.open(control);
        },`${learned?'secondary':'primary'} small npc-action${learned?' is-learned':''}`);
        if(row.kind==='shop')control.setAttribute('aria-haspopup','dialog');
        control.disabled=!status.allowed;
        control.title=status.reason||label;
        control.setAttribute('aria-label',`${name}：${status.allowed?label:status.reason}`);
        return control;
    };

    const draw=()=>{
        hidePreview();
        body.scrollTop=0;
        const skillShop=state.kind==='mentor';
        const rows=offers.filter(row=>row.kind===state.kind&&(state.kind!=='shop'||!state.category||row.category===state.category));
        const pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
        page=Math.min(page,pages-1);state.page=page;
        list.className=skillShop?'npc-skills':'npc-goods';
        intro.textContent=state.kind==='mentor'?mentorIntro:'';
        if(mentorIntro&&state.kind==='mentor')setText(intro,mentorIntro);
        intro.hidden=!intro.textContent;
        list.replaceChildren();pager.replaceChildren();serviceTabs.replaceChildren();categoryTabs.replaceChildren();wallet.replaceChildren();
        if(kinds.length>1){
            for(const kind of kinds){
                const sample=offers.find(row=>row.kind===kind);
                const tab=button(sample?.serviceLabel||(kind==='mentor'?'学习魔法':'商品'),()=>{state.kind=kind;page=0;draw();},'secondary');
                tab.setAttribute('aria-pressed',String(kind===state.kind));
                serviceTabs.append(tab);
            }
        }
        if(state.kind==='shop'&&shopCategories.length>1){
            for(const [id,label] of shopCategories){
                const tab=button(label,()=>{state.category=id;page=0;draw();},'secondary');
                tab.setAttribute('aria-pressed',String(id===state.category));
                categoryTabs.append(tab);
            }
        }
        for(const row of rows.slice(page*PAGE_SIZE,page*PAGE_SIZE+PAGE_SIZE)){
            const status=offerStatus(row),name=offerName(row),learned=row.kind==='mentor'&&status.reason==='已学会';
            if(row.kind==='mentor'){
                const text=el('div','npc-skill-text',el('div','npc-skill-title',el('strong','',name),schoolMark(schoolOf(row))));
                if(row.tips)text.append(el('span','npc-skill-tips',row.tips));
                const chips=[];
                if(row.needlevel)chips.push(fill('{level}级',{level:row.needlevel}).text);
                if(status.allowed&&status.price&&status.price!=='免费')chips.push(localizeOffer(status.price));
                else if(!status.allowed&&!learned)chips.push(localizeOffer(status.reason));
                const chip=el('span',`npc-skill-status${status.allowed||learned?'':' is-blocked'}`,chips.join(' · '));
                list.append(el('article','npc-skill',thumbnail(row,name),text,chip,actionButton(row,status,name)));
            }else{
                const meta=el('div','npc-good-meta');
                if(status.price)meta.append(moneyLine(el,'p','',status.price));
                if(!status.allowed&&status.reason&&status.reason!==status.price&&status.reason!==`需要${status.price}`)meta.append(moneyLine(el,'p','npc-blocked',status.reason));
                const owned=el('p','muted');setText(owned,'已拥有 {count}',{count:model.save.inventory[row.itemId]||0});
                meta.append(owned);
                list.append(el('article','npc-good',el('h3','',name),el('div','npc-good-row',thumbnail(row,name),meta,actionButton(row,status,name))));
            }
        }
        if(!rows.length)list.append(el('p','npc-empty',state.kind==='mentor'?'没有可学习的课程。':'没有匹配的商品。'));
        const prev=button('上一页',()=>{page--;draw();},'secondary'),next=button('下一页',()=>{page++;draw();},'secondary');
        prev.disabled=page===0;next.disabled=page>=pages-1;
        const count=el('span','');setText(count,'{page} / {pages} · {count}项',{page:page+1,pages,count:rows.length});count.setAttribute('aria-live','polite');
        pager.append(prev,count,next);
        if(state.kind==='mentor'){const points=el('span','');setText(points,'训练点 {count}',{count:trainingPoints(model.save,content)});wallet.append(points);}
        else{
            const ids=[...new Set(rows.flatMap(row=>(content.npcCatalog.exchanges[row.exchangeId]?.costs||[]).map(cost=>cost.id)))].filter(id=>[100,984,17213,17143,17225,22000].includes(id));
            for(const id of (ids.length?ids:[100]).slice(0,4)){
                const balance=el('span','');
                setText(balance,'{name} {count}',{name:id===22000?'训练点':content.items[id]?.name||'奇豆',count:id===22000?trainingPoints(model.save,content):model.save.inventory[id]||0});
                wallet.append(balance);
            }
        }
    };
    body.append(intro,serviceTabs,categoryTabs,list);
    modal.append(footer);
    draw();
}
