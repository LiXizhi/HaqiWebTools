import { equipmentAttributes } from './adventure_equipment_core.js';
import { canEquip, equipmentBlockReason, SCHOOL_NAMES } from './adventure_core.js';
import { productPrice } from './adventure_pets_core.js';
import { petPortrait } from './view_adventure_pets.js';
import { showPetDetails } from './view_adventure_pet_details.js';

// Layout: HaqiShop.kids1.html (account/preview, two tab rows, 3 × 3 goods).
// The original GetByCate provider is replaced by the local JSON catalogue.
// Purchases still go through the controller and the existing BalanceParams rules.
export function renderShop(body,model,cb,{el,button,art,tile}) {
    const {save,assets}=model,c=assets.content,config=c.shopConfig;
    const state=model.shopView||(model.shopView={});
    let category=config.categories.find(row=>row.id===state.category)||config.categories[0];
    let sub=state.subcategoryCategory===category.id&&Number.isInteger(state.subcategory)?state.subcategory:0;
    if(!category.subcategories[sub])sub=0;
    let page=Math.max(0,Number.isInteger(state.page)?state.page:0);
    const pageSize=config.pageSize;
    const modal=body.closest('.modal'),header=modal.querySelector('.modal-header');
    modal.classList.add('shop-modal');modal.setAttribute('aria-label',config.title);header.querySelector('h2').textContent=config.title;
    header.querySelector('.eyebrow')?.remove();
    const tabs=el('nav','shop-tabs'),subtabs=el('nav','shop-subtabs');
    tabs.setAttribute('aria-label','商品分类');subtabs.setAttribute('aria-label','商品子分类');
    header.insertBefore(tabs,header.querySelector('.close-button'));
    const balance=el('section','shop-wallet',el('span','','我的奇豆'),el('strong','',String(save.inventory[100]||0)),el('small','',`${save.name} · ${save.level}级`));
    const membershipLabel=model.membership?.isVip?'Keepwork VIP':'会员状态';
    balance.append(button(membershipLabel,()=>cb.panel('membership'),'secondary shop-membership'));
    const preview=el('section','shop-preview');preview.setAttribute('aria-label','商品预览');
    const aside=el('aside','shop-sidebar',balance,preview);
    const query=el('input','shop-search');query.type='search';query.placeholder='输入商品名称';query.setAttribute('aria-label','搜索商品');query.value=state.query||'';
    const ownership=el('select','');ownership.setAttribute('aria-label','收藏筛选');
    for(const [value,label] of [['','全部商品'],['owned','已拥有'],['new','未拥有']])ownership.append(new Option(label,value));
    ownership.value=state.ownership||'';
    const level=el('select','');level.setAttribute('aria-label','等级筛选');
    for(const [value,label] of [['','全部等级'],['available','当前可购买等级']])level.append(new Option(label,value));
    level.value=state.level||'';
    const school=el('select','');school.setAttribute('aria-label','装备学系');
    school.append(new Option('全部学系',''));
    for(const [id,label] of Object.entries(SCHOOL_NAMES))school.append(new Option(label,id));
    school.append(new Option('通用','all'));school.value=state.school||'';
    const grid=el('div','shop-goods'),pager=el('nav','shop-pagination'),status=el('span','shop-count');
    status.setAttribute('aria-live','polite');pager.setAttribute('aria-label','商品分页');
    const catalog=el('section','shop-catalog',subtabs,el('div','shop-toolbar',query,ownership,level,school),grid,pager);
    body.append(el('div','shop-layout',aside,catalog));
    const owned=item=>item.kind==='pet'?!!save.pets[item.petId]:(save.inventory[item.itemId]||0)>0;
    const matches=(item,filter)=>!filter||(!filter.kind||item.kind===filter.kind)&&(!filter.slots||filter.slots.includes(item.slot))&&(!filter.excludeSlots||!filter.excludeSlots.includes(item.slot))&&(!filter.school||item.school===filter.school)&&(!filter.itemIds||filter.itemIds.includes(item.itemId));
    function picture(item,size) {
        if(item.petId)return petPortrait(assets,item.petId,0,size);
        const gear=c.items[item.itemId];
        if(gear?.art){const image=art(assets,gear.art,size,size,'shop-item-art');image.setAttribute('role','img');image.setAttribute('aria-label',item.name);return image;}
        return el('span','shop-art-fallback',item.name.slice(0,2));
    }
    function buyButton(item) {
        const buy=button('购买',()=>cb.action({type:'buy',productId:item.id}),'primary shop-buy');
        buy.setAttribute('aria-label',`${item.name}：购买`);
        return buy;
    }
    function paintPreview(item) {
        preview.replaceChildren();
        if(!item){
            if(tile)preview.append(tile(assets,'sprites',save.appearance==='girl'?12:8,120,150));
            preview.append(el('p','muted','点击商品图标查看详情'));return;
        }
        preview.append(el('div','shop-preview-art',picture(item,112)),el('h3','',item.name),el('p','shop-item-meta',`${item.vipOnly?'Keepwork VIP 专属 · ':''}${item.level}级 · ${SCHOOL_NAMES[item.school]||'通用'}${owned(item)?' · 已拥有':''}`));
        const gear=c.items[item.itemId];
        if(item.kind==='gear'){
            if(gear.description)preview.append(el('p','shop-description',gear.description));
            const attributes=el('dl','shop-attributes');
            for(const row of equipmentAttributes(gear,save,c))attributes.append(el('dt','',row.label),el('dd','',`${row.value}${row.unit}`));
            preview.append(attributes);
            if(gear.iconFallback)preview.append(el('small','muted','原图缺失 · 同部位示意图'));
            if(gear.unsupportedStats?.length)preview.append(el('small','muted',`当前未生效属性：${gear.unsupportedStats.join('、')}`));
            if(!canEquip(save,gear,c))preview.append(el('small','shop-item-warning',equipmentBlockReason(save,gear,c)));
            if(item.slot===24&&owned(item))preview.append(button('前往卡包配卡',()=>cb.panel('deck'),'secondary'));
        }
        if(item.kind==='pet'){
            preview.append(button('查看四阶段与卡片',()=>showPetDetails(assets,item.petId,petPortrait,{el,button}),'secondary'));
            const capture=button('寻找并捕获',()=>cb.encounter('wild:'+item.petId),'secondary');capture.disabled=save.level<item.level;preview.append(capture);
        }
        preview.append(el('p','shop-preview-price',`${productPrice(item,c)} 奇豆 / 件`),buyButton(item));
    }
    function remember(){Object.assign(state,{category:category.id,subcategory:sub,subcategoryCategory:category.id,page,query:query.value,ownership:ownership.value,level:level.value,school:school.value,slot:''});}
    function paint(){
        remember();
        school.hidden=category.id!=='gear';
        for(const tab of tabs.children)tab.setAttribute('aria-pressed',String(tab.dataset.category===category.id));
        subtabs.replaceChildren();
        category.subcategories.forEach((row,index)=>{
            const tab=button(row.label,()=>{sub=index;page=0;state.selected=null;paint();},'secondary');
            tab.setAttribute('aria-pressed',String(index===sub));subtabs.append(tab);
        });
        const rows=c.shop.filter(item=>!item.isInternalTest&&matches(item,category)&&matches(item,category.subcategories[sub])&&item.name.includes(query.value.trim())&&(!ownership.value||owned(item)===(ownership.value==='owned'))&&(!level.value||item.level<=save.level)&&(category.id!=='gear'||!school.value||item.school===school.value))
            .sort((a,b)=>a.level-b.level||a.name.localeCompare(b.name,'zh'));
        const pages=Math.max(1,Math.ceil(rows.length/pageSize));page=Math.min(page,pages-1);remember();
        grid.replaceChildren();pager.replaceChildren();
        const visible=rows.slice(page*pageSize,(page+1)*pageSize);
        for(const item of visible){
            const card=el('article','shop-good');card.dataset.productId=item.id;
            const choose=()=>{state.selected=item.id;for(const node of grid.querySelectorAll('.shop-product-icon'))node.setAttribute('aria-pressed',String(node.dataset.productId===item.id));paintPreview(item);if(matchMedia('(max-width:720px)').matches)preview.scrollIntoView({block:'nearest'});};
            const image=button(picture(item,80),choose,'shop-product-icon');image.dataset.productId=item.id;
            image.setAttribute('aria-label',`查看${item.name}`);image.setAttribute('aria-pressed',String(state.selected===item.id));
            const name=el('strong','shop-good-name',item.name);name.title=item.name;
            card.append(name,image,el('span','shop-good-price',`${productPrice(item,c)} 奇豆`),el('small','shop-good-level',`${item.vipOnly?'会员专属 · ':''}${item.level}级${owned(item)?' · 已拥有':''}`),buyButton(item));
            grid.append(card);
        }
        if(!visible.length)grid.append(el('p','shop-empty','没有符合条件的商品，请调整分类或筛选。'));
        const previous=button('上一页',()=>{page--;state.selected=null;paint();},'secondary'),next=button('下一页',()=>{page++;state.selected=null;paint();},'secondary');
        previous.disabled=page===0;next.disabled=page===pages-1;status.textContent=`${page+1} / ${pages} 页 · ${rows.length} 件`;
        pager.append(previous,status,next);
        const selected=visible.find(item=>item.id===state.selected);if(!selected)state.selected=null;
        paintPreview(selected);
    }
    for(const row of config.categories){
        const tab=button(row.label,()=>{category=row;sub=0;page=0;state.selected=null;paint();},'secondary');tab.dataset.category=row.id;tabs.append(tab);
    }
    for(const input of [query,ownership,level,school])input.oninput=()=>{page=0;state.selected=null;paint();};
    const trial=el('select','');trial.setAttribute('aria-label','试炼等级');
    for(let number=1;number<=c.progression.levelCap;number++){const option=new Option(`${number}级试炼${number>save.level?'（未解锁）':''}`,number);option.disabled=number>save.level;trial.append(option);}trial.value=save.level;
    aside.append(el('details','shop-trial',el('summary','','赚取奇豆 · 魔法试炼'),trial,button('开始试炼',()=>cb.encounter('trial:'+trial.value),'secondary')));
    paint();
}
