// Touch input stays in screen coordinates: camera motion never changes the heading.
export function bindTouchMovement(surface,indicator,{enabled,steer,zoom=()=>{},tap=()=>{}}) {
    let origin=null,pinching=false,pinchDistance=0,dragging=false;
    const contacts=new Map();
    const radius=43,deadZone=6;
    function span() {
        const [a,b]=contacts.values();
        return b?Math.hypot(b.x-a.x,b.y-a.y):0;
    }
    function reset() {
        const ids=[...contacts.keys()];contacts.clear();origin=null;pinching=false;pinchDistance=0;dragging=false;
        indicator.hidden=true;steer(0,0);
        for(const id of ids)if(surface.hasPointerCapture(id))surface.releasePointerCapture(id);
    }
    surface.addEventListener('wheel',e=>{
        if(!enabled()||!Number.isFinite(e.deltaY))return;
        e.preventDefault();
        const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?surface.clientHeight:1);
        zoom(Math.exp(-Math.max(-120,Math.min(120,delta))*.0015));
    },{passive:false});
    surface.addEventListener('pointerdown',e=>{
        if(e.pointerType!=='touch'&&e.pointerType!=='pen')return;
        if(!enabled()||e.button!==0)return;
        e.preventDefault();contacts.set(e.pointerId,{x:e.clientX,y:e.clientY});surface.setPointerCapture(e.pointerId);
        if(contacts.size>1||pinching){
            pinching=true;pinchDistance=span();origin=null;
            indicator.hidden=true;steer(0,0);return;
        }
        origin={x:e.clientX,y:e.clientY};dragging=false;
        indicator.style.left=`${origin.x}px`;indicator.style.top=`${origin.y}px`;
        indicator.firstElementChild.style.transform='translate(-50%,-50%)';
        indicator.hidden=true;steer(0,0);
    });
    surface.addEventListener('pointermove',e=>{
        if(!contacts.has(e.pointerId))return;
        if(!enabled()){reset();return;}
        e.preventDefault();
        contacts.set(e.pointerId,{x:e.clientX,y:e.clientY});
        if(pinching){
            const next=span();
            if(pinchDistance>8&&next>8)zoom(next/pinchDistance);
            pinchDistance=next;return;
        }
        const x=e.clientX-origin.x,y=e.clientY-origin.y,length=Math.hypot(x,y);
        if(length>deadZone)dragging=true;
        indicator.hidden=!dragging;
        const scale=length?Math.min(radius,length)/length:0;
        indicator.firstElementChild.style.transform=`translate(-50%,-50%) translate(${x*scale}px,${y*scale}px)`;
        const speed=Math.max(0,Math.min(1,(length-deadZone)/(radius-deadZone)));
        steer(length?x/length*speed:0,length?y/length*speed:0);
    });
    for(const type of ['pointerup','pointercancel','lostpointercapture'])surface.addEventListener(type,e=>{
        if(!contacts.has(e.pointerId))return;
        const tapped=type==='pointerup'&&enabled()&&!pinching&&!dragging&&origin
            &&Math.hypot(e.clientX-origin.x,e.clientY-origin.y)<=deadZone;
        contacts.delete(e.pointerId);
        if(surface.hasPointerCapture(e.pointerId))surface.releasePointerCapture(e.pointerId);
        // After a pinch, one remaining finger must not unexpectedly start walking.
        if(!contacts.size)reset();else pinchDistance=span();
        // Stop steering before the callback creates an interaction path.
        if(tapped)tap(e.clientX,e.clientY);
    });
    return {reset};
}
