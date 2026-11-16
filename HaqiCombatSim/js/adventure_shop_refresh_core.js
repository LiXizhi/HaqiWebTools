// Keep member updates queued while the owner is confirming or saving a purchase.
export function paintShopPreservingFocus(root,paint){
    const doc=root.ownerDocument,active=doc.activeElement;
    const trigger=active?.closest?.('[data-shop-product-id]');
    const productId=trigger&&root.contains(trigger)?trigger.dataset.shopProductId:null;
    paint();
    if(productId==null)return;
    // Do not undo a deliberate focus change made while painting another surface.
    if(doc.activeElement!==active&&doc.activeElement!==doc.body)return;
    const next=Array.from(root.querySelectorAll('[data-shop-product-id]')).find(node=>node.dataset.shopProductId===productId&&!node.disabled);
    next?.focus({preventScroll:true});
}

export function createShopRefreshQueue({isOpen,isBlocked,paint}){
    const pending=new Set();
    return {
        request(owner){if(isOpen(owner))pending.add(owner);},
        clear(owner){pending.delete(owner);},
        flush(){for(const owner of pending){
            if(!isOpen(owner)){pending.delete(owner);continue;}
            if(isBlocked(owner))continue;
            pending.delete(owner);paint(owner);
        }}
    };
}
