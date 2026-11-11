import {DetailDialog} from './view_detail_dialog.js';
import {tr} from './locale_runtime.js';

const el=(tag,cls,...children)=>{const node=document.createElement(tag);if(cls)node.className=cls;node.append(...children);return node;};
const button=(label,fn,cls='')=>{const b=el('button',cls,label);b.type='button';b.onclick=fn;return b;};

// In-game replacement for window.confirm; resolves true only when the confirm button is pressed.
export function askAdventureConfirm({parent=document.body,title=tr('确认'),message,okText=tr('确定'),cancelText=tr('取消')}={}){
    return new Promise(resolve=>{
        const dialog=new DetailDialog(parent,{el,title,className:'equipment-item-dialog adventure-confirm-dialog'});
        let settled=false;
        const finish=value=>{if(settled)return;settled=true;resolve(value);dialog.close();};
        dialog.dialog.addEventListener('close',()=>finish(false));
        dialog.body.append(el('p','',message));
        dialog.footer.append(button(cancelText,()=>finish(false),'secondary'),button(okText,()=>finish(true),'primary'));
        dialog.open();
    });
}
