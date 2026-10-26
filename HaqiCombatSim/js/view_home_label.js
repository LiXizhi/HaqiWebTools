import {DetailDialog} from './view_detail_dialog.js';

export function openHomeLabel(parent,{el,button,obj,homeId,save,practice=null}){
 const dialog=new DetailDialog(parent,{el,title:'给作品写标签',className:'equipment-item-dialog'});
 const form=el('form'),input=el('input'),message=el('p');
 input.type='text';input.maxLength=60;input.value=obj.label||'';input.setAttribute('aria-label','作品标签');
 input.style.cssText='box-sizing:border-box;width:100%';
 form.append(el('p','','给这个物品起个名字，或写一句你自己的话。标签会留在家园里，空白表示移除。'),input,el('p','','没有标准答案，写下你想给朋友看的话。'),message);
 const submit=button('保存标签',()=>{});submit.type='submit';
 form.onsubmit=async event=>{event.preventDefault();if(submit.disabled)return;submit.disabled=true;input.disabled=true;try{await save(obj.id,input.value,homeId);dialog.destroy();}catch(error){message.textContent=error.message;submit.disabled=false;input.disabled=false;}};
 if(practice){const hint=el('p');form.prepend(el('p','','伙伴的请求：'+practice.prompt));form.append(button('看一个例子',()=>{practice.onHint?.();hint.textContent=practice.examples.join(' / ');}),hint);}
 form.append(submit);dialog.body.append(form);dialog.open();input.focus();return dialog;
}
