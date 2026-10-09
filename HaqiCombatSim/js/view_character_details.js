import {DetailDialog} from './view_detail_dialog.js';
import {ItemDetails} from './view_adventure_item_details.js';
import {el,button} from './view_adventure.js';
import {giftEligibility} from './character_relationship_core.js';

export function createCharacterDetails(parent,{getModel,onGift,onHistory,onList,onSelect}){
    const dialog=new DetailDialog(parent,{el,title:'关系详情'});let itemDetails;
    function relation(record){
        dialog.body.replaceChildren(el('h3','',record.peer.name),el('p','',`好感度 ${record.affinity} / 100${record.temporary?' · 临时':''} · 初次相遇 ${record.initialAffinity}`),el('p','',record.summary||'你们的故事刚刚开始。'));
        for(const event of record.events.slice(-10).reverse())dialog.body.append(el('p','',`${event.before} → ${event.after} · ${event.reason}`));
        const history=el('div','relationship-history');dialog.body.append(history);
        const append=messages=>{for(const row of messages)history.append(el('p','',`${row.role==='user'?'我':record.peer.name}：${row.text}`));};
        append(record.messages);
        let cursor=record.history;
        const more=button('更早的对话',async()=>{more.disabled=true;try{const page=await onHistory(cursor);append(page.messages);cursor=page.previous;more.hidden=!cursor;}catch(e){dialog.body.append(el('p','',e.message));}finally{more.disabled=false;}},'secondary');more.hidden=!cursor;
        dialog.footer.replaceChildren(more,button('所有关系',()=>void listing(),'secondary'));dialog.open();
    }
    async function listing(){
        dialog.body.replaceChildren(el('h3','','交流过的角色'));dialog.footer.replaceChildren();let cursor=0;
        const more=button('加载更多',async()=>{more.disabled=true;try{const page=await onList(cursor);for(const row of page.rows)dialog.body.append(button(`${row.name} · 好感度 ${row.affinity}`,()=>{dialog.close();onSelect(row.id);},'secondary'));cursor=page.next;more.hidden=cursor===null;if(!page.rows.length)dialog.body.append(el('p','','还没有关系记录'));}catch(e){dialog.body.append(el('p','',e.message));}finally{more.disabled=false;}},'secondary');dialog.footer.append(more);more.click();
    }
    function gifts(profile,rules){
        const model=getModel();dialog.body.replaceChildren(el('h3','',`送礼物给${profile.name}`));dialog.footer.replaceChildren();
        const rows=Object.entries(model.save.inventory).filter(([,n])=>n>0).map(([id,n])=>({id,n,item:model.assets.content.items[id]})).filter(row=>row.item);
        for(const row of rows){
            const reason=giftEligibility(model.save,model.assets.content,rules,row.id),line=el('div','relationship-gift-row');
            const preview=button(`${row.item.name} × ${row.n}`,()=>{itemDetails?.destroy();itemDetails=new ItemDetails(dialog.dialog,model,{el});itemDetails.show(row.item);},'secondary');
            const choose=button('选择',()=>confirm(row),'primary');choose.disabled=!!reason;line.append(preview,choose);if(reason)line.append(el('small','muted',reason));dialog.body.append(line);
        }
        if(!rows.length)dialog.body.append(el('p','','背包中没有物品'));dialog.open();
        function confirm(row){
            dialog.body.replaceChildren(el('p','',`将实际扣除${row.item.name}并赠送给${profile.name}。`));
            const quantity=el('input');quantity.type='number';quantity.min='1';quantity.max=String(row.n);quantity.value='1';quantity.setAttribute('aria-label','赠送数量');dialog.body.append(quantity);
            const submit=button('确认赠送',async()=>{submit.disabled=true;try{await onGift(row.id,Number(quantity.value));dialog.close();}catch(e){dialog.body.append(el('p','',e.message));submit.disabled=false;}},'primary');dialog.footer.replaceChildren(button('返回物品',()=>gifts(profile,rules),'secondary'),submit);
        }
    }
    return {relation,gifts,close(){itemDetails?.destroy();dialog.close();}};
}
