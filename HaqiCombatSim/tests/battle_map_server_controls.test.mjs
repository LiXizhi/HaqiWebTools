import test from 'node:test';
import assert from 'node:assert/strict';
import {createMapHeader} from '../js/ui/controls.js';
import {mountMapServers} from '../js/views/adventure/view_map_servers.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const previous={document:globalThis.document,Node:globalThis.Node};
 class Element{
  constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.dataset={};this.events=new Map();this.open=false;this.isConnected=true;this.className='';
   this.classList={contains:key=>this.className.split(' ').includes(key),add:(...keys)=>{this.className=[...new Set([...this.className.split(' ').filter(Boolean),...keys])].join(' ');},toggle:(key,on)=>{const keys=new Set(this.className.split(' ').filter(Boolean));if(on)keys.add(key);else keys.delete(key);this.className=[...keys].join(' ');}};
  }
  append(...nodes){for(const node of nodes){if(node&&typeof node==='object')node.parent=this;this.children.push(node);}}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  insertBefore(node,before){node.parent=this;const i=this.children.indexOf(before);if(i<0)this.children.push(node);else this.children.splice(i,0,node);}
  setAttribute(key,value){this.attributes[key]=value;}
  addEventListener(type,fn){const events=this.events.get(type)||[];events.push(fn);this.events.set(type,events);}
  emit(type){for(const fn of this.events.get(type)||[])fn({target:this,preventDefault(){},stopPropagation(){}});}
  querySelector(selector){const parts=selector.split(' '),matches=(node,part)=>part.startsWith('.')?node.classList?.contains(part.slice(1)):node.tag===part;
   const visit=node=>{for(const child of node.children||[]){if(matches(child,parts.at(-1))){let ancestor=child.parent,index=parts.length-2;while(ancestor&&index>=0){if(matches(ancestor,parts[index]))index--;ancestor=ancestor.parent;}if(index<0)return child;}const found=visit(child);if(found)return found;}return null;};return visit(this);
  }
  closest(){return null;}
  showModal(){this.open=true;}
  close(){this.open=false;this.emit('close');}
  focus(){document.activeElement=this;}
  remove(){this.isConnected=false;if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
 }
 globalThis.Node=Element;globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)};
 const root=new Element('main'),modal=new Element('section');modal.className='atlas-map-modal';root.append(modal);
 const header=createMapHeader('现实世界','earth',()=>{},()=>{});modal.append(header);
 return {root,header,restore:()=>Object.assign(globalThis,previous)};
}
const listing=page=>({page,pages:3,instances:[{id:'a',status:'green',playerCount:2,capacity:30},{id:'b',status:'crowded',playerCount:24,capacity:30},{id:'c',status:'full',playerCount:30,capacity:30},{id:'d',status:'unavailable',playerCount:0,capacity:30}]});

test('map server control stays beside close, exposes availability, pages safely and restores focus',async()=>{
 const f=fixture();let unsubscribe=0,notify,state={connected:true,instanceId:'a'},dispose;
 const calls=[],reads=[];
 try{
  dispose=mountMapServers(f.root,{state:()=>state,subscribe:fn=>(notify=fn,()=>unsubscribe++),list:async page=>(reads.push(page),listing(page)),switchInstance:id=>{calls.push(id);state={connected:true,instanceId:id};notify();}});
  const tools=f.header.querySelector('.map-header-tools'),trigger=tools.children[0];
  assert.equal(trigger.classList.contains('map-server-trigger'),true);assert.equal(tools.children[1].classList.contains('close-button'),true);
  assert.equal(trigger.attributes['aria-haspopup'],'dialog');trigger.onclick();await tick();
  const dialog=f.root.querySelector('.map-server-dialog'),grid=dialog.querySelector('.map-server-grid'),pager=dialog.querySelector('.map-server-pager');
  assert.equal(dialog.open,true);assert.equal(document.activeElement,dialog.querySelector('.close-button'));
  assert.deepEqual(grid.children.map(node=>node.disabled),[true,false,true,true]);
  assert.equal(grid.children[0].attributes['aria-pressed'],'true');grid.children[1].onclick();
  assert.deepEqual(calls,['b']);assert.equal(grid.children[1].attributes['aria-pressed'],'true');
  assert.equal(pager.children[0].disabled,true);assert.equal(pager.children[2].disabled,false);
  pager.children[3].value='900';pager.children[4].onclick();await tick();assert.deepEqual(reads,[1,3]);
  assert.equal(pager.children[2].disabled,true);dialog.close();assert.equal(document.activeElement,trigger);
  dispose();dispose=null;assert.equal(unsubscribe,1);assert.equal(trigger.isConnected,false);assert.equal(dialog.isConnected,false);
 }finally{dispose?.();f.restore();}
});

test('closing or disposing the map server dialog aborts reads and ignores stale responses',async()=>{
 const f=fixture(),pending=[];let dispose;
 try{
  dispose=mountMapServers(f.root,{state:()=>({}),subscribe:()=>()=>{},switchInstance:()=>{},list:(page,{signal})=>new Promise((resolve,reject)=>pending.push({page,signal,resolve,reject}))});
  const trigger=f.header.querySelector('.map-server-trigger');trigger.onclick();
  const dialog=f.root.querySelector('.map-server-dialog'),grid=dialog.querySelector('.map-server-grid');dialog.close();
  assert.equal(pending[0].signal.aborted,true);trigger.onclick();
  pending[0].resolve(listing(1));await tick();assert.equal(grid.children.length,0);
  pending[1].resolve(listing(1));await tick();assert.equal(grid.children.length,4);
  dialog.querySelector('.map-server-pager').children.at(-1).onclick();assert.equal(pending.length,3);
  dispose();dispose=null;assert.equal(pending[2].signal.aborted,true);pending[2].reject(new Error('late network failure'));await tick();
  assert.equal(dialog.isConnected,false);
 }finally{dispose?.();f.restore();}
});
