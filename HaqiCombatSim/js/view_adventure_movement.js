// Touch input stays in screen coordinates: camera motion never changes the heading.
export function bindTouchMovement(surface,indicator,{enabled,steer}) {
    let pointer=null,origin=null;
    const radius=43,deadZone=6;
    function reset() {
        const id=pointer;pointer=null;origin=null;
        indicator.hidden=true;steer(0,0);
        if(id!==null&&surface.hasPointerCapture(id))surface.releasePointerCapture(id);
    }
    surface.addEventListener('pointerdown',e=>{
        if(e.pointerType!=='touch'&&e.pointerType!=='pen')return;
        if(pointer!==null||!enabled()||e.button!==0)return;
        e.preventDefault();pointer=e.pointerId;origin={x:e.clientX,y:e.clientY};
        surface.setPointerCapture(pointer);
        indicator.style.left=`${origin.x}px`;indicator.style.top=`${origin.y}px`;
        indicator.firstElementChild.style.transform='translate(-50%,-50%)';
        indicator.hidden=false;steer(0,0);
    });
    surface.addEventListener('pointermove',e=>{
        if(e.pointerId!==pointer)return;
        if(!enabled()){reset();return;}
        e.preventDefault();
        const x=e.clientX-origin.x,y=e.clientY-origin.y,length=Math.hypot(x,y);
        const scale=length?Math.min(radius,length)/length:0;
        indicator.firstElementChild.style.transform=`translate(-50%,-50%) translate(${x*scale}px,${y*scale}px)`;
        const speed=Math.max(0,Math.min(1,(length-deadZone)/(radius-deadZone)));
        steer(length?x/length*speed:0,length?y/length*speed:0);
    });
    for(const type of ['pointerup','pointercancel','lostpointercapture'])surface.addEventListener(type,e=>{if(e.pointerId===pointer)reset();});
    return {reset};
}
