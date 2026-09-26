// Dialogue presentation only; quest actions remain in the controller.
import { fill, setText } from './locale_runtime.js';
import {mappingColor} from './dialogue_mapping_core.js';
export function bindDialogue(root,box,text,hint,defaultButton,{lines=[],readAloud,mapWords,targetLocale=lines[0]?.locale,close}={}) {
    const full=text.textContent,chars=Array.from(full);
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    let timer=0,index=0,disposed=false,ready=false,playback=null,mapping=null;
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
        if(event.target.closest('.dialogue-read'))return;
        // Closing is always immediate; other controls first reveal the sentence.
        if(event.target.closest('.close-button'))return;
        // 点击对话框外的空白区域：关闭对话。
        if(!box.contains(event.target)){event.preventDefault();event.stopImmediatePropagation();close?.();return;}
        // 对话框内的非控件区域：仅在对白未显示完时补全文字，其余情况无操作。
        if(!ready){event.preventDefault();event.stopImmediatePropagation();finish();}
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
    setText(hint,'点击对白或空格显示全文 · 空白处关闭');
    box.classList.add('is-speaking');
    if(lines.length){
        ready=true;box.classList.remove('is-speaking');box.classList.add('dialogue-learning');text.replaceChildren();
        const idleHint='点击喇叭朗读，点击译文映射词义；相近颜色表示近似对应。';
        const labels=[];let mapped=false;
        const mappingCaptions=[];
        function showMapping(result){
            result.forEach((parts,i)=>{labels[i].replaceChildren(...parts.map(part=>{
                const span=document.createElement('span');span.textContent=part.text;const color=mappingColor(part);
                if(color){span.className=/[\u3400-\u9fff]/u.test(part.text)?'dialogue-mapped-word is-cjk':'dialogue-mapped-word';span.style.color=color;span.style.fontWeight='600';span.title=part.match==='approximate'?'近似词义对应':'相同颜色表示对应词义';if(part.match==='approximate')span.style.textDecoration='underline dotted';}
                return span;
            }));});mapped=true;
            for(const caption of mappingCaptions)caption.textContent='已映射';
        }
        for(const row of lines){
            const isTarget=row.locale===targetLocale,canMap=!isTarget&&lines.length>1;
            const control=document.createElement('button');control.type='button';control.className='dialogue-read';
            const label=document.createElement('span');label.textContent=row.text;labels.push(label);
            const icon=document.createElement('span');icon.className='dialogue-action-icon';icon.setAttribute('aria-hidden','true');
            icon.innerHTML=canMap?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4"/></svg>':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 4 5 9H2v6h3l6 5ZM15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/></svg>';
            control.append(label,icon);
            let mappingLabel;
            if(canMap){mappingLabel=document.createElement('span');mappingLabel.className='dialogue-action-caption';mappingLabel.textContent='词义映射';control.append(mappingLabel);mappingCaptions.push(mappingLabel);}
            control.lang=row.locale;control.title=canMap?'点击映射上下两行词义':'点击朗读';control.setAttribute('aria-label',`${canMap?'词义映射':'朗读'}：${row.text}`);
            control.onclick=async()=>{
                if(canMap){
                    if(mapping||mapped)return;
                    const current=new AbortController();mapping=current;control.setAttribute('aria-busy','true');mappingLabel.textContent='映射中…';setText(hint,'正在映射词义…');
                    try{
                        if(!mapWords)throw Error('词义映射暂时不可用，请稍后重试。');
                        const result=await mapWords(lines,current.signal);
                        if(disposed||current.signal.aborted)return;
                        showMapping(result);setText(hint,idleHint);
                    }catch(error){if(!disposed&&!current.signal.aborted)hint.textContent=error.message||'词义映射失败，请重试。';}
                    finally{if(mapping===current)mapping=null;control.setAttribute('aria-busy','false');mappingLabel.textContent=mapped?'已映射':'重试映射';}
                    return;
                }
                playback?.abort();const current=new AbortController();playback=current;
                setText(hint,'正在朗读…');
                try{if(!readAloud)throw Error('朗读暂时不可用，请稍后重试。');await readAloud(row.text,row.locale,current.signal);if(!disposed&&!current.signal.aborted)setText(hint,idleHint);}
                catch(error){if(!disposed&&!current.signal.aborted)hint.textContent=error.message||'朗读失败，请点击台词重试。';}
            };
            text.append(control);
        }
        setText(hint,idleHint);
        if(lines.length>1&&mapWords?.peek){
            void mapWords.peek(lines).then(result=>{
                if(result&&!disposed&&!mapped&&!mapping)showMapping(result);
            }).catch(()=>{});
        }
    }else if(reduced||!chars.length)finish();else tick();
    root.disposeDialogue=()=>{
        disposed=true;clearTimeout(timer);playback?.abort();mapping?.abort();
        root.removeEventListener('click',click,true);root.removeEventListener('keydown',keydown);
        root.disposeDialogue=null;
    };
}
