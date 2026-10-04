import {createDialogueReveal} from './dialogue_reveal.js';
// Dialogue presentation only; quest actions remain in the controller.
import { fill, setText } from './locale_runtime.js';
import {createBilingualDialogue} from './view_bilingual_dialogue.js';
export function bindDialogue(root,box,text,hint,defaultButton,{lines=[],autoReadDialogue=false,readAloud,mapWords,targetLocale=lines[0]?.locale,close}={}) {
    const reveal=createDialogueReveal();
    const full=text.textContent,chars=Array.from(full);
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    let timer=0,index=0,disposed=false,ready=false,playback=null,mapping=null,disposeLinks=()=>{};
    const visible=document.createElement('span');
    visible.setAttribute('aria-hidden','true');
    const accessible=document.createElement('span');
    accessible.className='dialogue-sr';accessible.textContent=full;
    text.replaceChildren(visible,accessible);
    function finish(){
        clearTimeout(timer);ready=true;visible.textContent=full;
        box.classList.remove('is-speaking');
        setText(hint,'空格 · {action} · 点击空白处关闭',{action:defaultButton.textContent});
    }
    function tick(){
        if(disposed||!box.isConnected)return;
        visible.textContent=chars.slice(0,++index).join('');
        if(index>=chars.length){finish();return;}
        timer=setTimeout(tick,/[，。！？；…]/u.test(chars[index-1])?160:28);
    }
    // 键盘空格/回车仍可触发默认操作；鼠标只允许按钮触发。
    const advance=()=>{if(!ready)finish();else defaultButton.click();};
    function click(event){
        if(event.target.closest('.camp-chat-replay')){reveal.finish();return;}
        // Closing is always immediate; other controls first reveal the sentence.
        if(event.target.closest('.close-button')||event.target.closest('.dialogue-chat'))return;
        // 点击对话框外的空白区域：关闭对话。
        if(!box.contains(event.target)){event.preventDefault();event.stopImmediatePropagation();close?.();return;}
        // 对话框内的非控件区域：仅在对白未显示完时补全文字，其余情况无操作。
        if(!ready){event.preventDefault();event.stopImmediatePropagation();finish();}
    }
    function keydown(event){
        reveal.finish();
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
    setText(hint,'点击对白或空格显示全文 · 空白处关闭');
    box.classList.add('is-speaking');
    if(lines.length){
        ready=true;box.classList.remove('is-speaking');box.classList.add('dialogue-learning');text.replaceChildren();
        const idleHint='点击喇叭朗读，点击译文查看最多5组关键词；同色框和连线表示对应。';
        const makeButton=(label,run,cls)=>{const node=document.createElement('button');node.type='button';node.className=cls;node.textContent=label;node.onclick=run;return node;};
        const bilingual=createBilingualDialogue({button:makeButton,mapWords});
        const read=async()=>{
            playback?.abort();const current=new AbortController();playback=current;setText(hint,'正在朗读…');
            try{
                if(!readAloud)throw Error('朗读暂时不可用，请稍后重试。');
                await readAloud(lines[0].text,lines[0].locale,current.signal);
                if(!disposed&&!current.signal.aborted)setText(hint,idleHint);
            }catch(error){if(!disposed&&!current.signal.aborted)hint.textContent=error.message;}
        };
        const labels=lines.map(row=>{const label=document.createElement('p');label.className=row.locale===targetLocale?'dialogue-original':'dialogue-translation';label.lang=row.locale;label.textContent=row.text;text.append(label);return label;});
        const line=bilingual.attach({container:text,original:labels[0],gloss:labels[1],text:lines[0].text,translation:lines[1]?.text,locale:lines[0].locale,native:lines[1]?.locale,
            onRead:read,
            onError:error=>{if(!disposed)hint.textContent=error.message;}});
        reveal.start([{node:line.textNode,translation:line.translationNode}]);
        disposeLinks=()=>{reveal.finish();line.dispose();bilingual.close();};
        setText(hint,'点击“再听一次”朗读，点击“词义映射”查看中英文对应词。');
        if(autoReadDialogue&&lines[0].locale===targetLocale&&lines[0].text.trim())void read();

    }else if(reduced||!chars.length)finish();else tick();
    root.disposeDialogue=()=>{
        disposed=true;disposeLinks();clearTimeout(timer);playback?.abort();mapping?.abort();
        root.removeEventListener('click',click,true);root.removeEventListener('keydown',keydown);
        root.disposeDialogue=null;
    };
}
