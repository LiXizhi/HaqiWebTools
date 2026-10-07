import {createCloseButton} from './view_adventure_controls.js';
import {createDialogueMicrophone} from './view_dialogue_microphone.js';
import {tr,fill} from './locale_runtime.js';
const el=(tag,cls,text='')=>{const n=document.createElement(tag);n.className=cls;n.textContent=tr(text);return n;};
const button=(text,fn,cls='secondary')=>{const n=el('button',cls,text);n.type='button';n.onclick=fn;return n;};
export function createCompanionChatView(cb){
    const root=el('section','companion-controls'),toggle=button('交给 AI',cb.toggle),body=el('div','companion-chat');
    toggle.className='mount-toggle companion-controller-toggle';
    toggle.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3v3M9 3h6M4 10H2m20 0h-2M7 20v2m10-2v2"/><rect x="4" y="6" width="16" height="14" rx="4"/><circle cx="8" cy="11" r="1"/><circle cx="16" cy="11" r="1"/><path d="M8 16h8"/></svg>';
    const position=()=>{const anchor=document.querySelector('.local-secondary-toolbar');if(!anchor)return;const box=anchor.getBoundingClientRect(),mount=anchor.querySelector('.mount-toggle')?.getBoundingClientRect();root.style.left=`${mount?mount.right+4:box.left}px`;root.style.top=`${box.top}px`;};
    const title=el('strong','','同行伙伴'),header=el('header','');header.append(title,createCloseButton(()=>{body.hidden=true;},'收起陪伴聊天'));
    const log=el('div','companion-chat-log'),status=el('p','muted'),form=el('form','companion-chat-form'),input=el('input','');
    input.type='text';input.maxLength=2000;input.placeholder=tr('和队友说点什么');input.setAttribute('aria-label',tr('给 AI 队友的消息'));
    const send=button('发送',()=>form.requestSubmit(),'primary');
    form.onsubmit=e=>{e.preventDefault();if(input.value.trim()){const text=input.value;input.value='';cb.send(text);}};
    input.addEventListener('focus',()=>cb.focus?.());
    const mic=createDialogueMicrophone(button,{start:cb.record,finish:cb.finish,cancel:cb.cancel,isRecording:cb.isRecording});
    form.append(input,send,mic.node);
    const mute=button('关闭朗读',cb.mute),repeat=button('再次朗读',cb.repeat),clear=button('清除本机记忆',cb.clear),quiet=button('安静陪伴',cb.quiet),follow=button('跟着我',cb.follow);
    const memory=el('details',''),summary=el('summary','','本机共同记忆'),notes=el('p','');memory.append(summary,notes);
    const suggestions=el('div','companion-suggestions');
    const tools=el('div','companion-chat-tools');tools.append(mute,repeat,quiet,follow,clear);
    body.append(header,log,status,suggestions,form,tools,memory);root.append(toggle,body);root.hidden=true;body.hidden=true;document.body.append(root);
    return {root,position,get opened(){return !body.hidden;},render(m){
        root.hidden=!m.active||m.inBattle;toggle.title=tr(m.ai?'接管第二角色':'第二角色交给 AI');toggle.setAttribute('aria-label',toggle.title);toggle.setAttribute('aria-pressed',String(!!m.ai));toggle.disabled=!!m.switching;position();
        body.hidden=body.hidden||!m.ai;title.textContent=fill('{name} · AI 陪伴',{name:m.name||tr('队友')}).text;
        status.textContent=tr(m.status||'');mute.textContent=tr(m.muted?'开启朗读':'关闭朗读');quiet.textContent=tr(m.quiet?'恢复主动交流':'安静陪伴');
        input.disabled=send.disabled=!!m.busy||!m.ai;mic.update({phase:m.phase,disabled:!m.ai||m.busy});
        notes.textContent=[m.memory?.summary,...(m.memory?.events||[])].filter(Boolean).join('\n')||'还没有共同记忆。仅保存在本机。';
        log.replaceChildren();for(const row of m.memory?.messages||[]){const entry=el('div',`companion-line ${row.role}`,`${row.role==='user'?'你':m.name}：${row.text}`);if(row.translation&&row.translation!==row.text){const d=el('details','');d.append(el('summary','','查看释义'),el('p','',row.translation));entry.append(d);}log.append(entry);}log.scrollTop=log.scrollHeight;
        suggestions.replaceChildren();for(const suggestion of m.suggestions||[])suggestions.append(button(suggestion.label,()=>cb.suggest(suggestion)));
    },open(){body.hidden=false;input.focus();}};
}
