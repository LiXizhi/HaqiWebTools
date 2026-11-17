import {describeCard} from '../../card_description_core.js';
import {heroPortrait} from '../../hero_renderer.js';
import {tr} from '../../locale_runtime.js';
import {createCardFace} from '../../view_adventure_card.js';
import {createCloseButton} from '../../ui/controls.js';

export function el(tag,cls,...children) {
    const n=document.createElement(tag);if(cls)n.className=cls;
    const sources=[];
    for(const child of children.flat(Infinity)){
        if(child===null||child===undefined||child===false)continue;
        if(child instanceof Node)n.append(child);
        else {const source=String(child);sources.push(source);n.append(document.createTextNode(tr(source)));}
    }
    if(sources.length===1&&n.childNodes?.length===1&&n.childNodes[0].nodeType===3&&n.dataset)n.dataset.zh=sources[0];
    return n;
}
export function button(label,fn,cls='') {const b=el('button',cls,label);b.type='button';b.onclick=fn;return b;}
// Shared disabled overlay for the mount and bilingual-learning controls.
export function disabledModeMark(){
    const stop=el('span','mount-emoji-stop');
    stop.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="#6f6f6f" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="11.3"/><path d="M4 4l16 16"/></svg>';
    return stop;
}

export const paths={home:'M3 11l9-8 9 8 M5 10v11h14V10 M9 21v-8h6v8',book:'M4 4h6q2 0 2 2q0-2 2-2h6v15h-6q-2 0-2 2q0-2-2-2H4z M12 6v15',cards:'M5 5h12v15H5z M8 2h12v15',bag:'M5 8h14v12H5z M8 8V5a4 4 0 0 1 8 0v3',pet:'M8 13q4-5 8 0q6 7-4 6q-10 1-4-6 M5 6v3 M10 3v4 M15 3v4 M20 6v3',settings:'M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2 M16 12a4 4 0 1 1-8 0a4 4 0 1 1 8 0',map:'M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2z M9 3v16 M15 5v16',sound:'M4 10h4l5-5v14l-5-5H4z M17 8q5 4 0 8',arrow:'M5 12h14 M13 6l6 6-6 6'};
paths.gourd='M10 2h4v3c4 1 4 6 1 8 7 3 6 9-3 9S2 16 9 13C6 11 6 6 10 5z M8 13h8 M14 12l5 4';
paths.dungeon='M3 21V9h4V5h3V3h4v2h3v4h4v12H3 M9 21v-7a3 3 0 0 1 6 0v7 M5 12v2 M19 12v2';
paths.cloud='M6 18a4 4 0 0 1-1-8 7 7 0 0 1 13-2 5 5 0 0 1 0 10 M12 20V10 M8 14l4-4 4 4';
paths.close='M6 6l12 12 M18 6L6 18';
paths.shop='M3 9l2-6h14l2 6 M3 9v3h18V9 M5 12v9h14v-9 M9 21v-6h6v6';
// 坐骑名称 → emoji：关键词按从具体到一般排序（如“狼蛛”先于“狼”），未命中回落为抱抱龙 🐲。
const mountEmojiKeys=[['狼蛛','🕷️'],['机器人','🤖'],['雪地车','🚙'],['南瓜车','🎃'],['飞毯','🪄'],['扫帚','🧹'],['凤凰','🦅'],['鹰','🦅'],['羽','🪶'],['龙','🐲'],['虎','🐯'],['狼','🐺'],['马','🐎'],['驹','🐎'],['龟','🐢'],['海豚','🐬'],['鲨','🦈'],['鲸','🐳'],['猛犸','🦣'],['狐','🦊'],['兔','🐰'],['象','🐘'],['鹿','🦌'],['鸵鸟','🦤'],['鼠','🐭'],['牛','🐂'],['蛇','🐍'],['羊','🐑'],['猴','🐒'],['鸡','🐔'],['狗','🐶'],['猪','🐷'],['鸟','🐦'],['车','🚗']];
export function mountEmoji(name) {const text=String(name||'');return (mountEmojiKeys.find(([key])=>text.includes(key))||[])[1]||'🐲';}
export function icon(kind) {const span=el('span','icon');span.dataset.uiIcon=kind;span.setAttribute('aria-hidden','true');span.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[kind]||paths.book}"/></svg>`;return span;}
export function art(assets,ref,w=76,h=90,cls='') {
    const tall=ref?.fit==='height';
    const c=el('canvas',`art ${cls}${tall?' portrait-height':''}`);
    // Height-fit portraits need a wider bitmap so wing tips are drawn, then CSS lets them overflow the slot.
    const bw=tall?Math.ceil(h*2*1.75):w*2,bh=h*2;
    c.width=bw;c.height=bh;c.style.width=`${bw/2}px`;c.style.height=`${h}px`;
    assets.draw(c.getContext('2d'),ref,0,0,c.width,c.height);return c;
}
export function tile(assets,sheet,index,w=90,h=95) {if(sheet==='sprites'&&index>=8&&index<16)return heroPortrait(assets,{appearance:index>=12?'girl':'boy'},w,h,{facing:index%4});const c=el('canvas','art');c.width=w*2;c.height=h*2;c.style.width=`${w}px`;c.style.height=`${h}px`;assets.tile(c.getContext('2d'),sheet,index,0,0,c.width,c.height);return c;}
export function badge(text,cls=''){return el('span',`badge ${cls}`,text);}
export const schoolDescription={fire:'火焰与持续伤害，点燃你的热情。',ice:'坚固的护盾与寒冰魔法，稳步迎战。',storm:'强力的单体攻击，让雷霆为你而鸣。',life:'治疗与自然的力量，守护生命。',death:'吸取生命、布下陷阱，掌握幽暗魔法。'};
// 标题按设计字号排成一行；超出左栏时再缩小字号和字距，避免日语等较长译名折行。
export function fitGameTitle(title) {
    const box=title?.parentElement;if(!box)return;
    let observer;
    const apply=()=>{
        if(!title.isConnected){observer?.disconnect();return;}
        title.style.fontSize='';title.style.letterSpacing='';
        const limit=box.clientWidth;if(limit<8||title.scrollWidth<=limit+1)return;
        const size=parseFloat(getComputedStyle(title).fontSize)||32;
        const spacing=parseFloat(getComputedStyle(title).letterSpacing);
        const ratio=limit/title.scrollWidth;
        title.style.fontSize=`${Math.max(22,Math.floor(size*ratio))}px`;
        title.style.letterSpacing=`${Math.max(0,(Number.isFinite(spacing)?spacing:0)*ratio)}px`;
        if(title.scrollWidth>limit+1)title.style.fontSize=`${Math.max(22,Math.floor(parseFloat(title.style.fontSize)*limit/title.scrollWidth))}px`;
    };
    apply();
    if(typeof ResizeObserver==='function'){observer=new ResizeObserver(apply);observer.observe(box);}
}
export function modal(root,title,subtitle,cb,wide=false) {
    const localClasses=[...root.classList].filter(name=>name.startsWith('local-'));
    root.replaceChildren();root.className='overlay visible';root.classList.add(...localClasses);
    const box=el('section',`modal ${wide?'wide':''}`);box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label',tr(title));
    const close=createCloseButton(cb.close);
    box.append(el('header','modal-header',el('div','',el('p','eyebrow',subtitle),el('h2','',title)),close));const body=el('div','modal-body');box.append(body);root.append(box);
    return body;
}
export function spellHint(card,d) {
    return describeCard(card,{dataset:d,translate:tr}).summary;
}
export function spellFace(assets,card,artCard=card) {
    // kids pe_item.DrawCardMask: 151×230, pips (120,5), cooldown (7,115), description (18,142).
    // Shared background + generated subject; title/numbers/description stay dynamic.
    const cost=card.pipcost===114||card.pipcost==='X'||Number(card.pipcost)<0?'X':String(card.pipcost);
    const rounds=card.params.cooldown??0;
    const description=artCard.wordDescription||spellHint(card,assets.dataset);
    const base=assets.effects.cards[card.key]?.base;
    return createCardFace({el,name:artCard.name,cost,cooldown:rounds,description,
        draw:context=>{const drawn=assets.skillArt.drawCard(context,card,{name:artCard.name,cooldown:rounds,description,wordCard:!!artCard.wordDescription});if(drawn)assets.hanziPresentation?.badge(context,card);return drawn;},
        retry:base?()=>assets.skillArt.ensure(base):undefined});
}
