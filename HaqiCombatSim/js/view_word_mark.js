import {createCloseButton} from './view_adventure_controls.js';
export function appendWordMarkChoices(root,button,onMark){
 const choices=document.createElement('div');choices.className='tree-rating-choices';
 for(const [mark,label] of [['know','我全掌握了'],['basic','基本理解'],['unknown','不认识']])choices.append(button(label,()=>onMark(mark)));
 root.append(choices);return choices;
}
export function showDialogueWordMark({entry,surface,language,onMark,onRead,onClose=()=>{}}){
 const popup=document.createElement('dialog');popup.className='modal dialogue-word-popup';popup.setAttribute('aria-label','词语理解');
 const heading=document.createElement('h2');heading.textContent=entry.text;const gloss=document.createElement('p');gloss.textContent=entry.meaning;
 const notice=document.createElement('p');notice.setAttribute('role','status');
 const button=(text,run)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=async()=>{for(const n of popup.querySelectorAll('button'))n.disabled=true;try{await run();}catch(e){notice.textContent=e.message;}finally{for(const n of popup.querySelectorAll('button'))n.disabled=false;}};return b;};
 const head=document.createElement('header');head.className='modal-header';head.append(heading,createCloseButton(()=>popup.close(),'关闭词语理解'));popup.append(head);
 if(surface!==entry.text){const form=document.createElement('p');form.textContent=`${surface} → ${entry.text}`;popup.append(form);}
 popup.append(gloss,button('朗读',()=>onRead(entry.text,language)),notice);
 appendWordMarkChoices(popup,button,async mark=>{const result=await onMark(mark);if(result?.persisted===false){notice.textContent='记录未保存，本次仅保存在内存中。';return;}popup.close();});
 for(const event of ['click','pointerdown','pointerup','keydown'])popup.addEventListener(event,e=>e.stopPropagation());
 popup.addEventListener('close',()=>{popup.remove();onClose();},{once:true});document.body.append(popup);popup.showModal();return ()=>{popup.close();popup.remove();};
}
