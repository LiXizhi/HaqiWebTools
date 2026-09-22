import {npcOffers,npcOfferStatus} from './adventure_npc_core.js';
import {trainingPoints} from './adventure_learning_core.js';
import {drawSchoolIcon} from './card_renderer.js';
import {ItemDetails} from './view_adventure_item_details.js';

// Kids skill rows: CombatSkillLearn_panel.kids.html (icon, name, tip, school, level, study).
// Kids shop cells: NPCShopPage.html grid, 2 columns × 80px, icon + cost + buy.
const CLASS_SCHOOL={986:'fire',987:'ice',988:'storm',989:'balance',990:'life',991:'death',992:'balance'};
const PAGE_SIZE=8;

export function renderNpcServices(body,model,cb,{el,button,spellFace,art}) {
    const {content,dataset}=model.assets,npc=model.serviceNpc;
    if(!npc)return;
    const inspector=new ItemDetails(body,model,{el,spellFace});
    const modal=body.closest('.modal'),header=modal.querySelector('.modal-header');
    modal.classList.add('npc-services-modal');
    modal.setAttribute('aria-label',npc.name);
    header.querySelector('h2').textContent=npc.name;
    const eyebrow=header.querySelector('.eyebrow');
    const role=(npc.subtitle||'').replace(/[()（）]/g,'').trim();
    if(role&&eyebrow)eyebrow.textContent=role;else eyebrow?.remove();

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
        const cardKey=content.cardItems[row.kind==='mentor'?row.itemId:row.itemId-1000];
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
        const thumb=button(painted?face:icon||name.slice(0,1),()=>{
            if(row.kind!=='shop')return;
            hidePreview();
            const status=npcOfferStatus(model.save,content,row);
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
        const control=button(label,()=>cb.action({type:'npc-purchase',npcInstanceId:npc.instanceId,offerId:row.id}),`${learned?'secondary':'primary'} small npc-action${learned?' is-learned':''}`);
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
            const status=npcOfferStatus(model.save,content,row),name=offerName(row),learned=row.kind==='mentor'&&status.reason==='已学会';
            if(row.kind==='mentor'){
                const text=el('div','npc-skill-text',el('div','npc-skill-title',el('strong','',name),schoolMark(schoolOf(row))));
                if(row.tips)text.append(el('span','npc-skill-tips',row.tips));
                const chips=[];
                if(row.needlevel)chips.push(`${row.needlevel}级`);
                if(status.allowed&&status.price&&status.price!=='免费')chips.push(status.price);
                else if(!status.allowed&&!learned)chips.push(status.reason);
                const chip=el('span',`npc-skill-status${status.allowed||learned?'':' is-blocked'}`,chips.join(' · '));
                list.append(el('article','npc-skill',thumbnail(row,name),text,chip,actionButton(row,status,name)));
            }else{
                const meta=el('div','npc-good-meta');
                if(status.price)meta.append(el('p','',status.price));
                if(!status.allowed&&status.reason&&status.reason!==status.price&&status.reason!==`需要${status.price}`)meta.append(el('p','npc-blocked',status.reason));
                meta.append(el('p','muted',`已拥有 ${model.save.inventory[row.itemId]||0}`));
                list.append(el('article','npc-good',el('h3','',name),el('div','npc-good-row',thumbnail(row,name),meta,actionButton(row,status,name))));
            }
        }
        if(!rows.length)list.append(el('p','npc-empty',state.kind==='mentor'?'没有可学习的课程。':'没有匹配的商品。'));
        const prev=button('上一页',()=>{page--;draw();},'secondary'),next=button('下一页',()=>{page++;draw();},'secondary');
        prev.disabled=page===0;next.disabled=page>=pages-1;
        const count=el('span','',`${page+1} / ${pages} · ${rows.length}项`);count.setAttribute('aria-live','polite');
        pager.append(prev,count,next);
        if(state.kind==='mentor')wallet.append(el('span','',`训练点 ${trainingPoints(model.save,content)}`));
        else{
            const ids=[...new Set(rows.flatMap(row=>(content.npcCatalog.exchanges[row.exchangeId]?.costs||[]).map(cost=>cost.id)))].filter(id=>[100,17213,17143,17225,22000].includes(id));
            for(const id of (ids.length?ids:[100]).slice(0,4))wallet.append(el('span','',`${id===22000?'训练点':content.items[id]?.name||'奇豆'} ${id===22000?trainingPoints(model.save,content):model.save.inventory[id]||0}`));
        }
    };
    body.append(intro,serviceTabs,categoryTabs,list);
    modal.append(footer);
    draw();
}
