// Shared GUI controls. Views supply intent callbacks; no gameplay state here.
// Tests inject a shared document on globalThis; browsers use the real one.
const doc=()=>globalThis.document;
export function createCloseButton(onClose,label='关闭',extraClass=''){
    const document=doc();
    const button=document.createElement('button');button.type='button';
    button.className=['close-button',extraClass].filter(Boolean).join(' ');
    button.setAttribute('aria-label',label);button.title=label;button.onclick=onClose;
    const icon=document.createElement('span');icon.className='icon';icon.dataset.uiIcon='close';
    icon.setAttribute('aria-hidden','true');
    // The storybook atlas replaces this vector when available. Keep a clear
    // fallback while the cosmetic asset loads or if its download fails.
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');
    svg.setAttribute('stroke-width','2.5');svg.setAttribute('stroke-linecap','round');
    path.setAttribute('d','M6 6l12 12M18 6L6 18');svg.append(path);icon.append(svg);button.append(icon);
    return button;
}
