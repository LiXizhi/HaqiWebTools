import {BATTLE_CHAT} from './battle_chat_core.js';
import {tr} from './locale_runtime.js';

export function createBattleChat({el,button,onSend,disabled=false,tactical=true}){
    const panel=el('details','battle-chat');
    const glyph=el('span','battle-chat-icon');
    glyph.setAttribute('aria-hidden','true');
    glyph.innerHTML='<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h18a4 4 0 0 1 4 4v13a4 4 0 0 1-4 4H13l-7 5v-5a4 4 0 0 1-3-4V8a4 4 0 0 1 4-4Z"/><circle cx="16" cy="14" r="7"/><path d="M13 12v.5m6-.5v.5m-6 4q3 3 6 0"/></svg>';
    const trigger=el('summary','secondary',glyph);
    trigger.setAttribute('aria-label',tr('对白与表情'));trigger.title=tr('对白与表情');
    const menu=el('div','battle-chat-menu');
    if(tactical)menu.append(el('small','',tr('求助影响下一回合，队友会按可用卡牌响应。')));
    for(const row of BATTLE_CHAT){
        const action=button(row.emoji||row.text,()=>{onSend(row.id);panel.open=false;trigger.focus();},'secondary');
        action.disabled=disabled;action.setAttribute('aria-label',tr(row.text));
        menu.append(action);
    }
    panel.append(trigger,menu);
    panel.onkeydown=event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();panel.open=false;trigger.focus();}};
    panel.onfocusout=event=>{if(!panel.contains(event.relatedTarget))panel.open=false;};
    return panel;
}
