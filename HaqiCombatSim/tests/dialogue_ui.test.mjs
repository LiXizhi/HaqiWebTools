import test from 'node:test';
import assert from 'node:assert/strict';
import {bindDialogue} from '../js/view_adventure_dialogue.js';

function setup(t,reduced=false){
    const listeners=new Map(),classes=new Set();let calls=0;
    const node=()=>({textContent:'',setAttribute(){}});
    const button={textContent:'继续',classList:{add(){}},click(){calls++;},focus(){document.activeElement=this;}};
    const box={isConnected:true,classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)},focus(){document.activeElement=this;},querySelectorAll:()=>[button]};
    const root={addEventListener:(k,fn)=>listeners.set(k,fn),removeEventListener:k=>listeners.delete(k)};
    const text={textContent:'你好，年轻的魔法师。',replaceChildren(...children){this.children=children;}};
    const hint=node();
    t.mock.method(globalThis,'setTimeout',()=>1);
    t.mock.method(globalThis,'clearTimeout',()=>{});
    const previousDocument=globalThis.document,previousMedia=globalThis.matchMedia;
    globalThis.document={createElement:node,activeElement:null};globalThis.matchMedia=()=>({matches:reduced});
    t.after(()=>{root.disposeDialogue?.();if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;if(previousMedia===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=previousMedia;});
    bindDialogue(root,box,text,hint,button);
    const target={closest:()=>null};
    const event=extra=>({target,preventDefault(){},stopPropagation(){},stopImmediatePropagation(){},...extra});
    return {root,text,hint,classes,get calls(){return calls;},key:extra=>listeners.get('keydown')?.(event({key:' ',code:'Space',...extra})),click:extra=>listeners.get('click')?.(event(extra)),listeners};
}
test('first space reveals, held space never advances, second space advances once',t=>{
    const ui=setup(t);assert.ok(ui.classes.has('is-speaking'));
    ui.key();assert.equal(ui.calls,0);assert.equal(ui.text.children[0].textContent,ui.text.textContent);
    ui.key({repeat:true});assert.equal(ui.calls,0);
    ui.key();assert.equal(ui.calls,1);
});
test('click reveals without accepting; next background click accepts; disposal removes handlers',t=>{
    const ui=setup(t);ui.click();assert.equal(ui.calls,0);
    ui.click();assert.equal(ui.calls,1);
    ui.root.disposeDialogue();assert.equal(ui.listeners.size,0);
});
test('close stays immediate and reduced motion shows full text',t=>{
    const ui=setup(t,true);assert.equal(ui.text.children[0].textContent,ui.text.textContent);
    ui.click({target:{closest:selector=>selector==='.close-button'?{}:null}});
    assert.equal(ui.calls,0);ui.key();assert.equal(ui.calls,1);
});
