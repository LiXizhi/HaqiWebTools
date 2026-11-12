// Preserve native click/cancel semantics when background updates repaint a HUD.
// Queue only presentation work, never a button action or captured game model.
export function createHudRenderGuard(root,{render,getScope=()=>[],canRender=()=>true,schedule=fn=>setTimeout(fn,0),cancel=clearTimeout}={}){
 const doc=root.ownerDocument,win=doc.defaultView,held=new Set();
 let pending=false,timer=null,scope=null,disposed=false;
 const same=(a,b)=>a?.length===b?.length&&a.every((v,i)=>v===b[i]);
 const clear=()=>{held.clear();scope=null;if(timer!==null)cancel(timer);timer=null;};
 function flush(){timer=null;if(disposed||held.size)return;scope=null;const needed=pending;pending=false;if(needed&&canRender())render();}
 function later(){if(timer===null)timer=schedule(flush);}
 function down(event){
  if(event.button!==0)return;
  const target=event.target.closest?.('button,a,input,select,textarea,[role="button"]');
  if(!target||!root.contains(target))return;
  if(timer!==null){cancel(timer);timer=null;}
  scope=getScope();held.add(event.pointerId);
 }
 function release(event){if(!held.delete(event.pointerId))return;if(!held.size)later();}
 function blur(){held.clear();later();}
 root.addEventListener('pointerdown',down,true);
 doc.addEventListener('pointerup',release,true);doc.addEventListener('pointercancel',release,true);win?.addEventListener('blur',blur);
 return {
  request(){
   if(disposed)return;
   if(scope&&!same(scope,getScope())){clear();pending=false;}
   if(!canRender()){clear();pending=false;return;}
   if(held.size||timer!==null){pending=true;return;}
   render();
  },
  dispose(){disposed=true;clear();pending=false;root.removeEventListener('pointerdown',down,true);doc.removeEventListener('pointerup',release,true);doc.removeEventListener('pointercancel',release,true);win?.removeEventListener('blur',blur);}
 };
}
