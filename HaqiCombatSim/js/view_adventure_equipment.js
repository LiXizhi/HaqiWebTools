import { equipmentInstances, findEquipmentInstance } from './adventure_equipment_instances_core.js';
import { equipmentBlockReason, SCHOOL_NAMES } from './adventure_core.js';
import { equipmentRequirements } from './adventure_item_rules_core.js';
import { upgradeLevels } from './adventure_upgrade_core.js';
import { EQUIPMENT_SLOTS, equipmentAttributes, equipmentCards, equipmentSummary, previewEquipment } from './adventure_equipment_core.js';

// DOM only; mutations are dispatched through the adventure controller.
export function renderEquipment(body,model,cb,ui) {
    const {el,button,art,tile,spellFace}=ui,{save,assets}=model,c=assets.content;
    const state=model.equipmentView;
    const isGear=item=>item.kind===1||item.slot===24;
    const owned=Object.values(c.items).filter(item=>(save.inventory[item.id]||0)>0&&!['100','113','17213'].includes(String(item.id)));
    const shell=el('div','equipment-layout'),character=el('section','equipment-character'),wardrobe=el('section','equipment-wardrobe');
    const tabs=el('div','equipment-tabs');
    for(const [id,label] of [['gear','角色装备'],['all','旅途背包'],['upgrade','强化装备']]) {
        const b=button(label,()=>{if(id==='upgrade'&&cb.panel){cb.panel('upgrade');return;}state.tab=id;state.slot=0;state.query='';state.item=null;render();},`secondary ${state.tab===id?'active':''}`);
        b.setAttribute('aria-pressed',String(state.tab===id));tabs.append(b);
    }
    body.append(tabs,shell);
    character.append(el('p','eyebrow','我的魔法旅程'),el('h3','',save.name),el('p','muted',`${SCHOOL_NAMES[save.school]}学徒 · 等级 ${save.level}`));
    const portrait=tile(assets,'sprites',save.appearance==='girl'?12:8,130,150);
    portrait.setAttribute('role','img');portrait.setAttribute('aria-label','角色形象');
    character.append(el('div','equipment-portrait',portrait));
    const slots=el('div','equipment-slots');
    for(const slot of EQUIPMENT_SLOTS) {
        const item=c.items[save.equipment[slot.id]];
        const b=button([el('span','equipment-slot-name',slot.name),item?art(assets,item.art,42,42):el('span','equipment-empty','＋'),el('span','equipment-slot-title',item?.name||'未装备')],()=>{state.tab='gear';state.slot=slot.id;state.item=item?.id||null;render();},`equipment-slot ${state.slot===slot.id?'selected':''}`);
        b.setAttribute('aria-label',`${slot.name}：${item?.name||'未装备'}，查看该部位`);slots.append(b);
    }
    character.append(slots);
    const statDetails=el('details','equipment-stat-details',el('summary','','当前属性'));
    statDetails.open=state.statsOpen??matchMedia('(min-width:701px)').matches;
    statDetails.ontoggle=()=>{state.statsOpen=statDetails.open;};
    const stats=el('dl','equipment-summary');
    for(const row of equipmentSummary(save,c))stats.append(el('dt','',row.label),el('dd','',`${row.value}${row.unit}`));
    statDetails.append(stats,el('p','muted','攻击、防御、命中、暴击为本系装备加成。最大生命与超级魔力率包含等级基础值。装备附加牌不占普通卡包容量。'));
    character.append(statDetails);
    shell.append(character,wardrobe);
    wardrobe.append(el('div','equipment-wallet',el('span','',`仙豆 ${save.inventory[17213]||0}`),el('span','',`奇豆 ${save.inventory[100]||0}`)));
    const filters=el('div','equipment-filters');
    for(const [id,label] of [[0,'全部'],...EQUIPMENT_SLOTS.map(s=>[s.id,s.name])]) {
        const b=button(label,()=>{state.slot=id;state.item=null;render();},`secondary small ${state.slot===id?'active':''}`);b.setAttribute('aria-pressed',String(state.slot===id));filters.append(b);
    }
    const search=el('input','equipment-search');search.type='search';search.placeholder='搜索物品名称';search.setAttribute('aria-label','搜索物品名称');search.value=state.query;
    const count=el('p','muted'),grid=el('div','equipment-grid'),detail=el('section','equipment-detail');detail.setAttribute('aria-label','物品详情');
    wardrobe.append(filters,search,count,grid,detail);
    search.oninput=()=>{state.query=search.value;paintList();};
    function render(){
        const focusLabel=document.activeElement?.getAttribute('aria-label')||document.activeElement?.textContent;
        body.replaceChildren();renderEquipment(body,model,cb,ui);
        [...body.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')||b.textContent)===focusLabel)?.focus({preventScroll:true});
    }
    function paintList(){
        const items=owned.filter(item=>(state.tab==='upgrade'?upgradeLevels(c,item.id).length:state.tab==='all'||isGear(item))&&(!state.slot||item.slot===state.slot)&&item.name.includes(state.query.trim()));
        count.textContent=`${items.length} 种物品 · 点击查看详情与换装对比`;
        grid.replaceChildren();
        if(!items.some(item=>item.id===state.item))state.item=items[0]?.id||null;
        for(const item of items) {
            const equipped=Number(save.equipment[item.slot])===item.id;
            const b=button([art(assets,item.art,52,52),el('span','equipment-item-name',item.name),el('small','',equipped?'已装备':`拥有 ${save.inventory[item.id]}`)],()=>{state.item=item.id;state.guid=null;paintList();detail.scrollIntoView({block:'nearest',behavior:'smooth'});},`equipment-item ${equipped?'equipped':''} ${state.item===item.id?'selected':''}`);
            b.setAttribute('aria-pressed',String(state.item===item.id));grid.append(b);
        }
        if(!items.length)grid.append(el('p','equipment-empty-list',state.query?'没有找到匹配的物品。':state.slot?'这个部位还没有装备。完成导师任务可以获得。':'背包还空着。去找青龙导师开启旅程吧。'));
        paintDetail(c.items[state.item]);
    }
    function paintDetail(item){
        detail.replaceChildren();if(!item){detail.append(el('p','muted','选择一件物品，查看属性、穿戴条件和获取途径。'));return;}
        const instance=findEquipmentInstance(save,c,item.id,state.guid)||findEquipmentInstance(save,c,item.id);
        const equipped=Number(save.equipment[item.slot])===item.id&&(!save.equipmentGuids?.[item.slot]||save.equipmentGuids[item.slot]===instance?.guid),gear=isGear(item),level=instance?.serverdata.addlel||0;
        if(gear){
            const copies=equipmentInstances(save,c).rows.filter(row=>row.gsid===item.id);
            if(copies.length>1){const select=el('select','equipment-instance-select');select.setAttribute('aria-label','选择装备实例');copies.forEach((row,i)=>{const option=el('option','',`第 ${i+1} 件 · 强化 +${row.serverdata.addlel}${row.guid===save.equipmentGuids?.[item.slot]?' · 已装备':''}`);option.value=row.guid;select.append(option);});select.value=instance.guid;select.onchange=()=>{state.guid=select.value;paintDetail(item);};detail.append(select);}
        }
        detail.append(el('div','equipment-detail-heading',art(assets,item.art,64,64),el('div','',el('p','eyebrow',equipped?'正在装备':gear?'装备详情':'物品详情'),el('h3','',item.name),el('p','muted',`拥有 ${save.inventory[item.id]} 件${level?` · 强化 +${level}`:''}`))));
        if(upgradeLevels(c,item.id).length)detail.append(button('装备强化',()=>cb.panel?.('upgrade',{itemId:item.id,guid:instance?.guid}),'primary'));
        if(gear){
            const requirements=equipmentRequirements(item),school=Object.keys(c.schools).find(key=>c.schools[key]===requirements.school);
            detail.append(el('p','muted',`${EQUIPMENT_SLOTS.find(s=>s.id===item.slot)?.name||'装备'} · 等级 ${requirements.level} · ${school?SCHOOL_NAMES[school]+'系':'全学系通用'}`));
            const attrs=el('div','equipment-attributes');
            for(const row of equipmentAttributes(item,save,c,instance?.guid))attrs.append(el('span','',`${row.label} +${row.value}${row.unit}`));
            detail.append(attrs);
            const reason=equipmentBlockReason(save,item,c);
            const action=equipped?{type:'unequip',slot:item.slot}:{type:'equip',itemId:item.id,guid:instance?.guid};
            if(!reason){
                const preview=previewEquipment(save,c,action),changes=preview.rows.filter(row=>row.delta);
                const previous=c.items[save.equipment[item.slot]];
                detail.append(el('p','equipment-compare-title',equipped?'卸下后变化':previous?`替换「${previous.name}」后变化`:'穿戴后变化'));
                for(const row of changes)detail.append(el('div','equipment-change',el('span','',row.label),el('span',row.delta>0?'equipment-gain':'equipment-loss',`${row.before}${row.unit} → ${row.value}${row.unit}（${row.delta>0?'+':''}${row.delta}）`)));
                if(!changes.length)detail.append(el('p','muted','基础属性不变，请查看附加法术。'));
                if(preview.trimmed)detail.append(el('p','equipment-warning',`卡包容量降低，将按现有顺序移出 ${preview.trimmed} 张配卡。拥有的卡牌不会丢失，可在卡包中重新配置。`));
                const b=button(equipped?'卸下装备':previous?'替换装备':'穿戴装备',()=>cb.action(action),equipped?'secondary':'primary');
                b.disabled=!!save.pendingEncounter;detail.append(el('div','equipment-actions',b));
            }else detail.append(el('p','equipment-warning',reason));
            if(item.slot===24&&cb.panel)detail.append(button('整理魔法卡包',()=>cb.panel('deck'),'secondary'));
            const cards=equipmentCards(item,c);
            if(cards.length){const faces=el('div','equipment-cards');for(const key of cards){const card=assets.dataset.cards[key];if(card)faces.append(spellFace(assets,card));}detail.append(el('h4','','附加法术 · 装备后可用'),faces);}
        }else{
            detail.append(el('p','muted',String(item.description||'旅途中收集的物品。').replace(/[|#]/g,' ')));
            if(item.id===17307&&!save.pet)detail.append(button('打开出奇蛋',()=>cb.action({type:'hatch'}),'primary'));
            else if(item.id===17172){const b=button(save.pet?'喂养宠物':'先孵化一只宠物',()=>cb.action({type:'feed'}),'primary');b.disabled=!save.pet||save.pet.xp>=c.pet.levels.max_exp;detail.append(b);}
            else detail.append(el('p','muted','旅途收藏 · 本章暂无主动使用功能'));
        }
        const quests=c.quests.filter(q=>q.rewards.some(group=>group.items.some(row=>row.id===item.id)));
        if(quests.length)detail.append(el('p','equipment-source',`获取途径：${quests.map(q=>q.title).join('、')}`));
    }
    paintList();
}
