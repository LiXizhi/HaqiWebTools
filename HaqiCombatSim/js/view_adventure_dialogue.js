// Dialogue presentation only; quest actions remain in the controller.
import { fill, setText } from './locale_runtime.js';
export function bindDialogue(root,box,text,hint,defaultButton) {
    const full=text.textContent,chars=Array.from(full);
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    let timer=0,index=0,disposed=false,ready=false;
    const visible=document.createElement('span');
    visible.setAttribute('aria-hidden','true');
    const accessible=document.createElement('span');
    accessible.className='dialogue-sr';accessible.textContent=full;
    text.replaceChildren(visible,accessible);
    function finish(){
        clearTimeout(timer);ready=true;visible.textContent=full;
        box.classList.remove('is-speaking');
        setText(hint,'点击空白处 / 空格 · {action}',{action:defaultButton.textContent});
    }
    function tick(){
        if(disposed||!box.isConnected)return;
        visible.textContent=chars.slice(0,++index).join('');
        if(index>=chars.length){finish();return;}
        timer=setTimeout(tick,/[，。！？；…]/u.test(chars[index-1])?160:28);
    }
    const advance=()=>{if(!ready)finish();else defaultButton.click();};
    function click(event){
        // Closing is always immediate; other controls first reveal the sentence.
        if(event.target.closest('.close-button'))return;
        if(!ready){event.preventDefault();event.stopImmediatePropagation();finish();return;}
        if(!event.target.closest('button,a,input,select,textarea'))advance();
    }
    function keydown(event){
        if(event.target.closest('input,textarea,select,[contenteditable=true]'))return;
        if(event.key==='Tab'){
            const buttons=[...box.querySelectorAll('button:not(:disabled)')];
            const position=buttons.indexOf(document.activeElement);
            const next=position<0?(event.shiftKey?buttons.length-1:0):(position+(event.shiftKey?-1:1)+buttons.length)%buttons.length;
            event.preventDefault();buttons[next]?.focus();
            return;
        }
        if(event.code!=='Space'&&event.key!==' '&&event.key!=='Enter')return;
        event.preventDefault();event.stopPropagation();
        if(event.repeat)return;
        if(!ready){finish();return;}
        const focused=event.target.closest('button');
        if(focused)focused.click();else advance();
    }
    root.addEventListener('click',click,true);
    root.addEventListener('keydown',keydown);
    box.tabIndex=-1;box.focus({preventScroll:true});
    defaultButton.classList.add('dialogue-default');
    setText(hint,'点击任意位置 / 空格 · 显示完整对白');
    box.classList.add('is-speaking');
    if(reduced||!chars.length)finish();else tick();
    root.disposeDialogue=()=>{
        disposed=true;clearTimeout(timer);
        root.removeEventListener('click',click,true);root.removeEventListener('keydown',keydown);
        root.disposeDialogue=null;
    };
}
