import {createCloseButton,restoreVisibleFocus} from './view_adventure_controls.js';
import {createDialogueMicrophone} from './view_dialogue_microphone.js';

const el=(tag,text='')=>{const n=document.createElement(tag);n.textContent=text;return n;};
export function createLanguagePracticeView({title,close,submit,start,finish,cancel,isRecording,modal=true,host=null}){
    const opener=document.activeElement;const root=el(host?'section':'dialog');root.className=host?'journal-language-practice':'modal language-practice-modal';
    root.style.cssText='width:min(600px,calc(100vw - 24px));max-height:80vh;overflow:auto;box-sizing:border-box;padding:16px;';
    if(!modal)root.style.cssText+='position:fixed;inset:auto 12px 12px auto;z-index:100;width:min(380px,calc(100vw - 24px));max-height:65vh;';
    const header=el('header'),heading=el('h2',title),body=el('div'),status=el('p');status.setAttribute('role','status');
    if(host){root.style.cssText='';root.append(body,status);host.replaceChildren(root);}
    else {header.className='modal-header';header.append(heading,createCloseButton(close));root.append(header,body,status);document.body.append(root);root.addEventListener('cancel',e=>{e.preventDefault();close();});if(modal)root.showModal();else root.show();}
    const button=(label,fn,cls='secondary')=>{const b=el('button',label);b.type='button';b.className=cls;b.onclick=()=>void fn();return b;};
    const escape=e=>{const dialog=e.target?.closest?.('dialog[open]');if(dialog&&dialog!==root)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}};if(!host)document.addEventListener('keydown',escape,true);
    let mic=null,input=null,send=null;
    return {button,body,
        visible(value){root.style.display=value?'':'none';},
        list(rows){mic?.reset();mic=null;input=null;send=null;body.replaceChildren(...rows);},
        exercise({prompt,words,example='',onHint,onSpeak}){
            mic?.reset();body.replaceChildren(el('p',prompt),el('p','本轮词语：'+words.join('、')));
            input=el('textarea');input.style.cssText='box-sizing:border-box;width:100%;max-width:100%';input.rows=2;input.maxLength=500;input.setAttribute('aria-label','输入回答');body.append(input);
            const tools=el('div');tools.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
            send=button('回答',()=>submit(input.value,'text'));tools.append(send);
            mic=createDialogueMicrophone(button,{start,finish,cancel,isRecording});tools.append(mic.node);
            if(example){const hint=el('p');hint.hidden=true;tools.append(button('提示',()=>{hint.hidden=!hint.hidden;hint.textContent=example;onHint?.();}),button('听示范',onSpeak));body.append(hint);}
            body.append(tools);input.focus();
        },
        message(text){status.textContent=text;},
        phase(phase){const busy=['judging','connecting','recording'].includes(phase);if(input)input.disabled=busy;if(send)send.disabled=busy;mic?.update({phase,disabled:phase==='judging'});},
        dispose(){document.removeEventListener('keydown',escape,true);mic?.reset();if(!host)root.close();root.remove();if(!host)restoreVisibleFocus(opener);}
    };
}
