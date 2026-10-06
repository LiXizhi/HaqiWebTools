import {el,button} from './view_adventure.js';
import {fill,tr} from './locale_runtime.js';
import {drawSchoolIcon} from './card_renderer.js';

const schoolNames={fire:'烈火',ice:'寒冰',storm:'风暴',life:'生命',death:'死亡'};

function schoolIcon(school){
    const label=schoolNames[school]||tr('魔法');
    const canvas=el('canvas','scene-player-school');canvas.width=48;canvas.height=48;
    canvas.setAttribute('role','img');canvas.setAttribute('aria-label',fill('{school}系',{school:label}).text);canvas.title=label;
    const context=canvas.getContext('2d');if(context)drawSchoolIcon(context,school in schoolNames?school:'balance',24,24,36);
    return canvas;
}

function genderIcon(appearance){
    const girl=appearance==='girl';
    const label=tr(girl?'女':'男');
    const node=el('span',`scene-player-gender is-${girl?'girl':'boy'}`);
    node.setAttribute('role','img');node.setAttribute('aria-label',label);node.title=label;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 16 16');svg.setAttribute('aria-hidden','true');
    const path=document.createElementNS(svg.namespaceURI,'path');
    // Compact Mars / Venus marks; keep stroke readable at 14px.
    path.setAttribute('d',girl
        ?'M8 2.2a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8zm0 6.8v5.4m-2.2-2.2h4.4'
        :'M10.2 2.2h3.6v3.6M13.8 2.2 9.4 6.6A3.6 3.6 0 1 0 11 9.4L13.8 2.2z');
    path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.6');
    path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');
    svg.append(path);node.append(svg);return node;
}

function vipBadge(){
    const badge=el('span','scene-player-vip',tr('魔法星'));
    badge.title=tr('魔法星');badge.setAttribute('aria-label',tr('魔法星'));
    return badge;
}

function scenePlayerTitle(p){
    const title=el('span','scene-player-title',el('strong','',p.name));
    if(p.isVip===true)title.append(vipBadge());
    title.append(genderIcon(p.appearance));
    return title;
}

// Real friend messaging only; never substitute an AI response for the recipient.
export function renderFriendChat(box,body,state,cb){
    box.classList.add('friend-chat-modal');
    const friend=state.friends?.find(f=>String(f.userId)===String(state.chatPeer));
    const avatar=f=>el('span','friend-chat-avatar',(f.name||'好友').slice(0,1));
    if(friend){
        box.classList.add('is-conversation');box.querySelector('h2').textContent=friend.name;box.setAttribute('aria-label',fill(`与{v0}私聊`,{v0:String(friend.name)}).text);
        const header=el('div','friend-chat-peer',button('返回好友',cb.chatBack,'secondary'),avatar(friend),el('span','',friend.name));body.append(header);
        const log=el('div','friend-chat-messages');log.setAttribute('role','log');log.setAttribute('aria-label','聊天记录');
        for(const m of state.messages||[]){const mine=String(m.senderId)===String(state.userId);log.append(el('article',`friend-chat-message${mine?' is-player':''}`,el('span','friend-chat-avatar',mine?'我':friend.name.slice(0,1)),el('p','friend-chat-bubble',m.text)));}
        if(!state.messages?.length)log.append(el('p','friend-chat-empty',state.chatAvailable?'和好友聊聊吧':'私聊服务尚未开通，暂时无法加载或发送消息。'));
        const form=el('form','friend-chat-composer'),inputBox=el('div','friend-chat-input-box'),input=el('input');input.placeholder='输入消息';input.setAttribute('aria-label','私聊消息');input.maxLength=2000;input.value=state.chatDraft||'';input.oninput=()=>cb.draft('chatDraft',input.value);
        const menu=el('div','friend-chat-menu');menu.hidden=true;menu.setAttribute('role','group');menu.setAttribute('aria-label','更多聊天操作');
        const more=button('+',()=>toggle(menu.hidden),'friend-chat-more');more.setAttribute('aria-label','更多聊天操作');more.setAttribute('aria-expanded','false');
        function toggle(open){menu.hidden=!open;more.setAttribute('aria-expanded',String(open));}
        menu.append(button('写邮件',()=>cb.compose(friend),'secondary'),button('管理好友',cb.friends,'secondary'));menu.addEventListener('click',()=>toggle(false));
        box.addEventListener('pointerdown',e=>{if(!menu.contains(e.target)&&!more.contains(e.target))toggle(false);});
        box.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){e.preventDefault();e.stopPropagation();toggle(false);more.focus();}});
        const send=button('发送',()=>{if(input.value.trim())cb.sendChat(input.value);},'primary');send.disabled=!!state.busy||!state.chatAvailable;form.onsubmit=e=>{e.preventDefault();if(!send.disabled)send.click();};
        inputBox.append(input,more,menu);form.append(inputBox,send);body.append(log,form);
        queueMicrotask(()=>{if(log.isConnected)log.scrollTop=log.scrollHeight;});
        return;
    }
    const tab=state.chatTab==='friends'?'friends':'scene';
    const tabs=el('div','gui-tabs friend-chat-tabs');
    for(const [key,label]of [['scene','场景中的玩家'],['friends','我的好友']]){
        const b=button(label,()=>cb.chatTab(key));b.setAttribute('aria-pressed',String(tab===key));tabs.append(b);
    }
    body.append(tabs);
    if(tab==='scene'){renderScenePlayers(body,state,cb);return;}
    renderFriendList(body,state,cb,avatar);
}

function renderScenePlayers(body,state,cb){
    const players=state.scenePlayers||[];
    const tools=el('div','friend-chat-tools',el('span','muted',fill('本场景 · {count}',{count:players.length}).text),button('刷新',cb.refresh,'secondary'));
    tools.querySelectorAll('button').forEach(b=>b.disabled=!!state.busy);body.append(tools);
    const search=el('input','social-compose');search.placeholder='搜索玩家';search.setAttribute('aria-label','搜索玩家');
    const list=el('div','friend-chat-list');list.setAttribute('aria-label','场景中的玩家');
    const empty=el('p','muted',players.length?'没有找到玩家':'当前场景还没有其他玩家。');
    const draw=()=>{
        const query=search.value.trim().toLocaleLowerCase();list.replaceChildren();
        for(const p of players.filter(p=>`${p.name} ${schoolNames[p.school]||''}`.toLocaleLowerCase().includes(query))){
            const meta=fill('{level} 级',{level:p.level||1}).text;
            const row=el('div','friend-chat-row scene-player-row');
            const open=button('',()=>cb.profile?.(p),'friend-chat-row-main');open.disabled=!!state.busy||!cb.profile;
            open.append(schoolIcon(p.school),el('span','friend-chat-row-copy',scenePlayerTitle(p),el('small','',meta)));
            const teleport=button('传送',()=>cb.teleportPlayer?.(p),'secondary scene-player-teleport');
            teleport.disabled=!!state.busy||!p.position||!cb.teleportPlayer;
            teleport.setAttribute('aria-label',fill('传送到{name}身边',{name:p.name}).text);
            row.append(open,teleport);list.append(row);
        }
        empty.hidden=!!list.childElementCount;
    };
    search.oninput=draw;body.append(search,list,empty);draw();
}

function renderFriendList(body,state,cb,avatar){
    if(!state.owner){
        body.append(el('p','','登录后可以与好友私聊。'),button('登录 Keepwork',cb.login,'primary'));
        return;
    }
    const tools=el('div','friend-chat-tools',el('span','muted',fill(`全部好友 · {v0}`,{v0:String(state.friends.length)}).text),button('刷新',cb.refresh,'secondary'),button('管理好友',cb.friends,'secondary'));
    tools.querySelectorAll('button').forEach(b=>b.disabled=!!state.busy);body.append(tools);
    const search=el('input','social-compose');search.placeholder='搜索好友';search.setAttribute('aria-label','搜索好友');
    const list=el('div','friend-chat-list');list.setAttribute('aria-label','所有好友');
    const empty=el('p','muted',state.friends.length?'没有找到好友':'还没有好友，可以从伙伴名片添加。');
    const draw=()=>{const query=search.value.trim().toLocaleLowerCase();list.replaceChildren();
        for(const f of state.friends.filter(f=>`${f.name} ${f.username||''}`.toLocaleLowerCase().includes(query))){
            const conversation=state.conversations.find(c=>String(c.peerId)===String(f.userId));
            const row=button('',()=>cb.privateChat(f),'friend-chat-row');row.disabled=!!state.busy;
            row.append(avatar(f),el('span','friend-chat-row-copy',el('strong','',f.name),el('small','',conversation?.latest?.text||'点击开始聊天')));
            if(conversation?.unread)row.append(el('span','friend-chat-unread',String(conversation.unread)));list.append(row);
        }empty.hidden=!!list.childElementCount;};
    search.oninput=draw;body.append(search,list,empty);draw();
}
