import {loadKeepwork} from './adventure_cloud.js';
import {readOriginalCharacter} from './haqi_original.js';
import {ORIGINAL_IMPORT_BAGS,prepareOriginalImport} from './haqi_import_core.js';
import {renderOriginalImport} from './view_haqi_import.js';
import {renderPanel} from './view_adventure.js';

export function openOriginalImport({root,overlay,assets,isCurrent,commit,onClose,loadSDK=loadKeepwork,read=readOriginalCharacter}) {
    const controller=new AbortController();
    const state={busy:'',error:'',preview:null,reviewed:{},roleIds:null};
    let sdk,token,owner,active=true;
    const check=()=>{if(!active||controller.signal.aborted||!isCurrent())throw Error('角色或账号状态已变化，请重新导入。');if(sdk&&sdk.token!==token)throw Error('登录账号已变化，请重新导入。');};
    const clearOverlay=()=>{overlay.replaceChildren();overlay.className='overlay';};
    const escape=event=>{if(event.key!=='Escape')return;if(overlay.childElementCount){clearOverlay();paint();}else close();};
    const close=()=>{if(state.committing)return;active=false;controller.abort();clearOverlay();state.preview=null;window.removeEventListener('pagehide',close);window.removeEventListener('keydown',escape);onClose();};
    function paint(){if(active)renderOriginalImport(root,state,{close,read:readCharacter,confirm,preview,selectRole:id=>state.selectRole?.(id)});}
    function selectRole(ids){return new Promise(resolve=>{
        state.roleIds=ids;
        const cancel=()=>finish(null);
        const finish=id=>{controller.signal.removeEventListener('abort',cancel);state.roleIds=null;state.selectRole=null;resolve(id);paint();};
        state.selectRole=finish;controller.signal.addEventListener('abort',cancel,{once:true});paint();
    });}
    async function readCharacter(){
        if(state.busy)return;
        state.busy='正在核验登录…';state.error='';paint();
        try{
            sdk=await loadSDK();token=sdk.token;check();
            if(!token)throw Error('请先使用开始画面的账号登录，再回来读取原服角色。');
            const snapshot=await read({sdk,signal:controller.signal,requestedBags:ORIGINAL_IMPORT_BAGS,selectRole,onProgress:text=>{state.busy=text;paint();}});
            check();owner=snapshot.owner;state.preview=prepareOriginalImport(snapshot,assets.content,assets.dataset);state.reviewed={};
        }catch(error){if(active)state.error=error.message;}finally{state.busy='';paint();}
    }
    function preview(kind){
        try{check();if(!state.preview)return;
            const model={assets,save:structuredClone(state.preview.save),equipmentView:{tab:'gear',slot:0,item:null,query:''},petView:{},shopView:{},membership:{isVip:false}};
            renderPanel(overlay,kind,model,{close:()=>{clearOverlay();paint();},action:()=>false,panel:target=>{if(['inventory','deck'].includes(target))preview(target);}});
            state.reviewed[kind]=true;paint();
            const note=document.createElement('p');note.className='muted';note.textContent='导入预览 · 仅供核对，操作不保存';overlay.querySelector('.modal-body')?.prepend(note);
        }catch(error){state.error=error.message;paint();}
    }
    async function confirm(){
        if(state.busy||!state.preview||!state.reviewed.inventory||!state.reviewed.deck)return;
        state.committing=true;state.busy='正在核验身份并创建角色…';paint();
        try{
            check();const profile=await sdk.getUserProfile({forceRefresh:true,useCache:false});check();
            if(profile?.username!==owner)throw Error('登录账号已变化，请重新读取。');
            commit(state.preview.save,owner);state.committing=false;close();
        }catch(error){state.error=error.message;}finally{state.committing=false;state.busy='';paint();}
    }
    window.addEventListener('keydown',escape);window.addEventListener('pagehide',close,{once:true});paint();return close;
}
