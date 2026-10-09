import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { showPetDetails } from '../js/view_adventure_pet_details.js';
import { installExpansion } from '../js/adventure_expansion_core.js';
import { createAdventure, applyAction } from '../js/adventure_core.js';
import { STARTERS, addPet } from '../js/adventure_pets_core.js';

const read=name=>JSON.parse(fs.readFileSync(new URL('../data/'+name,import.meta.url)));
const {content}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));

function harness(t,save){
 const nodes=[];
 function el(tag,cls='',...children){
  const node={tagName:tag,className:cls,children:children.flat(),dataset:{},style:{},attributes:{},listeners:{},
   classList:{add(...names){this.value=`${this.value||''} ${names.join(' ')}`.trim();},remove(){},toggle(){},value:''},
   setAttribute(k,v){this.attributes[k]=v;},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},
   querySelector(sel){return walk(this).find(n=>sel.startsWith('.')?String(n.className||'').split(/\s+/).includes(sel.slice(1)):n.tagName===sel)||null;},
   querySelectorAll(){return [];},closest(){return this;},addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);},
   remove(){const i=nodes.indexOf(this);if(i>=0)nodes.splice(i,1);},focus(){},showModal(){this.open=true;},close(){this.open=false;(this.listeners.close||[]).forEach(fn=>fn());},
   getContext(){return {save(){},restore(){},translate(){},scale(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){},arc(){},bezierCurveTo(){},fillRect(){},ellipse(){},drawImage(){},createRadialGradient:()=>({addColorStop(){}})};},
   get textContent(){return this.text??this.children.map(child=>typeof child==='string'?child:child.textContent).join('');},set textContent(value){this.text=value;this.children=[];}};
  return node;
 }
 function button(children,onclick,cls){const node=el('button',cls,...[children].flat());node.onclick=onclick;node.click=()=>{if(!node.disabled)onclick();};return node;}
 function walk(node){return [node,...(node.children||[]).filter(child=>typeof child==='object').flatMap(walk)];}
 const oldDocument=globalThis.document;
 globalThis.document={createElement:el,createElementNS:(_ns,tag)=>el(tag),body:{append(...items){nodes.push(...items);}},activeElement:null};
 t.after(()=>{if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;});
 const assets={content,mode:'local',dataset:{cards:{}},skillArt:{drawCard(){},ensure(){}}};
 const actions=[];
 const portrait=()=>el('div','pet-sheet');
 return {actions,walk:()=>nodes.flatMap(walk),open(id){
  nodes.length=0;
  showPetDetails(assets,id,portrait,{el,button,spellFace:()=>el('div')},{save,action:action=>{actions.push(action);applyAction(save,content,action);}});
 }};
}

test('pet details deploy fills the next empty slot and undeploy rests without choosing a slot',t=>{
 const save=createAdventure(content,{starter:STARTERS[0]});
 addPet(save,content,STARTERS[1]);
 assert.deepEqual(save.formation,[STARTERS[0],null,null,null]);
 const ui=harness(t,save);
 ui.open(STARTERS[1]);
 const deploy=ui.walk().find(node=>node.tagName==='button'&&node.textContent==='上阵');
 const undeploy=ui.walk().find(node=>node.tagName==='button'&&node.textContent==='下阵');
 assert.ok(deploy);assert.ok(undeploy);assert.equal(deploy.disabled,false);assert.equal(undeploy.disabled,true);
 deploy.click();
 assert.deepEqual(ui.actions.at(-1),{type:'formation',slots:[STARTERS[0],STARTERS[1],null,null],heroSlot:0});
 assert.deepEqual(save.formation,[STARTERS[0],STARTERS[1],null,null]);
 ui.open(STARTERS[1]);
 const leave=ui.walk().find(node=>node.tagName==='button'&&node.textContent==='下阵');
 assert.equal(leave.disabled,false);
 leave.click();
 assert.deepEqual(save.formation,[STARTERS[0],null,null,null]);
 assert.ok(save.pets[STARTERS[1]]);
});

test('pet details deploy disables when the lineup is full or battle is pending',t=>{
 const save=createAdventure(content,{starter:STARTERS[0]});
 for(const id of STARTERS.slice(1))addPet(save,content,id);
 const fourth=Object.keys(content.pets).find(id=>!save.pets[id]&&!content.pets[id].legacy);
 addPet(save,content,fourth);
 applyAction(save,content,{type:'formation',slots:[STARTERS[0],STARTERS[1],STARTERS[2],fourth],heroSlot:0});
 const extra=Object.keys(content.pets).find(id=>!save.pets[id]&&!content.pets[id].legacy);
 addPet(save,content,extra);
 const ui=harness(t,save);
 ui.open(extra);
 const deploy=ui.walk().find(node=>node.tagName==='button'&&node.textContent==='上阵');
 assert.equal(deploy.disabled,true);assert.equal(deploy.title,'阵容已满');
 save.formation[3]=null;save.pendingEncounter={id:'battle'};
 ui.open(extra);
 const busy=ui.walk().find(node=>node.tagName==='button'&&node.textContent==='上阵');
 assert.equal(busy.disabled,true);assert.equal(busy.title,'战斗中无法调整阵容');
});
