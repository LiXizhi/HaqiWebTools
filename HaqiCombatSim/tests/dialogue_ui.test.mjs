import test from 'node:test';
import assert from 'node:assert/strict';
import {bindDialogue} from '../js/view_adventure_dialogue.js';

function setup(t,reduced=false,options={}){
    const listeners=new Map(),classes=new Set();let calls=0;
    const node=()=>({textContent:'',style:{},children:[],setAttribute(){},append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;}});
    const button={textContent:'继续',classList:{add(){}},click(){calls++;},focus(){document.activeElement=this;}};
    const box={isConnected:true,classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)},focus(){document.activeElement=this;},querySelectorAll:()=>[button]};
    const root={addEventListener:(k,fn)=>listeners.set(k,fn),removeEventListener:k=>listeners.delete(k)};
    const text={textContent:'你好，年轻的魔法师。',replaceChildren(...children){this.children=children;},append(child){this.children.push(child);}};
    const hint=node();
    t.mock.method(globalThis,'setTimeout',()=>1);
    t.mock.method(globalThis,'clearTimeout',()=>{});
    const previousDocument=globalThis.document,previousMedia=globalThis.matchMedia;
    globalThis.document={createElement:node,activeElement:null};globalThis.matchMedia=()=>({matches:reduced});
    t.after(()=>{root.disposeDialogue?.();if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;if(previousMedia===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=previousMedia;});
    bindDialogue(root,box,text,hint,button,options);
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

test('learning dialogue displays both languages; reading does not trigger quest action and closing cancels audio',async t=>{
    const calls=[];const ui=setup(t,false,{lines:[{text:'Hello!',locale:'en'},{text:'你好！',locale:'zh-CN'}],readAloud:async(text,locale,signal)=>{calls.push({text,locale,signal});}});
    assert.deepEqual(ui.text.children.map(n=>n.children[0].textContent),['Hello!','你好！']);assert.equal(ui.classes.has('is-speaking'),false);
    ui.click({target:{closest:selector=>selector==='.dialogue-read'?ui.text.children[0]:null}});assert.equal(ui.calls,0);
    await ui.text.children[0].onclick();await ui.text.children[0].onclick();
    assert.equal(calls[0].signal.aborted,true);assert.equal(calls[1].locale,'en');assert.equal(ui.calls,0);
    ui.root.disposeDialogue();assert.equal(calls[1].signal.aborted,true);
});

test('translation maps once without speaking or advancing and ignores late result after closing',async t=>{
    let resolve,calls=0,signal;const ui=setup(t,false,{lines:[{text:'Go',locale:'en'},{text:'走',locale:'zh-CN'}],readAloud:()=>{throw Error('must not speak');},mapWords:(_,s)=>{calls++;signal=s;return new Promise(r=>{resolve=r;});}});
    const pending=ui.text.children[1].onclick();await ui.text.children[1].onclick();assert.equal(calls,1);assert.equal(ui.calls,0);
    ui.root.disposeDialogue();assert.equal(signal.aborted,true);resolve([]);await pending;
    assert.equal(ui.text.children[0].children[0].textContent,'Go');
});
