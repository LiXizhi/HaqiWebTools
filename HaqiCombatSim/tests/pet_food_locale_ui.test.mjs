import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderPetFood,manualFoodCandidate} from '../js/views/adventure/view_adventure_pet_food.js';
import {parseLocaleFile} from '../js/locale_core.js';
import {setTranslator} from '../js/locale_runtime.js';

function el(tag,className='',...children){
    return {tag,className,children,dataset:{},attributes:{},classList:{toggle(){}},
        append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},
        setAttribute(key,value){this.attributes[key]=value;}};
}
test('hungry food-tray hint uses real UI dictionaries and keeps Chinese source after live refresh',()=>{
    const source='伙伴饿了，点击喂养';
    try{
        for(const language of ['zh-CN','en','ja','ko']){
            const table=language==='zh-CN'?{}:parseLocaleFile(fs.readFileSync(new URL(`../data/adventure/locale/${language}.txt`,import.meta.url),'utf8'));
            setTranslator(text=>table[text]||text);
            const pet={hunger:5},save={pets:{test:pet},petFoodSlots:[null,null]};
            const box=renderPetFood({}, {save,assets:{content:{items:{}}}}, {}, {el,button:(children)=>el('button','',children)});
            const hint=box.children.find(node=>node.className==='pet-food-hint');
            assert.equal(hint.textContent,table[source]||source);assert.equal(hint.dataset.zh,source);assert.equal(hint.hidden,false);
            assert.equal(box.attributes['aria-label'],table['宠物自动食槽']||'宠物自动食槽');
            pet.hunger=100;box.refresh();assert.equal(hint.hidden,true);assert.equal(hint.textContent,'');
            pet.hunger=5;box.refresh();assert.equal(hint.textContent,table[source]||source);
            save.pendingEncounter={};box.refresh();assert.equal(hint.hidden,true);
        }
    }finally{setTranslator(null);}
});

test('manual feeding exposes non-full pets without waiting for auto-feed hunger threshold',()=>{
 const save={pets:{full:{hunger:100},recent:{hunger:99},hungry:{hunger:50}}};
 assert.equal(manualFoodCandidate(save)[0],'hungry');delete save.pets.hungry;
 assert.equal(manualFoodCandidate(save)[0],'recent');save.pets.recent.hunger=100;
 assert.equal(manualFoodCandidate(save),null);
});

test('feeding lesson exposes one real action and hides it in combat or after claim',()=>{
 const save={quests:{63009:{accepted:true}},pets:{dragon:{hunger:99,speciesId:'green'}},petFoodSlots:[{itemId:17172,count:5},null]},calls=[];
 const box=renderPetFood({}, {save,assets:{content:{items:{17172:{name:'口粮'}},pets:{green:{name:'抱抱龙'}}}}}, {action:a=>calls.push(a)}, {el,button:(text,run,cls)=>({...el('button',cls,text),run}),art:()=>el('canvas')});
 const guided=box.children.find(n=>n.className==='pet-food-guided');assert.equal(guided.children.length,1);
 guided.children[0].run();assert.deepEqual(calls,[{type:'pet-food-feed',slot:0,petId:'dragon'}]);assert.equal(save.petFoodSlots[0].count,5);
 save.pendingEncounter={};box.refresh();assert.equal(guided.children.length,0);
 delete save.pendingEncounter;save.quests[63009].progress={'action:79019':1};box.refresh();assert.equal(guided.children.length,0);
 save.quests[63009].progress={};save.quests[63009].claimed=true;box.refresh();assert.equal(guided.children.length,0);
});


test('food slot detail translates the feed action and keeps the selected slot and pet',()=>{
 const originalDocument=globalThis.document;
 function node(tag,className='',...children){
  return {...el(tag,className,...children),addEventListener(){},focus(){},showModal(){this.open=true;},close(){this.open=false;}};
 }
 globalThis.document={createElement:tag=>node(tag),createElementNS:(_ns,tag)=>node(tag)};
 try{
  for(const language of ['en','ja','ko']){
   const table=parseLocaleFile(fs.readFileSync(new URL('../data/adventure/locale/'+language+'.txt',import.meta.url),'utf8'));
   setTranslator(text=>table[text]||text);
   const parent=node('main'),calls=[];
   const save={inventory:{},pets:{companion:{hunger:99,speciesId:'gululu'}},petFoodSlots:[null,{itemId:17172,count:5}]};
   const box=renderPetFood(parent,{save,assets:{content:{items:{17172:{name:'口粮'}},pets:{gululu:{name:'咕噜噜'}}}}},{action:a=>calls.push(a)},{el:node,button:(text,run,cls)=>({...node('button',cls,text),run}),art:()=>node('canvas')});
   box.children.find(n=>n.className==='pet-food-slots').children[1].run();
   const dialog=parent.children[0],footer=dialog.children.find(n=>n.className==='equipment-detail-footer'),feed=footer.children[0];
   assert.ok(table['喂{pet}一份口粮']);
   assert.equal(feed.children[0],table['喂{pet}一份口粮'].replace('{pet}',table['咕噜噜']||'咕噜噜'));
   feed.run();assert.deepEqual(calls,[{type:'pet-food-feed',slot:1,petId:'companion'}]);assert.equal(dialog.open,false);
  }
 }finally{globalThis.document=originalDocument;setTranslator(null);}
});
