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
        storyChoice(title,description,choose){const row=el('div'),detail=el('p',description);row.style.marginBottom='12px';detail.style.cssText='margin:4px 0;color:var(--muted);font-size:12px';row.append(button(title,choose),detail);return row;},
        storyContext(text){const details=el('details'),summary=el('summary','故事与玩法提示');details.open=true;details.append(summary,el('p',text));body.prepend(details);},
        visible(value){root.style.display=value?'':'none';},
        list(rows){mic?.reset();mic=null;input=null;send=null;body.replaceChildren(...rows);},
        storyMenu(stories,modes){
            mic?.reset();mic=null;input=null;send=null;
            const search=el('input'),list=el('div'),empty=el('p','没有找到这个故事。试试别的名字，或清空搜索。');
            search.type='search';search.placeholder='找故事';search.setAttribute('aria-label','搜索家园故事');
            search.style.cssText='box-sizing:border-box;width:100%;margin:8px 0';
            list.className='home-story-choices';list.setAttribute('aria-label','家园故事');
            list.style.cssText='max-height:240px;overflow:auto;overscroll-behavior:contain';
            const entries=stories.map(story=>({title:story.title.toLocaleLowerCase(),node:this.storyChoice(story.title,story.description,story.choose)}));
            empty.hidden=true;empty.setAttribute('role','status');
            list.append(...entries.map(row=>row.node),empty);
            search.addEventListener('input',()=>{const query=search.value.trim().toLocaleLowerCase();let found=0;for(const row of entries){row.node.hidden=!row.title.includes(query);if(!row.node.hidden)found++;}empty.hidden=found>0;list.scrollTop=0;});
            body.replaceChildren(el('h3','和伙伴玩故事'),search,list,el('h3','自由选择玩法'),...modes);
        },
        exercise({prompt,words,showWords=true,example='',onHint,onSpeak}){
            mic?.reset();body.replaceChildren(el('p',prompt));if(showWords)body.append(el('p','本轮词语：'+words.join('、')));
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
