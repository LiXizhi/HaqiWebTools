// Touch-only hand browsing. Keep the DOM/layout stable until the finger is released.
export function bindHandGesture(hand, { select, play }) {
    const doc=hand.ownerDocument, win=doc.defaultView;
    let gesture=null;
    function clear() {
        if(!gesture)return;
        const old=gesture;gesture=null;
        hand.classList.remove('hand-browsing','hand-aiming');
        for(const node of hand.children){node.classList.remove('touch-preview','touch-ready');node.style.removeProperty('--hand-drag-y');}
        if(old&&hand.hasPointerCapture(old.id))hand.releasePointerCapture(old.id);
    }
    function preview() {
        const g=gesture;
        hand.classList.toggle('hand-aiming',g.locked);
        for(const {node} of g.cards){
            const active=node===g.card.node;
            node.classList.toggle('touch-preview',active);
            node.classList.toggle('touch-ready',active&&g.rise>=56);
            node.style.setProperty('--hand-drag-y',`${active?-Math.min(120,Math.max(12,g.rise)):0}px`);
        }
    }
    function down(e) {
        if(e.pointerType!=='touch'||e.isPrimary===false||gesture)return;
        const face=e.target.closest('.card-select');
        if(!face||face.disabled||!hand.contains(face))return;
        const cards=[...hand.children].map(node=>({node,rect:node.getBoundingClientRect(),disabled:node.querySelector('.card-select').disabled}));
        const card=cards.find(c=>c.node===face.parentElement);
        e.preventDefault();
        gesture={id:e.pointerId,cards,card,baseY:e.clientY,rise:0,locked:false};
        hand.setPointerCapture(e.pointerId);hand.classList.add('hand-browsing');preview();
    }
    function move(e) {
        const g=gesture;if(!g||e.pointerId!==g.id)return;
        e.preventDefault();
        g.rise=g.baseY-e.clientY;
        if(g.rise>18)g.locked=true;
        if(g.rise<10)g.locked=false;
        if(!g.locked){
            // Use the frozen exposed strips, not the moving/raised card faces.
            const candidates=g.cards.filter(c=>!c.disabled&&e.clientX>=c.rect.left&&e.clientX<=c.rect.right);
            const card=candidates.at(-1);
            if(card&&card!==g.card){g.card=card;g.baseY=e.clientY;g.rise=0;}
        }
        preview();
    }
    function suppressClick(e) {
        // Pointer Events may synthesize a click even when pointerup was prevented.
        // Keep this guard on the persistent battle root through a synchronous repaint.
        const root=hand.parentElement;
        const stop=click=>{
            if(click.detail===0||Math.hypot(click.clientX-e.clientX,click.clientY-e.clientY)>25)return;
            click.preventDefault();click.stopImmediatePropagation();remove();
        };
        const remove=()=>root.removeEventListener('click',stop,true);
        root.addEventListener('click',stop,true);win.setTimeout(remove,450);
    }
    function up(e) {
        if(!gesture||e.pointerId!==gesture.id)return;
        move(e);
        const {card,rise}=gesture;
        const rect=hand.getBoundingClientRect();
        const inside=e.clientX>=rect.left-24&&e.clientX<=rect.right+24&&e.clientY<=rect.bottom+24;
        suppressClick(e);clear();
        if(inside)(rise>=56?play:select)(Number(card.node.dataset.seq));
    }
    function cancel(e){if(gesture&&(!e||e.pointerId===gesture.id))clear();}
    function secondTouch(e){if(gesture&&e.pointerType==='touch'&&e.pointerId!==gesture.id)clear();}
    function hidden(){if(doc.hidden)clear();}
    hand.addEventListener('pointerdown',down);
    hand.addEventListener('pointermove',move);
    hand.addEventListener('pointerup',up);
    hand.addEventListener('pointercancel',cancel);
    hand.addEventListener('lostpointercapture',cancel);
    doc.addEventListener('pointerdown',secondTouch,true);
    doc.addEventListener('visibilitychange',hidden);
    win.addEventListener('blur',clear);
    return ()=>{
        clear();
        hand.removeEventListener('pointerdown',down);
        hand.removeEventListener('pointermove',move);
        hand.removeEventListener('pointerup',up);
        hand.removeEventListener('pointercancel',cancel);
        hand.removeEventListener('lostpointercapture',cancel);
        doc.removeEventListener('pointerdown',secondTouch,true);
        doc.removeEventListener('visibilitychange',hidden);
        win.removeEventListener('blur',clear);
    };
}
