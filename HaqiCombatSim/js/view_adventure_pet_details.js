import { petParams, STAGE_NAMES } from './adventure_pets_core.js';
// A native nested dialog keeps the shop filters, page and scroll position intact.
export function showPetDetails(assets,id,portrait,{el,button}) {
    const def=assets.content.pets[id];
    const trigger=document.activeElement,dialog=el('dialog','modal pet-growth-modal');
    dialog.setAttribute('aria-label',`${def.name} · 四阶段与卡片`);
    const close=()=>dialog.close();
    const exit=button('×',close,'close-button');exit.setAttribute('aria-label','关闭宠物详情');
    dialog.append(el('header','modal-header',el('div','',el('p','eyebrow','宠物图鉴 · 成长与魔法'),el('h2','',def.name)),exit));
    const body=el('div','modal-body'),stages=el('div','pet-growth-stages');
    // Resolve the same balance parameters as gameplay; no duplicate level rules.
    const p=petParams(assets.content);
    for(let i=0;i<4;i++)stages.append(el('section','pet-growth-stage',portrait(assets,id,i,96),el('h3','',STAGE_NAMES[i]),el('p','muted',`${p.stageLevels[i]}级解锁 · 卡包 ${p.petCapacities[i]} 张`)));
    body.append(stages,el('h3','','可学习卡片'));
    const lessons=el('div','pet-growth-lessons');
    for(const lesson of [...def.lessons].sort((a,b)=>a.level-b.level))lessons.append(el('div','pet-growth-lesson',el('span','badge',`${lesson.level}级`),el('span','',assets.dataset.cards[lesson.key]?.name||lesson.key)));
    body.append(lessons);dialog.append(body);document.body.append(dialog);
    dialog.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close();}});
    dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
    dialog.addEventListener('close',()=>{dialog.remove();if(trigger?.isConnected)trigger.focus({preventScroll:true});},{once:true});
    dialog.showModal();exit.focus();
}
