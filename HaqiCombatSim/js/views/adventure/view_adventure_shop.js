import {shopOwned,shopUse,shopUsable,shopOffer,shopProductPage} from '../../adventure_shop_catalog_core.js';
import {createShopPurchase} from '../../adventure_shop_purchase_core.js';
import {createShopMembershipSummary} from './view_adventure_shop_membership.js';
import {shopBagComparison,shopEquipmentComparison,restoreShopPurchaseFocus} from './view_adventure_shop_comparison.js';
import {heroPortrait} from '../../hero_renderer.js';
import { fill, setText, tr } from '../../locale_runtime.js';
import {ItemDetails} from './view_adventure_item_details.js';
import { canEquip, equipmentBlockReason, SCHOOL_NAMES } from '../../adventure_core.js';
import { productPrice,foodInfo } from '../../adventure_pets_core.js';
import { petPortrait } from './view_adventure_pets.js';
import { showPetDetails } from './view_adventure_pet_details.js';
import { createCloseButton } from '../../ui/controls.js';
import { shopGuidance,adventureShopSelection } from '../../adventure_shop_guidance_core.js';

// Layout: HaqiShop.kids1.html (account/preview, two tab rows, 3 × 3 goods).
// The original GetByCate provider is replaced by the local JSON catalogue.
// Purchases still go through the controller and the existing BalanceParams rules.
export function renderShop(body,model,cb,{el,button,art,tile,spellFace}) {
    const {save,assets}=model,c=assets.content,config=c.shopConfig;
    const inspector=new ItemDetails(body,model,{el,spellFace,tile});
    const state=model.shopView||(model.shopView={});
    let requestedProduct=state.productId||state.selected;
    const selection=adventureShopSelection(save,c);
    let focused=selection.active&&!state.showAll&&state.mode!=='catalog';
    let category=config.categories.find(row=>row.id===state.category)||config.categories[0];
    let sub=state.subcategoryCategory===category.id&&Number.isInteger(state.subcategory)?state.subcategory:0;
    if(!category.subcategories[sub])sub=0;
    let page=Math.max(0,Number.isInteger(state.page)?state.page:0);
    const pageSize=config.pageSize;
    const modal=body.closest('.modal'),header=modal.querySelector('.modal-header');
    const shopRoot=modal.parentElement;modal.shopViewState=state;
    modal.classList.add('shop-modal');modal.setAttribute('aria-label',tr(config.title));setText(header.querySelector('h2'),config.title);
    header.querySelector('.eyebrow')?.remove();
    const tabs=el('nav','shop-tabs'),subtabs=el('nav','shop-subtabs');
    tabs.setAttribute('aria-label','商品分类');subtabs.setAttribute('aria-label','商品子分类');
    header.insertBefore(tabs,header.querySelector('.close-button'));
    const playerLine=el('small','');setText(playerLine,'{name} · {level}级',{name:save.name,level:save.level});
    const balance=el('section','shop-wallet',el('div','shop-balances',walletLine(100,'我的奇豆'),walletLine(984,'我的魔豆')),playerLine,
        el('p','shop-item-meta','奇豆可通过战斗与任务获得；魔豆由会员有效天数兑换。查看会员权益了解兑换条件。'));
    balance.append(createShopMembershipSummary(model,cb,{el,button}));
    const preview=el('section','shop-preview');preview.setAttribute('aria-label','商品预览');
    const aside=el('aside','shop-sidebar',balance,preview);
    const query=el('input','shop-search');query.type='search';query.placeholder=tr('输入商品名称');query.setAttribute('aria-label',tr('搜索商品'));query.value=state.query||'';
    const addOption=(select,label,value)=>{const option=new Option(tr(label),value);if(option.dataset)option.dataset.zh=label;select.append(option);};
    const ownership=el('select','');ownership.setAttribute('aria-label',tr('收藏筛选'));
    for(const [value,label] of [['','全部商品'],['owned','已拥有'],['new','未拥有']])addOption(ownership,label,value);
    ownership.value=state.ownership||'';
    const level=el('select','');level.setAttribute('aria-label',tr('等级筛选'));
    for(const [value,label] of [['usable','当前能用'],['available','当前等级'],['','全部等级']])addOption(level,label,value);
    level.value=state.level??'usable';
    const school=el('select','');school.setAttribute('aria-label',tr('装备学系'));
    addOption(school,'全部学系','');
    for(const [id,label] of Object.entries(SCHOOL_NAMES))addOption(school,label,id);
    addOption(school,'全学系','all');school.value=state.school||'';
    const grid=el('div','shop-goods'),pager=el('nav','shop-pagination'),status=el('span','shop-count');
    status.setAttribute('aria-live','polite');pager.setAttribute('aria-label','商品分页');
    const catalog=el('section','shop-catalog',subtabs,el('div','shop-toolbar',query,ownership,level,school),grid,pager);
    const layout=el('div','shop-layout',aside,catalog);body.append(layout);
    body.addEventListener('pointerdown',event=>{if(event.target.closest('.shop-bean'))return;for(const node of body.querySelectorAll('.shop-bean.is-open'))node.classList.remove('is-open');});
    const offer=item=>shopOffer(save,item,c,{isVip:model.membership?.isVip===true});
    function walletLine(id,label){
        const amount=(save.inventory[id]||0).toLocaleString('zh-CN');
        return el('span','shop-balance',beanButton(label,id),el('strong','',amount));
    }
    function beanButton(label,currencyId=100){
        const icon=el('canvas','shop-bean-icon');icon.width=32;icon.height=32;icon.setAttribute('aria-hidden','true');
        const art=c.currencyIcons?.[String(currencyId)];if(art)assets.draw(icon.getContext('2d'),art,0,0,32,32);
        const tip=el('span','shop-bean-tip',label);tip.setAttribute('role','tooltip');
        const node=el('button','shop-bean',icon,tip);node.type='button';
        node.dataset.zh=label;node.title=tr(label);node.setAttribute('aria-label',tr(label));
        node.addEventListener('click',event=>{
            event.stopPropagation();
            const open=node.classList.toggle('is-open');
            if(open)for(const other of document.querySelectorAll('.shop-bean.is-open'))if(other!==node)other.classList.remove('is-open');
        });
        return node;
    }
    function beanPrice(amount,extra){
        const row=el('span','shop-bean-price',beanButton('奇豆'),el('span','',String(amount)));
        if(extra)row.append(el('span','',extra));
        return row;
    }
    function priceLabel(item,extra){
        if(item.kind==='mount'&&item.currency===984){
            const amount=el('span','');setText(amount,'{count} 魔豆',{count:productPrice(item,c)});
            const row=el('span','shop-bean-price',amount);
            if(extra)row.append(el('span','',extra));
            return row;
        }
        return beanPrice(productPrice(item,c),extra);
    }
    function requirementText(item){
        const price=`${fill(item.currency===984?'{count} 魔豆':'{count} 奇豆',{count:productPrice(item,c)}).text}${tr(' / 件')}`;
        return `${price}${item.vipOnly?' · '+tr('会员专属'):''}`;
    }
    const owned=item=>shopOwned(save,item);
    const matches=(item,filter)=>!filter||(!filter.kind||item.kind===filter.kind)&&(!filter.slots||filter.slots.includes(item.slot))&&(!filter.excludeSlots||!filter.excludeSlots.includes(item.slot))&&(!filter.school||item.school===filter.school)&&(!filter.itemIds||filter.itemIds.includes(item.itemId));
    function picture(item,size) {
        if(item.petId)return petPortrait(assets,item.petId,0,size);
        const gear=c.items[item.itemId];
        if(gear?.art){const image=art(assets,gear.art,size,size,'shop-item-art');image.setAttribute('role','img');image.setAttribute('aria-label',tr(item.name));return image;}
        return el('span','shop-art-fallback',tr(item.name).slice(0,2));
    }
    function talkIcon() {
        const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
        svg.setAttribute('viewBox','0 0 32 32');svg.setAttribute('aria-hidden','true');svg.classList.add('pet-free-icon');
        const badge=document.createElementNS(ns,'circle');
        badge.setAttribute('cx','16');badge.setAttribute('cy','16');badge.setAttribute('r','15');badge.setAttribute('fill','#2f6b45');
        const bubble=document.createElementNS(ns,'path');
        bubble.setAttribute('fill','#fff8df');bubble.setAttribute('stroke','#f4ca69');bubble.setAttribute('stroke-width','1.2');
        bubble.setAttribute('stroke-linejoin','round');
        bubble.setAttribute('d','M8.2 9.2h12.4a2.4 2.4 0 0 1 2.4 2.4v5.6a2.4 2.4 0 0 1-2.4 2.4H14.2L11 22.2v-2.6H8.2a2.4 2.4 0 0 1-2.4-2.4v-5.6a2.4 2.4 0 0 1 2.4-2.4z');
        const heart=document.createElementNS(ns,'path');
        heart.setAttribute('fill','#e07a3d');
        heart.setAttribute('d','M16 17.2c-2.4-1.6-4-2.8-4-4.3a1.8 1.8 0 0 1 3.2-1.2L16 12.6l.8-.9a1.8 1.8 0 0 1 3.2 1.2c0 1.5-1.6 2.7-4 4.3z');
        svg.append(badge,bubble,heart);return svg;
    }
    function openPurchase(item,trigger) {
        const dialog=el('dialog','pet-buy-dialog');
        dialog.dataset.zh='确认购买';
        dialog.setAttribute('aria-label',tr('确认购买'));
        const close=()=>dialog.close();
        const exit=createCloseButton(close,'关闭购买');
        const food=foodInfo(c,item.itemId),quantity=el('input','');quantity.type='number';quantity.min='1';quantity.max='999';quantity.step='1';quantity.value='1';quantity.setAttribute('aria-label','购买数量');
        let pending=false,navigating=false;
        const errorLine=el('p','shop-item-warning');errorLine.setAttribute('role','status');
        const submit=createShopPurchase({
            purchase:()=>cb.action({type:'buy',productId:item.id,...(food?{count:Number(quantity.value)}:{})}),
            onSuccess:()=>{if(!dialog.isConnected||!dialog.open)return;navigating=true;close();const use=shopUse(item,c);cb.panel(use.panel,use.options);},
            onPending:value=>{pending=value;quantity.disabled=value;confirm.disabled=value||!shopOffer(save,item,c,{isVip:model.membership?.isVip===true,count:food?Number(quantity.value):1}).canBuy;},
            onError:()=>{errorLine.textContent='购买未完成，请稍后重试。';}
        });
        const confirm=button('确认购买',()=>{if(pending||(food&&!quantity.reportValidity()))return;errorLine.textContent='';void submit();},'primary');
        confirm.setAttribute('aria-label',fill(`{v0}：确认`,{v0:String(item.name)}).text);
        const body=el('div','modal-body pet-buy-body',el('div','shop-preview-art',picture(item,112)),el('h3','',item.name),el('p','shop-preview-price',priceLabel(item,' / 件')),confirm);
        const use=shopUse(item,c),quote=offer(item);
        body.insertBefore(el('p','shop-item-meta',use.purpose),confirm);
        body.insertBefore(errorLine,confirm);
        if(!food)body.insertBefore(el('p','shop-item-meta',`余额 ${quote.balance} ${quote.currencyName} · 买后剩余 ${Math.max(0,quote.balance-quote.total)}`),confirm);
        confirm.disabled=!quote.canBuy;
        if(quote.reason)body.insertBefore(el('p','shop-item-warning',quote.reason),confirm);
        if(food){
            const total=el('p','shop-preview-price');
            const update=()=>{const count=Number(quantity.value),cost=productPrice(item,c)*count;const quote=shopOffer(save,item,c,{isVip:model.membership?.isVip===true,count});total.textContent=Number.isSafeInteger(cost)&&cost>=0?`合计 ${cost} 奇豆 · 买后剩余 ${Math.max(0,quote.balance-cost)}${quote.reason?' · '+quote.reason:''}`:'请输入有效数量';confirm.disabled=!quote.canBuy;};
            quantity.addEventListener('input',update);update();
            body.insertBefore(el('label','pet-food-quantity',el('span','','购买数量'),quantity),confirm);body.insertBefore(total,confirm);
            body.insertBefore(el('p','muted',fill(`每份饱食 +{v0}{v1}。空食槽会自动补入，可到宠物页查看。`,{v0:String(food.restore),v1:String(food.xp?fill(`，经验 +{v0}`,{v0:String(food.xp)}).text:'')}).text),confirm);
        }
        const nodes=[el('header','modal-header',el('h2','','确认购买'),exit),body];

        dialog.append(...nodes);
        (modal.closest('.local-personal')||document.body).append(dialog);
        dialog.addEventListener('pointerdown',event=>{if(event.target.closest('.shop-bean'))return;for(const node of dialog.querySelectorAll('.shop-bean.is-open'))node.classList.remove('is-open');});
        dialog.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close();}});
        dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();});
        dialog.addEventListener('close',()=>{dialog.remove();restoreShopPurchaseFocus({root:shopRoot,state,trigger,productId:item.id,navigating});},{once:true});
        dialog.showModal();exit.focus();
    }
    function buyButton(item) {
        const quote=offer(item),use=shopUse(item,c);
        const useOwned=quote.owned&&['gear','mount','pet'].includes(item.kind);
        const label=useOwned?use.label:quote.reason||'购买';
        const buy=button(label,()=>useOwned?cb.panel(use.panel,use.options):openPurchase(item,buy),useOwned?'secondary shop-buy':'primary shop-buy');
        buy.disabled=!useOwned&&!quote.canBuy;
        buy.dataset.shopProductId=String(item.id);
        buy.setAttribute('aria-label',item.name+'：'+label);
        if(quote.reason)buy.title=quote.reason;
        return buy;
    }
    function paintPreview(item) {
        preview.replaceChildren();
        if(!item){
            if(tile)preview.append(heroPortrait(assets,save,120,150));
            const advice=shopGuidance(save,c),product=c.shop.find(row=>row.id===advice.productId);
            preview.append(el('strong','','冒险准备'),el('p','shop-item-meta',advice.text));
            if(product&&!advice.owned){
                preview.append(el('h3','',product.name),el('p','shop-preview-price',priceLabel(product)));
                if(advice.shortfall)preview.append(el('small','muted',`还差 ${advice.shortfall} 奇豆`));
                const choose=button('看看这件',()=>paintPreview(product),'secondary');preview.append(choose);
            }else preview.append(button(advice.panel==='pet'?'去照顾伙伴':'去配卡',()=>cb.panel(advice.panel),'secondary'));
            return;
        }
        preview.append(el('div','shop-preview-art',picture(item,112)),el('h3','',item.name),el('p','shop-item-meta',itemMeta(item,true)));
        const gear=c.items[item.itemId];
        if(item.kind==='gear'){
            if(item.slot===24)preview.append(el('p','shop-item-meta',shopBagComparison(save,item.itemId,c)));
            else {
                const comparison=shopEquipmentComparison(save,item.itemId,c,{membership:model.membership,now:model.now??Date.now()});
                if(comparison){
                    preview.append(el('small','muted',comparison.label));
                    for(const row of comparison.rows)preview.append(el('p','shop-item-meta',`${row.label} ${row.before}${row.unit} → ${row.value}${row.unit}`));
                }
            }
            if(gear.iconFallback)preview.append(el('small','muted','原图缺失 · 同部位示意图'));
            if(gear.unsupportedStats?.length){const note=el('small','muted');setText(note,'当前未生效属性：{stats}',{stats:gear.unsupportedStats.join('、')});preview.append(note);}
            if(!canEquip(save,gear,c))preview.append(el('small','shop-item-warning',equipmentBlockReason(save,gear,c)));
            if(item.slot===24&&owned(item))preview.append(button('前往卡包配卡',()=>cb.panel('deck'),'secondary'));
        }
        if(item.kind==='pet'){
            preview.append(button('查看四阶段与卡片',()=>showPetDetails(assets,item.petId,petPortrait,{el,button}),'secondary'));
            const capture=button('寻找并捕获',()=>cb.encounter('wild:'+item.petId),'secondary');capture.disabled=save.level<item.level;preview.append(capture,el('small','muted','捕获时从符文卡使用抓宠符文。普通和高级符文由哈奇岛的安卓婆婆出售。'));
        }
        if(item.kind==='mount')preview.append(el('small','muted','购买后在宠物页的坐骑栏选择骑乘。骑乘时属性加入战斗。'));
        if(foodInfo(c,item.itemId))preview.append(button('去宠物食槽',()=>cb.panel('pet'),'secondary'));
        preview.append(el('p','shop-item-meta',shopUse(item,c).purpose),el('p','shop-preview-price',priceLabel(item,' / 件')),buyButton(item));
    }
    function remember(){Object.assign(state,{category:category.id,subcategory:sub,subcategoryCategory:category.id,page,query:query.value,ownership:ownership.value,level:level.value,school:school.value,slot:''});}
    function itemMeta(item,withSchool){
        const food=foodInfo(c,item.itemId);
        if(food)return fill(`饱食 +{v0}{v1} · 背包 {v2}`,{v0:String(food.restore),v1:String(food.xp?fill(` · 经验 +{v0}`,{v0:String(food.xp)}).text:''),v2:String(save.inventory[item.itemId]||0)}).text;
        const parts=[];
        if(item.kind==='mount'&&item.currency===984)parts.push(tr('魔豆坐骑'));
        if(item.vipOnly)parts.push(tr('会员专属'));
        parts.push(fill('{level}级',{level:item.level}).text);
        if(withSchool)parts.push(tr(SCHOOL_NAMES[item.school]||'全学系'));
        if(owned(item))parts.push(tr('已拥有'));
        return parts.join(' · ');
    }
    function paint(){
        remember();
        tabs.replaceChildren();
        if(selection.active){
            const toggle=button(focused?'查看全部商品':'回到冒险补给',()=>{focused=!focused;state.showAll=!focused;state.mode=focused?'focused':'catalog';state.selected=null;paint();tabs.firstElementChild?.focus({preventScroll:true});},'secondary');
            tabs.append(toggle);
        }
        if(!focused)for(const row of config.categories){const labels={gear:'战力装备',bag:'配卡卡包',mount:'骑乘坐骑',pet:'战斗伙伴',supply:'伙伴补给'};const tab=button(labels[row.id]||row.label,()=>{category=row;sub=0;page=0;state.selected=null;paint();Array.from(tabs.children).find(node=>node.dataset.category===row.id)?.focus({preventScroll:true});},'secondary');tab.dataset.category=row.id;tabs.append(tab);}
        catalog.hidden=focused&&selection.rows.length===0;
        layout.classList.toggle('shop-layout-focused',focused);
        layout.classList.toggle('shop-layout-empty',catalog.hidden);
        layout.dataset.focusedCount=focused?String(selection.rows.length):'';
        modal.classList.toggle('shop-modal-focused',focused);
        catalog.querySelector('.shop-toolbar').hidden=focused;
        subtabs.hidden=focused;pager.hidden=focused;aside.querySelector('.shop-trial').hidden=focused;
        if(focused){
            grid.replaceChildren();preview.replaceChildren(el('strong','','当前冒险需要'),el('p','shop-item-meta',selection.message));
            if(!selection.rows.length)preview.append(button('去试试配卡',()=>cb.panel('deck'),'secondary'));
            for(const row of selection.rows){
                const item=c.shop.find(p=>p.id===row.productId),card=el('article','shop-good');
                card.append(el('strong','shop-good-name',item?.name||(row.panel==='pet'?'已有口粮':'已有卡包')));
                if(item)card.append(picture(item,80));
                card.append(el('p','shop-good-level',row.text));
                if(row.owned)card.append(button(row.panel==='pet'?'去宠物食槽':'去装备配卡',()=>cb.panel(row.panel),'secondary shop-buy'));
                else{
                    card.append(el('span','shop-good-price',priceLabel(item)),el('small','shop-good-level',row.shortfall?`还差 ${row.shortfall} 奇豆`:`买后${row.panel==='pet'?'去食槽喂伙伴':'去配卡使用'}`));
                    const buy=buyButton(item);card.append(buy);
                }
                grid.append(card);
            }
            return;
        }
        school.hidden=category.id!=='gear';
        for(const tab of tabs.children)tab.setAttribute('aria-pressed',String(tab.dataset.category===category.id));
        subtabs.replaceChildren();
        category.subcategories.forEach((row,index)=>{
            const tab=button(row.label,()=>{sub=index;page=0;state.selected=null;paint();subtabs.children[index]?.focus({preventScroll:true});},'secondary');
            tab.setAttribute('aria-pressed',String(index===sub));subtabs.append(tab);
        });
        const q=query.value.trim().toLowerCase();
        const rows=c.shop.filter(item=>!item.isInternalTest&&!item.retired&&matches(item,category)&&matches(item,category.subcategories[sub])&&(!q||item.name.toLowerCase().includes(q)||tr(item.name).toLowerCase().includes(q))&&(!ownership.value||owned(item)===(ownership.value==='owned'))&&(!level.value||(level.value==='usable'?shopUsable(save,item,c):item.level<=save.level))&&(category.id!=='gear'||!school.value||item.school===school.value))
            .sort((a,b)=>Number(owned(a))-Number(owned(b))||Number(!offer(a).canBuy)-Number(!offer(b).canBuy)||a.level-b.level||a.name.localeCompare(b.name,'zh'));
        if(requestedProduct){const targetPage=shopProductPage(rows,requestedProduct,pageSize);if(targetPage!==null){page=targetPage;state.selected=requestedProduct;}requestedProduct=null;delete state.productId;}
        const pages=Math.max(1,Math.ceil(rows.length/pageSize));page=Math.min(page,pages-1);remember();
        grid.replaceChildren();pager.replaceChildren();
        const visible=rows.slice(page*pageSize,(page+1)*pageSize);
        for(const item of visible){
            const card=el('article','shop-good');card.dataset.productId=item.id;
            const choose=()=>{state.selected=item.id;for(const node of grid.querySelectorAll('.shop-product-icon'))node.setAttribute('aria-pressed',String(node.dataset.productId===item.id));paintPreview(item);if(item.petId&&matchMedia('(max-width:720px)').matches)preview.scrollIntoView({block:'nearest'});};
            const image=button(picture(item,80),choose,'shop-product-icon');image.dataset.productId=item.id;
            if(!item.petId){
                image.setAttribute('aria-haspopup','dialog');
                image.addEventListener('click',()=>inspector.show(c.items[item.itemId],{trigger:image,source:config.title,requirements:requirementText(item),requirementsLabel:'购买条件'}));
            }
            image.setAttribute('aria-label',fill(`查看{v0}`,{v0:String(item.name)}).text);image.setAttribute('aria-pressed',String(state.selected===item.id));
            const name=el('strong','shop-good-name',item.name);name.title=tr(item.name);
            card.append(name,image,el('small','shop-good-purpose',shopUse(item,c).purpose),el('span','shop-good-price',priceLabel(item)),el('small','shop-good-level',itemMeta(item,false)),buyButton(item));
            grid.append(card);
        }
        if(!visible.length)grid.append(el('p','shop-empty','没有符合条件的商品，请调整分类或筛选。'));
        const focusPager=preferred=>{const buttons=Array.from(pager.querySelectorAll('button'));(buttons[preferred]?.disabled?buttons.find(node=>!node.disabled):buttons[preferred])?.focus({preventScroll:true});};
        const previous=button('上一页',()=>{page--;state.selected=null;paint();focusPager(0);},'secondary'),next=button('下一页',()=>{page++;state.selected=null;paint();focusPager(1);},'secondary');
        previous.disabled=page===0;next.disabled=page===pages-1;setText(status,'{page} / {pages} 页 · {count} 件',{page:page+1,pages,count:rows.length});
        pager.append(previous,status,next);
        const selected=visible.find(item=>item.id===state.selected);if(!selected)state.selected=null;
        paintPreview(selected);
    }
    for(const input of [query,ownership,level,school])input.oninput=()=>{page=0;state.selected=null;paint();};
    const trial=el('select','');trial.setAttribute('aria-label','试炼等级');
    for(let number=1;number<=c.progression.levelCap;number++){const option=new Option(fill(number>save.level?'{level}级试炼（未解锁）':'{level}级试炼',{level:number}).text,number);option.disabled=number>save.level;trial.append(option);}trial.value=save.level;
    aside.append(el('details','shop-trial',el('summary','','赚取奇豆 · 魔法试炼'),trial,button('开始试炼',()=>cb.encounter('trial:'+trial.value),'secondary')));
    paint();
}
