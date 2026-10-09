import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderPetFood} from '../js/view_adventure_pet_food.js';
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
            const hint=box.children[1];
            assert.equal(hint.textContent,table[source]||source);assert.equal(hint.dataset.zh,source);assert.equal(hint.hidden,false);
            assert.equal(box.attributes['aria-label'],table['宠物自动食槽']||'宠物自动食槽');
            pet.hunger=100;box.refresh();assert.equal(hint.hidden,true);assert.equal(hint.textContent,'');
            pet.hunger=5;box.refresh();assert.equal(hint.textContent,table[source]||source);
            save.pendingEncounter={};box.refresh();assert.equal(hint.hidden,true);
        }
    }finally{setTranslator(null);}
});
