import {tr} from './locale_runtime.js';

// One interaction entry under player two; the controller owns proximity and actions.
export function createLocalPeerControl(onOpen){
    const node=document.createElement('button');
    node.type='button';node.className='local-peer-bubble local-peer-toolbar-button';node.textContent='…';node.hidden=true;
    node.setAttribute('aria-label',tr('同屏队友互动'));
    node.onclick=event=>{event.stopPropagation();onOpen();};
    node.addEventListener('pointerdown',event=>event.stopPropagation());
    return {node,render(anchor,visible){
        node.hidden=!anchor||!visible;
        if(anchor&&node.parentNode!==anchor)anchor.append(node);
    }};
}
