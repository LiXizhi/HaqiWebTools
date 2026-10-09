import {DetailDialog} from './view_detail_dialog.js';
import {openPhotoHeadView} from './view_photo_head.js?v=20261007-look-controls';
import {tr} from './locale_runtime.js';
const el=(tag,className='',...children)=>{const n=document.createElement(tag);n.className=className;n.append(...children);return n;};
// Open the window immediately; SDK, worker and account IO remain lazy.
export function createPhotoHeadFeature({assets,getOwner,membership,onLogin,loadService=()=>import('./photo_head_service.js')}) {
    let service,view;
    async function open(draft,onApply){
        if(view?.dialog.open)return;
        const shell=new DetailDialog(document.body,{el,title:tr('照片生成形象')});view=shell;
        shell.body.textContent=tr('正在打开形象窗口…');shell.body.setAttribute('role','status');
        shell.dialog.addEventListener('close',()=>shell.dialog.remove(),{once:true});shell.open();
        try{
            const {createPhotoHeadService}=await loadService();
            if(!shell.dialog.open||view!==shell)return;
            service??=createPhotoHeadService({assets,getOwner,membership});
            openPhotoHeadView({service,assets,draft,onApply,onLogin,getOwner,shell});
        }catch{
            if(!shell.dialog.open||view!==shell)return;
            shell.body.textContent=tr('形象窗口打开失败，请重试');
            const retry=el('button','secondary',tr('重试'));retry.type='button';
            retry.onclick=()=>{shell.destroy();void open(draft,onApply);};shell.footer.replaceChildren(retry);
        }
    }
    return {open};
}
