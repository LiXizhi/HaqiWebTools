import {createCloseButton} from './view_adventure_controls.js';
import { equipmentInstances, findEquipmentInstance } from './adventure_equipment_instances_core.js';
import { equipmentBlockReason, SCHOOL_NAMES } from './adventure_core.js';
import { equipmentRequirements } from './adventure_item_rules_core.js';
import { upgradeLevels } from './adventure_upgrade_core.js';
import { EQUIPMENT_SLOTS, equipmentAttributes, equipmentCards, equipmentSummary, previewEquipment } from './adventure_equipment_core.js';

const FILTERS = [[0,'全部',[]],[2,'帽子',[2]],[5,'法袍',[5]],[7,'靴子',[7]],['weapons','武器',[10,11]],[24,'卡包',[24]],['apparel','衣饰',[6,8,9]],['accessories','饰品',[4,15,16,17]],['colorful','炫彩',[18,19,70,71]]];

const TRAVEL_FILTERS = [[0,'全部'],['supplies','消耗品'],['cards','卡牌'],['collection','收藏']];
const travelCategory = item => item.kind===3?'supplies':item.kind===18?'cards':'collection';
const PAGE_SIZE = 12;

// DOM only; mutations are dispatched through the adventure controller.
export function renderEquipment(body,model,cb,ui) {
    const {el,button,art,tile,spellFace}=ui,{save,assets}=model,c=assets.content;
    const state=model.equipmentView,travel=state.tab==='all';
    const isGear=item=>item.kind===1||item.slot===24;
    const owned=Object.values(c.items).filter(item=>(save.inventory[item.id]||0)>0&&!['100','113','17213'].includes(String(item.id)));
    const shell=el('div','equipment-layout'),character=el('section','equipment-character'),wardrobe=el('section','equipment-wardrobe');
    const tabs=el('div','equipment-tabs');
    for(const [id,label] of [['gear','角色装备'],['all','旅行背包'],['upgrade','强化装备'],['gems','镶嵌宝石']]) {
        const b=button(label,()=>{if(['upgrade','gems'].includes(id)&&cb.panel){cb.panel(id);return;}state.tab=id;state.slot=0;state.page=0;state.query='';state.item=null;state.guid=null;render();},`secondary ${state.tab===id?'active':''}`);
        b.setAttribute('aria-pressed',String(state.tab===id));tabs.append(b);
    }
    body.append(tabs,shell);
    const identity=el('div','equipment-identity',el('h3','',save.name),el('p','muted',`${SCHOOL_NAMES[save.school]}学徒 · 等级 ${save.level}`));
    const portrait=tile(assets,'sprites',save.appearance==='girl'?12:8,130,150);
    portrait.setAttribute('role','img');portrait.setAttribute('aria-label','角色形象');
    character.append(el('div','equipment-profile',identity,el('div','equipment-portrait',portrait)));
    if(!travel){
        const slots=el('div','equipment-slots');
        for(const slot of EQUIPMENT_SLOTS) {
            const item=c.items[save.equipment[slot.id]];
            const b=button([el('span','equipment-slot-name',slot.name),item?art(assets,item.art,42,42):el('span','equipment-empty','＋'),el('span','equipment-slot-title',item?.name||'未装备')],()=>{state.tab='gear';state.slot=slot.id;state.page=0;state.item=item?.id||null;state.guid=save.equipmentGuids?.[slot.id]||null;const next=render();if(item)next.openDetail(item);},`equipment-slot ${state.slot===slot.id?'selected':''}`);
            b.setAttribute('aria-label',`${slot.name}：${item?.name||'未装备'}，查看该部位`);slots.append(b);
        }
        character.append(slots);
        const statDetails=el('details','equipment-stat-details',el('summary','','当前属性'));
        statDetails.open=state.statsOpen??false;
        statDetails.ontoggle=()=>{state.statsOpen=statDetails.open;};
        const stats=el('dl','equipment-summary');
        for(const row of equipmentSummary(save,c))stats.append(el('dt','',row.label),el('dd','',`${row.value}${row.unit}`));
        statDetails.append(stats,el('p','muted','攻击、防御、命中、暴击为本系装备加成。最大生命与超级魔力率包含等级基础值。装备附加牌不占普通卡包容量。'));
        character.append(statDetails);
    }else{
        character.append(el('h3','equipment-section-title','旅行物品'));
        const summary=el('dl','equipment-summary');
        for(const [id,label] of TRAVEL_FILTERS.slice(1))summary.append(el('dt','',label),el('dd','',`${owned.filter(item=>!isGear(item)&&travelCategory(item)===id).length} 种`));
        character.append(summary,el('p','muted','消耗品、卡牌与收藏物品收纳在这里。点击右侧物品查看详情。'));
    }
    shell.append(character,wardrobe);
    const header=body.closest('.modal').querySelector('.modal-header');
    header.querySelector('.equipment-wallet')?.remove();
    header.insertBefore(el('div','equipment-wallet',el('span','',`仙豆 ${save.inventory[17213]||0}`),el('span','',`奇豆 ${save.inventory[100]||0}`)),header.querySelector('.close-button'));
    const filters=el('div','equipment-filters');
    for(const [id,label,slots=[]] of travel?TRAVEL_FILTERS:FILTERS) {
        const b=button(label,()=>{state.slot=id;state.page=0;state.item=null;render();},`equipment-filter ${state.slot===id||slots.includes(state.slot)?'active':''}`);b.setAttribute('aria-pressed',String(state.slot===id||slots.includes(state.slot)));filters.append(b);
    }
    const grid=el('div','equipment-grid'),pager=el('div','equipment-pager'),detail=el('section','equipment-detail');detail.setAttribute('aria-label','物品详情');
    wardrobe.append(filters,grid,pager);
    const dialog=el('dialog','equipment-item-dialog'),footer=el('div','equipment-detail-footer');
    dialog.setAttribute('aria-label','物品详情与装备对比');
    const closeDetail=()=>dialog.close();
    const closeButton=createCloseButton(closeDetail,'关闭物品详情');
    dialog.append(el('header','equipment-dialog-header',el('strong','','物品详情'),closeButton),detail,footer);
    body.append(dialog);
    dialog.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();closeDetail();}});
    dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDetail();}});
    function openDetail(item){paintDetail(item);dialog.showModal();closeButton.focus({preventScroll:true});}

    function render(){
        const focusLabel=document.activeElement?.getAttribute('aria-label')||document.activeElement?.textContent;
        body.replaceChildren();const next=renderEquipment(body,model,cb,ui);
        [...body.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')||b.textContent)===focusLabel)?.focus({preventScroll:true});
        return next;
    }
    function paintList(){
        const items=owned.filter(item=>(travel?!isGear(item):isGear(item))&&(!state.slot||(travel?travelCategory(item)===state.slot:(FILTERS.find(([id])=>id===state.slot)?.[2]||[state.slot]).includes(item.slot))));
        const pages=Math.max(1,Math.ceil(items.length/PAGE_SIZE));
        state.page=Math.max(0,Math.min(state.page||0,pages-1));
        grid.replaceChildren();pager.replaceChildren();
        if(!items.some(item=>item.id===state.item))state.item=items[0]?.id||null;
        for(const item of items.slice(state.page*PAGE_SIZE,(state.page+1)*PAGE_SIZE)) {
            const equipped=Number(save.equipment[item.slot])===item.id;
            const b=button([art(assets,item.art,52,52),el('span','equipment-item-name',item.name)],()=>{state.item=item.id;state.guid=null;for(const cell of grid.children){const selected=cell===b;cell.classList.toggle('selected',selected);cell.setAttribute('aria-pressed',String(selected));}openDetail(item);},`equipment-item ${equipped?'equipped':''} ${state.item===item.id?'selected':''}`);
            const quantity=save.inventory[item.id];
            if(!isGear(item)||quantity>1)b.append(el('span','equipment-quantity',String(quantity)));
            if(equipped)b.append(el('small','equipment-equipped-label','已装备'));
            b.setAttribute('aria-label',`${item.name}${!isGear(item)||quantity>1?`，数量 ${quantity}`:''}${equipped?'，已装备':''}，查看详情`);
            b.title=item.name;b.setAttribute('aria-haspopup','dialog');b.setAttribute('aria-pressed',String(state.item===item.id));grid.append(b);
        }
        while(grid.children.length<PAGE_SIZE){const empty=el('div','equipment-item empty');empty.setAttribute('aria-hidden','true');grid.append(empty);}
        const previous=button('上一页',()=>{state.page--;paintList();},'secondary small'),next=button('下一页',()=>{state.page++;paintList();},'secondary small');
        previous.disabled=state.page===0;next.disabled=state.page===pages-1;
        pager.append(previous,el('span','',`${state.page+1} / ${pages}`),next);
        if(!items.length)grid.append(el('p','equipment-empty-list',state.slot?'这个分类还没有物品。':travel?'旅行背包还没有物品。':'还没有装备，完成导师任务可以获得。'));
    }
    function paintDetail(item){
        detail.replaceChildren();footer.replaceChildren();if(!item){detail.append(el('p','muted','选择一件物品，查看属性、穿戴条件和获取途径。'));return;}
        const instance=findEquipmentInstance(save,c,item.id,state.guid)||findEquipmentInstance(save,c,item.id);
        const equipped=Number(save.equipment[item.slot])===item.id&&(!save.equipmentGuids?.[item.slot]||save.equipmentGuids[item.slot]===instance?.guid),gear=isGear(item),level=instance?.serverdata.addlel||0;
        if(gear){
            const copies=equipmentInstances(save,c).rows.filter(row=>row.gsid===item.id);
            if(copies.length>1){const select=el('select','equipment-instance-select');select.setAttribute('aria-label','选择装备实例');copies.forEach((row,i)=>{const option=el('option','',`第 ${i+1} 件 · 强化 +${row.serverdata.addlel}${row.guid===save.equipmentGuids?.[item.slot]?' · 已装备':''}`);option.value=row.guid;select.append(option);});select.value=instance.guid;select.onchange=()=>{state.guid=select.value;paintDetail(item);};detail.append(select);}
        }
        detail.append(el('div','equipment-detail-heading',art(assets,item.art,64,64),el('div','',el('p','eyebrow',equipped?'正在装备':gear?'装备详情':'物品详情'),el('h3','',item.name),el('p','muted',`拥有 ${save.inventory[item.id]} 件${level?` · 强化 +${level}`:''}`))));

        if(gear){
            const requirements=equipmentRequirements(item),school=Object.keys(c.schools).find(key=>c.schools[key]===requirements.school);
            detail.append(el('p','muted',`${EQUIPMENT_SLOTS.find(s=>s.id===item.slot)?.name||'装备'} · 等级 ${requirements.level} · ${school?SCHOOL_NAMES[school]+'系':'全学系通用'}`));
            const attrs=el('div','equipment-attributes');
            for(const row of equipmentAttributes(item,save,c,instance?.guid))attrs.append(el('span','',`${row.label} +${row.value}${row.unit}`));
            detail.append(attrs);
            const reason=save.pendingEncounter?'战斗中无法换装':equipmentBlockReason(save,item,c);
            const action=equipped?{type:'unequip',slot:item.slot}:{type:'equip',itemId:item.id,guid:instance?.guid};
            if(!reason){
                const preview=previewEquipment(save,c,action),changes=preview.rows.filter(row=>row.delta);
                const previous=c.items[save.equipment[item.slot]];
                detail.append(el('p','equipment-compare-title',equipped?'卸下后变化':previous?`替换「${previous.name}」后变化`:'穿戴后变化'));
                const table=el('table','equipment-comparison');
                table.append(el('thead','',el('tr','',...['属性','当前',equipped?'卸下后':'换装后','变化'].map(label=>el('th','',label)))));
                const rows=el('tbody','');
                for(const row of changes)rows.append(el('tr','',el('th','',row.label),el('td','',`${row.before}${row.unit}`),el('td','',`${row.value}${row.unit}`),el('td',row.delta>0?'equipment-gain':'equipment-loss',`${row.delta>0?'+':''}${row.delta}${row.unit}`)));
                table.append(rows);if(changes.length)detail.append(table);
                if(!changes.length)detail.append(el('p','muted','基础属性不变，请查看附加法术。'));
                if(preview.trimmed)detail.append(el('p','equipment-warning',`卡包容量降低，将按现有顺序移出 ${preview.trimmed} 张配卡。拥有的卡牌不会丢失，可在卡包中重新配置。`));
                const b=button(equipped?'卸下':'穿上',()=>{dialog.close();cb.action(action);},equipped?'secondary':'primary');
                b.disabled=!!save.pendingEncounter;footer.prepend(b);if(save.pendingEncounter)footer.append(el('span','muted','战斗中无法换装'));
            }else {detail.append(el('p','equipment-warning',reason));const b=button('穿上',()=>{},'primary');b.disabled=true;footer.prepend(b);}
            if(item.stats[36]>0)footer.append(button('镶嵌宝石',()=>{dialog.close();cb.panel?.('gems',{itemId:item.id,guid:instance?.guid});},'secondary'));
            if(upgradeLevels(c,item.id).length)footer.append(button('强化',()=>{dialog.close();cb.panel?.('upgrade',{itemId:item.id,guid:instance?.guid});},'secondary'));
            if(item.slot===24&&cb.panel)footer.append(button('整理魔法卡包',()=>{dialog.close();cb.panel('deck');},'secondary'));
            const cards=equipmentCards(item,c);
            if(cards.length){const faces=el('div','equipment-cards');for(const key of cards){const card=assets.dataset.cards[key];if(card)faces.append(spellFace(assets,card));}detail.append(el('h4','','附加法术 · 装备后可用'),faces);}
        }else{
            detail.append(el('p','muted',String(item.description||'旅途中收集的物品。').replace(/[|#]/g,' ')));
            if(item.id===17307&&!save.pet)footer.append(button('打开出奇蛋',()=>{dialog.close();cb.action({type:'hatch'});},'primary'));
            else if(item.id===17172){const b=button(save.pet?'喂养宠物':'先孵化一只宠物',()=>{dialog.close();cb.action({type:'feed'});},'primary');b.disabled=!save.pet||save.pet.xp>=c.pet.levels.max_exp;footer.append(b);}
            else detail.append(el('p','muted','旅途收藏 · 本章暂无主动使用功能'));
        }
        const quests=c.quests.filter(q=>q.rewards.some(group=>group.items.some(row=>row.id===item.id)));
        if(quests.length)detail.append(el('p','equipment-source',`获取途径：${quests.map(q=>q.title).join('、')}`));
    }
    paintList();
    return {openDetail};
}
