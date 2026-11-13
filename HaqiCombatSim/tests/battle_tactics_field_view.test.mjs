import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {createAdventure,beginEncounter} from '../js/adventure_core.js';
import {createLocalFormation,localParty,localHumanResources} from '../js/adventure_local_coop_core.js';
import {restorePveBattle} from '../js/combat_pve_core.js';
import {cardsInHand} from '../js/combat_unit_core.js';
import {renderBattle} from '../js/view_adventure.js';
import {createTacticsFieldBattle} from '../js/tactics_field_battle_core.js';

class Element {
    constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attrs={};this.style={setProperty(){},removeProperty(){}};this.offsetHeight=40;this.offsetTop=22;this.className='';this.classList={add:(...names)=>{this.className+=' '+names.join(' ');},remove:(...names)=>{this.className=this.className.split(' ').filter(n=>!names.includes(n)).join(' ');},toggle:(name,on)=>{if(on)this.classList.add(name);else this.classList.remove(name);}};}
    get ownerDocument(){return document;}
    get firstChild(){return this.children[0];} get lastChild(){return this.children.at(-1);}
    get childNodes(){return this.children;}
    append(...nodes){for(const node of nodes){node.remove?.();node.parent=this;this.children.push(node);}}
    replaceChildren(...nodes){for(const node of this.children)node.parent=null;this.children=[];this.append(...nodes);}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null;}
    setAttribute(k,v){this.attrs[k]=String(v);} getAttribute(k){return this.attrs[k];}
    addEventListener(){} removeEventListener(){} getContext(){return null;}
    querySelectorAll(selector){const match=n=>selector.startsWith('.')?selector.slice(1).split('.').every(cls=>n.className?.split(' ').includes(cls)):selector.startsWith('#')?n.id===selector.slice(1):n.tagName?.toLowerCase()===selector;return this.children.flatMap(n=>[...(match(n)?[n]:[]),...(n.querySelectorAll?.(selector)||[])]);}
    querySelector(s){return this.querySelectorAll(s)[0]||null;}
    getBoundingClientRect(){return {left:0,top:0,width:1500,height:900};}
}

test('monster practice uses the full battle HUD with normal cards, targeting, retreat and simple results',t=>{
 const original=Object.fromEntries(['document','Node','matchMedia','ResizeObserver','getComputedStyle'].map(k=>[k,globalThis[k]]));
 t.after(()=>{for(const [k,v] of Object.entries(original)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}});
 globalThis.Node=Element;
 globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag),createTextNode:text=>({nodeType:3,textContent:text}),addEventListener(){},removeEventListener(){},defaultView:{addEventListener(){},removeEventListener(){}}};
 globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.getComputedStyle=()=>({bottom:'24px'});
 const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p,import.meta.url)));
 const {content,dataset}=installExpansion(...['adventure/chapter.json','adventure/combat.json','adventure/pets.json','adventure/shop-candidates.json','kids/cards.json','kids/charms.json'].map(read));
 for(const lessonId of ['focus','squad']){
  const battle=createTacticsFieldBattle(dataset,content,{lessonId}),save=createAdventure(content,{seed:1});
  const root=new Element('div'),model={assets:{content,dataset,effects:{cards:{}}},save,battle,discarded:[]};
  let target,retreated=0,next=0,finished=0;
  const callbacks={select(){},target:id=>{target=id;},swipePlay(){},discard(){},pass(){},retreat:()=>retreated++,finish:()=>finished++,practiceNext:()=>next++,sound(){}};
  renderBattle(root,model,callbacks);
  assert.equal(root.querySelectorAll('.battle-canvas').length,1);assert.equal(root.querySelectorAll('.battle-hand').length,1);
  assert.equal(root.querySelectorAll('.hand-card').length,cardsInHand(battle.sides.near[0]).length);assert.equal(root.querySelectorAll('.tactics-training').length,0);
  assert.equal(root.querySelectorAll('.opening-enemy-intent').length,1);
  const canvas=root.querySelector('.battle-canvas');canvas.battlePositions={mob0:{x:100,y:100}};canvas.clientWidth=1500;canvas.clientHeight=900;
  canvas.onclick({clientX:100,clientY:100});assert.equal(target,'mob0');
  root.querySelector('.battle-heading-actions').querySelectorAll('button').at(-1).onclick();assert.equal(retreated,1);
  battle.finished=true;battle.winner='near';renderBattle(root,model,callbacks);
  const result=root.querySelector('.result-card');assert.ok(result);
  const buttons=result.querySelectorAll('button');assert.equal(buttons.length,2);buttons[0].onclick();buttons[1].onclick();
  assert.equal(next,1);assert.equal(finished,1);
 }
});
