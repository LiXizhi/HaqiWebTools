import {el,button} from './view_adventure.js';
import {socialActionOptions} from './adventure_social_actions_core.js';

export function socialActionsHeading(state){
    const p=state.selected;if(!p)return '伙伴互动';
    const friend=p.kind==='account'&&state.friends.some(f=>f.userId===String(p.userId));
    const affinity=state.actionAffinity==null?'':` · ${friend?'好感度':'临时好感'} ${state.actionAffinity}`;
    return `${p.name} · ${friend?'好友':'陌生人'}${affinity}`;
}
export function renderSocialActions(box,body,state,cb){
    box.classList.add('social-actions-modal');
    const p=state.selected,friend=p.kind==='account'&&state.friends.some(f=>f.userId===String(p.userId));
    const heading=socialActionsHeading(state),title=box.querySelector?.('.modal-header h2');
    if(title)title.textContent=heading;
    box.setAttribute?.('aria-label',heading);
    if(p.kind==='account')body.append(el('small','muted social-actions-note','当前互动由公开角色的 AI 代理回应'));
    const list=el('div','social-action-list');
    const add=(label,icon,detail,fn,disabled=false)=>{const b=button('',fn,'social-action-item');b.disabled=disabled||state.busy;b.setAttribute('aria-label',label);const i=el('span','social-action-icon',icon);i.setAttribute('aria-hidden','true');b.append(i,el('span','social-action-copy',el('strong','',label),el('small','',detail)));list.append(b);};
    const actions=socialActionOptions({profile:p,friend,affinity:state.actionAffinity,content:cb.assets().content});
    const greet=actions.shift();
    const joined=state.team.some(t=>t.id===p.id);
    add(joined?'管理队伍':'邀请组队','⚑',joined?'一起出发冒险':'加入当前冒险队伍',()=>joined?cb.open('social-party'):cb.invite(p),state.coopActive||!joined&&state.team.length>=3);
    add(greet.label,greet.icon,greet.detail,()=>cb.gesture(greet.id));
    if(p.kind==='account')add(friend?'好友列表':'加好友','＋',friend?'查看已有好友':'发送好友申请',()=>friend?cb.friends():state.owner?cb.friend(p):cb.login());
    for(const a of actions)add(a.label,a.icon,a.detail,()=>cb.gesture(a.id),a.disabled);
    add('聊一聊','☏','自由交谈与语言练习',()=>cb.talk(p));
    add('查看信息','ⓘ','打开完整人物面板',()=>cb.profile(p));
    body.append(list);
    box.onkeydown=event=>{
        const buttons=[...box.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cb.close();return;}
        if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
            event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();
        }else if(event.key==='Tab'&&((event.shiftKey&&index===0)||(!event.shiftKey&&index===buttons.length-1))){event.preventDefault();buttons[event.shiftKey?buttons.length-1:0]?.focus();}
    };
    requestAnimationFrame(()=>{if(box.isConnected)list.querySelector('button:not(:disabled)')?.focus();});
}
