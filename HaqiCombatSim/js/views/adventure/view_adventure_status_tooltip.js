// Transparent DOM targets follow the actual Canvas icon bounds, including short-screen scaling.
export function attachStatusTooltips(root,canvas) {
    root.disposeStatusTooltips?.();
    const controller=new AbortController(),layer=document.createElement('div'),tip=document.createElement('div');
    layer.className='battle-status-targets';tip.className='battle-status-tooltip';tip.id='battle-status-tooltip';
    tip.setAttribute('role','tooltip');tip.hidden=true;root.append(layer,tip);
    const buttons=new Map();let active=null,pinned=false;
    const hide=()=>{tip.hidden=true;active=null;pinned=false;};
    const place=()=>{
        const button=buttons.get(active);if(!button)return hide();
        tip.textContent=button.getAttribute('aria-label');tip.hidden=false;
        const rect=button.getBoundingClientRect(),bounds=root.getBoundingClientRect();
        tip.style.left=`${Math.max(4,Math.min(root.clientWidth-tip.offsetWidth-4,rect.left-bounds.left+rect.width/2-tip.offsetWidth/2))}px`;
        const below=rect.bottom-bounds.top+8;
        tip.style.top=`${Math.max(4,Math.min(root.clientHeight-tip.offsetHeight-4,below+tip.offsetHeight<=root.clientHeight?below:rect.top-bounds.top-tip.offsetHeight-8))}px`;
    };
    const show=(key,pin=false)=>{active=key;pinned=pin;place();};
    canvas.updateStatusTargets=targets=>{
        const keys=new Set(targets.map(t=>t.key));
        let changed=false;
        for(const [key,button] of buttons)if(!keys.has(key)){button.remove();buttons.delete(key);if(active===key)hide();}
        const offsetLeft=canvas.offsetLeft||0,offsetTop=canvas.offsetTop||0;
        for(const hit of targets){
            let button=buttons.get(hit.key);
            if(!button){
                button=document.createElement('button');button.type='button';button.className='battle-status-hit';
                button.setAttribute('aria-describedby',tip.id);
                button.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch'&&!pinned)show(hit.key);});
                button.addEventListener('pointerleave',()=>{if(!pinned&&active===hit.key)hide();});
                button.addEventListener('focus',()=>show(hit.key));
                button.addEventListener('blur',()=>{if(!pinned&&active===hit.key)hide();});
                button.addEventListener('click',e=>{e.stopPropagation();if(active===hit.key&&pinned)hide();else show(hit.key,true);});
                buttons.set(hit.key,button);layer.append(button);
            }
            if(button.lastDesc!==hit.description){button.lastDesc=hit.description;button.setAttribute('aria-label',hit.description);if(active===hit.key)changed=true;}
            const left=`${Math.round((offsetLeft+hit.x)*10)/10}px`,top=`${Math.round((offsetTop+hit.y)*10)/10}px`,width=`${Math.round(hit.width*10)/10}px`,height=`${Math.round(hit.height*10)/10}px`;
            if(button.style.left!==left)button.style.left=left;
            if(button.style.top!==top)button.style.top=top;
            if(button.style.width!==width)button.style.width=width;
            if(button.style.height!==height)button.style.height=height;
        }
        if(active&&changed)place();
    };
    root.addEventListener('pointerdown',e=>{if(!layer.contains(e.target)&&!tip.contains(e.target))hide();},{capture:true,signal:controller.signal});
    root.addEventListener('keydown',e=>{if(e.key==='Escape'&&active){hide();e.stopPropagation();}},{signal:controller.signal});
    root.disposeStatusTooltips=()=>{controller.abort();delete canvas.updateStatusTargets;layer.remove();tip.remove();};
}
