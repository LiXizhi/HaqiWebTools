import test from 'node:test';
import assert from 'node:assert/strict';
import {createPetStatus,updatePetStatus,createPetEvolution} from '../js/view_adventure_pet_status.js';
import {petMaxHp} from '../js/adventure_pets_core.js';

const el=(tag,className='',...children)=>({tag,className,children,dataset:{},attributes:{},append(...nodes){this.children.push(...nodes);},setAttribute(k,v){this.attributes[k]=v;}});
const content={pets:{test:{school:'fire'}}};
const pet={speciesId:'test',level:10,hp:20,hunger:35};

test('pet status shows separate life and yellow satiety meters and refreshes without rebuilding',()=>{
 const node=createPetStatus(pet,content,el),[hp,hunger]=node.children;
 assert.equal(hp.value,20);assert.equal(hp.max,petMaxHp(pet,content));
 assert.equal(hunger.value,35);assert.equal(hunger.max,100);assert.equal(hunger.className,'pet-meter pet-meter-hunger');
 assert.match(hunger.attributes['aria-label'],/饱食 35 \/ 100/);
 updatePetStatus({querySelectorAll:()=>[node]},{pets:{test:{...pet,hp:10,hunger:35.5}}},content);
 assert.equal(node.children[0],hp);assert.equal(hp.value,10);assert.equal(hunger.value,35.5);
});

test('evolution always shows four stages, unlock levels, current stage and locked silhouettes',()=>{
 const path=createPetEvolution({content},'test',pet,(_assets,_id,stage)=>el('div','pet-sheet',stage),el);
 assert.equal(path.children.length,4);
 assert.deepEqual(path.children.map(n=>n.children[0].children[0]),[0,1,2,3]);
 assert.deepEqual(path.children.map(n=>n.children[2].children[0].match(/^\d+/)[0]),['1','10','25','40']);
 assert.equal(path.children[1].attributes['aria-current'],'step');
 assert.ok(path.children[2].className.includes('is-locked'));assert.ok(path.children[3].className.includes('is-locked'));
 assert.ok(!path.children[0].className.includes('is-locked'));
 const unlocked=createPetEvolution({content},'test',{...pet,level:40},()=>el('div','pet-sheet'),el);
 assert.ok(unlocked.children.every(n=>!n.className.includes('is-locked')));
});

test('owned evolution stages select unlocked appearances and retain locked silhouettes',()=>{
 const selected=[];
 const path=createPetEvolution({content},'test',{...pet,appearanceStage:0},()=>el('div','pet-sheet'),el,stage=>selected.push(stage));
 assert.ok(path.children.every(n=>n.tag==='button'));
 assert.deepEqual(path.children.map(n=>n.disabled),[false,false,true,true]);
 assert.equal(path.children[0].attributes['aria-pressed'],'true');
 path.children[1].onclick();path.children[2].onclick();assert.deepEqual(selected,[1]);
});
