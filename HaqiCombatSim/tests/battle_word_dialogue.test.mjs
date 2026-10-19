import test from 'node:test';
import assert from 'node:assert/strict';
import {createBilingualDialogue} from '../js/view_bilingual_dialogue.js';
import {buildWordIndex,localWordMapping,seedWordLexicon} from '../js/word_lexicon_core.js';
import {emptyLanguageTree,setTreeMark} from '../js/language_tree_core.js';
import {dialogueMappingPrompt} from '../js/dialogue_mapping_core.js';
class Element extends EventTarget {
 constructor(tag){super();this.tagName=tag;this.children=[];this.dataset={};this.style={};this.attributes={};this.className='';this.disabled=false;this.ownText='';this.isConnected=true;this.classList={add:(...names)=>{this.className=[...new Set([...this.className.split(' ').filter(Boolean),...names])].join(' ');},remove:name=>{this.className=this.className.split(' ').filter(n=>n!==name).join(' ');}};}
 get textContent(){return this.ownText+this.children.map(c=>c.textContent).join('');}
 set textContent(value){this.ownText=String(value);this.children=[];}
 append(...children){for(const node of children){node.parent=this;this.children.push(node);}}
 replaceChildren(...children){this.children=[];this.ownText='';this.append(...children);}
 setAttribute(key,value){this.attributes[key]=value;}
 querySelectorAll(selector){const all=this.children.flatMap(n=>[n,...n.querySelectorAll('*')]);return all.filter(n=>selector==='*'||selector==='button'&&n.tagName==='button'||selector.startsWith('.')&&n.className.split(' ').includes(selector.slice(1)));}
 getBoundingClientRect(){return {left:0,top:0,width:300,height:140};}
 getClientRects(){return [{left:10,right:70,top:10,bottom:30}];}
 showModal(){this.open=true;}
 close(){this.open=false;this.dispatchEvent(new Event('close'));}
 remove(){this.isConnected=false;if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
}
function setup(t,{delay=false}={}){
 const before=Object.fromEntries(['document','ResizeObserver','requestAnimationFrame','cancelAnimationFrame'].map(k=>[k,globalThis[k]]));
 globalThis.document={body:new Element('body'),createElement:t=>new Element(t),createElementNS:(_,t)=>new Element(t)};globalThis.ResizeObserver=class {observe(){} disconnect(){}};globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 let controller; t.after(()=>{controller?.close();for(const [key,value] of Object.entries(before))if(value===undefined)delete globalThis[key];else globalThis[key]=value;});
 const index=buildWordIndex({language:'en',entries:[{id:'worry',text:'worry',meaning:'担心',forms:['worried','worries'],senses:['worry']},{id:'book',text:'book',meaning:'书',forms:[],senses:['book']}]}),native=buildWordIndex({language:'zh',entries:[{id:'担心',forms:[],senses:['worry']},{id:'书',forms:[],senses:['book']}]});
 const state=emptyLanguageTree();seedWordLexicon(state,index);let active=true,listener=()=>{},generated=0,requested,resolve;
 const learner={language:'en',index,state,valid:()=>active,mapping:()=>localWordMapping(lines,[index,native],state),subscribe:fn=>{listener=fn;return ()=>listener=()=>{};},mark:async(id,mark)=>{setTreeMark(state,id,mark);listener();return {persisted:true};}};
 const lines=[{text:'Worried book',locale:'en'},{text:'担心书',locale:'zh-CN'}];
 const button=(text,run,cls)=>{const e=new Element('button');e.textContent=text;e.onclick=run;e.className=cls||'';return e;};
 controller=createBilingualDialogue({button,createWordLearning:()=>delay?new Promise(done=>resolve=done):Promise.resolve(learner),mapWords:async input=>{generated++;requested=input;return [[{text:'Worried',color:'#123'},{text:' book'}],[{text:'担心',color:'#123'},{text:'书'}]];}});
 const container=new Element('section'),original=new Element('p'),gloss=new Element('p');container.append(original,gloss);document.body.append(container);
 const view=controller.attach({container,original,gloss,text:lines[0].text,translation:lines[1].text,locale:'en',native:'zh-CN',onRead:()=>{}});
 return {view,controller,container,learner,original,gloss,resolve:()=>resolve(learner),switchRole:()=>active=false,get generated(){return generated;},get requested(){return requested;}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('local dialogue is clickable without model calls; mark popup shares state and removes all forms',async t=>{
 const ui=setup(t);await settle();assert.equal(ui.generated,0);assert.equal(ui.original.textContent,'Worried book');
 assert.equal(ui.original.querySelectorAll('.dialogue-learning-word').length,2);
 const read=ui.original.children[0];assert.equal(read.tagName,'button');assert.equal(read.querySelectorAll('button').length,0,'word buttons are siblings, never nested in the read button');
 const word=ui.original.querySelectorAll('.dialogue-learning-word')[0];word.dispatchEvent(new Event('click'));await settle();
 const popup=document.body.children.find(n=>n.tagName==='dialog');assert.ok(popup.open);assert.match(popup.textContent,/Worried → worry/);
 await popup.querySelectorAll('button').find(n=>n.textContent==='我全掌握了').onclick();
 assert.equal(ui.learner.state.words.worry.mark,'know');assert.ok(ui.original.querySelectorAll('.dialogue-learning-word').every(n=>n.textContent!=='Worried'));assert.equal(ui.generated,0);
 const map=ui.gloss.querySelectorAll('.camp-chat-map')[0];assert.equal(map.disabled,false,'local results do not disable optional model supplementation');await map.onclick();assert.equal(ui.generated,1);assert.ok(ui.requested[0].excludeWords.includes('Worried'));assert.match(dialogueMappingPrompt(ui.requested)[1].content,/excludeWords/);
 assert.ok(ui.original.querySelectorAll('.dialogue-learning-word').every(n=>n.textContent!=='Worried'));assert.equal(ui.original.textContent,'Worried book');
});
test('late vocabulary load cannot render or subscribe after the dialogue closes',async t=>{
 const ui=setup(t,{delay:true});ui.view.dispose();ui.resolve();await settle();assert.equal(ui.container.querySelectorAll('.dialogue-learning-word').length,0);assert.equal(ui.generated,0);
});
test('role changes prevent marking or generating a model supplement for the old view',async t=>{
 const ui=setup(t);await settle();ui.switchRole();await ui.gloss.querySelectorAll('.camp-chat-map')[0].onclick();assert.equal(ui.generated,0);
 ui.original.querySelectorAll('.dialogue-learning-word')[0].dispatchEvent(new Event('click'));await settle();assert.ok(!document.body.children.some(n=>n.tagName==='dialog'));
});
