// Pointer capture keeps a scene prop under the same finger. Click/keyboard
// actions remain available on the prop itself; a cancelled gesture never drops.
export function bindSceneDrag(node,{onStart=()=>{},onEnd=()=>{},threshold=10}={}){
 let gesture=null;
 node.draggable=false;node.dataset.sceneDrag='true';
 const down=event=>{
  if(gesture||event.isPrimary===false||(event.button!==undefined&&event.button!==0))return;
  gesture={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};
  node.setPointerCapture?.(event.pointerId);onStart();
 };
 const move=event=>{
  if(!gesture||gesture.id!==event.pointerId)return;
  const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
  gesture.moved ||= Math.hypot(dx,dy)>=threshold;
  if(!gesture.moved)return;
  event.preventDefault();node.classList.add('scene-drag-active');node.style.translate=`${dx}px ${dy}px`;
 };
 const finish=(event,cancelled=false)=>{
  if(!gesture||gesture.id!==event.pointerId)return;
  const current=gesture;gesture=null;node.style.translate='';node.classList.remove('scene-drag-active');
  if(node.hasPointerCapture?.(current.id))node.releasePointerCapture(current.id);
  const dx=event.clientX-current.x,dy=event.clientY-current.y;
  onEnd({x:event.clientX,y:event.clientY,dx,dy,moved:current.moved||Math.hypot(dx,dy)>=threshold,cancelled});
 };
 node.addEventListener('pointerdown',down);
 node.addEventListener('pointermove',move);
 node.addEventListener('pointerup',event=>finish(event));
 node.addEventListener('pointercancel',event=>finish(event,true));
 node.addEventListener('lostpointercapture',event=>finish(event,true));
}

export function pointInsideElement(element,x,y){
 const bounds=element.getBoundingClientRect();
 return Number.isFinite(x)&&Number.isFinite(y)&&x>=bounds.left&&x<=bounds.right&&y>=bounds.top&&y<=bounds.bottom;
}
