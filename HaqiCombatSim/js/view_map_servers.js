import {DetailDialog} from './view_detail_dialog.js';
import {setText,fill} from './locale_runtime.js';

const el=(tag,className='',...children)=>{const node=document.createElement(tag);node.className=className;for(const child of children){if(typeof child==='string'){const span=document.createElement('span');setText(span,child);node.append(span);}else node.append(child);}return node;};
const button=(text,action)=>{const node=el('button','secondary',text);node.type='button';node.onclick=action;return node;};
const labels={green:'流畅',crowded:'拥挤',full:'已满',unavailable:'维护中'};

// IO and session ownership stay in the controller; closing this view cancels its reads.
export function mountMapServers(root,cb){
    const header=root.querySelector('.atlas-map-modal .modal-header');
    if(!header)return ()=>{};
    const trigger=button('游戏服未连接',()=>{detail.open(trigger);void load(1);});
    trigger.classList.add('map-server-trigger');trigger.setAttribute('aria-haspopup','dialog');
    header.insertBefore(trigger,header.querySelector('.close-button'));
    const detail=new DetailDialog(root,{el,title:'选择服务器',className:'equipment-item-dialog map-server-dialog'});
    const message=el('p','map-server-message'),grid=el('div','map-server-grid'),pager=el('div','map-server-pager');
    message.setAttribute('role','status');detail.body.replaceChildren(message,grid,pager);
    let disposed=false,request=null,page=1,pages=1,rows=[];
    const update=()=>{
        const state=cb.state()||{};
        setText(trigger,state.connected?fill('服务器 {id}',{id:state.instanceId}).text:'游戏服未连接');
        trigger.classList.toggle('connected',!!state.connected);trigger.title=state.message||'';
        if(detail.dialog.open){setText(message,state.message||'游戏服未连接');renderRows();}
    };
    function renderRows(){
        const current=cb.state();grid.replaceChildren();
        for(const row of rows){
            const selected=current?.connected&&current.instanceId===row.id;
            const item=button('',()=>{try{cb.switchInstance(row.id);update();}catch(error){setText(message,error.message);}});
            item.classList.add('map-server-item');item.dataset.status=labels[row.status]?row.status:'unavailable';
            item.setAttribute('aria-pressed',String(selected));
            item.replaceChildren(el('strong','',fill('服务器 {id}',{id:row.id}).text),el('span','map-server-load',labels[row.status]||'维护中'),el('small','',`${row.playerCount} / ${row.capacity}`));
            if(selected)item.append(el('small','','当前服务器'));
            item.disabled=selected||!['green','crowded'].includes(row.status);grid.append(item);
        }
    }
    async function load(next){
        request?.abort();const task=new AbortController();request=task;rows=[];grid.replaceChildren();pager.replaceChildren();setText(message,'正在读取服务器列表…');
        try{
            const data=await cb.list(next,{signal:task.signal});
            if(disposed||task.signal.aborted||!detail.dialog.open)return;
            page=data.page;pages=data.pages;rows=data.instances;update();
            if(!rows.length)setText(message,'暂无可用服务器');
            const prev=button('上一页',()=>void load(page-1)),nextButton=button('下一页',()=>void load(page+1)),refresh=button('刷新',()=>void load(page));
            prev.disabled=page<=1;nextButton.disabled=page>=pages;
            const jump=el('input');jump.type='number';jump.min='1';jump.max=String(pages);jump.value=String(page);jump.setAttribute('aria-label','页码');
            const go=()=>void load(Math.max(1,Math.min(pages,Math.floor(Number(jump.value))||1)));
            jump.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();go();}};
            pager.append(prev,el('span','',fill('第 {page} / {pages} 页',{page,pages}).text),nextButton,jump,button('跳转',go),refresh);
        }catch(error){if(disposed||task.signal.aborted)return;setText(message,error.message);pager.append(button('重试',()=>void load(next)));}
    }
    detail.dialog.addEventListener('close',()=>request?.abort());
    const unsubscribe=cb.subscribe(update);update();
    return ()=>{disposed=true;request?.abort();unsubscribe();detail.destroy();trigger.remove();};
}
