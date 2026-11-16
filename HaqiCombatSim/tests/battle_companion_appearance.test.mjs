import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {OPENING_PET} from '../js/opening_journey_core.js';
import {createCompanionPractice,selectCompanionPractice,castCompanionPractice} from '../js/companion_practice_core.js';
const source=f=>fs.readFileSync(new URL('../js/'+f,import.meta.url),'utf8');
const read=f=>JSON.parse(fs.readFileSync(new URL('../data/'+f,import.meta.url)));
const {content,dataset}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));

for(const mode of ['local','cdn'])test(`practice and first-pet welcome share the same bunny before and after recovery (${mode})`,()=>{
 const nodes=[];
 function el(tag,className='',...children){
  const n={tag,className,children,style:{},dataset:{},attributes:{},classList:{add(){}},
   setAttribute(k,v){this.attributes[k]=v;},append(...items){this.children.push(...items);},
   replaceChildren(...items){this.children=items;},addEventListener(){},querySelector(){return null;}};
  nodes.push(n);return n;
 }
 const context=vm.createContext({OPENING_PET,el,document:{createElement:tag=>el(tag)},
  button:(label,action,cls)=>el('button',cls,label),modal:root=>root,
  art:()=>el('canvas'),spellFace:()=>el('div'),spellHint:()=>'',createCloseButton:()=>el('button')});
 const portrait=source('view_adventure_pets.js');
 vm.runInContext(portrait.slice(portrait.indexOf('export function petPortrait('),portrait.indexOf('export function starterPicker(')).replace('export function','function'),context);
 const practice=source('view_adventure.js');
 vm.runInContext(practice.slice(practice.indexOf('export function renderCompanionPractice('),practice.indexOf('export function renderPanel(')).replace('export function','function'),context);
 const welcome=source('view_opening_journey.js');
 vm.runInContext(welcome.slice(welcome.indexOf('export function')).replaceAll('export function','function'),context);
 const model={assets:{mode,content,dataset},save:{pets:{first:{speciesId:OPENING_PET,appearanceStage:0,name:'咕噜噜'}}}};
 const lesson=createCompanionPractice(dataset),cb={};
 const expected=`url("${content.pets.pixel_bunny_marshmallow.art[mode==='local'?'local':'cdn']}")`;
 function portraits(render){nodes.length=0;render(el('div'));return nodes.filter(n=>n.className==='pet-sheet');}
 const first=portraits(root=>context.renderPetWelcome(root,model,'first',cb));
 assert.equal(first.length,1);assert.equal(first[0].style.backgroundImage,expected);
 for(const done of [false,true]){
  if(done){selectCompanionPractice(lesson,lesson.keys[1]);assert.equal(castCompanionPractice(lesson,'companion'),true);}
  const before=JSON.stringify(lesson);
  const images=portraits(root=>context.renderCompanionPractice(root,model,lesson,cb));
  assert.equal(images.length,done?2:1);
  for(const image of images){
   assert.equal(image.style.backgroundImage,first[0].style.backgroundImage);
   assert.equal(image.style.backgroundPosition,first[0].style.backgroundPosition);
   assert.equal(image.attributes['aria-label'],'咕噜噜');
  }
  assert.equal(JSON.stringify(lesson),before,'rendering cannot alter practice health or progress');
 }
});
