import test from 'node:test';
import assert from 'node:assert/strict';
import {createBilingualDialogue} from '../js/view_bilingual_dialogue.js';

test('mapped words survive collapse and reopen when local vocabulary is unavailable',async t=>{
    function element(){
        let text='';
        return {children:[],style:{},attributes:{},classList:{add(){},remove(){}},
            get textContent(){return text;},set textContent(value){text=value;this.children=[];},
            setAttribute(k,v){this.attributes[k]=v;},addEventListener(){},querySelectorAll(){return [];},
            append(...nodes){for(const node of nodes){node.remove();node.parent=this;this.children.push(node);}},
            replaceChildren(...nodes){this.children=[];this.append(...nodes);},
            remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null;},
            getBoundingClientRect(){return {left:0,top:0,width:300,height:120};},
            getClientRects(){return [{left:0,right:30,top:0,bottom:20}];}};
    }
    const globals={document:{createElement:element,createElementNS:element},requestAnimationFrame:()=>1,cancelAnimationFrame(){},ResizeObserver:class{observe(){}disconnect(){}}};
    for(const [name,value] of Object.entries(globals)){const previous=globalThis[name];globalThis[name]=value;t.after(()=>{if(previous===undefined)delete globalThis[name];else globalThis[name]=previous;});}
    let requests=0;
    const ui=createBilingualDialogue({createWordLearning:async()=>null,mapWords:async()=>{requests++;return [[{text:'Go',color:'#A23'}],[{text:'走',color:'#A23'}]];},button:(label,run,cls)=>{const node=element();node.textContent=label;node.onclick=run;node.className=cls;return node;}});
    const container=element(),original=element(),gloss=element();container.append(original,gloss);
    const view=ui.attach({container,original,gloss,text:'Go',translation:'走',locale:'en',native:'zh-CN',onRead:async()=>{},deferMapping:true});
    const toggle=container.children.find(n=>n.className==='secondary dialogue-learning-toggle'),mapping=gloss.children[1];
    assert.equal(mapping.hidden,true);await mapping.onclick();assert.equal(requests,0,'collapsed mapping must not issue a request');
    toggle.onclick();await mapping.onclick();assert.equal(requests,1);assert.equal(view.textNode.children.length,1);
    toggle.onclick();assert.equal(view.textNode.textContent,'Go');assert.equal(view.textNode.children.length,0);assert.equal(mapping.hidden,true);
    toggle.onclick();assert.equal(view.textNode.children.length,1,'reopening restores the existing annotation without another request');
    assert.equal(view.textNode.children[0].style.color,'#A23');assert.equal(requests,1);
    assert.equal(container.children.filter(n=>n.attributes.class==='dialogue-mapping-links').length,1,'only one connector layer');
    ui.close();assert.equal(container.children.filter(n=>n.attributes.class==='dialogue-mapping-links').length,0);
});
