import { fill, setText, tr } from './locale_runtime.js';
import {ItemDetails} from './view_adventure_item_details.js';
import { canEquip, equipmentBlockReason, SCHOOL_NAMES } from './adventure_core.js';
import { productPrice } from './adventure_pets_core.js';
import { petPortrait } from './view_adventure_pets.js';
import { showPetDetails } from './view_adventure_pet_details.js';
import { createCloseButton } from './view_adventure_controls.js';

// Layout: HaqiShop.kids1.html (account/preview, two tab rows, 3 × 3 goods).
// The original GetByCate provider is replaced by the local JSON catalogue.
// Purchases still go through the controller and the existing BalanceParams rules.
export function renderShop(body,model,cb,{el,button,art,tile,spellFace}) {
    const {save,assets}=model,c=assets.content,config=c.shopConfig;
    const inspector=new ItemDetails(body,model,{el,spellFace});
    const state=model.shopView||(model.shopView={});
    let category=config.categories.find(row=>row.id===state.category)||config.categories[0];
    let sub=state.subcategoryCategory===category.id&&Number.isInteger(state.subcategory)?state.subcategory:0;
    if(!category.subcategories[sub])sub=0;
    let page=Math.max(0,Number.isInteger(state.page)?state.page:0);
    const pageSize=config.pageSize;
    const modal=body.closest('.modal'),header=modal.querySelector('.modal-header');
    modal.classList.add('shop-modal');modal.setAttribute('aria-label',tr(config.title));setText(header.querySelector('h2'),config.title);
    header.querySelector('.eyebrow')?.remove();
    const tabs=el('nav','shop-tabs'),subtabs=el('nav','shop-subtabs');
    tabs.setAttribute('aria-label','商品分类');subtabs.setAttribute('aria-label','商品子分类');
    header.insertBefore(tabs,header.querySelector('.close-button'));
    const playerLine=el('small','');setText(playerLine,'{name} · {level}级',{name:save.name,level:save.level});
    const balance=el('section','shop-wallet',el('div','shop-balances',walletLine(100,'我的奇豆'),walletLine(984,'我的魔豆')),playerLine);
    const membershipLabel=model.membership?.isVip?'会员权益':'升级会员';
    balance.append(button(membershipLabel,()=>cb.panel('membership'),'secondary shop-membership'));
    const preview=el('section','shop-preview');preview.setAttribute('aria-label','商品预览');
    const aside=el('aside','shop-sidebar',balance,preview);
    const query=el('input','shop-search');query.type='search';query.placeholder=tr('输入商品名称');query.setAttribute('aria-label',tr('搜索商品'));query.value=state.query||'';
    const addOption=(select,label,value)=>{const option=new Option(tr(label),value);if(option.dataset)option.dataset.zh=label;select.append(option);};
    const ownership=el('select','');ownership.setAttribute('aria-label',tr('收藏筛选'));
    for(const [value,label] of [['','全部商品'],['owned','已拥有'],['new','未拥有']])addOption(ownership,label,value);
    ownership.value=state.ownership||'';
    const level=el('select','');level.setAttribute('aria-label',tr('等级筛选'));
    for(const [value,label] of [['','全部等级'],['available','当前可购买等级']])addOption(level,label,value);
    level.value=state.level||'';
    const school=el('select','');school.setAttribute('aria-label',tr('装备学系'));
    addOption(school,'全部学系','');
    for(const [id,label] of Object.entries(SCHOOL_NAMES))addOption(school,label,id);
    addOption(school,'全学系','all');school.value=state.school||'';
    const grid=el('div','shop-goods'),pager=el('nav','shop-pagination'),status=el('span','shop-count');
    status.setAttribute('aria-live','polite');pager.setAttribute('aria-label','商品分页');
    const catalog=el('section','shop-catalog',subtabs,el('div','shop-toolbar',query,ownership,level,school),grid,pager);
    body.append(el('div','shop-layout',aside,catalog));
    body.addEventListener('pointerdown',event=>{if(event.target.closest('.shop-bean'))return;for(const node of body.querySelectorAll('.shop-bean.is-open'))node.classList.remove('is-open');});
    const NOT_FOR_SALE_BEANS=10000;
    function magicBeanPrice(item){return item.kind==='mount'&&item.currency===984?productPrice(item,c):null;}
    function notForSale(item){const cost=magicBeanPrice(item);return cost!=null&&cost>NOT_FOR_SALE_BEANS;}
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
        if(notForSale(item))return el('span','shop-bean-price shop-not-for-sale','非卖品');
        if(item.kind==='mount'&&item.currency===984){
            const amount=el('span','');setText(amount,'{count} 魔豆',{count:productPrice(item,c)});
            const row=el('span','shop-bean-price',amount);
            if(extra)row.append(el('span','',extra));
            return row;
        }
        return beanPrice(productPrice(item,c),extra);
    }
    function requirementText(item){
        const price=notForSale(item)?tr('非卖品'):`${fill(item.currency===984?'{count} 魔豆':'{count} 奇豆',{count:productPrice(item,c)}).text}${tr(' / 件')}`;
        return `${price}${item.vipOnly?' · '+tr('会员专属'):''}`;
    }
    const owned=item=>item.kind==='pet'?!!save.pets[item.petId]:(save.inventory[item.itemId]||0)>0;
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
    function offerLanguageTest(item) {
        cb.languageTest({kind:'shop',productId:item.id,name:item.name,price:productPrice(item,c)});
    }
    function openPurchase(item,trigger) {
        const dialog=el('dialog','pet-buy-dialog');
        dialog.dataset.zh='确认购买';
        dialog.setAttribute('aria-label',tr('确认购买'));
        const close=()=>dialog.close();
        const exit=createCloseButton(close,'关闭购买');
        const confirm=button('确认',()=>{close();cb.action({type:'buy',productId:item.id});},'primary');
        confirm.setAttribute('aria-label',`${item.name}：确认`);
        const body=el('div','modal-body pet-buy-body',el('div','shop-preview-art',picture(item,112)),el('h3','',item.name),el('p','shop-preview-price',priceLabel(item,' / 件')),confirm);
        const nodes=[el('header','modal-header',el('h2','','确认购买'),exit),body];

        dialog.append(...nodes);
        document.body.append(dialog);
        dialog.addEventListener('pointerdown',event=>{if(event.target.closest('.shop-bean'))return;for(const node of dialog.querySelectorAll('.shop-bean.is-open'))node.classList.remove('is-open');});
        dialog.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close();}});
        dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();});
        dialog.addEventListener('close',()=>{dialog.remove();if(trigger?.isConnected)trigger.focus({preventScroll:true});},{once:true});
        dialog.showModal();exit.focus();
    }
    function openNotForSale(item,trigger) {
        const gear=c.items[item.itemId];
        if(!gear){openPurchase(item,trigger);return;}
        inspector.show(gear,{trigger,source:config.title,requirements:requirementText(item),requirementsLabel:'购买条件'});
        const note=el('span','muted','');
        setText(note,'仍要购买将花费 {cost} 魔豆',{cost:productPrice(item,c).toLocaleString('zh-CN')});
        const confirm=button('确认',()=>{inspector.close();cb.action({type:'buy',productId:item.id});},'primary');
        confirm.setAttribute('aria-label',`${item.name}：确认`);
        inspector.footer.replaceChildren(el('strong','shop-not-for-sale','非卖品'),note,confirm);
    }
    function buyButton(item) {
        const buy=button('购买',()=>notForSale(item)?openNotForSale(item,buy):openPurchase(item,buy),'primary shop-buy');
        buy.setAttribute('aria-label',`${item.name}：购买`);
        return buy;
    }
    function paintPreview(item) {
        preview.replaceChildren();
        if(!item){
            if(tile)preview.append(tile(assets,'sprites',save.appearance==='girl'?12:8,120,150));
            preview.append(el('p','muted','点击商品图标查看详情'));return;
        }
        preview.append(el('div','shop-preview-art',picture(item,112)),el('h3','',item.name),el('p','shop-item-meta',itemMeta(item,true)));
        const gear=c.items[item.itemId];
        if(item.kind==='gear'){
            if(gear.iconFallback)preview.append(el('small','muted','原图缺失 · 同部位示意图'));
            if(gear.unsupportedStats?.length){const note=el('small','muted');setText(note,'当前未生效属性：{stats}',{stats:gear.unsupportedStats.join('、')});preview.append(note);}
            if(!canEquip(save,gear,c))preview.append(el('small','shop-item-warning',equipmentBlockReason(save,gear,c)));
            if(item.slot===24&&owned(item))preview.append(button('前往卡包配卡',()=>cb.panel('deck'),'secondary'));
        }
        if(item.kind==='pet'){
            preview.append(button('查看四阶段与卡片',()=>showPetDetails(assets,item.petId,petPortrait,{el,button}),'secondary'));
            const capture=button('寻找并捕获',()=>cb.encounter('wild:'+item.petId),'secondary');capture.disabled=save.level<item.level;preview.append(capture,el('small','muted','捕获时从符文卡使用抓宠符文。普通和高级符文由哈奇岛的安卓婆婆出售。'));
        }
        if(item.kind==='mount')preview.append(el('small','muted','购买后在背包的坐骑分类中骑乘。骑乘时属性加入战斗。'));
        preview.append(el('p','shop-preview-price',priceLabel(item,' / 件')),buyButton(item));
    }
    function remember(){Object.assign(state,{category:category.id,subcategory:sub,subcategoryCategory:category.id,page,query:query.value,ownership:ownership.value,level:level.value,school:school.value,slot:''});}
    function itemMeta(item,withSchool){
        const parts=[];
        if(item.vipOnly)parts.push(tr('会员专属'));
        parts.push(fill('{level}级',{level:item.level}).text);
        if(withSchool)parts.push(tr(SCHOOL_NAMES[item.school]||'全学系'));
        if(owned(item))parts.push(tr('已拥有'));
        return parts.join(' · ');
    }
    function paint(){
        remember();
        school.hidden=category.id!=='gear';
        for(const tab of tabs.children)tab.setAttribute('aria-pressed',String(tab.dataset.category===category.id));
        subtabs.replaceChildren();
        category.subcategories.forEach((row,index)=>{
            const tab=button(row.label,()=>{sub=index;page=0;state.selected=null;paint();},'secondary');
            tab.setAttribute('aria-pressed',String(index===sub));subtabs.append(tab);
        });
        const q=query.value.trim().toLowerCase();
        const rows=c.shop.filter(item=>!item.isInternalTest&&!item.retired&&matches(item,category)&&matches(item,category.subcategories[sub])&&(!q||item.name.toLowerCase().includes(q)||tr(item.name).toLowerCase().includes(q))&&(!ownership.value||owned(item)===(ownership.value==='owned'))&&(!level.value||item.level<=save.level)&&(category.id!=='gear'||!school.value||item.school===school.value))
            .sort((a,b)=>a.level-b.level||a.name.localeCompare(b.name,'zh'));
        const pages=Math.max(1,Math.ceil(rows.length/pageSize));page=Math.min(page,pages-1);remember();
        grid.replaceChildren();pager.replaceChildren();
        const visible=rows.slice(page*pageSize,(page+1)*pageSize);
        for(const item of visible){
            const card=el('article','shop-good');card.dataset.productId=item.id;
            const choose=()=>{state.selected=item.id;for(const node of grid.querySelectorAll('.shop-product-icon'))node.setAttribute('aria-pressed',String(node.dataset.productId===item.id));paintPreview(item);if(matchMedia('(max-width:720px)').matches)preview.scrollIntoView({block:'nearest'});};
            const image=button(picture(item,80),choose,'shop-product-icon');image.dataset.productId=item.id;
            if(!item.petId){
                image.setAttribute('aria-haspopup','dialog');
                image.addEventListener('click',()=>inspector.show(c.items[item.itemId],{trigger:image,source:config.title,requirements:requirementText(item),requirementsLabel:'购买条件'}));
            }
            image.setAttribute('aria-label',`查看${item.name}`);image.setAttribute('aria-pressed',String(state.selected===item.id));
            const name=el('strong','shop-good-name',item.name);name.title=tr(item.name);
            card.append(name,image,el('span','shop-good-price',priceLabel(item)),el('small','shop-good-level',itemMeta(item,false)),buyButton(item));
            grid.append(card);
        }
        if(!visible.length)grid.append(el('p','shop-empty','没有符合条件的商品，请调整分类或筛选。'));
        const previous=button('上一页',()=>{page--;state.selected=null;paint();},'secondary'),next=button('下一页',()=>{page++;state.selected=null;paint();},'secondary');
        previous.disabled=page===0;next.disabled=page===pages-1;setText(status,'{page} / {pages} 页 · {count} 件',{page:page+1,pages,count:rows.length});
        pager.append(previous,status,next);
        const selected=visible.find(item=>item.id===state.selected);if(!selected)state.selected=null;
        paintPreview(selected);
    }
    for(const row of config.categories){
        const tab=button(row.label,()=>{category=row;sub=0;page=0;state.selected=null;paint();},'secondary');tab.dataset.category=row.id;tabs.append(tab);
    }
    for(const input of [query,ownership,level,school])input.oninput=()=>{page=0;state.selected=null;paint();};
    const trial=el('select','');trial.setAttribute('aria-label','试炼等级');
    for(let number=1;number<=c.progression.levelCap;number++){const option=new Option(fill(number>save.level?'{level}级试炼（未解锁）':'{level}级试炼',{level:number}).text,number);option.disabled=number>save.level;trial.append(option);}trial.value=save.level;
    aside.append(el('details','shop-trial',el('summary','','赚取奇豆 · 魔法试炼'),trial,button('开始试炼',()=>cb.encounter('trial:'+trial.value),'secondary')));
    paint();
}
