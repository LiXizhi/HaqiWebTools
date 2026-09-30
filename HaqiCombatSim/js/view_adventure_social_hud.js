// DOM-only HUD controls; all network/state changes belong to the controller.
export function socialHudButton(label,kind,unread,onOpen){
    const b=document.createElement('button');b.type='button';b.className='mount-toggle social-hud-button';b.dataset.social=kind;b.title=label;b.setAttribute('aria-label',unread?`${label}，有未读通知`:label);
    const mark=document.createElementNS('http://www.w3.org/2000/svg','svg');mark.setAttribute('viewBox','0 0 24 24');mark.setAttribute('width','24');mark.setAttribute('height','24');mark.setAttribute('aria-hidden','true');mark.classList.add('social-symbol');const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',kind==='mail'?'M3 5h18v14H3z M3 6l9 7 9-7':'M4 4h16v12H10l-6 5V4z M8 9h8 M8 12h5');path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.8');path.setAttribute('stroke-linejoin','round');mark.append(path);b.append(mark);
    const dot=document.createElement('span');dot.className='social-unread';dot.hidden=!unread;dot.setAttribute('aria-hidden','true');b.append(dot);b.onclick=()=>onOpen(kind);return b;
}
export function teamHudButton(team,coopRun,onOpen){
    const members=coopRun?.members||team||[];
    const count=1+members.filter(Boolean).length;
    if(count===1&&!coopRun)return null;
    const b=socialHudButton('队伍管理','social-party',false,onOpen);
    b.title=`队伍管理（${count}人）`;b.setAttribute('aria-label',b.title);
    b.classList.add('team-hud-button');
    b.querySelector('path').setAttribute('d','M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M2 21v-2a7 7 0 0 1 14 0v2 M16 5a3 3 0 0 1 0 6 M18 14a5 5 0 0 1 4 5v2');
    const badge=document.createElement('span');badge.className='team-hud-count';badge.textContent=String(count);badge.setAttribute('aria-hidden','true');b.append(badge);
    return b;
}
export function bindDungeonMenu(button,onOpen){
    button.setAttribute('aria-expanded','false');button.setAttribute('aria-haspopup','true');
    const menu=document.createElement('div');menu.className='dungeon-entry-menu';menu.hidden=true;
    const hide=(focus=false)=>{menu.hidden=true;button.setAttribute('aria-expanded','false');if(focus)button.focus();};
    for(const [label,key]of [['PvE 组队副本','dungeons'],['PvP 红蘑菇赛场','social-pvp']]){const row=document.createElement('button');row.type='button';row.textContent=label;row.onclick=()=>{hide();onOpen(key);};menu.append(row);}
    const wrapper=document.createElement('div');wrapper.className='dungeon-entry';button.replaceWith(wrapper);wrapper.append(button,menu);
    button.onclick=()=>{if(!menu.hidden)hide();else{menu.hidden=false;button.setAttribute('aria-expanded','true');menu.firstElementChild.focus();}};
    wrapper.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();hide(true);}if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();const rows=[...menu.children],index=rows.indexOf(document.activeElement);rows[(index+(e.key==='ArrowDown'?1:rows.length-1))%rows.length].focus();}});
    wrapper.addEventListener('focusout',e=>{if(!wrapper.contains(e.relatedTarget))hide();});
    // Capture on the HUD itself, so replacement of HUD nodes removes the listener too.
    const root=wrapper.closest('#hud')||wrapper.parentElement;root.socialMenuAbort?.abort();root.socialMenuAbort=new AbortController();document.addEventListener('pointerdown',e=>{if(!wrapper.contains(e.target))hide();},{capture:true,signal:root.socialMenuAbort.signal});
}
