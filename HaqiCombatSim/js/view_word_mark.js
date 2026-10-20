import {createCloseButton} from './view_adventure_controls.js';
export function createWordPronounceButton(text){
 const read=document.createElement('button');read.type='button';read.className='tree-pronounce';read.title='朗读';read.setAttribute('aria-label',`朗读：${text}`);
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');path.setAttribute('d','M4 9h4l5-4v14l-5-4H4z M16 8c2 2 2 6 0 8 M19 5c4 4 4 10 0 14');for(const [key,value] of Object.entries({fill:'none',stroke:'currentColor','stroke-width':'1.8','stroke-linecap':'round','stroke-linejoin':'round'}))path.setAttribute(key,value);svg.append(path);read.append(svg);return read;
}
export function appendWordMarkChoices(root,button,onMark){
 const choices=document.createElement('div');choices.className='tree-rating-choices';
 for(const [mark,label] of [['know','我全掌握了'],['basic','基本理解'],['unknown','不认识']])choices.append(button(label,()=>onMark(mark)));
 root.append(choices);return choices;
}
export function showDialogueWordMark({entry,surface,language,onMark,onRead,onClose=()=>{}}){
 const popup=document.createElement('dialog');popup.className='tree-choice-popup dialogue-word-popup';popup.setAttribute('aria-label','词语理解');
 const heading=document.createElement('h2');heading.textContent=entry.text;const gloss=document.createElement('p');gloss.textContent=entry.meaning;
 const notice=document.createElement('p');notice.setAttribute('role','status');
 const button=(text,run)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=async()=>{for(const n of popup.querySelectorAll('button'))n.disabled=true;try{await run();}catch(e){notice.textContent=e.message;}finally{for(const n of popup.querySelectorAll('button'))n.disabled=false;}};return b;};
 const read=createWordPronounceButton(entry.text);read.onclick=button('',()=>onRead(entry.text,language)).onclick;
 const head=document.createElement('div');head.className='tree-word-heading';head.append(heading,read,createCloseButton(()=>popup.close(),'关闭词语理解'));popup.append(head);
 const body=document.createElement('div');popup.append(body);
 if(surface!==entry.text){const form=document.createElement('p');form.textContent=`${surface} → ${entry.text}`;body.append(form);}
 body.append(gloss,notice);
 appendWordMarkChoices(body,button,async mark=>{const result=await onMark(mark);if(result?.persisted===false){notice.textContent='记录未保存，本次仅保存在内存中。';return;}popup.close();});
 for(const event of ['click','pointerdown','pointerup','keydown'])popup.addEventListener(event,e=>e.stopPropagation());
 popup.addEventListener('close',()=>{popup.remove();onClose();},{once:true});document.body.append(popup);popup.showModal();return ()=>{popup.close();popup.remove();};
}
