import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHeroPicker} from '../js/view_hero_picker.js';
import {createAdventure,parseSave} from '../js/adventure_core.js';
import {durableSave,splitRoleSave,joinRoleSave} from '../js/adventure_storage_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {validHeroBodyId,randomHeroBodyId,DEFAULT_HEAD_EXCLUDE,createHeroDraft} from '../js/hero_body_core.js';
const read=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url)));
test('new body identifiers include both digits and reject unknown or wrong-gender values',()=>{
 for(const [gender,appearance] of [['male','boy'],['female','girl']]){
  assert.ok(validHeroBodyId(gender+'-ref',appearance));
  for(let n=7;n<=13;n++)assert.ok(validHeroBodyId(gender+n,appearance));
  for(const id of [gender+'14',gender+'01',gender+'0','../male7'])assert.equal(validHeroBodyId(id,appearance),false);
 }
 assert.equal(validHeroBodyId('female11','boy'),false);
});

test('head and body wrap independently, retain gender choices and accept keyboard/swipes',t=>{
 const previous=globalThis.document;
 function node(){return {children:[],style:{},dataset:{},attributes:{},classList:{toggle(){}},setAttribute(k,v){this.attributes[k]=v;},append(...n){this.children.push(...n);},replaceChildren(...n){this.children=n;},setPointerCapture(){},dispatchEvent(){},getBoundingClientRect(){return {top:0,left:0,width:100,height:100};}};}
 globalThis.document={createElement:node};t.after(()=>{globalThis.document=previous;});
 const assets={hero:{manifest:{heads:{a:{gender:'male',name:'甲'},b:{gender:'male',name:'乙'},c:{gender:'female',name:'丙'}},bodyVariants:{male2:{gender:'male',name:'红'},female2:{gender:'female',name:'红'}}},appearance:s=>s,createView:a=>({node:node(),ready:Promise.resolve()})}};
 const draft={appearance:'boy'},picker=createHeroPicker(assets,draft),[boy,girl]=picker.children;
 // children: [portrait, head prev, head next, body prev, body next]
 boy.children[1].onclick();assert.equal(draft.headId,'b');assert.equal(draft.bodyId,'male');
 boy.children[4].onclick();assert.equal(draft.bodyId,'male2');assert.equal(draft.headId,'b');
 boy.onkeydown({key:'ArrowRight',target:{dataset:{part:'body'}},preventDefault(){}});assert.equal(draft.bodyId,'male');
 const down=(x,y)=>boy.onpointerdown({target:{closest:()=>null},button:0,pointerId:1,clientX:x,clientY:y});
 down(100,70);boy.onpointerup({pointerId:1,clientX:40,clientY:72});assert.equal(draft.bodyId,'male2');
 down(100,20);boy.onpointerup({pointerId:1,clientX:80,clientY:100});assert.equal(draft.bodyId,'male2');
 down(100,70);boy.onpointercancel();boy.onpointerup({pointerId:1,clientX:0,clientY:70});assert.equal(draft.bodyId,'male2');
 girl.children[4].onclick();assert.equal(draft.bodyId,'female2');assert.equal(draft.headId,'c');
 down(0,50);boy.onpointerup({pointerId:1,clientX:0,clientY:50});boy.children[0].onclick();assert.equal(draft.bodyId,'male2');assert.equal(draft.headId,'b');
 const rebuilt=createHeroPicker(assets,draft);rebuilt.children[1].children[0].onclick();assert.equal(draft.bodyId,'female2');
});

test('selected head survives save validation and durable projection; old saves stay valid',()=>{
 const {content,dataset}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
 const save=createAdventure(content,{appearance:'girl',headId:'onyx-girl',bodyId:'female-ref'});
 assert.equal(parseSave(JSON.stringify(save),content,dataset).headId,'onyx-girl');assert.equal(durableSave(save).headId,'onyx-girl');assert.equal(durableSave(save).bodyId,'female-ref');
 const {state,...parts}=splitRoleSave(save);assert.equal(joinRoleSave(state,parts,content).headId,'onyx-girl');
 assert.equal(joinRoleSave(state,parts,content).bodyId,'female-ref');delete save.bodyId;delete save.headId;assert.equal(parseSave(JSON.stringify(save),content,dataset).headId,undefined);
 save.headId='../bad';assert.throws(()=>parseSave(JSON.stringify(save),content,dataset),/头部/);
});

test('AI costume selection is stable, gender-safe and reaches reference costumes',()=>{
 const manifest=read('hero-preview.json');
 for(const appearance of ['boy','girl']){
  const seen=new Set();
  for(let i=0;i<500;i++){
   const id=randomHeroBodyId(manifest,appearance,`companion:${i}`);
   assert.equal(id,randomHeroBodyId(manifest,appearance,`companion:${i}`));
   assert.ok(validHeroBodyId(id,appearance));seen.add(id);
  }
  assert.ok(seen.has(appearance==='girl'?'female-ref':'male-ref'));
  assert.equal(seen.size,14);
 }
 assert.equal(randomHeroBodyId({},'girl',1),'female');
});

test('new character draft randomises head and outfit for both genders without a dark default',()=>{
 const manifest=read('adventure/hero-art.json');
 const heads=new Set(),bodies=new Set();
 for(let i=0;i<200;i++){
  const draft=createHeroDraft(manifest,1000+i);
  assert.equal(JSON.stringify(createHeroDraft(manifest,1000+i)),JSON.stringify(draft));
  assert.deepEqual(Object.keys(draft.headChoices).sort(),['boy','girl']);
  assert.deepEqual(Object.keys(draft.bodyChoices).sort(),['boy','girl']);
  assert.equal(draft.headId,draft.headChoices[draft.appearance]);
  assert.equal(draft.bodyId,draft.bodyChoices[draft.appearance]);
  assert.equal(manifest.heads[draft.headChoices.boy].gender,'male');
  assert.equal(manifest.heads[draft.headChoices.girl].gender,'female');
  assert.equal(DEFAULT_HEAD_EXCLUDE.test(draft.headId),false);
  assert.equal(validHeroBodyId(draft.bodyId,draft.appearance),true);
  heads.add(draft.headId);bodies.add(draft.bodyId);
 }
 assert.equal([...heads].some(id=>DEFAULT_HEAD_EXCLUDE.test(id)),false);
 assert.ok(heads.size>=4,'default heads should vary');
 assert.ok(bodies.size>=8,'default outfits should vary across both genders');
 // Missing manifest still yields a valid, non-African default.
 const fallback=createHeroDraft(undefined,7);
 assert.equal(fallback.headId,'elf-boy');assert.equal(fallback.bodyId,'male');
});
