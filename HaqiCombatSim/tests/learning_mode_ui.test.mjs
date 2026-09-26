import test from 'node:test';
import assert from 'node:assert/strict';
import {renderLearningMode} from '../js/view_learning_mode.js';

function setup(t,save){
    const nodes=[];let applied=null,disabled=false;
    const el=(tag,cls='',...children)=>{
        const n={tag,className:cls,children:[],attributes:{},value:'',disabled:false,append(...rows){this.children.push(...rows);},add(o){this.children.push(o);},setAttribute(k,v){this.attributes[k]=v;}};
        n.append(...children);nodes.push(n);return n;
    };
    const oldDoc=globalThis.document,oldOption=globalThis.Option;
    globalThis.document={createElement:tag=>el(tag)};globalThis.Option=class{constructor(text,value){this.text=text;this.value=value;}};
    t.after(()=>{if(oldDoc===undefined)delete globalThis.document;else globalThis.document=oldDoc;if(oldOption===undefined)delete globalThis.Option;else globalThis.Option=oldOption;});
    const body=el('main');
    renderLearningMode(body,{save},{applyLearningMode:d=>{applied=d;},disableLearning:()=>{disabled=true;},panel:()=>{}},{el,button:(label,run,cls)=>Object.assign(el('button',cls,label),{onclick:run})});
    const [display,target]=nodes.filter(n=>n.tag==='select'),apply=nodes.find(n=>n.tag==='button'&&n.className==='primary');
    return {display,target,apply,nodes,get applied(){return applied;},get disabled(){return disabled;}};
}
test('opening and editing mode settings never mutates the save until explicit apply',t=>{
    const save={locale:'zh-CN',languageLearning:{enabled:false,target:'en',native:'zh-CN',selectionConfirmed:false}},before=structuredClone(save),h=setup(t,save);
    assert.equal(h.target.value,'en');h.display.value='en';h.display.onchange();assert.equal(h.target.value,'zh-CN');
    assert.deepEqual(save,before);assert.equal(h.applied,null);
    h.apply.onclick();assert.equal(h.applied.locale,'en');assert.equal(h.applied.target,'zh-CN');assert.equal(h.applied.native,'en');
});
test('an explicit target is not overwritten by display changes; unsupported courses cannot enable',t=>{
    const h=setup(t,{locale:'zh-CN',languageLearning:{enabled:false,target:'en',native:'zh-CN',selectionConfirmed:false}});
    h.target.value='zh-CN';h.target.onchange();h.display.value='ja';h.display.onchange();assert.equal(h.target.value,'zh-CN');
    h.target.value='ja';h.target.onchange();assert.equal(h.apply.disabled,true);
    h.target.value='en';h.target.onchange();assert.equal(h.apply.disabled,false);
});
test('saved preferences survive reopening; changing target resolves auxiliary language collision',t=>{
    const h=setup(t,{locale:'zh-CN',languageLearning:{enabled:true,target:'en',native:'zh-CN',selectionConfirmed:true}});
    h.display.value='en';h.display.onchange();assert.equal(h.target.value,'en');
    h.target.value='zh-CN';h.target.onchange();h.apply.onclick();assert.equal(h.applied.native,'en');
    const off=h.nodes.find(n=>n.tag==='button'&&n.children[0]==='关闭双语学习');off.onclick();assert.equal(h.disabled,true);
});
