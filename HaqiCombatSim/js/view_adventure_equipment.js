import {heroPortrait} from './hero_renderer.js';
import { setText, fill } from './locale_runtime.js';
import {ItemDetails, attributeSpan} from './view_adventure_item_details.js';
import {DRAGON_TOTEMS,dragonTotemStage,dragonTotemItemExperience} from './adventure_progression_bonuses_core.js';
import {signedAttribute,visibleEquipmentSummary,progressionAttributes,equipmentSetDetails,equipmentAttributes} from './adventure_equipment_core.js';
import {runeStatus} from './adventure_runes_core.js';
import { equipmentInstances, findEquipmentInstance } from './adventure_equipment_instances_core.js';
import { equipmentBlockReason, SCHOOL_NAMES } from './adventure_core.js';
import { upgradeLevels } from './adventure_upgrade_core.js';
import { EQUIPMENT_SLOTS, previewEquipment } from './adventure_equipment_core.js';

const FILTERS = [[0,'全部',[]],[2,'帽子',[2]],[5,'法袍',[5]],[7,'靴子',[7]],['weapons','武器',[10,11]],[24,'卡包',[24]],['apparel','衣饰',[6,8,9]],['accessories','饰品',[4,15,16,17]],['colorful','炫彩',[18,19,70,71]],['mounts','坐骑',['mount']]];

const TRAVEL_FILTERS = [[0,'全部'],['supplies','消耗品'],['cards','卡牌'],['collection','收藏']];
const travelCategory = item => item.kind===3?'supplies':item.kind===18?'cards':'collection';
const PAGE_SIZE = 12;

// DOM only; mutations are dispatched through the adventure controller.
export function renderEquipment(body,model,cb,ui) {
    const {el,button,art,tile,spellFace}=ui,{save,assets}=model,c=assets.content;
    const state=model.equipmentView,travel=state.tab==='all';
    const isGear=item=>item.kind===1||item.slot===24;
    const isMountItem=item=>!!c.mountByItem?.[item.id]||(item.kind===2&&item.subtype===6)||(item.kind===10&&item.subtype===1);
    const showingMounts=state.slot==='mounts'||state.slot==='mount';
    const owned=Object.values(c.items).filter(item=>(save.inventory[item.id]||0)>0&&!['100','113','17213'].includes(String(item.id)));
    const shell=el('div','equipment-layout'),character=el('section','equipment-character'),wardrobe=el('section','equipment-wardrobe');
    const tabs=el('div','equipment-tabs');
    for(const [id,label] of [['gear','角色装备'],['all','旅行背包'],['upgrade','强化装备'],['gems','镶嵌宝石']]) {
        const b=button(label,()=>{if(['upgrade','gems'].includes(id)&&cb.panel){cb.panel(id);return;}state.tab=id;state.slot=0;state.page=0;state.query='';state.item=null;state.guid=null;render();},`secondary ${state.tab===id?'active':''}`);
        b.setAttribute('aria-pressed',String(state.tab===id));tabs.append(b);
    }
    body.append(tabs,shell);
    const identity=el('div','equipment-identity',el('h3','',save.name),el('p','muted',`${SCHOOL_NAMES[save.school]}学徒 · 等级 ${save.level}`));
    const portrait=heroPortrait(assets,save,130,150);
    portrait.setAttribute('role','img');portrait.setAttribute('aria-label','角色形象');
    character.append(el('div','equipment-profile',identity,el('div','equipment-portrait',portrait)));
    if(!travel){
        const slots=el('div','equipment-slots');
        for(const slot of EQUIPMENT_SLOTS) {
            const item=slot.id==='mount'?c.items[save.mountId]:c.items[save.equipment[slot.id]];
            // An equipped slot shows only the item art; the slot name is kept for empty slots.
            const b=button([item?null:el('span','equipment-slot-name',slot.name),item?art(assets,item.art,42,42):el('span','equipment-empty','＋'),el('span','equipment-slot-title',item?.name||'未装备')],()=>{state.tab='gear';state.slot=slot.id==='mount'?'mounts':slot.id;state.page=0;state.item=item?.id||null;state.guid=slot.id==='mount'?null:save.equipmentGuids?.[slot.id]||null;const next=render();if(item)next.openDetail(item);},`equipment-slot ${state.slot===slot.id||(slot.id==='mount'&&state.slot==='mounts')?'selected':''}`);
            b.setAttribute('aria-label',`${slot.name}：${item?.name||'未装备'}，查看该部位`);slots.append(b);
        }
        character.append(slots);
        const statDetails=el('details','equipment-stat-details',el('summary','','当前属性'));
        statDetails.open=state.statsOpen??false;
        statDetails.ontoggle=()=>{state.statsOpen=statDetails.open;};
        const stats=el('dl','equipment-summary');
        for(const row of visibleEquipmentSummary(save,c))stats.append(el('dt','',row.label),el('dd','',`${row.value}${row.unit}`));
        statDetails.append(stats,el('p','muted','属性加成包含装备、强化、宝石和骑乘中的坐骑；其他学系与扩展属性仅显示非零项。最大生命与超级魔力率包含等级基础值。装备附加牌不占普通卡包容量。'));
        character.append(statDetails);
        if(c.progressionBonuses){
            const current=DRAGON_TOTEMS.find(row=>(save.inventory[row.id]||0)>0);
            const experience=save.inventory[50359]||0;
            const stage=current?dragonTotemStage(c.progressionBonuses,current.id,50359,experience):null;
            const totems=el('details','equipment-stat-details',el('summary','','龙图腾'));
            totems.append(el('p','',current?`${current.name} · ${stage?.level??0}级 · 经验 ${experience}`:'尚未学习图腾信仰'));
            for(const attribute of progressionAttributes(stage?.stats))totems.append(el('p','',attributeSpan(el,attribute)));
            totems.append(el('p','muted',`魔豆 ${save.inventory[984]||0} · ${current?'转换信仰50魔豆，保留经验':'首次学习免费'}`));
            const choices=el('div','equipment-attributes');
            for(const row of DRAGON_TOTEMS){
                const selected=current?.id===row.id;
                const choose=button(selected?`${row.name} · 已学习`:`${current?'转换为':'学习'}${row.name}`,()=>{
                    if(!globalThis.confirm(current?`花费50魔豆，将信仰转换为${row.name}？图腾经验保留。`:`免费学习${row.name}？`))return;
                    cb.action({type:'choose-totem',professionId:row.id});
                },'secondary');
                choose.disabled=selected||!!save.pendingEncounter||!!current&&(save.inventory[984]||0)<50||!c.progressionBonuses.professions?.[row.id]?.length;
                choices.append(choose);
            }
            totems.append(choices);character.append(totems);
        }
    }else{
        character.append(el('h3','equipment-section-title','旅行物品'));
        const summary=el('dl','equipment-summary');
        for(const [id,label] of TRAVEL_FILTERS.slice(1))summary.append(el('dt','',label),el('dd','',`${owned.filter(item=>!isGear(item)&&travelCategory(item)===id).length} 种`));
        character.append(summary,el('p','muted','消耗品、卡牌与收藏物品收纳在这里。点击右侧物品查看详情。'));
    }
    shell.append(character,wardrobe);
    const header=body.closest('.modal').querySelector('.modal-header');
    header.querySelector('.equipment-wallet')?.remove();
    const fairyBeans=save.inventory[17213]||0,qiBeans=save.inventory[100]||0;
    const fairySpan=el('span',''),qiSpan=el('span','');
    setText(fairySpan,'仙豆 {count}',{count:fairyBeans});setText(qiSpan,'奇豆 {count}',{count:qiBeans});
    header.insertBefore(el('div','equipment-wallet',fairySpan,qiSpan),header.querySelector('.close-button'));
    const filters=el('div','equipment-filters');
    for(const [id,label,slots=[]] of travel?TRAVEL_FILTERS:FILTERS) {
        const b=button(label,()=>{state.slot=id;state.page=0;state.item=null;render();},`equipment-filter ${state.slot===id||slots.includes(state.slot)?'active':''}`);b.setAttribute('aria-pressed',String(state.slot===id||slots.includes(state.slot)));filters.append(b);
    }
    const grid=el('div','equipment-grid'),pager=el('div','equipment-pager'),detail=el('section','equipment-detail');detail.setAttribute('aria-label','物品详情');
    wardrobe.append(filters,grid,pager);
    const inspector=new ItemDetails(body,model,ui);
    const {dialog,footer}=inspector;
    inspector.body.replaceWith(detail);inspector.body=detail;
    function openDetail(item){cb.learningEvent?.('item-selected',{itemId:item.id});paintDetail(item);inspector.open();}


    function render(){
        const focusLabel=document.activeElement?.getAttribute('aria-label')||document.activeElement?.textContent;
        body.replaceChildren();const next=renderEquipment(body,model,cb,ui);
        [...body.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')||b.textContent)===focusLabel)?.focus({preventScroll:true});
        return next;
    }
    function paintList(){
        const items=owned.filter(item=>showingMounts?isMountItem(item):(travel?!isGear(item):isGear(item))&&(!state.slot||(travel?travelCategory(item)===state.slot:(FILTERS.find(([id])=>id===state.slot)?.[2]||[state.slot]).includes(item.slot))));
        const pages=Math.max(1,Math.ceil(items.length/PAGE_SIZE));
        state.page=Math.max(0,Math.min(state.page||0,pages-1));
        grid.replaceChildren();pager.replaceChildren();
        if(!items.some(item=>item.id===state.item))state.item=items[0]?.id||null;
        for(const item of items.slice(state.page*PAGE_SIZE,(state.page+1)*PAGE_SIZE)) {
            const equipped=showingMounts?save.mountId===item.id:Number(save.equipment[item.slot])===item.id;
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
        if(!items.length&&!travel)grid.append(el('p','equipment-empty-list',state.slot?'这个分类还没有物品。':'还没有装备，完成导师任务可以获得。'));
    }
    function paintDetail(item){
        detail.replaceChildren();footer.replaceChildren();if(!item){detail.append(el('p','muted','选择一件物品，查看属性、穿戴条件和获取途径。'));return;}
        const mount=c.mountByItem?.[item.id];
        const instance=mount?null:findEquipmentInstance(save,c,item.id,state.guid)||findEquipmentInstance(save,c,item.id);
        const equipped=mount?save.mountId===item.id:Number(save.equipment[item.slot])===item.id&&(!save.equipmentGuids?.[item.slot]||save.equipmentGuids[item.slot]===instance?.guid),gear=isGear(item),level=instance?.serverdata.addlel||0;
        inspector.render(item,{owned:true,instanceGuid:instance?.guid});
        if(level)detail.append(el('p','muted',`强化 +${level}`));
        if(gear){
            const copies=equipmentInstances(save,c).rows.filter(row=>row.gsid===item.id);
            if(copies.length>1){const select=el('select','equipment-instance-select');select.setAttribute('aria-label','选择装备实例');copies.forEach((row,i)=>{const option=el('option','',`第 ${i+1} 件 · 强化 +${row.serverdata.addlel}${row.guid===save.equipmentGuids?.[item.slot]?' · 已装备':''}`);option.value=row.guid;select.append(option);});select.value=instance.guid;select.onchange=()=>{state.guid=select.value;paintDetail(item);};detail.append(select);}
        }
        if(mount){
            detail.append(el('p','muted',mount.art?.cdn?'骑乘后，这些属性加入角色战斗属性。':'这只坐骑还没有骑乘形象。'));
            for(const row of equipmentAttributes({stats:mount.stats||{}},save,c))detail.append(el('p','',attributeSpan(el,row)));
            const riding=save.mountId===item.id;
            const action=riding?{type:'dismount'}:{type:'ride',itemId:item.id};
            if(mount.art?.cdn&&!save.pendingEncounter){
                const preview=previewEquipment(save,c,action),changes=preview.rows.filter(row=>row.delta);
                if(changes.length){
                    detail.append(el('p','equipment-compare-title',riding?'卸下后变化':'骑乘后变化'));
                    for(const row of changes)detail.append(el('p',row.delta>0?'equipment-gain':'equipment-loss',`${row.label} ${row.delta>0?'+':''}${row.delta}${row.unit}`));
                }
            }
            const ride=button(riding?'卸下':mount.art?.cdn?'骑上':'暂不可骑乘',()=>{dialog.close();cb.action(action);},riding?'secondary':'primary');
            ride.disabled=!!save.pendingEncounter||!mount.art?.cdn;
            footer.prepend(ride);
            if(save.pendingEncounter)footer.append(el('span','muted','战斗中无法换坐骑'));
        }else if(gear){
            const set=equipmentSetDetails(save,c,item.id);
            if(set){
                const heading=el('h4','');setText(heading,'套装 {id} · 已穿戴 {count} 件',{id:set.setId,count:set.count});detail.append(heading);
                for(const group of set.groups){
                    const status=group.active?'已激活':'未激活';
                    const attrNodes=[];
                    group.attributes.forEach((row,i)=>{if(i)attrNodes.push('，');attrNodes.push(attributeSpan(el,row));});
                    const prefix=fill('{count} 件 · {status}：',{count:group.items,status}).text;
                    const line=el('p',group.active?'equipment-gain':'muted',prefix,...attrNodes);
                    line.dataset.zh=`${group.items} 件 · ${status}：${group.attributes.map(row=>`${row.label} ${signedAttribute(row.value)}${row.unit}`).join('，')}`;
                    detail.append(line);
                }
            }
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
        }else{
            const rune=runeStatus(item,c,assets.dataset);
            if(!rune&&item.id===17307&&!save.pet)footer.append(button('打开出奇蛋',()=>{dialog.close();cb.action({type:'hatch'});},'primary'));
            else if(item.id===17172){const b=button(save.pet?'喂养宠物':'先孵化一只宠物',()=>{dialog.close();cb.action({type:'feed'});},'primary');b.disabled=!save.pet||save.pet.xp>=c.pet.levels.max_exp;footer.append(b);}
            else if(item.stats?.[70]!==undefined&&item.stats?.[71]!==undefined){
                const gain=dragonTotemItemExperience(save,c,item.id);
                const use=button(gain?`使用 · 图腾经验 +${gain}`:'图腾道具暂不可用',()=>{
                    if(!globalThis.confirm(`使用1个${item.name}，增加${gain}点图腾经验？`))return;
                    dialog.close();cb.action({type:'use-totem-item',itemId:item.id});
                },'primary');
                use.disabled=!gain||!!save.pendingEncounter;footer.append(use);
            }
            else if(!rune)detail.append(el('p','muted','旅途收藏 · 本章暂无主动使用功能'));
        }
        const quests=c.quests.filter(q=>q.rewards.some(group=>group.items.some(row=>row.id===item.id)));
        if(quests.length)detail.append(el('p','equipment-source',`获取途径：${quests.map(q=>q.title).join('、')}`));
    }
    paintList();
    return {openDetail};
}
