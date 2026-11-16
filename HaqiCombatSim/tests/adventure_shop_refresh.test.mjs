import test from 'node:test';
import assert from 'node:assert/strict';
import {createShopRefreshQueue,paintShopPreservingFocus} from '../js/adventure_shop_refresh_core.js';

function fixture(){
    const open=[true,true],blocked=[false,false],painted=[];
    const queue=createShopRefreshQueue({isOpen:i=>open[i],isBlocked:i=>blocked[i],paint:i=>painted.push(i)});
    return {queue,open,blocked,painted};
}
test('member update paints each open owner independently and only once',()=>{
    const {queue,blocked,painted}=fixture();blocked[0]=true;
    queue.request(0);queue.request(0);queue.request(1);queue.flush();
    assert.deepEqual(painted,[1]);
    blocked[0]=false;queue.flush();queue.flush();assert.deepEqual(painted,[1,0]);
});
test('open confirmation and pending purchase defer updates until both clear',()=>{
    let dialog=true,purchase=true,count=0;
    const queue=createShopRefreshQueue({isOpen:()=>true,isBlocked:()=>dialog||purchase,paint:()=>count++});
    queue.request(0);queue.flush();assert.equal(count,0);
    dialog=false;queue.flush();assert.equal(count,0);
    purchase=false;queue.flush();assert.equal(count,1);
});
test('close clears the old update before reopening the owner panel',()=>{
    const {queue,blocked,painted}=fixture();blocked[0]=true;queue.request(0);
    queue.clear(0);blocked[0]=false;queue.flush();assert.deepEqual(painted,[]);
    queue.request(0);queue.flush();assert.deepEqual(painted,[0]);
});
test('leaving or switching away drops a deferred update',()=>{
    const {queue,open,blocked,painted}=fixture();blocked[0]=true;queue.request(0);
    open[0]=false;queue.flush();open[0]=true;blocked[0]=false;queue.flush();assert.deepEqual(painted,[]);
});

function focusFixture(){
    const doc={body:{},activeElement:null},nodes=[];
    const root={ownerDocument:doc,contains:node=>nodes.includes(node),querySelectorAll:()=>nodes};
    const button=id=>({dataset:{shopProductId:id},closest(){return this;},focus(){doc.activeElement=this;}});
    const old=button('bag');nodes.push(old);doc.activeElement=old;
    return {doc,root,nodes,button,old};
}
test('deferred member repaint restores the cancelled purchase product focus',()=>{
    const {doc,root,nodes,button}=focusFixture();let blocked=true;
    const next=button('bag');
    const queue=createShopRefreshQueue({isOpen:()=>true,isBlocked:()=>blocked,paint:()=>paintShopPreservingFocus(root,()=>{nodes.splice(0,1,next);doc.activeElement=doc.body;})});
    queue.request(0);queue.flush();blocked=false;queue.flush();assert.equal(doc.activeElement,next);
});
test('refresh of another owner never steals their current product focus',()=>{
    const {doc,root,nodes,button}=focusFixture();const peer=button('bag');doc.activeElement=peer;
    paintShopPreservingFocus(root,()=>nodes.splice(0,1,button('bag')));assert.equal(doc.activeElement,peer);
});
test('missing or disabled product and deliberate focus changes are respected',()=>{
    for(const scenario of ['missing','disabled','moved']){
        const {doc,root,nodes,button}=focusFixture();const other={};
        paintShopPreservingFocus(root,()=>{const next=button('bag');next.disabled=scenario==='disabled';nodes.splice(0,1,...(scenario==='missing'?[]:[next]));doc.activeElement=scenario==='moved'?other:doc.body;});
        assert.equal(doc.activeElement,scenario==='moved'?other:doc.body);
    }
});
