import test from 'node:test';
import assert from 'node:assert/strict';
import {attachStatusTooltips} from '../js/view_adventure_status_tooltip.js';
class Node extends EventTarget {
 constructor(){super();this.children=[];this.style={};this.attrs={};this.clientWidth=390;this.clientHeight=300;this.offsetWidth=180;this.offsetHeight=70;this.offsetLeft=0;this.offsetTop=0;}
 append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
 setAttribute(k,v){this.attrs[k]=v;}
 getAttribute(k){return this.attrs[k];}
 contains(n){return n===this||this.children.some(c=>c.contains(n));}
 getBoundingClientRect(){return {left:0,top:0,bottom:28,width:28};}
}
test('hover, tap, keyboard, expiry and disposal manage descriptions without targeting the canvas',()=>{
 const previous=globalThis.document;globalThis.document={createElement:()=>new Node()};
 try{
  const root=new Node(),canvas=new Node();attachStatusTooltips(root,canvas);
  const [layer,tip]=root.children;
  const hit={key:'hero:ward:1',x:30,y:40,width:28,height:28,description:'角色\n数量：4\n护盾'};
  canvas.updateStatusTargets([hit]);const button=layer.children[0];
  assert.equal(button.style.left,'30px');
  button.dispatchEvent(new Event('pointerenter'));assert.equal(tip.hidden,false);assert.equal(tip.textContent,hit.description);
  button.dispatchEvent(new Event('pointerleave'));assert.equal(tip.hidden,true);
  button.dispatchEvent(new Event('click'));button.dispatchEvent(new Event('pointerleave'));assert.equal(tip.hidden,false);
  canvas.updateStatusTargets([{...hit,description:'角色\n数量：3\n护盾'}]);assert.match(tip.textContent,/3/);
  button.dispatchEvent(new Event('click'));assert.equal(tip.hidden,true);
  button.dispatchEvent(new Event('focus'));assert.equal(tip.hidden,false);
  root.dispatchEvent(Object.assign(new Event('keydown'),{key:'Escape'}));assert.equal(tip.hidden,true);
  button.dispatchEvent(new Event('click'));root.dispatchEvent(new Event('pointerdown'));assert.equal(tip.hidden,true);
  button.dispatchEvent(new Event('click'));canvas.updateStatusTargets([]);assert.equal(tip.hidden,true);assert.equal(layer.children.length,0);
  root.disposeStatusTooltips();assert.equal(canvas.updateStatusTargets,undefined);assert.equal(root.children.length,0);
 }finally{globalThis.document=previous;}
});
