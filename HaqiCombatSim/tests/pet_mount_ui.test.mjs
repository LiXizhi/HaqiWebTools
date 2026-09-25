import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderPetCollection } from '../js/view_adventure_pets.js';
import { createMountPreview } from '../js/view_adventure_mount_preview.js';
import { installExpansion } from '../js/adventure_expansion_core.js';
import { installMountCatalog, resolveMountDrawPose } from '../js/adventure_mounts_core.js';
import { createAdventure, applyAction, parseSave } from '../js/adventure_core.js';

const read=name=>JSON.parse(fs.readFileSync(new URL('../data/'+name,import.meta.url)));
const {content}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
installMountCatalog(content,read('adventure/mount-catalog.json'));

test('mount UI delegates all 66 mounts to the shared renderer without a second rider scale',()=>{
 const el=(tag,cls,...children)=>({className:cls,style:{},dataset:{},children,setAttribute(){},append(...nodes){this.children.push(...nodes);}});
 for(const mount of content.mountCatalog.mounts.filter(row=>row.rideable)){
  const itemId=Object.keys(content.mountByItem).find(id=>content.mountByItem[id].mountId===mount.id);
  for(const appearance of ['boy','girl'])for(const mode of ['local','cdn'])for(const heroSlot of [0,1,2,3]){
   let requested;
   const hero={createView(a,options){requested={appearance:a,options};return {node:el('canvas'),ready:Promise.resolve()};}};
   const preview=createMountPreview({content,mode,hero},{mountId:itemId,appearance,heroSlot,name:'测试'},{el});
   const picture=preview.children[0];assert.equal(picture.children.length,1);assert.equal(picture.children[0].className,'pet-mount-canvas');
   assert.equal(requested.appearance.mount,mount);assert.equal(requested.appearance.gender,appearance==='girl'?'female':'male');
   assert.equal(requested.options.size,240);assert.equal(requested.options.facing,heroSlot<2?2:1);assert.equal(requested.options.animate,true);
   const scene=resolveMountDrawPose(mount,requested.options.facing,{size:120,gender:requested.appearance.gender});
   const rendered=resolveMountDrawPose(mount,requested.options.facing,{size:requested.options.size,gender:requested.appearance.gender});
   assert.equal(rendered.rider.w/2,scene.rider.w);
   const factor=value=>Number(value.match(/\* ([\d.e+-]+)\)/)[1]);
   const height=120*factor(picture.style.height);assert.equal(Number(preview.dataset.overhang),Math.max(0,height/120-1));
   assert.ok(requested.options.width>0&&requested.options.height>0);
  }
 }
});

function setup(t){
 const oldDocument=globalThis.document,oldFrame=globalThis.requestAnimationFrame;
 function el(tag,cls='',...children){
  return {tagName:tag,className:cls,children:children.flat(),dataset:{},style:{},attributes:{},listeners:{},scrollLeft:0,clientWidth:500,scrollWidth:500,
   classList:{add(){},remove(){},toggle(){}},setAttribute(k,v){this.attributes[k]=v;},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},
   querySelector(){return null;},closest(){return this;},addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);},focus(){},showModal(){this.open=true;},close(){this.open=false;},getContext(){return {};},get childNodes(){return this.children;},contains(node){return this.children.includes(node);},get textContent(){return this.text||this.children.map(child=>typeof child==='string'?child:child.textContent).join('');},set textContent(value){this.text=value;this.children=[];}};
 }
 function button(children,onclick,cls){const node=el('button',cls,...[children].flat());node.onclick=onclick;node.click=()=>{if(!node.disabled)onclick();};return node;}
 globalThis.document={createElement:el,createElementNS:(_ns,tag)=>el(tag)};globalThis.requestAnimationFrame=fn=>fn();
 t.after(()=>{if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;if(oldFrame===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=oldFrame;});
 const save=createAdventure(content),model={save,assets:{content,mode:'local',draw(){},dataset:{cards:{}}},petView:{}},body=el('div');
 const mounts=Object.values(content.items).filter(item=>content.mountByItem[item.id]?.art?.cdn).slice(0,3);
 save.inventory[mounts[0].id]=1;save.inventory[mounts[1].id]=1;
 const actions=[];
 function paint(){body.replaceChildren();renderPetCollection(body,model,{action:action=>{actions.push(action);applyAction(save,content,action);paint();},panel(){}},{el,button,art:()=>el('canvas'),tile:()=>el('canvas'),icon:()=>el('span')});}
 function all(node=body){return [node,...node.children.filter(child=>typeof child==='object').flatMap(all)];}
 const tab=id=>all().find(node=>node.dataset.petTab===id);
 const cards=()=>all().filter(node=>node.dataset.mountId!=null);
 const detailAction=()=>all().find(node=>node.className==='equipment-detail-footer').children.find(node=>node.tagName==='button');
 paint();return {save,model,body,mounts,paint,all,tab,cards,actions,detailAction};
}

test('pet tabs default to followers; owned mount details ride, switch and dismount without altering formation',t=>{
 const ui=setup(t),formation=structuredClone(ui.save.formation),pets=structuredClone(ui.save.pets);
 assert.equal(ui.tab('follow').attributes['aria-pressed'],'true');assert.equal(ui.cards().length,0);
 ui.tab('mount').click();assert.equal(ui.cards().length,2);
 const preview=()=>ui.all().find(node=>node.className==='pet-mount-preview');
 const platforms=()=>ui.all().find(node=>node.className==='pet-stage-line').children;
 assert.equal(platforms().length,4);
 assert.ok(platforms().every(node=>!node.hidden));
 assert.ok(ui.all().find(node=>node.className==='pet-hero-figure').children.includes(preview()));
 assert.equal(preview().dataset.previewMount,'');
 for(const card of ui.cards())assert.ok(!card.children.some(child=>child.tagName==='small'));
 assert.ok(!ui.cards().some(card=>card.dataset.mountId===ui.mounts[2].id));
 ui.cards()[0].click();assert.equal(ui.actions.length,0);assert.ok(ui.all().find(node=>node.tagName==='dialog').open);ui.detailAction().click();assert.equal(ui.save.mountId,ui.mounts[0].id);
 assert.equal(preview().dataset.previewMount,content.mountByItem[ui.mounts[0].id].mountId);
 assert.ok(ui.all().filter(node=>node.className==='pet-mount-canvas').length>=1);
 assert.equal(ui.tab('mount').attributes['aria-pressed'],'true');
 assert.equal(ui.cards()[0].attributes['aria-pressed'],'true');
 ui.cards()[1].click();ui.detailAction().click();assert.equal(ui.save.mountId,ui.mounts[1].id);
 assert.equal(preview().dataset.previewMount,content.mountByItem[ui.mounts[1].id].mountId);
 assert.equal(parseSave(JSON.stringify(ui.save),content).mountId,ui.mounts[1].id);
 ui.cards()[1].click();assert.equal(ui.detailAction().textContent,'下骑');ui.detailAction().click();assert.equal(ui.save.mountId,null);
 assert.equal(preview().dataset.previewMount,'');
 assert.deepEqual(ui.actions.map(action=>action.type),['ride','ride','dismount']);
 assert.deepEqual(ui.save.formation,formation);assert.deepEqual(ui.save.pets,pets);
 ui.tab('follow').click();assert.equal(ui.cards().length,0);
 assert.ok(!preview().hidden);
 assert.ok(platforms().every(node=>!node.hidden));
 // The mounted figure follows the hero's platform, not a fixed slot or active tab.
 ui.save.mountId=ui.mounts[0].id;ui.save.heroSlot=2;ui.paint();
 assert.ok(ui.all(platforms()[2]).includes(preview()));
 assert.equal(preview().dataset.previewMount,content.mountByItem[ui.mounts[0].id].mountId);
 assert.equal(preview().dataset.previewFacing,'left');
});

test('mount shelf disables battle changes, supports search and explains an empty collection',t=>{
 const ui=setup(t);ui.save.pendingEncounter={id:'test'};ui.paint();ui.tab('mount').click();
 for(const card of ui.cards()){assert.ok(!card.disabled);card.click();assert.equal(ui.detailAction().disabled,true);ui.detailAction().click();}assert.equal(ui.actions.length,0);
 assert.match(ui.body.textContent,/战斗中无法换坐骑/);
 const query=ui.all().find(node=>node.className==='pet-search');query.value='不存在的坐骑';query.oninput();
 assert.equal(ui.cards().length,0);assert.match(ui.body.textContent,/没有找到坐骑/);
 ui.tab('follow').click();assert.equal(query.value,'');ui.tab('mount').click();assert.equal(query.value,'不存在的坐骑');
 delete ui.save.pendingEncounter;ui.model.petView.mountQuery='';
 for(const item of ui.mounts)delete ui.save.inventory[item.id];ui.paint();assert.match(ui.body.textContent,/还没有坐骑/);
});


test('dropping owned mounts rides without moving followers; repeated, invalid and battle drops do nothing',t=>{
 const ui=setup(t),formation=structuredClone(ui.save.formation);
 const drop=id=>ui.all().find(node=>node.className==='pet-stage-line').children[0].ondrop({preventDefault(){},dataTransfer:{getData:()=>`mount:${id}`}});
 drop(ui.mounts[0].id);assert.equal(ui.save.mountId,ui.mounts[0].id);
 drop(ui.mounts[0].id);assert.equal(ui.actions.length,1);
 drop(ui.mounts[2].id);assert.equal(ui.actions.length,1);
 drop(ui.mounts[1].id);assert.equal(ui.save.mountId,ui.mounts[1].id);
 ui.save.pendingEncounter={id:'test'};drop(ui.mounts[0].id);assert.equal(ui.actions.length,2);
 assert.deepEqual(ui.save.formation,formation);
});


test('pointer drag rides on release and suppresses the following detail click',t=>{
 const ui=setup(t);ui.tab('mount').click();
 const card=ui.cards()[0],slot=ui.all().find(node=>node.className==='pet-stage-line').children[2];
 const oldCanvas=globalThis.HTMLCanvasElement;
 globalThis.HTMLCanvasElement=class {};
 t.after(()=>{if(oldCanvas===undefined)delete globalThis.HTMLCanvasElement;else globalThis.HTMLCanvasElement=oldCanvas;});
 const ghost=new HTMLCanvasElement();Object.assign(ghost,{style:{},setAttribute(){},getContext:()=>({drawImage(){}}),remove(){this.removed=true;}});
 const picture=card.children[0];picture.getBoundingClientRect=()=>({left:0,top:200,width:112,height:100});picture.cloneNode=()=>ghost;
 card.querySelector=()=>picture;card.setPointerCapture=()=>{};
 document.body={append(){}};document.elementFromPoint=()=>({closest:()=>slot});
 const emit=(type,extra={})=>card.listeners[type].forEach(fn=>fn({type,isPrimary:true,button:0,pointerId:1,clientX:10,clientY:200,...extra}));
 emit('pointerdown');emit('pointermove',{clientY:20});assert.equal(ui.actions.length,0);
 emit('pointerup',{clientY:20});assert.equal(ui.save.mountId,ui.mounts[0].id);assert.ok(ghost.removed);
 let suppressed=false;emit('click',{preventDefault(){},stopImmediatePropagation(){suppressed=true;}});assert.ok(suppressed);
 // A cancelled gesture never dispatches an action.
 emit('pointerdown');emit('pointermove',{clientY:20});emit('pointercancel',{clientY:20});
 assert.deepEqual(ui.actions.map(action=>action.type),['ride']);
});

test('dragging a formation pet to the collection rests it; cancel, outside and battle drops do not',t=>{
 const ui=setup(t),id=ui.save.formation[ui.save.heroSlot];
 const oldCanvas=globalThis.HTMLCanvasElement;
 globalThis.HTMLCanvasElement=class {};
 t.after(()=>{if(oldCanvas===undefined)delete globalThis.HTMLCanvasElement;else globalThis.HTMLCanvasElement=oldCanvas;});
 const card=ui.all().find(node=>node.className==='pet-stage-line').children[ui.save.heroSlot].children.find(node=>node.className==='pet-stand');
 const shelf=ui.all().find(node=>node.className==='pet-shelf');
 const ghost=new HTMLCanvasElement();Object.assign(ghost,{style:{},setAttribute(){},getContext:()=>({drawImage(){}}),remove(){}});
 const picture={getBoundingClientRect:()=>({left:0,top:20,width:120,height:120}),cloneNode:()=>ghost};
 card.querySelector=()=>picture;card.setPointerCapture=()=>{};
 document.body={append(){}};shelf.closest=()=>null;document.elementFromPoint=()=>shelf;
 const emit=(type,extra={})=>(card.listeners[type]||[]).forEach(fn=>fn({type,isPrimary:true,button:0,pointerId:1,clientX:10,clientY:20,...extra}));
 const drag=end=>{emit('pointerdown');emit('pointermove',{clientY:300});emit(end,{clientY:300});};
 drag('pointercancel');assert.equal(ui.actions.length,0);
 document.elementFromPoint=()=>null;drag('pointerup');assert.equal(ui.actions.length,0);
 document.elementFromPoint=()=>shelf;ui.save.pendingEncounter={id:'battle'};drag('pointerup');assert.equal(ui.actions.length,0);
 delete ui.save.pendingEncounter;const heroSlot=ui.save.heroSlot;drag('pointerup');
 assert.equal(ui.actions.length,1);assert.ok(!ui.save.formation.includes(id));assert.ok(ui.save.pets[id]);assert.equal(ui.save.heroSlot,heroSlot);
 let suppressed=false;emit('click',{preventDefault(){},stopImmediatePropagation(){suppressed=true;}});assert.ok(suppressed);
});
