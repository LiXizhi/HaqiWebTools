import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHeroPicker} from '../js/view_hero_picker.js';
import {createAdventure,parseSave} from '../js/adventure_core.js';
import {durableSave,splitRoleSave,joinRoleSave} from '../js/adventure_storage_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
const read=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url)));

test('arrows wrap, horizontal swipes change once, vertical/cancelled gestures preserve choice',t=>{
 const previous=globalThis.document;
 function node(){return {children:[],style:{},dataset:{},attributes:{},classList:{toggle(){}},setAttribute(k,v){this.attributes[k]=v;},append(...n){this.children.push(...n);},replaceChildren(...n){this.children=n;},setPointerCapture(){}};}
 globalThis.document={createElement:node};t.after(()=>{globalThis.document=previous;});
 const assets={hero:{manifest:{heads:{a:{gender:'male',name:'甲'},b:{gender:'male',name:'乙'},c:{gender:'female',name:'丙'},d:{gender:'female',name:'丁'}}},appearance:s=>s,createView:a=>({node:{...node(),headId:a.headId},ready:Promise.resolve()})}};
 const draft={appearance:'boy'},picker=createHeroPicker(assets,draft),[boy,girl]=picker.children;
 boy.children[0].onclick();assert.equal(draft.headId,'b');boy.children[2].onclick();assert.equal(draft.headId,'a');
 const pick=girl.children[1],down=(x,y)=>pick.onpointerdown({button:0,pointerId:1,clientX:x,clientY:y});
 down(100,20);pick.onpointerup({pointerId:1,clientX:40,clientY:22});pick.onclick();assert.equal(draft.headId,'d');assert.equal(draft.appearance,'girl');
 down(100,20);pick.onpointerup({pointerId:1,clientX:80,clientY:100});assert.equal(draft.headId,'d');
 down(100,20);pick.onpointercancel();pick.onpointerup({pointerId:1,clientX:0,clientY:20});assert.equal(draft.headId,'d');
 pick.onkeydown({key:'ArrowRight',preventDefault(){}});assert.equal(draft.headId,'c');
 boy.children[1].onclick();assert.equal(draft.headId,'a');const rebuilt=createHeroPicker(assets,draft);rebuilt.children[1].children[1].onclick();assert.equal(draft.headId,'c');
});

test('selected head survives save validation and durable projection; old saves stay valid',()=>{
 const {content,dataset}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
 const save=createAdventure(content,{appearance:'girl',headId:'onyx-girl'});
 assert.equal(parseSave(JSON.stringify(save),content,dataset).headId,'onyx-girl');assert.equal(durableSave(save).headId,'onyx-girl');
 const {state,...parts}=splitRoleSave(save);assert.equal(joinRoleSave(state,parts,content).headId,'onyx-girl');
 delete save.headId;assert.equal(parseSave(JSON.stringify(save),content,dataset).headId,undefined);
 save.headId='../bad';assert.throws(()=>parseSave(JSON.stringify(save),content,dataset),/头部/);
});
