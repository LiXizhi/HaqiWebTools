import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createBilingualDialogue} from '../js/view_bilingual_dialogue.js';
import {parseWordLexicon,buildWordIndex,localWordMapping,seedWordLexicon,canonicalWord} from '../js/word_lexicon_core.js';
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
function setup(t,{delay=false,friend=false,pair=null}={}){
 const before=Object.fromEntries(['document','ResizeObserver','requestAnimationFrame','cancelAnimationFrame'].map(k=>[k,globalThis[k]]));
 globalThis.document={body:new Element('body'),createElement:t=>new Element(t),createElementNS:(_,t)=>new Element(t)};globalThis.ResizeObserver=class {observe(){} disconnect(){}};globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 let controller; t.after(()=>{controller?.close();for(const [key,value] of Object.entries(before))if(value===undefined)delete globalThis[key];else globalThis[key]=value;});
 let index=buildWordIndex({language:'en',entries:[{id:'worry',text:'worry',meaning:'担心',forms:['worried','worries'],senses:['worry']},{id:'book',text:'book',meaning:'书',forms:[],senses:['book']}]}),native=buildWordIndex({language:'zh',entries:[{id:'担心',forms:[],senses:['worry']},{id:'书',forms:[],senses:['book']}]});
 if(friend||pair){const load=language=>buildWordIndex(parseWordLexicon(fs.readFileSync(new URL(`../data/adventure/locale/word_${language}.txt`,import.meta.url),'utf8'),language));index=load(pair?.[0].locale||'en');native=load(pair?.[1].locale||'zh');}
 const state=emptyLanguageTree();seedWordLexicon(state,index);let active=true,listener=()=>{},generated=0,requested,resolve;
 const learner={language:index.language,index,state,valid:()=>active,mapping:()=>localWordMapping(lines,[index,native],state),subscribe:fn=>{listener=fn;return ()=>listener=()=>{};},mark:async(id,mark)=>{setTreeMark(state,id,mark);listener();return {persisted:true};}};
 const lines=pair|| (friend?[{text:'Welcome, my friend.',locale:'en'},{text:'欢迎光临，我的朋友。',locale:'zh-CN'}]:[{text:'Worried book',locale:'en'},{text:'担心书',locale:'zh-CN'}]);
 const button=(text,run,cls)=>{const e=new Element('button');e.textContent=text;e.onclick=run;e.className=cls||'';return e;};
 controller=createBilingualDialogue({button,createWordLearning:()=>delay?new Promise(done=>resolve=done):Promise.resolve(learner),mapWords:async input=>{generated++;requested=input;return [[{text:'Worried',color:'#123'},{text:' book'}],[{text:'担心',color:'#123'},{text:'书'}]];}});
 const container=new Element('section'),original=new Element('p'),gloss=new Element('p');container.append(original,gloss);document.body.append(container);
 const view=controller.attach({container,original,gloss,text:lines[0].text,translation:lines[1].text,locale:lines[0].locale,native:lines[1].locale,onRead:()=>{}});
 return {view,controller,container,learner,original,gloss,resolve:()=>resolve(learner),switchRole:()=>active=false,get generated(){return generated;},get requested(){return requested;}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('local dialogue is clickable without model calls; mark popup shares state and removes all forms',async t=>{
 const ui=setup(t);await settle();assert.equal(ui.generated,0);assert.equal(ui.original.textContent,'Worried book');
 assert.equal(ui.original.querySelectorAll('.dialogue-learning-word').length,2);
 const read=ui.original.children[0];assert.equal(read.tagName,'button');assert.equal(read.querySelectorAll('button').length,0,'word buttons are siblings, never nested in the read button');
 const word=ui.original.querySelectorAll('.dialogue-learning-word')[0];word.dispatchEvent(new Event('click'));await settle();
 const popup=document.body.children.find(n=>n.tagName==='dialog');assert.ok(popup.open);assert.match(popup.textContent,/Worried → worry/);
 assert.ok(popup.className.split(' ').includes('tree-choice-popup'),'popup uses the WordTree card');
 const heading=popup.querySelectorAll('.tree-word-heading')[0];
 const pronounce=heading.querySelectorAll('.tree-pronounce')[0];assert.equal(pronounce.attributes['aria-label'],'朗读：worry');
 assert.equal(popup.querySelectorAll('.tree-rating-choices')[0].querySelectorAll('button').length,3);
 assert.ok(!popup.querySelectorAll('button').some(n=>n.textContent==='朗读'),'pronunciation is an icon beside the word');
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

test('local pairs appear automatically and an explicit model click preserves them',async t=>{
 const ui=setup(t);await settle();
 assert.equal(ui.container.querySelectorAll('.dialogue-mapped-word').length,4);
 await ui.gloss.querySelectorAll('.camp-chat-map')[0].onclick();
 assert.equal(ui.generated,1);assert.equal(ui.requested[0].excludeWords,undefined);
 assert.equal(ui.container.querySelectorAll('.dialogue-mapped-word').length,4);
});

test('real friend vocabulary automatically pairs both dialogue lines and shares mastery state',async t=>{
 const ui=setup(t,{friend:true});await settle();
 assert.equal(ui.generated,0);
 const source=ui.original.querySelectorAll('.dialogue-mapped-word').find(n=>n.textContent==='friend');
 const target=ui.gloss.querySelectorAll('.dialogue-mapped-word').find(n=>n.textContent==='朋友');
 assert.ok(source);assert.ok(target);assert.equal(source.style.color,target.style.color);
 assert.equal(ui.original.textContent,'Welcome, my friend.');
 assert.ok(ui.gloss.textContent.startsWith('欢迎光临，我的朋友。'));
 target.dispatchEvent(new Event('click'));await settle();
 const popup=document.body.children.find(n=>n.tagName==='dialog');assert.ok(popup.open);
 await popup.querySelectorAll('button').find(n=>n.textContent==='我全掌握了').onclick();
 assert.equal(ui.learner.state.words.friend.mark,'know');
 assert.ok(!ui.container.querySelectorAll('.dialogue-mapped-word').some(n=>['friend','朋友'].includes(n.textContent)));
 await ui.learner.mark('friend','unknown');
 assert.ok(ui.gloss.querySelectorAll('.dialogue-mapped-word').some(n=>n.textContent==='朋友'));
 assert.equal(ui.generated,0);
});

const languageSamples={en:{text:'My friends.',surface:'friends'},zh:{text:'我的朋友。',surface:'朋友'},ja:{text:'友だちです。',surface:'友だち'},ko:{text:'친구가 있어요.',surface:'친구'}};
for(const [source,a] of Object.entries(languageSamples))for(const [target,b] of Object.entries(languageSamples))if(source!==target)test(`automatic ${source} to ${target} dialogue pairing needs no model`,async t=>{
 const ui=setup(t,{pair:[{text:a.text,locale:source},{text:b.text,locale:target}]});await settle();
 const left=ui.original.querySelectorAll('.dialogue-mapped-word').find(n=>n.textContent===a.surface);
 const right=ui.gloss.querySelectorAll('.dialogue-mapped-word').find(n=>n.textContent===b.surface);
 assert.ok(left);assert.ok(right);assert.equal(left.style.color,right.style.color);assert.equal(ui.generated,0);
 assert.equal(ui.original.textContent,a.text);assert.ok(ui.gloss.textContent.startsWith(b.text));
 await ui.learner.mark(canonicalWord(ui.learner.index,a.surface),'know');
 assert.ok(!ui.gloss.querySelectorAll('.dialogue-mapped-word').some(n=>n.textContent===b.surface));assert.equal(ui.generated,0);
});
